/**
 * Synthesis Pressure V1 — computed, operator-facing runtime observability metric.
 * Estimates whether the Twin is in the sweet spot for synthesis.
 * Diagnostic only: does not change runtime behavior, mode selection, focus selection,
 * proposal behavior, governance, or public mutation.
 *
 * Formula:
 *   synthesis_pressure =
 *     0.25 * recurrence_pull_signal
 *   + 0.25 * unfinished_pull_signal
 *   + 0.20 * archive_candidate_pressure
 *   + 0.20 * return_success_trend
 *   - 0.20 * repetition_without_movement_penalty
 *   then if momentum < 0.35: synthesis_pressure *= 0.6
 *
 * Bands: low < 0.30 | rising 0.30–0.54 | high 0.55–0.74 | convert_now >= 0.75
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SynthesisPressureBand = "low" | "rising" | "high" | "convert_now";

/** Normalized 0–1 inputs for the metric. Source fields documented in implementation summary. */
export interface SynthesisPressureInput {
  /** From creative_state_snapshot.idea_recurrence (recurrence-related selection/trace). */
  recurrence_pull_signal: number;
  /** From archive candidate backlog + unfinished work (archive_entry count, snapshot.unfinished_projects). */
  unfinished_pull_signal: number;
  /** From return pool size: archive_entry count normalized. */
  archive_candidate_pressure: number;
  /** From recent trajectory_review for return sessions: movement_score / trajectory_quality / productive_return. */
  return_success_trend: number;
  /** From recent trajectory_review: repetition_without_movement, low_signal_continuation, repetition_risk. */
  repetition_without_movement_penalty: number;
  /** From creative_state_snapshot.recent_exploration_rate (momentum). */
  momentum: number;
}

export interface SynthesisPressurePayload {
  /** Raw weighted sum before momentum gate. */
  raw_score: number;
  /** After momentum gate (if momentum < 0.35 then raw_score * 0.6). */
  synthesis_pressure: number;
  band: SynthesisPressureBand;
  /** Each component (before gate). */
  components: {
    recurrence_pull_signal: number;
    unfinished_pull_signal: number;
    archive_candidate_pressure: number;
    return_success_trend: number;
    repetition_without_movement_penalty: number;
  };
  /** Whether the momentum gate was applied (momentum < 0.35). */
  momentum_gate_applied: boolean;
  momentum: number;
}

const W_RECURRENCE = 0.25;
const W_UNFINISHED = 0.25;
const W_ARCHIVE = 0.2;
const W_RETURN_SUCCESS = 0.2;
const W_PENALTY = 0.2;
const MOMENTUM_GATE_THRESHOLD = 0.35;
const MOMENTUM_GATE_MULTIPLIER = 0.6;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
}

function bandFromScore(score: number): SynthesisPressureBand {
  if (score >= 0.75) return "convert_now";
  if (score >= 0.55) return "high";
  if (score >= 0.30) return "rising";
  return "low";
}

/**
 * Compute synthesis_pressure from normalized inputs. Pure function for testing.
 */
export function computeSynthesisPressure(input: SynthesisPressureInput): SynthesisPressurePayload {
  const rec = clamp01(input.recurrence_pull_signal);
  const unf = clamp01(input.unfinished_pull_signal);
  const arch = clamp01(input.archive_candidate_pressure);
  const ret = clamp01(input.return_success_trend);
  const pen = clamp01(input.repetition_without_movement_penalty);
  const momentum = clamp01(input.momentum);

  const raw_score =
    W_RECURRENCE * rec +
    W_UNFINISHED * unf +
    W_ARCHIVE * arch +
    W_RETURN_SUCCESS * ret -
    W_PENALTY * pen;

  const momentum_gate_applied = momentum < MOMENTUM_GATE_THRESHOLD;
  const synthesis_pressure = clamp01(
    momentum_gate_applied ? raw_score * MOMENTUM_GATE_MULTIPLIER : Math.max(0, raw_score)
  );

  return {
    raw_score,
    synthesis_pressure,
    band: bandFromScore(synthesis_pressure),
    components: {
      recurrence_pull_signal: rec,
      unfinished_pull_signal: unf,
      archive_candidate_pressure: arch,
      return_success_trend: ret,
      repetition_without_movement_penalty: pen,
    },
    momentum_gate_applied,
    momentum,
  };
}

/** Row from trajectory_review used for return_success_trend and repetition penalty. */
export interface TrajectoryReviewRow {
  narrative_state: string | null;
  action_kind: string | null;
  outcome_kind: string | null;
  movement_score: number;
  trajectory_quality: number;
  issues_json: { items?: string[] } | null;
}

/**
 * Derive recurrence_pull_signal from latest creative_state_snapshot.idea_recurrence.
 * Source: creative_state_snapshot.idea_recurrence (0–1).
 */
export function deriveRecurrencePullSignal(ideaRecurrence: number | null | undefined): number {
  return clamp01(ideaRecurrence ?? 0.5);
}

/**
 * Derive unfinished_pull_signal from archive count + unfinished_projects.
 * Source: archive_entry count, creative_state_snapshot.unfinished_projects.
 * Heuristic: low when few archive candidates, high when many or high unfinished_projects.
 */
export function deriveUnfinishedPullSignal(
  archiveEntryCount: number,
  unfinishedProjects: number | null | undefined
): number {
  const archNorm = archiveEntryCount <= 0 ? 0 : Math.min(1, archiveEntryCount / 25);
  const unf = clamp01(unfinishedProjects ?? 0);
  return clamp01(archNorm * 0.7 + unf * 0.3);
}

/**
 * Derive archive_candidate_pressure from return pool size.
 * Source: archive_entry count. 0 when none, ~0.5 moderate (~10), 1.0 when large (>= 25).
 */
export function deriveArchiveCandidatePressure(archiveEntryCount: number): number {
  if (archiveEntryCount <= 0) return 0;
  if (archiveEntryCount >= 25) return 1;
  return clamp01(archiveEntryCount / 25);
}

/**
 * Derive return_success_trend from recent trajectory_review for return sessions.
 * Source: trajectory_review (narrative_state='return' OR action_kind='resurface_archive' OR outcome_kind='productive_return').
 * Proxy: average of movement_score and trajectory_quality for those rows; 0.5 when none.
 */
export function deriveReturnSuccessTrend(rows: TrajectoryReviewRow[]): number {
  const returnRows = rows.filter(
    (r) =>
      r.narrative_state === "return" ||
      r.action_kind === "resurface_archive" ||
      r.outcome_kind === "productive_return"
  );
  if (returnRows.length === 0) return 0.5;
  let sum = 0;
  for (const r of returnRows) {
    sum += (r.movement_score + r.trajectory_quality) / 2;
  }
  return clamp01(sum / returnRows.length);
}

/**
 * Derive repetition_without_movement_penalty from recent trajectory_review.
 * Source: trajectory_review outcome_kind in (repetition_without_movement, low_signal_continuation)
 *         or issues_json.items contains 'repetition_risk'. Rate over recent window, 0–1.
 */
export function deriveRepetitionPenalty(rows: TrajectoryReviewRow[]): number {
  if (rows.length === 0) return 0;
  const weakOutcomes = ["repetition_without_movement", "low_signal_continuation"];
  let count = 0;
  for (const r of rows) {
    if (r.outcome_kind && weakOutcomes.includes(r.outcome_kind)) {
      count += 1;
      continue;
    }
    const items = r.issues_json?.items;
    if (Array.isArray(items) && items.includes("repetition_risk")) count += 1;
  }
  return clamp01(count / rows.length);
}

/**
 * Derive momentum from creative_state_snapshot.recent_exploration_rate.
 * Source: creative_state_snapshot.recent_exploration_rate (0–1).
 */
export function deriveMomentum(recentExplorationRate: number | null | undefined): number {
  return clamp01(recentExplorationRate ?? 0.5);
}

const TRAJECTORY_REVIEW_WINDOW = 10;

/**
 * Fetch inputs from Supabase and compute synthesis_pressure. For use by runtime state API or observability.
 * Does not mutate any state or affect runtime behavior.
 */
export async function getSynthesisPressure(supabase: SupabaseClient): Promise<SynthesisPressurePayload> {
  try {
    const [snapshotRes, archiveCountRes, reviewRes] = await Promise.all([
      supabase
        .from("creative_state_snapshot")
        .select("idea_recurrence, unfinished_projects, recent_exploration_rate")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("archive_entry").select("archive_entry_id", { count: "exact", head: true }),
      supabase
        .from("trajectory_review")
        .select("narrative_state, action_kind, outcome_kind, movement_score, trajectory_quality, issues_json")
        .order("created_at", { ascending: false })
        .limit(TRAJECTORY_REVIEW_WINDOW),
    ]);

    const snapshot = snapshotRes.data as Record<string, unknown> | null;
    const archiveCount = archiveCountRes.count ?? 0;
    const reviewRows = (reviewRes.data ?? []) as TrajectoryReviewRow[];

    const ideaRecurrence = snapshot?.idea_recurrence as number | null | undefined;
    const unfinishedProjects = snapshot?.unfinished_projects as number | null | undefined;
    const recentExplorationRate = snapshot?.recent_exploration_rate as number | null | undefined;

    const input: SynthesisPressureInput = {
      recurrence_pull_signal: deriveRecurrencePullSignal(ideaRecurrence),
      unfinished_pull_signal: deriveUnfinishedPullSignal(archiveCount, unfinishedProjects),
      archive_candidate_pressure: deriveArchiveCandidatePressure(archiveCount),
      return_success_trend: deriveReturnSuccessTrend(reviewRows),
      repetition_without_movement_penalty: deriveRepetitionPenalty(reviewRows),
      momentum: deriveMomentum(recentExplorationRate),
    };

    return computeSynthesisPressure(input);
  } catch {
    // On any Supabase outage or unexpected error, return a safe-default payload.
    // All signals default to neutral (0.5) with no archive pressure, so the
    // metric reports "rising" rather than a stale or misleading high/low value.
    return computeSynthesisPressure({
      recurrence_pull_signal: 0.5,
      unfinished_pull_signal: 0,
      archive_candidate_pressure: 0,
      return_success_trend: 0.5,
      repetition_without_movement_penalty: 0,
      momentum: 0.5,
    });
  }
}
