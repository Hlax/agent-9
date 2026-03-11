/**
 * Thin wrapper around the canonical proposal state transition guard.
 * Kept for backwards compatibility with existing imports in PATCH routes.
 */
import { isLegalProposalStateTransition } from "./governance-rules";

export function isValidProposalTransition(currentState: string, targetState: string): boolean {
  return isLegalProposalStateTransition(currentState, targetState);
}
