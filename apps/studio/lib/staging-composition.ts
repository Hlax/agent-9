/**
 * Staging habitat composition: merge approved proposals into staging, promote to public.
 * Canon: docs/architecture/habitat_branch_staging_design.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHabitatPayloadForMerge, validateHabitatPayload } from "./habitat-payload";

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

  // Advance source proposals to 'published'. Collect unique non-null proposal IDs
  // from staging rows, then bulk-update only those in promotable states.
  // The update and count are split into two queries: Supabase does not reliably
  // return a row-count when chaining .select() after .update().in().in().
  const sourceProposalIds = [
    ...new Set(rows.map((r) => r.source_proposal_id).filter((id): id is string => !!id)),
  ];
  let proposalsPublished = 0;
  if (sourceProposalIds.length > 0) {
    const { error: updateErr } = await supabase
      .from("proposal_record")
      .update({ proposal_state: "published", updated_at: now })
      .in("proposal_record_id", sourceProposalIds)
      .in("proposal_state", PROMOTABLE_PROPOSAL_STATES);

    if (!updateErr) {
      const { count, error: countErr } = await supabase
        .from("proposal_record")
        .select("proposal_record_id", { count: "exact", head: true })
        .in("proposal_record_id", sourceProposalIds)
        .eq("proposal_state", "published");

      if (!countErr) {
        proposalsPublished = count ?? 0;
      }
    }
    // Non-fatal: if updating proposal states fails we still record the promotion.
  }

  const { data: promo, error: insertErr } = await supabase
    .from("habitat_promotion_record")
    .insert({
      promoted_at: now,
      promoted_by: promotedBy,
      slugs_updated: slugsUpdated,
      created_at: now,
    })
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
