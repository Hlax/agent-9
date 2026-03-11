/**
 * Proposal state transition validation (B-3).
 * Canon: docs/02_runtime/concept_to_proposal_flow.md, docs/03_governance/*.
 */

import { PROPOSAL_STATE_TRANSITIONS } from "./governance-rules";

/**
 * Returns true when transitioning a proposal from `currentState` to `targetState`
 * is a legal forward move according to the canonical transition map.
 *
 * Exempt paths (intentional bypasses):
 *   - /api/proposals/[id]/approve — domain-specific side-effects, handles its own semantics.
 *   - /api/proposals/[id]/unpublish — privileged rollback; published → approved_for_staging.
 * This function is used only by the PATCH /api/proposals/[id] route.
 */
export function isValidProposalTransition(currentState: string, targetState: string): boolean {
  const allowed = PROPOSAL_STATE_TRANSITIONS[currentState];
  if (!allowed) return false;
  return allowed.includes(targetState);
}
