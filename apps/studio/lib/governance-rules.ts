/**
 * Governance rules enforced in Studio (canon: docs/03_governance/*).
 * Do not conflate these in code:
 * - Approval is not publication.
 * - approved_for_publication is an approval state; publish is a separate action.
 * - Staging is not public release.
 * - Critique is not evaluation; evaluation is not approval.
 * - Archive/reject are not delete.
 */

/** Approval states that can be set via the artifact approval API. */
export const APPROVAL_ACTIONS = [
  "approved",
  "approved_with_annotation",
  "needs_revision",
  "rejected",
  "archived",
  "approved_for_publication",
] as const;

/** Only artifacts in this approval state may be published. */
export const REQUIRED_APPROVAL_FOR_PUBLISH = "approved_for_publication" as const;

/**
 * Canonical artifact approval state transitions for the artifact lane.
 *
 * This map encodes the *review* lifecycle only. It does not cover publication
 * (handled separately via publication_state) and is intentionally conservative:
 *
 * - Forward flow: pending_review/needs_revision to approved or archived/rejected.
 * - Legacy approved / approved_with_annotation: may move toward publication or archival.
 * - Terminal states: rejected/archived may not be reopened via the approval API.
 *
 * For backwards compatibility, artifacts with no current_approval_state are
 * treated as having no prior state; the first approval write is allowed to
 * any value in APPROVAL_ACTIONS.
 */
export const ARTIFACT_APPROVAL_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  pending_review: [
    "approved",
    "approved_with_annotation",
    "needs_revision",
    "rejected",
    "archived",
    "approved_for_publication",
  ],
  needs_revision: [
    "approved",
    "approved_with_annotation",
    "rejected",
    "archived",
    "approved_for_publication",
  ],
  approved: [
    "approved_with_annotation",
    "rejected",
    "archived",
    "approved_for_publication",
  ],
  approved_with_annotation: [
    "approved",
    "rejected",
    "archived",
    "approved_for_publication",
  ],
  approved_for_publication: ["archived"],
  // Terminal states for the approval API – cannot be reopened here.
  rejected: [],
  archived: [],
};

/**
 * Returns true when moving an artifact's current_approval_state from `fromState`
 * to `toState` is a legal transition according to ARTIFACT_APPROVAL_TRANSITIONS.
 *
 * Rules:
 * - If fromState is null/undefined, the first approval write is always allowed.
 * - If fromState === toState, the transition is treated as idempotent (allowed).
 * - Unknown fromState values are treated as illegal to avoid hiding drift.
 */
export function isLegalArtifactApprovalTransition(
  fromState: string | null | undefined,
  toState: string
): boolean {
  if (!fromState) return true;
  if (fromState === toState) return true;
  const allowed = ARTIFACT_APPROVAL_TRANSITIONS[fromState];
  if (!allowed) return false;
  return allowed.includes(toState);
}

/**
 * Canonical proposal state transition map (B-3).
 * Keys are valid current states; values are the states that may follow via PATCH.
 * Terminal states (published, archived, rejected, ignored) have no forward transitions via PATCH.
 * Rollback from published uses the dedicated /unpublish route (privileged side-effect path).
 * Forward transitions with domain side-effects (approve_for_staging, approve_for_publication)
 * should prefer the /approve route, but PATCH is also allowed for direct Harvey overrides.
 * Canon: docs/02_runtime/concept_to_proposal_flow.md.
 */
export const PROPOSAL_STATE_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  pending_review:           ["needs_revision", "approved_for_staging", "archived", "rejected", "ignored"],
  needs_revision:           ["approved_for_staging", "archived", "rejected"],
  approved:                 ["approved_for_staging", "approved_for_publication", "archived", "rejected"],
  approved_for_staging:     ["staged", "approved_for_publication", "archived", "rejected"],
  staged:                   ["approved_for_publication", "archived", "rejected"],
  approved_for_publication: ["published", "archived"],
  // Terminal states — no forward transitions via PATCH.
  published: [],
  archived:  [],
  rejected:  [],
  ignored:   [],
};

/**
 * Returns true when moving a proposal from `fromState` to `toState` is a legal
 * transition according to the canonical map above.
 *
 * This is the single authoritative guard for proposal state changes.
 * Call-sites that previously did ad-hoc checks should delegate here.
 */
export function isLegalProposalStateTransition(fromState: string, toState: string): boolean {
  const allowed = PROPOSAL_STATE_TRANSITIONS[fromState];
  if (!allowed) return false;
  return allowed.includes(toState);
}

/**
 * Returns the list of legal next proposal states from the given state.
 * Used by review UI to show available actions (e.g. "Stage", "Approve for publication").
 */
export function getNextLegalProposalActions(currentState: string): readonly string[] {
  return PROPOSAL_STATE_TRANSITIONS[currentState] ?? [];
}
