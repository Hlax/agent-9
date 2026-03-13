/**
 * Trajectory Review V1 — post-session diagnostic layer.
 * Derives scores and labels heuristically from session/trace/critique/evaluation/proposal.
 * Diagnostic only; does not mutate governance or session state.
 */

// --- Canon vocabularies (compact only) ---

export const OUTCOME_KINDS = [
  "useful_progress",
  "productive_return",
  "proposal_generated",
  "safe_hold",
  "low_signal_continuation",
  "repetition_without_movement",
  "misaligned_action",
] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export const ISSUE_KINDS = [
  "overconfident_weak_outcome",
  "underconfident_good_outcome",
  "repetition_risk",
  "proposal_churn",
  "reflection_without_resolution",
  "curation_pressure_ignored",
  "identity_pressure_unaddressed",
] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export const STRENGTH_KINDS = [
  "good_return_timing",
  "healthy_deferral",
  "useful_surface_generation",
  "aligned_avatar_exploration",
  "strong_state_alignment",
] as const;
export type StrengthKind = (typeof STRENGTH_KINDS)[number];

const REVIEW_VERSION = "v1";

/** Minimal session-derived inputs for trajectory review (no cross-session data). */
export interface TrajectoryReviewInput {
  narrative_state: string;
  action_kind: string;
  confidence: number;
  proposal_created: boolean;
  repetition_detected: boolean;
  has_artifact: boolean;
  has_critique: boolean;
  has_evaluation: boolean;
  memory_record_created: boolean;
  archive_entry_created: boolean;
  live_backlog: number;
  selection_source: string | null;
  execution_mode: string;
  /** Previous-state style signals (0–1) for alignment heuristics. */
  previous_curation_backlog?: number;
  previous_reflection_need?: number;
  previous_avatar_alignment?: number;
}

/** Row shape for trajectory_review insert (ids and created_at set by DB or caller). */
export interface TrajectoryReviewRow {
  session_id: string;
  deliberation_trace_id: string | null;
  review_version: string;
  narrative_state: string | null;
  action_kind: string | null;
  outcome_kind: string | null;
  trajectory_quality: number;
  alignment_score: number;
  movement_score: number;
  novelty_score: number;
  governance_score: number;
  confidence_calibration_score: number;
  issues_json: { items: string[] } | null;
  strengths_json: { items: string[] } | null;
  learning_signal: string | null;
  /** Reserved: persisted for analytics/future use. Not consumed by any selector (Trajectory Feedback V1 audit). Do not assume control-active. */
  recommended_next_action_kind: string | null;
}

const W = {
  alignment: 0.3,
  movement: 0.3,
  novelty: 0.2,
  governance: 0.1,
  confidence_calibration: 0.1,
};

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
}

/** Heuristic alignment: action matches narrative posture and tensions. */
function alignmentScore(input: TrajectoryReviewInput): number {
  const { narrative_state, action_kind, selection_source } = input;
  if (narrative_state === "return" && (action_kind === "resurface_archive" || selection_source === "archive")) {
    return 0.9;
  }
  if (narrative_state === "reflection" && action_kind === "continue_thread") return 0.65;
  if (narrative_state === "curation_pressure" && action_kind !== "continue_thread" && action_kind !== "generate_habitat_candidate") {
    return 0.4;
  }
  if (narrative_state === "stalled" && action_kind === "resurface_archive") return 0.75;
  if (narrative_state === "expansion" && action_kind === "continue_thread") return 0.8;
  return 0.6;
}

/** Heuristic movement: forward progress (artifact, critique, evaluation, proposal, memory, archive). */
function movementScore(input: TrajectoryReviewInput): number {
  let s = 0;
  if (input.has_artifact) s += 0.35;
  if (input.has_critique) s += 0.2;
  if (input.has_evaluation) s += 0.15;
  if (input.proposal_created) s += 0.2;
  if (input.memory_record_created) s += 0.05;
  if (input.archive_entry_created) s += 0.05;
  return clamp01(s);
}

/** Heuristic novelty: avoid repetition; return/archive adds variation. */
function noveltyScore(input: TrajectoryReviewInput): number {
  if (input.repetition_detected) return 0.25;
  if (input.selection_source === "archive") return 0.85;
  if (input.proposal_created) return 0.7;
  return 0.55;
}

/** Governance: session respected authority (proposal vs direct mutation). We never mutate directly. */
function governanceScore(_input: TrajectoryReviewInput): number {
  return 1.0;
}

/** Confidence vs outcome: overconfident weak = low, underconfident good = medium, else calibrated. */
function confidenceCalibrationScore(input: TrajectoryReviewInput): number {
  const conf = input.confidence;
  const band = conf < 0.4 ? "low" : conf < 0.7 ? "medium" : "high";
  const movement = movementScore(input);
  const hasGoodOutcome = movement >= 0.5 || input.proposal_created;
  if (band === "high" && !hasGoodOutcome) return 0.35; // overconfident_weak_outcome
  if (band === "low" && hasGoodOutcome) return 0.6; // underconfident_good_outcome
  return 0.8;
}

/** trajectory_quality = 0.30*alignment + 0.30*movement + 0.20*novelty + 0.10*governance + 0.10*confidence_calibration */
function trajectoryQuality(
  alignment: number,
  movement: number,
  novelty: number,
  governance: number,
  confidenceCal: number
): number {
  return clamp01(
    W.alignment * alignment +
      W.movement * movement +
      W.novelty * novelty +
      W.governance * governance +
      W.confidence_calibration * confidenceCal
  );
}

function classifyOutcomeKind(input: TrajectoryReviewInput): OutcomeKind {
  if (input.proposal_created) return "proposal_generated";
  if (input.repetition_detected && movementScore(input) < 0.4) return "repetition_without_movement";
  if (input.narrative_state === "return" && input.archive_entry_created) return "productive_return";
  if (input.narrative_state === "curation_pressure" && input.action_kind === "continue_thread") return "misaligned_action";
  if (movementScore(input) >= 0.6) return "useful_progress";
  if (input.narrative_state === "reflection" && movementScore(input) < 0.5) return "low_signal_continuation";
  if (input.execution_mode === "human_required" || input.confidence < 0.4) return "safe_hold";
  return "low_signal_continuation";
}

function collectIssues(input: TrajectoryReviewInput): IssueKind[] {
  const issues: IssueKind[] = [];
  const conf = input.confidence;
  const band = conf < 0.4 ? "low" : conf < 0.7 ? "medium" : "high";
  const movement = movementScore(input);
  const hasGoodOutcome = movement >= 0.5 || input.proposal_created;
  if (band === "high" && !hasGoodOutcome) issues.push("overconfident_weak_outcome");
  if (band === "low" && hasGoodOutcome) issues.push("underconfident_good_outcome");
  if (input.repetition_detected) issues.push("repetition_risk");
  if (input.narrative_state === "reflection" && movement < 0.5) issues.push("reflection_without_resolution");
  if (input.narrative_state === "curation_pressure" && input.action_kind === "continue_thread") {
    issues.push("curation_pressure_ignored");
  }
  if ((input.previous_avatar_alignment ?? 0.5) < 0.4 && input.action_kind !== "generate_avatar_candidate") {
    issues.push("identity_pressure_unaddressed");
  }
  return issues;
}

function collectStrengths(input: TrajectoryReviewInput): StrengthKind[] {
  const strengths: StrengthKind[] = [];
  if (input.narrative_state === "return" && input.selection_source === "archive") strengths.push("good_return_timing");
  if (input.execution_mode === "human_required" && !input.proposal_created) strengths.push("healthy_deferral");
  if (input.proposal_created && input.action_kind === "generate_habitat_candidate") strengths.push("useful_surface_generation");
  if (input.proposal_created && input.action_kind === "generate_avatar_candidate") strengths.push("aligned_avatar_exploration");
  if (alignmentScore(input) >= 0.75) strengths.push("strong_state_alignment");
  return strengths;
}

function learningSignal(input: TrajectoryReviewInput, outcomeKind: OutcomeKind): string {
  if (outcomeKind === "productive_return") {
    return "Archive return produced forward movement.";
  }
  if (outcomeKind === "proposal_generated") {
    return "Session yielded a proposal for review.";
  }
  if (outcomeKind === "repetition_without_movement") {
    return "Repetition detected with limited structural change.";
  }
  if (outcomeKind === "useful_progress") {
    return "Session advanced artifact, critique, and evaluation.";
  }
  if (outcomeKind === "safe_hold") {
    return "Session deferred to human gate; no inappropriate mutation.";
  }
  if (outcomeKind === "misaligned_action") {
    return "Action did not address current curation pressure.";
  }
  return "Session completed with moderate signal.";
}

function recommendedNextActionKind(input: TrajectoryReviewInput, outcomeKind: OutcomeKind): string | null {
  if (outcomeKind === "repetition_without_movement" && input.narrative_state !== "return") {
    return "resurface_archive";
  }
  if (input.narrative_state === "curation_pressure") {
    return "generate_habitat_candidate";
  }
  return null;
}

/**
 * Derive a single trajectory_review row from session-derived input only.
 * Does not perform any I/O or mutate state.
 */
export function deriveTrajectoryReview(
  sessionId: string,
  deliberationTraceId: string | null,
  input: TrajectoryReviewInput
): TrajectoryReviewRow {
  const alignment = alignmentScore(input);
  const movement = movementScore(input);
  const novelty = noveltyScore(input);
  const governance = governanceScore(input);
  const confidenceCal = confidenceCalibrationScore(input);
  const quality = trajectoryQuality(alignment, movement, novelty, governance, confidenceCal);
  const outcomeKind = classifyOutcomeKind(input);
  const issues = collectIssues(input);
  const strengths = collectStrengths(input);

  return {
    session_id: sessionId,
    deliberation_trace_id: deliberationTraceId,
    review_version: REVIEW_VERSION,
    narrative_state: input.narrative_state || null,
    action_kind: input.action_kind || null,
    outcome_kind: outcomeKind,
    trajectory_quality: quality,
    alignment_score: alignment,
    movement_score: movement,
    novelty_score: novelty,
    governance_score: governance,
    confidence_calibration_score: confidenceCal,
    issues_json: issues.length > 0 ? { items: issues } : null,
    strengths_json: strengths.length > 0 ? { items: strengths } : null,
    learning_signal: learningSignal(input, outcomeKind),
    // Reserved: not yet read by mode/focus/proposal logic (Trajectory Feedback V1).
    recommended_next_action_kind: recommendedNextActionKind(input, outcomeKind),
  };
}
