import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getRuntimeStatePayload } from "@/lib/runtime-state-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/runtime/state — latest creative_state_snapshot, backlog, runtime config, synthesis_pressure, and introspection fields.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  const payload = await getRuntimeStatePayload(supabase);
  return NextResponse.json(payload);
}
