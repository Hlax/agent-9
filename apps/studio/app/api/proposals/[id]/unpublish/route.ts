import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { writeChangeRecord } from "@/lib/change-record";
import { validateHabitatPayload } from "@/lib/habitat-payload";
import {
  canRollbackProposalState,
  getProposalAuthority,
  type LaneType,
} from "@/lib/proposal-governance";

/**
 * POST /api/proposals/[id]/unpublish — demote a habitat proposal from public and clear public_habitat_content.
 * Requires auth. Used to undo a previously approved-for-publication habitat layout.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    const { id } = await params;

    const { data: proposal, error: fetchErr } = await supabase
      .from("proposal_record")
      .select("*")
      .eq("proposal_record_id", id)
      .single();
    if (fetchErr || !proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    // Only handle habitat-style proposals that may have written to public_habitat_content.
    if (
      proposal.target_type !== "public_habitat_proposal" &&
      proposal.target_type !== "habitat" &&
      proposal.target_type !== "concept"
    ) {
      return NextResponse.json({ error: "Only habitat proposals can be unpublished via this route." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const archive = body?.archive === true;

    let slug: string = "home";
    if (proposal.habitat_payload_json && typeof proposal.habitat_payload_json === "object") {
      const result = validateHabitatPayload(proposal.habitat_payload_json);
      if (result.success) {
        slug = result.data.page;
      }
    }

    // Clear public_habitat_content for this slug (keeps row but removes payload/title/body).
    await supabase
      .from("public_habitat_content")
      .update({
        title: null,
        body: null,
        payload_json: null,
        updated_at: new Date().toISOString(),
      })
      .eq("slug", slug);

    const targetState = archive ? "archived" : "approved_for_staging";
    const lane = ((proposal.lane_type as string | null) ?? "surface") as LaneType;
    const authority = getProposalAuthority("http_user");
    const rollback = canRollbackProposalState({
      current_state: proposal.proposal_state as string,
      target_state: targetState,
      lane_type: lane,
      actor_authority: authority,
    });
    if (!rollback.ok) {
      return NextResponse.json(
        {
          error: `Cannot rollback proposal from '${proposal.proposal_state}' to '${targetState}'.`,
          reason_codes: rollback.reason_codes,
        },
        { status: 400 }
      );
    }

    await supabase
      .from("proposal_record")
      .update({
        proposal_state: targetState,
        updated_at: new Date().toISOString(),
      })
      .eq("proposal_record_id", id);

    await writeChangeRecord({
      supabase,
      change_type: "habitat_update",
      initiated_by: "harvey",
      target_type: "proposal_record",
      target_id: id,
      title: proposal.title ?? "Habitat content unpublished from public",
      description: proposal.summary ?? "Habitat proposal demoted from public habitat.",
      reason: "unpublish",
      approved_by: user?.email ?? "harvey",
    });

    return NextResponse.json({ ok: true, proposal_record_id: id, state: targetState, slug });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unpublish failed" },
      { status: 500 }
    );
  }
}

