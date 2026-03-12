/**
 * Staging habitat composition: merge approved proposals into staging, promote to public.
 * Canon: docs/architecture/habitat_branch_staging_design.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateHabitatPayload } from "./habitat-payload";

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
 * Call when a proposal is approved_for_staging and has valid habitat_payload_json.
 * Returns true if merge was applied; false if payload invalid or not habitat.
 */
export async function mergeHabitatProposalIntoStaging(
  supabase: SupabaseClient,
  proposalRecordId: string,
  habitatPayloadJson: unknown,
  proposalTitle?: string | null
): Promise<{ applied: boolean; slug?: string; error?: string }> {
  const result = validateHabitatPayload(habitatPayloadJson);
  if (!result.success) {
    return { applied: false, error: result.error };
  }
  const payload = result.data;
  const slug = payload.page;
  const now = new Date().toISOString();
  const { error } = await supabase.from("staging_habitat_content").upsert(
    {
      slug,
      title: proposalTitle ?? payload.page,
      body: null,
      payload_json: payload as object,
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
 */
export async function promoteStagingToPublic(
  supabase: SupabaseClient,
  promotedBy: string
): Promise<{ promotionId: string; slugsUpdated: string[]; error?: string }> {
  const { data: stagingRows, error: fetchErr } = await supabase
    .from("staging_habitat_content")
    .select("slug, title, body, payload_json");
  if (fetchErr) {
    return { promotionId: "", slugsUpdated: [], error: fetchErr.message };
  }
  const rows = (stagingRows ?? []) as StagingPageRow[];
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
      return { promotionId: "", slugsUpdated, error: upsertErr.message };
    }
    slugsUpdated.push(row.slug);
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
    return { promotionId: "", slugsUpdated, error: insertErr.message };
  }
  return {
    promotionId: (promo?.id as string) ?? "",
    slugsUpdated,
  };
}
