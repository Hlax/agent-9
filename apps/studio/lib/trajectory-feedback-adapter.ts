/**
 * Trajectory feedback adapter — advisory signals with one Stage-2 active binding.
 *
 * Stage-1 contract (still in force for all other signals):
 *   `getTrajectoryFeedback` output MUST NOT be called directly from any selector:
 *   not mode, drive, focus, proposal eligibility, proposal pressure, or selection source.
 *
 * Stage-2 active binding (one bounded signal only):
 *   The `gently_reduce_repetition` signal from this adapter is pre-computed in
 *   `loadCreativeStateAndBacklog` and stored as `state.trajectoryAdvisory`. It is then
 *   read in `selectModeAndDrive` as a small +0.06 nudge to `reflection_need` — a bounded
 *   delta on an existing selector, never a branch replacement. This binding is logged
 *   explicitly and recorded in the deliberation trace (`hypotheses_json`).
 *
 * All other signals (`favor_consolidation`, `proposal_pressure_adjustment`) remain
 * dry-run / observability-only. Their output MUST NOT reach any selector.
 *
 * Safe insertion point for remaining dry-run signals:
 *   Call `buildAdvisoryLog` after a session completes (e.g. in runtime-state-api for
 *   the debug panel). NEVER call `getTrajectoryFeedback` directly from session-runner
 *   selection paths or mode/drive logic.
 *
 * Signals the adapter reads (from thought map / clustering):
 *   - session_posture
 *   - thread_repeat_rate / longest_thread_streak
 *   - trajectory_shape / exploration_vs_consolidation
 *   - proposals_last_10_sessions
 *   - interpretation_confidence (gates advisory on data quality)
 *
 * Where advisory output goes:
 *   - `gently_reduce_repetition` → state.trajectoryAdvisory → reflection_need nudge in selectModeAndDrive
 *   - deliberation trace `hypotheses_json.trajectory_advisory_applied`
 *   - runtime-state-api `deriveTrajectoryAdvisoryDryRun` for debug panel (other signals)
 *   - NOT in selection_evidence, NOT in selection_source logic
 */

/**
 * Read-only snapshot from the thought map passed into the adapter.
 * All fields are optional so callers can pass partial data safely.
 */
export interface TrajectoryFeedbackContext {
  /** Dominant posture over the window (from thought map, observability only). */
  session_posture?: "exploratory" | "consolidating" | "reflective" | "mixed" | null;
  /** (# same-thread pairs) / (# comparable pairs); null when insufficient data. */
  thread_repeat_rate?: number | null;
  /** Max consecutive sessions on same thread in the window. */
  longest_thread_streak?: number;
  /** Shape label from clustering (descriptive). */
  trajectory_shape?: "scattered" | "light" | "clustered" | "sticky" | "unknown" | null;
  /** Whether window is exploration-heavy, consolidation-heavy, or balanced. */
  exploration_vs_consolidation?: "exploration-heavy" | "consolidation-heavy" | "balanced" | null;
  /** Number of sessions in the thought map window. */
  window_sessions?: number;
  /** Number of proposals created in the last 10 sessions. */
  proposals_last_10_sessions?: number;
  /** Strength of thought map interpretation based on window size. */
  interpretation_confidence?: "low" | "medium" | "high" | null;
}

/** Advisory output from the adapter (dry run; never feeds selectors). */
export interface TrajectoryFeedbackResult {
  gently_reduce_repetition: boolean;
  favor_consolidation: "none" | "light" | "strong";
  proposal_pressure_adjustment: number;
  reason: string;
}

/**
 * Structured dry-run log entry for runtime observability.
 * Stored and displayed for debugging only — must NOT influence any selection path.
 */
export interface TrajectoryAdvisoryLog {
  /** Always true: this output is observability-only and must never feed selectors. */
  dry_run: true;
  /** The advisory output for this window. */
  feedback: TrajectoryFeedbackResult;
  /** Snapshot of the context used to derive feedback (for auditability). */
  context_snapshot: TrajectoryFeedbackContext;
  /** ISO timestamp when the log was produced. */
  generated_at: string;
  /** Human-readable note about the Stage-2 contract. */
  note: string;
}

/**
 * Dry-run advisory function. Returns neutral or light advisory feedback based on
 * the thought map context. Does NOT affect any selection path.
 *
 * When `interpretation_confidence` is "low" or the window is too small (<5 sessions),
 * always returns neutral feedback to avoid acting on insufficient data.
 */
export function getTrajectoryFeedback(context: TrajectoryFeedbackContext): TrajectoryFeedbackResult {
  const confidence = context.interpretation_confidence ?? "low";
  const windowSessions = context.window_sessions ?? 0;

  // Gate: insufficient data → always neutral.
  if (confidence === "low" || windowSessions < 5) {
    return {
      gently_reduce_repetition: false,
      favor_consolidation: "none",
      proposal_pressure_adjustment: 0,
      reason: "insufficient data for advisory (window too small or low confidence)",
    };
  }

  const repeatRate = context.thread_repeat_rate ?? 0;
  const posture = context.session_posture ?? "mixed";
  const shape = context.trajectory_shape ?? "unknown";
  const balance = context.exploration_vs_consolidation ?? "balanced";
  const longestStreak = context.longest_thread_streak ?? 0;
  const proposalsRecent = context.proposals_last_10_sessions ?? 0;

  let gently_reduce_repetition = false;
  let favor_consolidation: TrajectoryFeedbackResult["favor_consolidation"] = "none";
  let proposal_pressure_adjustment = 0;
  const reasons: string[] = [];

  // Repetition advisory: sticky trajectory with long streak.
  if (shape === "sticky" || repeatRate > 0.7) {
    gently_reduce_repetition = true;
    reasons.push("sticky thread repeat rate");
  }
  if (longestStreak >= 5) {
    gently_reduce_repetition = true;
    reasons.push(`longest streak ${longestStreak}`);
  }

  // Consolidation advisory: exploration-heavy posture with many recent proposals.
  if (balance === "exploration-heavy" && proposalsRecent >= 5) {
    favor_consolidation = "light";
    reasons.push("exploration-heavy with proposal backlog");
  } else if (posture === "consolidating" && shape === "clustered") {
    favor_consolidation = "light";
    reasons.push("consolidating posture in clustered window");
  }

  // Proposal pressure advisory: low production despite healthy clustering.
  if (proposalsRecent === 0 && shape === "clustered" && windowSessions >= 8) {
    proposal_pressure_adjustment = 1;
    reasons.push("no proposals in clustered window");
  }

  if (reasons.length === 0) reasons.push("trajectory within normal range");

  return {
    gently_reduce_repetition,
    favor_consolidation,
    proposal_pressure_adjustment,
    reason: reasons.join("; "),
  };
}

/**
 * Build a structured advisory log entry for runtime observability (debug panel).
 * Safe to call from runtime-state-api after fetching the thought map.
 * MUST NOT be called from session-runner or any selection path — the pre-computed
 * state.trajectoryAdvisory path in loadCreativeStateAndBacklog is the only sanctioned
 * wiring for the active gently_reduce_repetition signal.
 */
export function buildAdvisoryLog(context: TrajectoryFeedbackContext): TrajectoryAdvisoryLog {
  return {
    dry_run: true,
    feedback: getTrajectoryFeedback(context),
    context_snapshot: context,
    generated_at: new Date().toISOString(),
    note: "Trajectory advisory adapter. gently_reduce_repetition is Stage-2 active (wired via state.trajectoryAdvisory → reflection_need nudge). Other signals are observability-only and do NOT influence selection paths.",
  };
}
