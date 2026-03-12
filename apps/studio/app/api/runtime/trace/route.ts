import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getRuntimeTracePayload } from "@/lib/runtime-state-api";

/**
 * GET /api/runtime/trace — last 10 sessions with trace (decision chain) for Twin introspection.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  const payload = await getRuntimeTracePayload(supabase);
  if ("error" in payload && payload.error) {
    return NextResponse.json({ sessions: [], error: payload.error }, { status: 500 });
  }
  return NextResponse.json(payload);
}
