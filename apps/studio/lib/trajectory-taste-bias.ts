/**
 * Trajectory Taste Bias V1 — soft action-scoring preference layer.
 * Slightly biases candidate action selection toward action kinds that recently
 * produced stronger trajectory_review outcomes. Does not introduce new candidates,
 * alter governance, proposal/publication/identity/habitat behavior, mode selection,
 * or return focus selection. Effect is bounded and interpretable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Single trajectory_review row used for taste computation. */
export interface TrajectoryReviewForTaste {
  action_kind: string | null;
  trajectory_quality: number;
  issues_json: { items?: string[] } | null;
  strengths_json: { items?: string[] } | null;
}

export interface TasteBiasPayload {
  /** Window size (number of recent reviews used). */
  recent_window_size: number;
  /** Taste score by action_kind (bounded). Unknown action_kind uses 0. */
  taste_by_action_kind: Record<string, number>;
  /** Applied bias for the selected action (0.15 * taste_score[action_kind]). */
  applied_bias_for_selected: number;
  /** action_kind that was selected (for debug). */
  selected_action_kind: string | null;
  /** Whether fallback neutral was used (sparse history). */
  sparse_fallback_used: boolean;
}

const TASTE_WINDOW_SIZE = 15;
const MIN_REVIEWS_FOR_TASTE = 3;
const STRENGTH_BONUS = 0.05;
const ISSUE_PENALTY = 0.07;
const TASTE_APPLY_MULTIPLIER = 0.15;
/** Cap taste_score so 0.15 * taste never exceeds ~20% influence. */
const TASTE_CAP = 0.5;

function clampTaste(x: number): number {
  return Math.max(-TASTE_CAP, Math.min(TASTE_CAP, Number.isFinite(x) ? x : 0));
}

/**
 * Compute taste_score per action_kind from recent trajectory_review rows.
 * taste_score[action_kind] = avg(trajectory_quality) + strength_bonus - issue_penalty,
 * with sparse fallback (neutral) when too few reviews for that action_kind.
 */
export function computeTasteByActionKind(
  rows: TrajectoryReviewForTaste[],
  options?: { minReviewsForTaste?: number }
): Record<string, number> {
  const minReviews = options?.minReviewsForTaste ?? MIN_REVIEWS_FOR_TASTE;
  const byAction: Record<string, { qualitySum: number; count: number; strengthCount: number; issueCount: number }> = {};

  for (const r of rows) {
    const kind = r.action_kind ?? "unknown";
    if (!byAction[kind]) {
      byAction[kind] = { qualitySum: 0, count: 0, strengthCount: 0, issueCount: 0 };
    }
    const rec = byAction[kind]!;
    rec.qualitySum += r.trajectory_quality;
    rec.count += 1;
    const strengths = r.strengths_json?.items;
    if (Array.isArray(strengths)) rec.strengthCount += strengths.length;
    const issues = r.issues_json?.items;
    if (Array.isArray(issues)) rec.issueCount += issues.length;
  }

  const result: Record<string, number> = {};
  for (const [kind, data] of Object.entries(byAction)) {
    if (data.count < minReviews) {
      result[kind] = 0;
      continue;
    }
    const avgQuality = data.qualitySum / data.count;
    const raw =
      avgQuality + data.strengthCount * STRENGTH_BONUS - data.issueCount * ISSUE_PENALTY;
    result[kind] = clampTaste(raw);
  }
  return result;
}

/**
 * Fetch recent trajectory_review rows and compute taste map.
 * Returns taste map and debug payload. Sparse history uses neutral (0) per action_kind.
 */
export async function getTasteBiasMap(supabase: SupabaseClient): Promise<{
  tasteByActionKind: Record<string, number>;
  payload: TasteBiasPayload;
  rows: TrajectoryReviewForTaste[];
}> {
  const { data: rows } = await supabase
    .from("trajectory_review")
    .select("action_kind, trajectory_quality, issues_json, strengths_json")
    .order("created_at", { ascending: false })
    .limit(TASTE_WINDOW_SIZE);

  const list = (rows ?? []) as TrajectoryReviewForTaste[];
  const tasteByActionKind = computeTasteByActionKind(list);

  const payload: TasteBiasPayload = {
    recent_window_size: list.length,
    taste_by_action_kind: { ...tasteByActionKind },
    applied_bias_for_selected: 0,
    selected_action_kind: null,
    sparse_fallback_used: list.length < MIN_REVIEWS_FOR_TASTE,
  };

  return { tasteByActionKind, payload, rows: list };
}

/**
 * Get taste score for an action_kind (0 when unknown or sparse). Bounded in [-TASTE_CAP, TASTE_CAP].
 */
export function getTasteForAction(
  tasteByActionKind: Record<string, number>,
  actionKind: string | null
): number {
  if (!actionKind) return 0;
  return tasteByActionKind[actionKind] ?? 0;
}

/**
 * Apply taste bias to a base score: base_score + TASTE_APPLY_MULTIPLIER * taste_score[action_kind].
 * Guardrail: taste contribution is at most 20% of (base + contribution); we cap taste_score so additive is bounded.
 */
export function applyTasteBias(
  baseScore: number,
  actionKind: string | null,
  tasteByActionKind: Record<string, number>
): number {
  const taste = getTasteForAction(tasteByActionKind, actionKind);
  return baseScore + TASTE_APPLY_MULTIPLIER * taste;
}

/**
 * Fill in applied_bias_for_selected and selected_action_kind in the payload (for debug).
 */
export function fillTastePayloadSelected(
  payload: TasteBiasPayload,
  selectedActionKind: string | null
): TasteBiasPayload {
  const taste = getTasteForAction(payload.taste_by_action_kind, selectedActionKind);
  return {
    ...payload,
    selected_action_kind: selectedActionKind,
    applied_bias_for_selected: TASTE_APPLY_MULTIPLIER * taste,
  };
}
