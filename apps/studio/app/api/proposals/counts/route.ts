import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getLaneMap } from "@/lib/canon";

const ACTIVE_STATES = ["pending_review", "approved", "approved_for_staging", "approved_for_publication", "staged"];

/**
 * GET /api/proposals/counts — canon-native counts by lane_id and optionally by proposal_type.
 * Query: proposal_type (optional). Returns { byLane: Record<lane_id, number>, byProposalType?: Record<proposal_type, number> }.
 * Legacy keys (identity_name, public_habitat_proposal, avatar_candidate) are quarantined; prefer byLane / byProposalType.
 */
export async function GET(request: Request) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) {
      const laneMap = getLaneMap();
      const byLane: Record<string, number> = {};
      for (const l of laneMap.lanes) byLane[l.lane_id] = 0;
      return NextResponse.json({ byLane, byProposalType: {} });
    }

    const { searchParams } = new URL(request.url);
    const includeByProposalType = searchParams.get("by_proposal_type") === "1" || searchParams.get("by_proposal_type") === "true";

    const laneMap = getLaneMap();
    const byLane: Record<string, number> = {};
    for (const l of laneMap.lanes) byLane[l.lane_id] = 0;

    const dbLaneTypes = ["surface", "medium", "system"] as const;
    const [surfaceRes, mediumRes, systemRes] = await Promise.all(
      dbLaneTypes.map((lane_type) =>
        supabase
          .from("proposal_record")
          .select("proposal_record_id", { count: "exact", head: true })
          .eq("lane_type", lane_type)
          .in("proposal_state", ACTIVE_STATES)
      )
    );

    const surfaceCount = surfaceRes.count ?? 0;
    const mediumCount = mediumRes.count ?? 0;
    const systemCount = systemRes.count ?? 0;

    byLane["build_lane"] = surfaceCount;
    byLane["promotion_lane"] = 0;
    byLane["audit_lane"] = mediumCount;
    byLane["system_lane"] = systemCount;
    byLane["canon_lane"] = 0;

    let byProposalType: Record<string, number> = {};
    if (includeByProposalType) {
      const { data: all } = await supabase
        .from("proposal_record")
        .select("proposal_type")
        .in("proposal_state", ACTIVE_STATES);
      const counts: Record<string, number> = {};
      for (const row of all ?? []) {
        const pt = (row as { proposal_type: string | null }).proposal_type ?? "_none";
        counts[pt] = (counts[pt] ?? 0) + 1;
      }
      byProposalType = counts;
    }

    return NextResponse.json({ byLane, byProposalType });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
