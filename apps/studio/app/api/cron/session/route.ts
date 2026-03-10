/**
 * GET /api/cron/session — scheduler entrypoint.
 * Intended to be called by Vercel Cron (Authorization: Bearer ${CRON_SECRET})
 * and optionally by manual callers with header x-cron-secret.
 * If always_on is enabled and interval elapsed, triggers a session run.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getRuntimeConfig, setLastRunAt, setRuntimeConfig, getIntervalMs, getSessionsRunInLastHour } from "@/lib/runtime-config";
import { getLowTokenThreshold, getMaxSessionsPerHour } from "@/lib/stop-limits";
import { runSessionInternal, SessionRunError } from "@/lib/session-runner";

const CRON_SECRET_HEADER = "x-cron-secret";

function getLastRunMs(lastRunAt: string | null): number {
  if (!lastRunAt) return 0;
  const t = new Date(lastRunAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export async function GET(request: Request) {
  // NOTE: Auth is intentionally relaxed here so both Vercel Cron and
  // manual calls work reliably in production. Safety is enforced by
  // always_on flag, mode, and token/interval guards. Manual callers
  // can still pass x-cron-secret; it is forwarded to /api/session/run.

  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const authHeader = request.headers.get("authorization");
  const manualSecret = request.headers.get(CRON_SECRET_HEADER);

  const hasEnvSecret = !!process.env.CRON_SECRET;
  const validVercelCron = hasEnvSecret && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const validManualCall = hasEnvSecret && manualSecret === process.env.CRON_SECRET;
  const hasProtectionBypassHeader = !!request.headers.get("x-vercel-protection-bypass");

  console.log("[cron/session] auth", {
    isVercelCron,
    hasEnvSecret,
    hasAuthorization: !!authHeader,
    hasManualSecretHeader: !!manualSecret,
    validVercelCron,
    validManualCall,
    hasProtectionBypassHeader,
    hasAutomationBypassEnv: !!process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  });

  if (hasEnvSecret && !validVercelCron && !validManualCall) {
    console.log("[cron/session] unauthorized", {
      isVercelCron,
      hasAuthorization: !!authHeader,
      hasManualSecretHeader: !!manualSecret,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServer();
  let config = await getRuntimeConfig(supabase);

  console.log("[cron/session] hit");
  console.log("[cron/session] loaded config", {
    mode: config.mode,
    always_on: config.always_on,
    last_run_at: config.last_run_at,
    tokens_used_today: config.tokens_used_today,
  });

  if (!config.always_on) {
    console.log("[cron/session] skipped: always_on disabled");
    return NextResponse.json({
      skipped: true,
      reason: "always_on_disabled",
      mode: config.mode,
      config: {
        always_on: config.always_on,
        last_run_at: config.last_run_at,
      },
    });
  }

  const lowThreshold = getLowTokenThreshold();
  if (lowThreshold > 0 && config.tokens_used_today >= lowThreshold && supabase && config.mode !== "slow") {
    console.log("[cron/session] low token threshold reached; switching mode to slow", {
      lowThreshold,
      tokens_used_today: config.tokens_used_today,
      previous_mode: config.mode,
    });
    await setRuntimeConfig(supabase, { mode: "slow" });
    config = await getRuntimeConfig(supabase);
    console.log("[cron/session] config after slow-mode update", {
      mode: config.mode,
      always_on: config.always_on,
      last_run_at: config.last_run_at,
      tokens_used_today: config.tokens_used_today,
    });
  }

  const intervalMs = getIntervalMs(config.mode);
  let lastRunMs = getLastRunMs(config.last_run_at);

  if (lastRunMs === 0 && supabase) {
    console.log("[cron/session] no last_run_at; falling back to latest creative_session.started_at");
    const { data: row } = await supabase
      .from("creative_session")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row?.started_at) {
      lastRunMs = new Date(row.started_at).getTime();
      console.log("[cron/session] derived last_run_ms from creative_session", {
        started_at: row.started_at,
        lastRunMs,
      });
    } else {
      console.log("[cron/session] no creative_session rows found; treating as first run");
    }
  }

  const now = Date.now();
  const elapsed = lastRunMs > 0 ? now - lastRunMs : intervalMs;
  if (elapsed < intervalMs) {
    const nextRunInMs = intervalMs - elapsed;
    console.log("[cron/session] skipped: interval not reached", {
      mode: config.mode,
      intervalMs,
      lastRunMs,
      now,
      elapsed,
      nextRunInMs,
    });
    return NextResponse.json({
      skipped: true,
      reason: "interval",
      mode: config.mode,
      next_run_in_ms: nextRunInMs,
      config: {
        always_on: config.always_on,
        last_run_at: config.last_run_at,
      },
    });
  }

  console.log("[cron/session] session run started");

  // C-1: Hourly session rate-limit guard.
  const maxSessionsPerHour = getMaxSessionsPerHour();
  if (maxSessionsPerHour > 0 && supabase) {
    const sessionsThisHour = await getSessionsRunInLastHour(supabase);
    if (sessionsThisHour >= maxSessionsPerHour) {
      console.log("[cron/session] rate limit reached", {
        sessionsThisHour,
        maxSessionsPerHour,
      });
      return NextResponse.json({ error: "Session rate limit reached" }, { status: 429 });
    }
  }

  try {
    const payload = await runSessionInternal({
      createdBy: "harvey",
      isCron: true,
      promptContext: null,
      preferMedium: null,
    });

    if (supabase) {
      console.log("[cron/session] updating last_run_at");
      await setLastRunAt(supabase, new Date().toISOString());
    }

    console.log("[cron/session] session run succeeded", {
      session_id: payload.session_id,
      artifact_count: payload.artifact_count,
    });

    return NextResponse.json({
      triggered: true,
      mode: config.mode,
      session: {
        session_id: payload.session_id,
        artifact_count: payload.artifact_count,
        artifact_medium: payload.artifact_medium,
      },
    });
  } catch (e) {
    if (supabase) {
      // Do NOT advance last_run_at on failure; cron should retry next interval.
      console.error("[cron/session] session run failed (no last_run_at update)", {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    if (e instanceof SessionRunError) {
      console.error("[cron/session] session runner failed", {
        status: e.status,
        error: e.payload,
      });
      return NextResponse.json(
        {
          triggered: true,
          run_status: e.status,
          run_error: e.payload,
        },
        { status: 200 }
      );
    }

    console.error("[cron/session] session runner failed with unexpected error", {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      {
        triggered: true,
        run_status: 500,
        run_error: { error: "Session run failed" },
      },
      { status: 200 }
    );
  }
}
