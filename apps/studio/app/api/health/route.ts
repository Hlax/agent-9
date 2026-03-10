/**
 * GET /api/health — liveness/readiness for Studio.
 * Returns 200 with { ok, db } when app is up; 503 if DB required and unavailable.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabase = getSupabaseServer();
  let db: "ok" | "unavailable" | "not_configured" = "not_configured";
  if (supabase) {
    const { error } = await supabase.from("runtime_config").select("key").limit(1).maybeSingle();
    db = error ? "unavailable" : "ok";
  }

  const ok = true;
  if (db === "unavailable") {
    return NextResponse.json({ ok, db }, { status: 503 });
  }
  return NextResponse.json({ ok, db });
}
