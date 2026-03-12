import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/staging/proposals — proposals for staging habitat (approved_for_staging, staged).
 * No auth required so habitat-staging app can load from Studio API (same-origin or NEXT_PUBLIC_STUDIO_URL).
 * In production you may restrict by network or add a shared secret.
 */
export async function GET() {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ proposals: [] });

    const { data, error } = await supabase
      .from("proposal_record")
      .select("proposal_record_id, lane_type, target_type, proposal_role, title, summary, proposal_state, target_surface, proposal_type, preview_uri, artifact_id, habitat_payload_json, created_at, updated_at")
      .eq("lane_type", "surface")
      .in("proposal_state", ["approved_for_staging", "staged", "approved_for_publication", "published"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposals: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
