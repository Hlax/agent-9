/**
 * Staging habitat composition: merge approved proposals into staging, promote to public.
 * Canon: docs/architecture/habitat_branch_staging_design.md
 * Snapshot lineage: docs/05_build/SNAPSHOT_LINEAGE_IDENTITY_TRAJECTORY_V1.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveTraitSummaryFromStagingPages } from "./habitat-trait-summary";
import { parseHabitatPayloadForMerge, validateHabitatPayload } from "./habitat-payload";
import {
  canTransitionProposalState,
  getProposalAuthority,
  type LaneType,
} from "./proposal-governance";

/** Active identity id (is_active = true). Required for lineage; even single-identity must set identity_id. */
export async function getActiveIdentityId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("identity")
    .select("identity_id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return (data?.identity_id as string) ?? null;
}

/** Previous public snapshot for this identity (chain head). Used as parent_snapshot_id for new public snapshot. */
export async function getPreviousPublicSnapshotId(
  supabase: SupabaseClient,
  identityId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("habitat_snapshot")
    .select("snapshot_id")
    .eq("identity_id", identityId)
    .eq("snapshot_kind", "public")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.snapshot_id as string) ?? null;
}

/** Create a new public snapshot row (immutable). On promotion we create a NEW row; do not re-tag staging. */
export async function createPublicHabitatSnapshot(
  supabase: SupabaseClient,
  params: {
    identity_id: string;
    parent_snapshot_id: string | null;
    payload_json: object;
    trait_summary: object;
    source_session_ids: string[];
  }
): Promise<{ snapshot_id: string } | { error: string }> {
  const now = new Date().toISOString();
  const row = {
    identity_id: params.identity_id,
    parent_snapshot_id: params.parent_snapshot_id,
    snapshot_kind: "public" as const,
    created_at: now,
    source_session_ids: params.source_session_ids,
    trait_summary: params.trait_summary,
    lineage_metadata: null as object | null,
    payload_json: params.payload_json,
  };
  const { data, error } = await supabase
    .from("habitat_snapshot")
    .insert(row)
    .select("snapshot_id")
    .single();
  if (error) return { error: error.message };
  return { snapshot_id: (data?.snapshot_id as string) ?? "" };
}

/**
 * Proposal states from which a promotion-to-public may advance to 'published'.
 * Only proposals in these states are eligible for bulk advancement on promotion.
 */
const PROMOTABLE_PROPOSAL_STATES = [
  "approved_for_staging",
  "staged",
  "approved_for_publication",
] as const;

export interface StagingPageRow {
  slug: string;
  title: string | null;
  body: string | null;
  payload_json: object | null;
  source_proposal_id: string | null;
  updated_at: string;
}

/**
 * Merge a single habitat proposal into staging_habitat_content (per-page replace).
 * Supports real payload shape: page (string slug), blocks (array), version (optional number).
 * If full validation passes we use it; otherwise we accept minimal merge shape (page + blocks).
 * Returns true if merge was applied; false if payload invalid. Do not advance proposal state when false.
 */
export async function mergeHabitatProposalIntoStaging(
  supabase: SupabaseClient,
  proposalRecordId: string,
  habitatPayloadJson: unknown,
  proposalTitle?: string | null
): Promise<{ applied: boolean; slug?: string; error?: string }> {
  const raw =
    typeof habitatPayloadJson === "string"
      ? (() => {
          try {
            return JSON.parse(habitatPayloadJson) as unknown;
          } catch {
            return habitatPayloadJson;
          }
        })()
      : habitatPayloadJson;

  let slug: string;
  let payloadForStaging: object;

  const fullResult = validateHabitatPayload(raw);
  if (fullResult.success) {
    slug = fullResult.data.page;
    payloadForStaging = fullResult.data as object;
  } else {
    const minimalResult = parseHabitatPayloadForMerge(raw);
    if ("error" in minimalResult) {
      return { applied: false, error: minimalResult.error };
    }
    slug = minimalResult.slug;
    payloadForStaging = minimalResult.payload;
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("staging_habitat_content").upsert(
    {
      slug,
      title: proposalTitle ?? slug,
      body: null,
      payload_json: payloadForStaging,
      source_proposal_id: proposalRecordId,
      updated_at: now,
    },
    { onConflict: "slug" }
  );
  if (error) {
    return { applied: false, slug, error: error.message };
  }
  return { applied: true, slug };
}

/**
 * Promote current staging composition to public (copy staging_habitat_content → public_habitat_content).
 * Records promotion in habitat_promotion_record. Human-only; no runner.
 * After successful promotion, advances source proposals to 'published' state.
 * Returns an error if staging composition is empty (nothing to promote).
 */
export async function promoteStagingToPublic(
  supabase: SupabaseClient,
  promotedBy: string
): Promise<{ promotionId: string; slugsUpdated: string[]; proposalsPublished: number; error?: string }> {
  const { data: stagingRows, error: fetchErr } = await supabase
    .from("staging_habitat_content")
    .select("slug, title, body, payload_json, source_proposal_id");
  if (fetchErr) {
    return { promotionId: "", slugsUpdated: [], proposalsPublished: 0, error: fetchErr.message };
  }
  const rows = (stagingRows ?? []) as StagingPageRow[];

  if (rows.length === 0) {
    return {
      promotionId: "",
      slugsUpdated: [],
      proposalsPublished: 0,
      error: "Staging composition is empty; nothing to promote to public.",
    };
  }

  const slugsUpdated: string[] = [];
  const now = new Date().toISOString();
  for (const row of rows) {
    const { error: upsertErr } = await supabase.from("public_habitat_content").upsert(
      {
        slug: row.slug,
        title: row.title,
        body: row.body,
        payload_json: row.payload_json,
        updated_at: now,
      },
      { onConflict: "slug" }
    );
    if (upsertErr) {
      return { promotionId: "", slugsUpdated, proposalsPublished: 0, error: upsertErr.message };
    }
    slugsUpdated.push(row.slug);
  }

  // Snapshot lineage V1: create new public snapshot (identity-scoped chain). Do not re-tag staging row.
  const identityId = await getActiveIdentityId(supabase);
  let newSnapshotId: string | null = null;
  let previousPublicSnapshotId: string | null = null;
  if (identityId) {
    previousPublicSnapshotId = await getPreviousPublicSnapshotId(supabase, identityId);
    const { data: ident } = await supabase
      .from("identity")
      .select("active_avatar_artifact_id, embodiment_direction")
      .eq("identity_id", identityId)
      .maybeSingle();
    const avatarArtifactId = (ident as { active_avatar_artifact_id?: string } | null)?.active_avatar_artifact_id ?? null;
    const embodimentDirection = (ident as { embodiment_direction?: string } | null)?.embodiment_direction ?? null;
    const pages = rows.map((r) => ({ slug: r.slug, payload_json: r.payload_json }));
    const traitSummary = deriveTraitSummaryFromStagingPages(pages, avatarArtifactId, embodimentDirection, []);
    const payloadJson = {
      habitat_pages: rows.map((r) => ({ slug: r.slug, payload: r.payload_json })),
      avatar_state: avatarArtifactId ? { avatar_artifact_id: avatarArtifactId, embodiment_direction: embodimentDirection } : null,
      extensions: [],
    };
    const snapshotResult = await createPublicHabitatSnapshot(supabase, {
      identity_id: identityId,
      parent_snapshot_id: previousPublicSnapshotId,
      payload_json: payloadJson,
      trait_summary: traitSummary,
      source_session_ids: [], // promotion is human-triggered; no session ids
    });
    if ("snapshot_id" in snapshotResult) {
      newSnapshotId = snapshotResult.snapshot_id;
    }
    // Non-fatal: if snapshot creation fails we still record the promotion (lineage optional for V1).
  }

  // Advance source proposals to 'published'. Collect unique non-null proposal IDs
  // from staging rows, then bulk-update only those in promotable states.
  // The update and count are split into two queries: Supabase does not reliably
  // return a row-count when chaining .select() after .update().in().in().
  const sourceProposalIds = [
    ...new Set(rows.map((r) => r.source_proposal_id).filter((id): id is string => !!id)),
  ];
  let proposalsPublished = 0;
  if (sourceProposalIds.length > 0) {
    const { data: proposals, error: proposalsErr } = await supabase
      .from("proposal_record")
      .select("proposal_record_id, proposal_state, lane_type")
      .in("proposal_record_id", sourceProposalIds)
      .in("proposal_state", PROMOTABLE_PROPOSAL_STATES);

    if (!proposalsErr && Array.isArray(proposals) && proposals.length > 0) {
      const authority = getProposalAuthority("http_user");
      const eligibleIds = proposals
        .filter((p) => {
          const lane = ((p.lane_type as string | null) ?? "surface") as LaneType;
          const check = canTransitionProposalState({
            current_state: p.proposal_state as string,
            target_state: "published",
            lane_type: lane,
            actor_authority: authority,
          });
          return check.ok;
        })
        .map((p) => p.proposal_record_id as string)
        .filter((id): id is string => !!id);

      if (eligibleIds.length > 0) {
        const { error: updateErr } = await supabase
          .from("proposal_record")
          .update({ proposal_state: "published", updated_at: now })
          .in("proposal_record_id", eligibleIds);

        if (!updateErr) {
          const { count, error: countErr } = await supabase
            .from("proposal_record")
            .select("proposal_record_id", { count: "exact", head: true })
            .in("proposal_record_id", eligibleIds)
            .eq("proposal_state", "published");

          if (!countErr) {
            proposalsPublished = count ?? 0;
          }
        }
      }
      // Non-fatal: if updating proposal states fails we still record the promotion.
    }
  }

  const promoRow: Record<string, unknown> = {
    promoted_at: now,
    promoted_by: promotedBy,
    slugs_updated: slugsUpdated,
    created_at: now,
  };
  if (newSnapshotId != null) promoRow.snapshot_id = newSnapshotId;
  if (previousPublicSnapshotId != null) promoRow.previous_public_snapshot_id = previousPublicSnapshotId;

  const { data: promo, error: insertErr } = await supabase
    .from("habitat_promotion_record")
    .insert(promoRow)
    .select("id")
    .single();
  if (insertErr) {
    return { promotionId: "", slugsUpdated, proposalsPublished, error: insertErr.message };
  }
  return {
    promotionId: (promo?.id as string) ?? "",
    slugsUpdated,
    proposalsPublished,
  };
}
