/**
 * Proposal eligibility for concept artifacts.
 * Canon: docs/02_runtime/concept_to_proposal_flow.md
 */

const ELIGIBLE_CRITIQUE_OUTCOMES = ["continue", "branch", "shift_medium"] as const;
const ALIGNMENT_MIN = 0.6;
const FERTILITY_MIN = 0.7;
const PULL_MIN = 0.6;

export interface EligibilityInput {
  medium: string;
  alignment_score: number | null;
  fertility_score: number | null;
  pull_score: number | null;
  critique_outcome: string | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
}

/**
 * Returns whether a concept artifact is proposal-eligible per threshold.
 * Harvey override is handled by the caller (create proposal regardless of this).
 */
export function isProposalEligible(input: EligibilityInput): EligibilityResult {
  if (input.medium !== "concept") {
    return { eligible: false, reason: "Only concept artifacts can become proposals." };
  }

  const outcome = (input.critique_outcome ?? "").toLowerCase();
  if (!ELIGIBLE_CRITIQUE_OUTCOMES.includes(outcome as (typeof ELIGIBLE_CRITIQUE_OUTCOMES)[number])) {
    return {
      eligible: false,
      reason: `Critique outcome must be one of: ${ELIGIBLE_CRITIQUE_OUTCOMES.join(", ")}. Got: ${input.critique_outcome ?? "null"}.`,
    };
  }

  const alignment = input.alignment_score ?? 0;
  const fertility = input.fertility_score ?? 0;
  const pull = input.pull_score ?? 0;

  if (alignment < ALIGNMENT_MIN) {
    return { eligible: false, reason: `Alignment score ${alignment.toFixed(2)} is below threshold ${ALIGNMENT_MIN}.` };
  }
  if (fertility < FERTILITY_MIN) {
    return { eligible: false, reason: `Fertility score ${fertility.toFixed(2)} is below threshold ${FERTILITY_MIN}.` };
  }
  if (pull < PULL_MIN) {
    return { eligible: false, reason: `Pull score ${pull.toFixed(2)} is below threshold ${PULL_MIN}.` };
  }

  return { eligible: true, reason: "Eligible: concept with sufficient alignment, fertility, pull, and continue/branch/shift_medium." };
}
