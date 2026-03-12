import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getRuntimeContinuityPayload } from "@/lib/runtime-state-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/runtime/continuity — recent session ontology continuity view.
 * Internal-only; returns shaped rows and aggregates for operator inspection.
 */
export async function GET() {
  const supabase = getSupabaseServer();
  const payload = await getRuntimeContinuityPayload(supabase);
  if ("error" in payload && payload.error) {
    return NextResponse.json(
      { sessions: [], summary: null, error: payload.error },
      { status: 500 }
    );
  }
  return NextResponse.json(payload);
}
