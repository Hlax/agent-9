/**
 * GET /api/cron/session — scheduler entrypoint.
 * Intended to be called by Vercel Cron (Authorization: Bearer ${CRON_SECRET})
 * and optionally by manual callers with header x-cron-secret.
 * If always_on is enabled and interval elapsed, acquires runtime lock and runs
 * up to MAX_SESSIONS_PER_WAKE sessions sequentially; stops early on guardrails or 45s limit.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  getRuntimeConfig,
  setLastRunAt,
  setRuntimeConfig,
  getIntervalMs,
  getSessionsRunInLastHour,
  getMaxSessionsPerHour,
} from "@/lib/runtime-config";
import { getLowTokenThreshold } from "@/lib/stop-limits";
import { runSessionInternal, SessionRunError } from "@/lib/session-runner";
import { tryAcquireRuntimeLock, releaseRuntimeLock, LOCK_LEASE_MINUTES } from "@/lib/runtime-lock";
import type { SessionRunSuccessPayload } from "@/lib/session-runner";

const CRON_SECRET_HEADER = "x-cron-secret";

const MAX_SESSIONS_PER_WAKE = 1;
const MAX_RUNTIME_DURATION_MS = 45_000;

function getLastRunMs(lastRunAt: string | null): number {
  if (!lastRunAt) return 0;
  const t = new Date(lastRunAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export async function GET(request: Request) {
  console.info("[cron/session] start", {
    timestamp: new Date().toISOString(),
  });

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

  console.info("[cron/session] auth_passed");

  const supabase = getSupabaseServer();
  let config = await getRuntimeConfig(supabase);

  console.log("[cron/session] hit");
  console.log("[cron/session] loaded config", {
  mode: config.mode,
  always_on: config.always_on,
  last_run_at: config.last_run_at,
  tokens_used_today: config.tokens_used_today,
  });

  const alwaysOnEnabled = config.always_on;
  console.info("[cron/session] always_on_check", {
    always_on_enabled: alwaysOnEnabled,
  });
  if (!config.always_on) {
    console.info("[cron/session] exit", {
      reason: "always_on_disabled",
    });
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
  const shouldRun = elapsed >= intervalMs;
  console.info("[cron/session] interval_check", {
    should_run: shouldRun,
    last_run_at: config.last_run_at,
  });
  if (elapsed < intervalMs) {
    console.info("[cron/session] exit", {
      reason: "interval_skip",
    });
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

  // C-1: Hourly session rate-limit guard.
  const maxSessionsPerHour = getMaxSessionsPerHour(config.mode);
  let hourlyCount = 0;
  if (maxSessionsPerHour > 0 && supabase) {
    hourlyCount = await getSessionsRunInLastHour(supabase);
    const allowed = maxSessionsPerHour;
    console.info("[cron/session] hourly_limit_check", {
      allowed,
      hourly_count: hourlyCount,
    });
    if (hourlyCount >= maxSessionsPerHour) {
      console.info("[cron/session] exit", {
        reason: "hourly_limit",
      });
      console.log("[cron/session] rate limit reached", {
        sessionsThisHour: hourlyCount,
        maxSessionsPerHour,
      });
      return NextResponse.json({ error: "Session rate limit reached" }, { status: 429 });
    }
  } else {
    console.info("[cron/session] hourly_limit_check", {
      allowed: maxSessionsPerHour,
      hourly_count: hourlyCount,
    });
  }

  console.info("[cron/session] lock_attempt");
  const ownerId = crypto.randomUUID();
  const lockResult = await tryAcquireRuntimeLock(supabase, ownerId, LOCK_LEASE_MINUTES);
  const acquired = lockResult.acquired;
  console.info("[cron/session] lock_result", {
    acquired,
  });
  if (!lockResult.acquired) {
    console.info("[cron/session] exit", {
      reason: "lock_held",
    });
    console.log("[cron/session] skipped: lock held by another runner");
    return NextResponse.json({
      skipped: true,
      reason: "lock_held",
      mode: config.mode,
    });
  }

  const startTime = Date.now();
  const sessions: Array<{ session_id: string; artifact_count: number; artifact_medium?: string | null }> = [];
  let lastPayload: SessionRunSuccessPayload | null = null;
  let runError: { status: number; payload: unknown } | null = null;
  let guardrailStop: string | null = null;

  try {
    console.info("[cron/session] batch_start", {
      max_sessions: MAX_SESSIONS_PER_WAKE,
    });

    for (let i = 0; i < MAX_SESSIONS_PER_WAKE; i++) {
      if (Date.now() - startTime >= MAX_RUNTIME_DURATION_MS) {
        console.info("[cron/session] exit", {
          reason: "time_budget",
        });
        console.log("[cron/session] hard stop: max runtime duration reached");
        break;
      }

      console.info("[cron/session] session_start", {
        index: i + 1,
      });
      try {
        const payload = await runSessionInternal({
          createdBy: "harvey",
          isCron: true,
          promptContext: null,
          preferMedium: null,
        });

        lastPayload = payload;
        if (supabase) {
          await setLastRunAt(supabase, new Date().toISOString());
        }

        sessions.push({
          session_id: payload.session_id,
          artifact_count: payload.artifact_count,
          artifact_medium: payload.artifact_medium,
        });
        console.info("[cron/session] session_complete", {
          index: i + 1,
        });
        console.log(`[Runtime] Session ${i + 1}/${MAX_SESSIONS_PER_WAKE} complete`, {
          session_id: payload.session_id,
          artifact_count: payload.artifact_count,
        });

        if (payload.guardrail_stop) {
          guardrailStop = payload.guardrail_stop;
          console.info("[cron/session] guardrail_stop", {
            reason: payload.guardrail_stop,
          });
          console.log("[cron/session] guardrail stop", { guardrail_stop: payload.guardrail_stop });
          break;
        }
      } catch (e) {
        console.info("[cron/session] exit", {
          reason: "session_error",
        });
        if (e instanceof SessionRunError) {
          runError = { status: e.status, payload: e.payload };
          console.error("[cron/session] session runner error (stopping batch)", {
            status: e.status,
            error: e.payload,
          });
        } else {
          runError = { status: 500, payload: { error: e instanceof Error ? e.message : "Session run failed" } };
          console.error("[cron/session] unexpected error (stopping batch)", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
        break;
      }
    }

    const lastSession = lastPayload
      ? {
          session_id: lastPayload.session_id,
          artifact_count: lastPayload.artifact_count,
          artifact_medium: lastPayload.artifact_medium,
        }
      : sessions[sessions.length - 1] ?? null;

    const sessionsRun = sessions.length;
    console.info("[cron/session] finished", {
      sessions_run: sessionsRun,
    });

    return NextResponse.json({
      triggered: true,
      mode: config.mode,
      sessions_run: sessions.length,
      sessions,
      session: lastSession,
      ...(guardrailStop && { guardrail_stop: guardrailStop }),
      ...(runError && { run_status: runError.status, run_error: runError.payload }),
    });
  } finally {
    await releaseRuntimeLock(supabase);
  }
}
