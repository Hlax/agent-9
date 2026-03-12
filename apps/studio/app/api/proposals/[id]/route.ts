import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { isValidProposalTransition } from "@/lib/proposal-transitions";

const ALLOWED_PROPOSAL_STATES = [
  "archived",
  "rejected",
  "ignored",
  "needs_revision",
  "staged",
  "approved_for_staging",
  "approved_for_publication",
  "published",
] as const;

/** States that only surface proposals may enter; medium/system must use approve route (which enforces lane). */
const SURFACE_ONLY_STATES = ["approved_for_staging", "approved_for_publication", "published"] as const;

/**
 * PATCH /api/proposals/[id] — update proposal state.
 * Body: { proposal_state }.
 * Negative: archived, rejected, ignored, needs_revision.
 * Positive flow (concept-to-proposal): staged, approved_for_staging, approved_for_publication, published.
 * Transition legality is enforced: only canonical forward moves are allowed (B-3).
 * Lane: only surface proposals may be moved to approved_for_staging, approved_for_publication, or published via PATCH; use /approve for governed path.
 * Exempt paths: /approve (domain side-effects) and /unpublish (privileged rollback).
 */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    const { id } = await params;
    const body = await _request.json().catch(() => ({}));
    const raw = body?.proposal_state;
    const proposal_state = ALLOWED_PROPOSAL_STATES.includes(raw) ? raw : null;
    if (!proposal_state) return NextResponse.json({ error: `proposal_state must be one of: ${ALLOWED_PROPOSAL_STATES.join(", ")}` }, { status: 400 });

    const { data: existing, error: fetchErr } = await supabase
      .from("proposal_record")
      .select("proposal_record_id, proposal_state, lane_type")
      .eq("proposal_record_id", id)
      .single();
    if (fetchErr || !existing) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    if (!isValidProposalTransition(existing.proposal_state, proposal_state)) {
      return NextResponse.json(
        { error: `Cannot transition proposal from '${existing.proposal_state}' to '${proposal_state}'.` },
        { status: 400 }
      );
    }

    const lane = (existing.lane_type ?? "surface") as string;
    if (
      (SURFACE_ONLY_STATES as readonly string[]).includes(proposal_state) &&
      lane !== "surface"
    ) {
      return NextResponse.json(
        {
          error:
            "Only surface proposals may be moved to approved_for_staging, approved_for_publication, or published. Use POST /api/proposals/[id]/approve for the governed path.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("proposal_record")
      .update({ proposal_state, updated_at: new Date().toISOString() })
      .eq("proposal_record_id", id)
      .select("proposal_record_id, proposal_state")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
