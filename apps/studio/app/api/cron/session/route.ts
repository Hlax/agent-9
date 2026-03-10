/**
 * GET /api/cron/session — scheduler entrypoint.
 * Call from cron (e.g. every 1–5 min) with header x-cron-secret.
 * If always_on is enabled and interval elapsed, triggers POST /api/session/run.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  getRuntimeConfig,
  setLastRunAt,
  setRuntimeConfig,
  getIntervalMs,
} from "@/lib/runtime-config";
import { getLowTokenThreshold } from "@/lib/stop-limits";

const CRON_SECRET_HEADER = "x-cron-secret";

function getLastRunMs(lastRunAt: string | null): number {
  if (!lastRunAt) return 0;
  const t = new Date(lastRunAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export async function GET(request: Request) {
  const secret = request.headers.get(CRON_SECRET_HEADER);
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServer();
  let config = await getRuntimeConfig(supabase);

  if (!config.always_on) {
    return NextResponse.json({ skipped: true, reason: "always_on_disabled", mode: config.mode });
  }

  const lowThreshold = getLowTokenThreshold();
  if (lowThreshold > 0 && config.tokens_used_today >= lowThreshold && supabase && config.mode !== "slow") {
    await setRuntimeConfig(supabase, { mode: "slow" });
    config = await getRuntimeConfig(supabase);
  }

  const intervalMs = getIntervalMs(config.mode);
  let lastRunMs = getLastRunMs(config.last_run_at);

  if (lastRunMs === 0 && supabase) {
    const { data: row } = await supabase
      .from("creative_session")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row?.started_at) lastRunMs = new Date(row.started_at).getTime();
  }

  const now = Date.now();
  const elapsed = lastRunMs > 0 ? now - lastRunMs : intervalMs;
  if (elapsed < intervalMs) {
    return NextResponse.json({
      skipped: true,
      reason: "interval",
      mode: config.mode,
      next_run_in_ms: intervalMs - elapsed,
    });
  }

  const base = process.env.APP_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
  const url = base.startsWith("http") ? base : `https://${base}`;
  const runUrl = `${url.replace(/\/$/, "")}/api/session/run`;

  const res = await fetch(runUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [CRON_SECRET_HEADER]: process.env.CRON_SECRET,
    },
    body: JSON.stringify({}),
  });

  if (supabase && (res.ok || res.status < 500)) {
    await setLastRunAt(supabase, new Date().toISOString());
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { triggered: true, run_status: res.status, run_error: text.slice(0, 200) },
      { status: 200 }
    );
  }

  return NextResponse.json({ triggered: true, mode: config.mode });
}
