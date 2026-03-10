/**
 * Staging/release gate for publish: if artifact has linked proposals,
 * at least one must have passed staging (approved_for_staging or later).
 */

const STAGED_STATES = ["approved_for_staging", "staged", "approved_for_publication", "published"];

export function passesStagingGate(proposals: { proposal_state: string }[]): boolean {
  if (!proposals?.length) return true;
  return proposals.some((p) => STAGED_STATES.includes(p.proposal_state));
}
