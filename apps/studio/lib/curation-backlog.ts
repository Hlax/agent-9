/**
 * C-4: Live public_curation_backlog normalization.
 *
 * Counts proposal_record rows in active (non-terminal) states and normalizes to a 0–1 float.
 * Injected into creative state before computeSessionMode so session-mode selection reflects
 * current review pressure rather than a stale persisted snapshot value.
 *
 * Denominator rationale: 10 pending proposals = full backlog pressure (1.0).
 * Chosen states: all proposals that still require human or agent action — not yet published,
 * rejected, archived, or ignored.
 */

import type { getSupabaseServer } from "@/lib/supabase-server";

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseServer>>;

/**
 * Proposal states that represent active backlog pressure.
 * Terminal states (published, rejected, archived, ignored) are excluded.
 */
export const BACKLOG_PROPOSAL_STATES = [
  "pending_review",
  "approved",
  "approved_for_staging",
  "staged",
  "needs_revision",
  "approved_for_publication",
] as const;

/**
 * Number of pending proposals that equals full backlog pressure (1.0).
 * At 10 proposals the curation drive reaches maximum weight; above 10 it stays clamped.
 */
export const BACKLOG_FULL_AT = 10;

/**
 * Normalize a raw proposal count to a 0–1 backlog pressure value.
 * Pure function — useful for testing without a database.
 *
 * @param count  Raw pending proposal count.
 * @param fullAt Denominator for normalization (default: BACKLOG_FULL_AT = 10).
 *               Must be a positive number. Values ≤ 0 are treated as 0 (returns 0).
 */
export function normalizeBacklog(count: number, fullAt = BACKLOG_FULL_AT): number {
  if (fullAt <= 0) return 0;
  return Math.min(count / fullAt, 1.0);
}
/**
 * Query the live pending proposal count and return a normalized backlog pressure (0–1).
 * Returns 0 when supabase is unavailable (offline / test without DB).
 *
 * All proposal types (avatar, habitat, system, surface) count equally.
 * Age weighting is not applied in V1; every active proposal contributes the same pressure.
 */
export async function computePublicCurationBacklog(
  supabase: SupabaseClient | null
): Promise<number> {
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("proposal_record")
    .select("proposal_record_id", { count: "exact", head: true })
    .in("proposal_state", [...BACKLOG_PROPOSAL_STATES]);

  if (error || count === null) return 0;
  return normalizeBacklog(count);
}
