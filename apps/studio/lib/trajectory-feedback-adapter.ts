/**
 * Stage-2 advisory feedback adapter (dry run only)
 * Not wired into runtime selection paths.
 *
 * Placeholder module for future trajectory feedback (e.g. repetition reduction,
 * consolidation bias, proposal pressure). Must NOT affect selection logic.
 */

export interface TrajectoryFeedbackResult {
  gently_reduce_repetition: boolean;
  favor_consolidation: "none" | "light" | "strong";
  proposal_pressure_adjustment: number;
  reason: string;
}

/**
 * Dry-run only. Returns neutral feedback. Do not import from session-runner or selection paths.
 */
export function getTrajectoryFeedback(_context: unknown): TrajectoryFeedbackResult {
  return {
    gently_reduce_repetition: false,
    favor_consolidation: "none",
    proposal_pressure_adjustment: 0,
    reason: "dry-run only",
  };
}
