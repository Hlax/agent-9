import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { writeChangeRecord } from "@/lib/change-record";
import { validateHabitatPayload, collectArtifactIdsFromPayload } from "@/lib/habitat-payload";
import { isLegalProposalStateTransition } from "@/lib/governance-rules";
import { mergeHabitatProposalIntoStaging } from "@/lib/staging-composition";

/**
 * POST /api/proposals/[id]/approve — approve a proposal and apply it.
 * Body: { action: 'apply_name' | 'approve_avatar' | 'approve' | 'approve_for_staging' | 'approve_for_publication' }.
 * - apply_name: set active identity.name from proposal title; moves proposal to approved_for_staging.
 * - approve_avatar: update identity.embodiment_direction from proposal; moves proposal to approved_for_staging.
 * - approve: legacy Harvey override; set proposal_state to 'approved'.
 * - approve_for_staging: set proposal_state to 'approved_for_staging' (gate: agent may build in staging). Canon: concept_to_proposal_flow.md.
 * - approve_for_publication: set proposal_state to 'approved_for_publication'; for habitat proposals upsert public_habitat_content; for avatar_candidate set identity.active_avatar_artifact_id.
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
    const body = await request.json().catch(() => ({}));
    const action = body?.action ?? "approve";

    const { data: proposal, error: fetchErr } = await supabase
      .from("proposal_record")
      .select("*")
      .eq("proposal_record_id", id)
      .single();
    if (fetchErr || !proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    // Map each action to a canonical proposal FSM target state.
    // apply_name and approve_avatar apply a domain side effect and move the
    // proposal to approved_for_staging — the first legal forward step from
    // pending_review (pending_review → approved_for_staging is a valid FSM
    // transition). The legacy "approved" state is unreachable from pending_review
    // in the current FSM, so these actions no longer target it.
    let newState = "approved_for_staging" as string;
    if (action === "approve_for_staging") {
      newState = "approved_for_staging";
    } else if (action === "approve_for_publication" || action === "approve_publication") {
      newState = "approved_for_publication";
    } else if (action === "approve") {
      // Legacy: keep "approved" for callers explicitly requesting it (Harvey override).
      newState = "approved";
    }

    if (!isLegalProposalStateTransition(proposal.proposal_state, newState)) {
      return NextResponse.json(
        {
          error: `Cannot transition proposal from '${proposal.proposal_state}' to '${newState}'.`,
        },
        { status: 400 }
      );
    }

    const approvedBy = user?.email ?? "harvey";

    // Normalize habitat payload: Supabase may return JSONB as string; support both keys.
    let habitatPayload: unknown =
      proposal.habitat_payload_json ?? (proposal as Record<string, unknown>).habitatPayloadJson;
    if (typeof habitatPayload === "string") {
      try {
        habitatPayload = JSON.parse(habitatPayload) as unknown;
      } catch {
        habitatPayload = null;
      }
    }

    // Branch model: approve_for_staging for habitat proposals merges into staging composition.
    const isHabitatForStaging =
      action === "approve_for_staging" &&
      habitatPayload != null &&
      typeof habitatPayload === "object" &&
      (proposal.target_surface === "staging_habitat" || proposal.target_type === "concept");
    if (isHabitatForStaging) {
      const mergeResult = await mergeHabitatProposalIntoStaging(
        supabase,
        id,
        habitatPayload,
        proposal.title
      );
      if (!mergeResult.applied) {
        return NextResponse.json(
          {
            error: mergeResult.error
              ? `Staging merge failed: ${mergeResult.error}`
              : "Staging merge failed; proposal state was not advanced.",
          },
          { status: 400 }
        );
      }
    }

    if (action === "apply_name" && proposal.target_type === "identity_name") {
      const { data: ident } = await supabase.from("identity").select("identity_id").eq("is_active", true).limit(1).maybeSingle();
      if (ident) {
        await supabase.from("identity").update({
          name: proposal.title ?? "",
          name_status: "accepted",
          updated_at: new Date().toISOString(),
        }).eq("identity_id", ident.identity_id);
        await writeChangeRecord({
          supabase,
          change_type: "identity_update",
          initiated_by: "harvey",
          target_type: "proposal_record",
          target_id: id,
          title: `Identity name: ${proposal.title ?? "accepted"}`,
          description: proposal.summary ?? "Name proposal approved and applied.",
          reason: null,
          approved_by: approvedBy,
        });
      }
    }
    if (action === "approve_avatar" && proposal.target_type === "avatar_candidate") {
      const { data: ident } = await supabase.from("identity").select("identity_id").eq("is_active", true).limit(1).maybeSingle();
      if (ident && (proposal.summary ?? proposal.title)) {
        await supabase.from("identity").update({ embodiment_direction: (proposal.summary ?? proposal.title).slice(0, 2000), updated_at: new Date().toISOString() }).eq("identity_id", ident.identity_id);
        await writeChangeRecord({
          supabase,
          change_type: "embodiment_update",
          initiated_by: "harvey",
          target_type: "proposal_record",
          target_id: id,
          title: "Avatar / embodiment direction updated",
          description: (proposal.summary ?? proposal.title ?? "").slice(0, 500),
          reason: null,
          approved_by: approvedBy,
        });
      }
    }
    if (
      (action === "approve_for_publication" || action === "approve_publication") &&
      proposal.target_type === "avatar_candidate" &&
      proposal.artifact_id
    ) {
      const { data: art } = await supabase
        .from("artifact")
        .select("artifact_id, medium, current_approval_state")
        .eq("artifact_id", proposal.artifact_id)
        .single();
      if (!art || art.medium !== "image") {
        return NextResponse.json(
          { error: "Avatar proposal must reference an image artifact." },
          { status: 400 }
        );
      }
      if (art.current_approval_state !== "approved" && art.current_approval_state !== "approved_for_publication") {
        return NextResponse.json(
          { error: "Image must be approved before setting as public avatar." },
          { status: 400 }
        );
      }
      const { data: ident } = await supabase.from("identity").select("identity_id").eq("is_active", true).limit(1).maybeSingle();
      if (ident) {
        await supabase.from("identity").update({
          active_avatar_artifact_id: proposal.artifact_id,
          updated_at: new Date().toISOString(),
        }).eq("identity_id", ident.identity_id);
        await writeChangeRecord({
          supabase,
          change_type: "avatar_update",
          initiated_by: "harvey",
          target_type: "proposal_record",
          target_id: id,
          title: "Public avatar set from proposal",
          description: `Artifact ${proposal.artifact_id} set as active public avatar.`,
          reason: null,
          approved_by: approvedBy,
        });
      }
    }
    if (
      (action === "approve_for_publication" || action === "approve_publication") &&
      (proposal.target_type === "public_habitat_proposal" || proposal.target_type === "habitat" || proposal.target_type === "concept")
    ) {
      let slug: string = "home";
      const title = proposal.title ?? "Habitat";
      const body = proposal.summary ?? null;
      let payload_json: object | null = null;

      if (habitatPayload != null && typeof habitatPayload === "object") {
        const result = validateHabitatPayload(habitatPayload);
        if (!result.success) {
          return NextResponse.json(
            { error: "Habitat payload invalid for publication", details: result.error },
            { status: 400 }
          );
        }
        const payload = result.data;
        slug = payload.page;
        const refIds = collectArtifactIdsFromPayload(payload);
        if (refIds.length > 0) {
          const { data: publicArtifacts } = await supabase
            .from("artifact")
            .select("artifact_id")
            .eq("current_approval_state", "approved_for_publication")
            .eq("current_publication_state", "published");
          const allowedIds = new Set((publicArtifacts ?? []).map((a: { artifact_id: string }) => a.artifact_id));
          const { data: ident } = await supabase.from("identity").select("active_avatar_artifact_id").eq("is_active", true).limit(1).maybeSingle();
          if (ident?.active_avatar_artifact_id) allowedIds.add(ident.active_avatar_artifact_id);
          const invalid = refIds.filter((rid) => !allowedIds.has(rid));
          if (invalid.length > 0) {
            return NextResponse.json(
              { error: "Habitat payload references non-public artifacts", artifact_ids: invalid },
              { status: 400 }
            );
          }
        }
        payload_json = payload as object;
      }

      await supabase.from("public_habitat_content").upsert(
        { slug, title, body, payload_json, updated_at: new Date().toISOString() },
        { onConflict: "slug" }
      );
      await writeChangeRecord({
        supabase,
        change_type: "habitat_update",
        initiated_by: "harvey",
        target_type: "proposal_record",
        target_id: id,
        title: proposal.title ?? "Habitat content approved for publication",
        description: proposal.summary ?? "Habitat proposal approved and applied to public_habitat_content.",
        reason: null,
        approved_by: approvedBy,
      });
    }

    if (proposal.lane_type === "system") {
      await writeChangeRecord({
        supabase,
        change_type: "system_update",
        initiated_by: "harvey",
        target_type: "proposal_record",
        target_id: id,
        title: proposal.title ?? "System proposal approved",
        description: proposal.summary ?? "System proposal approved.",
        reason: null,
        approved_by: approvedBy,
      });
    }

    const { error: updateErr } = await supabase
      .from("proposal_record")
      .update({ proposal_state: newState, updated_at: new Date().toISOString() })
      .eq("proposal_record_id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, proposal_record_id: id, action, proposal_state: newState });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
