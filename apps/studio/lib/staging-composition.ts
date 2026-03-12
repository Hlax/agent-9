/**
 * Staging habitat composition: merge approved proposals into staging, promote to public.
 * Canon: docs/architecture/habitat_branch_staging_design.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHabitatPayloadForMerge, validateHabitatPayload } from "./habitat-payload";

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
