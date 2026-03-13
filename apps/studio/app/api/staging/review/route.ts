import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  buildStagingBuckets,
  type RawStagingPage,
  type RawStagingProposal,
} from "@/lib/staging-read-model";
import {
  canTransitionProposalState,
  getProposalAuthority,
  type LaneType,
} from "@/lib/proposal-governance";

const TERMINAL_STATES = ["archived", "rejected", "ignored", "published"] as const;

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
        buckets: {
          habitat: { groups: [] },
          artifacts: { proposals: [] },
          critiques: { proposals: [] },
          extensions: { proposals: [] },
          system: { proposals: [] },
        },
        totals: {
          proposals: 0,
          habitatGroups: 0,
          artifacts: 0,
          critiques: 0,
          extensions: 0,
          system: 0,
        },
      });
    }

    const [proposalRes, pageRes] = await Promise.all([
      supabase
        .from("proposal_record")
        .select(
          "proposal_record_id, lane_type, target_type, target_surface, proposal_role, proposal_type, title, summary, proposal_state, review_note, habitat_payload_json, artifact_id, created_at, updated_at"
        )
        .not("proposal_state", "in", TERMINAL_STATES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("staging_habitat_content")
        .select("slug, title, payload_json, source_proposal_id, updated_at"),
    ]);

    if (proposalRes.error) {
      return NextResponse.json(
        { error: proposalRes.error.message },
        { status: 500 }
      );
    }

    if (pageRes.error) {
      return NextResponse.json(
        { error: pageRes.error.message },
        { status: 500 }
      );
    }

    const proposalsRaw = (proposalRes.data ?? []) as RawStagingProposal[];
    const pages = (pageRes.data ?? []) as RawStagingPage[];

    const authority = getProposalAuthority("reviewer");

    const proposalsWithActions: RawStagingProposal[] = proposalsRaw.map((p) => {
      const lane = ((p.lane_type as string | null) ?? "surface") as LaneType;
      const allowed: string[] = [];
      for (const action of ACTIONS) {
        const check = canTransitionProposalState({
          current_state: p.proposal_state as string,
          target_state: action.target_state,
          lane_type: lane,
          actor_authority: authority,
        });
        if (check.ok) {
          allowed.push(action.key);
        }
      }
      return {
        ...p,
        allowed_actions: allowed,
      };
    });

    const model = buildStagingBuckets(proposalsWithActions, pages);

    return NextResponse.json(model);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Failed to load staging review model.",
      },
      { status: 500 }
    );
  }
}

