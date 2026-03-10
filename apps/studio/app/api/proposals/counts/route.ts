import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/proposals/counts — return proposal counts per lane/target for layout (e.g. hide mock when any count > 0).
 * Query: lane_type (optional). If lane_type=surface, returns { identity_name, public_habitat_proposal, avatar_candidate }.
 */
export async function GET(request: Request) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ identity_name: 0, public_habitat_proposal: 0, avatar_candidate: 0 });

    const { searchParams } = new URL(request.url);
    const lane_type = searchParams.get("lane_type") ?? "surface";

    if (lane_type !== "surface") {
      return NextResponse.json({ identity_name: 0, public_habitat_proposal: 0, avatar_candidate: 0 });
    }

    const approvedStates = ["approved", "approved_for_staging", "approved_for_publication"];
    const [nameRes, habitatRes, avatarRes] = await Promise.all([
      supabase.from("proposal_record").select("proposal_record_id", { count: "exact", head: true }).eq("lane_type", "surface").eq("target_type", "identity_name").in("proposal_state", ["pending_review", ...approvedStates]),
      supabase.from("proposal_record").select("proposal_record_id", { count: "exact", head: true }).eq("lane_type", "surface").eq("target_type", "public_habitat_proposal").in("proposal_state", ["pending_review", ...approvedStates]),
      supabase.from("proposal_record").select("proposal_record_id", { count: "exact", head: true }).eq("lane_type", "surface").eq("target_type", "avatar_candidate").in("proposal_state", ["pending_review", ...approvedStates]),
    ]);

    const identity_name = nameRes.count ?? 0;
    const public_habitat_proposal = habitatRes.count ?? 0;
    const avatar_candidate = avatarRes.count ?? 0;

    return NextResponse.json({ identity_name, public_habitat_proposal, avatar_candidate });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
