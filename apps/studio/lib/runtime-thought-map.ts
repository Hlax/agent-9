/**
 * Session Thought Map (Stage 1 — observability only).
 *
 * Derives an interpreted summary from the session continuity timeline for human
 * visibility on the runtime debug page. This module does NOT feed any selector:
 * not mode, drive, focus, proposal eligibility, proposal pressure, or selection
 * source. See THOUGHT_MAP_GOVERNANCE_AND_ROLLOUT.md §6.1.
 */

import type { SessionTimelineRow } from "@/lib/runtime-state-api";
import type { SessionClusteringSummary } from "@/lib/runtime-state-api";

/** Human-facing summary of recent session trajectory (observability only). */
export interface ThoughtMapSummary {
  /** Dominant posture over the window: exploratory, consolidating, or reflective. */
  session_posture: "exploratory" | "consolidating" | "reflective" | "mixed";
  /** From clustering: (# same-thread pairs) / (# comparable pairs); null if none. */
  thread_repeat_rate: number | null;
  /** From clustering: max consecutive sessions on same thread. */
  longest_thread_streak: number;
  /** Shape label derived from clustering interpretation (descriptive, not judgmental). */
  trajectory_shape: "scattered" | "light" | "clustered" | "sticky" | "unknown";
  /** Pass-through clustering summary for transparency. */
  clustering_summary: SessionClusteringSummary;
  /** Whether the window is exploration-heavy, consolidation-heavy, or balanced. */
  exploration_vs_consolidation: "exploration-heavy" | "consolidation-heavy" | "balanced";
  /** Strength of interpretation based on window size. Helps operators not overtrust early data. */
  interpretation_confidence: "low" | "medium" | "high";
  /** Number of sessions in the window (for swarm scheduling and transparency). */
  window_sessions: number;
  /** Proposal activity over the last N sessions. */
  proposal_activity_summary: {
    proposals_last_10_sessions: number;
    /** When available from review/approval data; null otherwise. */
    acceptance_rate: number | null;
  };
}

const LAST_N_FOR_PROPOSALS = 10;

/**
 * Infer a single-session posture from narrative_state and mode (no trajectory_mode in trace yet).
 * Per governance: explore/diversify → exploratory; reinforce/consolidate → consolidating; reflect → reflective.
 */
function inferPosture(row: SessionTimelineRow): "exploratory" | "consolidating" | "reflective" {
  const mode = (row.mode ?? "").toLowerCase();
  const narrative = (row.narrative_state ?? "").toLowerCase();

  if (mode === "reflect" || narrative === "reflection" || narrative === "stalled") return "reflective";
  if (mode === "return" || narrative === "return") return "consolidating";
  if (narrative === "expansion" || narrative === "curation_pressure") return "exploratory";
  if (mode === "default" || !mode) return "exploratory"; // default session mode tends exploratory
  return "exploratory";
}

/**
 * Derive thought map summary from timeline rows and clustering summary.
 * Pure function: no I/O, no selector reads. For Stage 1 observability only.
 */
export function deriveThoughtMapSummary(
  rows: SessionTimelineRow[],
  clustering_summary: SessionClusteringSummary
): ThoughtMapSummary {
  const postureCounts: Record<"exploratory" | "consolidating" | "reflective", number> = {
    exploratory: 0,
    consolidating: 0,
    reflective: 0,
  };
  for (const row of rows) {
    const p = inferPosture(row);
    postureCounts[p]++;
  }
  const total = rows.length;
  const exploratoryShare = total > 0 ? postureCounts.exploratory / total : 0;
  const consolidatingShare = total > 0 ? postureCounts.consolidating / total : 0;
  const reflectiveShare = total > 0 ? postureCounts.reflective / total : 0;

  let session_posture: ThoughtMapSummary["session_posture"] = "mixed";
  if (exploratoryShare >= 0.5) session_posture = "exploratory";
  else if (consolidatingShare >= 0.5) session_posture = "consolidating";
  else if (reflectiveShare >= 0.5) session_posture = "reflective";

  let trajectory_shape: ThoughtMapSummary["trajectory_shape"] = "unknown";
  const interp = clustering_summary.interpretation;
  if (interp === "chaotic exploration") trajectory_shape = "scattered";
  else if (interp === "light exploration") trajectory_shape = "light";
  else if (interp === "healthy clustering") trajectory_shape = "clustered";
  else if (interp === "possible stickiness") trajectory_shape = "sticky";

  let interpretation_confidence: ThoughtMapSummary["interpretation_confidence"] = "low";
  if (total > 10) interpretation_confidence = "high";
  else if (total >= 5) interpretation_confidence = "medium";

  let exploration_vs_consolidation: ThoughtMapSummary["exploration_vs_consolidation"] = "balanced";
  if (exploratoryShare >= 0.45 && exploratoryShare > consolidatingShare) exploration_vs_consolidation = "exploration-heavy";
  else if (consolidatingShare >= 0.45 && consolidatingShare > exploratoryShare) exploration_vs_consolidation = "consolidation-heavy";

  const last10 = rows.slice(0, LAST_N_FOR_PROPOSALS);
  const proposals_last_10_sessions = last10.filter((r) => r.proposal_created).length;

  return {
    session_posture,
    thread_repeat_rate: clustering_summary.thread_repeat_rate,
    longest_thread_streak: clustering_summary.longest_same_thread_streak,
    trajectory_shape,
    clustering_summary,
    exploration_vs_consolidation,
    interpretation_confidence,
    window_sessions: total,
    proposal_activity_summary: {
      proposals_last_10_sessions,
      acceptance_rate: null, // not available from timeline alone; can be wired when review/approval data exists
    },
  };
}
