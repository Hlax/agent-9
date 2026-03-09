/**
 * Load latest creative state snapshot for session start. Plan: state load + state update.
 */

import type { getSupabaseServer } from "@/lib/supabase-server";
import { defaultCreativeState, snapshotToState } from "@twin/evaluation";
import type { CreativeStateFields } from "@twin/evaluation";

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseServer>>;

export interface LatestCreativeStateResult {
  state: CreativeStateFields;
  snapshotId: string | null;
}

/**
 * Load the most recent creative_state_snapshot (by created_at). If none exists, return default state.
 */
export async function getLatestCreativeState(
  supabase: SupabaseClient | null
): Promise<LatestCreativeStateResult> {
  if (!supabase) {
    return { state: defaultCreativeState(), snapshotId: null };
  }
  const { data: row, error } = await supabase
    .from("creative_state_snapshot")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    return { state: defaultCreativeState(), snapshotId: null };
  }

  const state = snapshotToState({
    identity_stability: row.identity_stability,
    avatar_alignment: row.avatar_alignment,
    expression_diversity: row.expression_diversity,
    unfinished_projects: row.unfinished_projects,
    recent_exploration_rate: row.recent_exploration_rate,
    creative_tension: row.creative_tension,
    curiosity_level: row.curiosity_level,
    reflection_need: row.reflection_need,
    idea_recurrence: row.idea_recurrence,
    public_curation_backlog: row.public_curation_backlog,
  });
  return { state, snapshotId: row.state_snapshot_id };
}
