import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getRuntimeDeliberationPayload } from "@/lib/runtime-state-api";

/**
 * GET /api/runtime/deliberation — latest deliberation_trace row.
 * Internal introspection endpoint; not for public surfaces.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  const payload = await getRuntimeDeliberationPayload(supabase);
  if ("error" in payload && payload.error) {
    return NextResponse.json({ trace: null, error: payload.error }, { status: 500 });
  }
  return NextResponse.json(payload);
}
