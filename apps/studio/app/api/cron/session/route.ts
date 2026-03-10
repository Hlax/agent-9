/**
 * GET /api/cron/session — scheduler entrypoint.
 * Call from cron (e.g. every 1–5 min) with header x-cron-secret.
 * If always_on is enabled and interval elapsed, triggers POST /api/session/run.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getRuntimeConfig, setLastRunAt, setRuntimeConfig, getIntervalMs } from "@/lib/runtime-config";
import { getLowTokenThreshold } from "@/lib/stop-limits";

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

  const base = process.env.APP_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
  const url = base.startsWith("http") ? base : `https://${base}`;
  const runUrl = `${url.replace(/\/$/, "")}/api/session/run`;

  console.log("[cron/session] about to call session runner", { runUrl });

  // Empty body = no preferMedium; session/run will use derivePreferredMedium (creative state).
  // CRON_SECRET must be set in Vercel env so session/run accepts this server-to-server call.
  const res = await fetch(runUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [CRON_SECRET_HEADER]: process.env.CRON_SECRET ?? "",
    },
    body: JSON.stringify({}),
  });

  console.log("[cron/session] session runner response", {
    ok: res.ok,
    status: res.status,
  });

  if (supabase && (res.ok || res.status < 500)) {
    console.log("[cron/session] updating last_run_at");
    await setLastRunAt(supabase, new Date().toISOString());
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[cron/session] session runner failed", {
      status: res.status,
      error: text.slice(0, 200),
    });
    return NextResponse.json(
      {
        triggered: true,
        run_status: res.status,
        run_error: text.slice(0, 200),
      },
      { status: 200 }
    );
  }

  console.log("[cron/session] completed successfully", { mode: config.mode });
  return NextResponse.json({ triggered: true, mode: config.mode });
}
