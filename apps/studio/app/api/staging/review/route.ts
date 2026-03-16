import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  getStagingReviewModel,
  type RawStagingProposal,
} from "@/lib/staging-read-model";
import {
  canTransitionProposalState,
  getProposalAuthority,
  type LaneType,
} from "@/lib/proposal-governance";

const ACTIONS: { key: string; target_state: string }[] = [
  { key: "approve_for_staging", target_state: "approved_for_staging" },
  { key: "needs_revision", target_state: "needs_revision" },
  { key: "reject", target_state: "rejected" },
  { key: "ignore", target_state: "ignored" },
  { key: "approve_for_publication", target_state: "approved_for_publication" },
];

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) {
      return NextResponse.json({
        lanes: {},
        totals: { proposals: 0, byLane: {}, habitatGroups: 0, artifacts: 0, critiques: 0, extensions: 0, system: 0 },
        buckets: {
          habitat: { groups: [] },
          artifacts: { proposals: [] },
          critiques: { proposals: [] },
          extensions: { proposals: [] },
          system: { proposals: [] },
        },
      });
    }

    const model = await getStagingReviewModel(supabase);
    const authority = getProposalAuthority("reviewer");

    const addActions = (lane_type: string | null, proposal_state: string): string[] => {
      const lane = (lane_type ?? "surface") as LaneType;
      const allowed: string[] = [];
      for (const action of ACTIONS) {
        const check = canTransitionProposalState({
          current_state: proposal_state,
          target_state: action.target_state,
          lane_type: lane,
          actor_authority: authority,
        });
        if (check.ok) allowed.push(action.key);
      }
      return allowed;
    };

    for (const laneId of Object.keys(model.lanes)) {
      const laneData = model.lanes[laneId];
      if (laneData?.proposals) {
        laneData.proposals = laneData.proposals.map((v) => ({
          ...v,
          allowed_actions: addActions(v.lane_type, v.proposal_state),
        }));
      }
      if (laneData?.groups) {
        for (const g of laneData.groups) {
          g.proposals = g.proposals.map((v) => ({
            ...v,
            allowed_actions: addActions(v.lane_type, v.proposal_state),
          }));
        }
      }
    }
    for (const key of ["habitat", "artifacts", "critiques", "extensions", "system"] as const) {
      const bucket = model.buckets[key];
      if ("groups" in bucket && bucket.groups) {
        for (const g of bucket.groups) {
          g.proposals = g.proposals.map((v) => ({
            ...v,
            allowed_actions: addActions(v.lane_type, v.proposal_state),
          }));
        }
      } else if ("proposals" in bucket && bucket.proposals) {
        bucket.proposals = bucket.proposals.map((v) => ({
          ...v,
          allowed_actions: addActions(v.lane_type, v.proposal_state),
        }));
      }
    }

    return NextResponse.json(model);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load staging review model." },
      { status: 500 }
    );
  }
}

