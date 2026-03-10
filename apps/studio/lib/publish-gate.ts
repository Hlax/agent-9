/**
 * Staging/release gate for publish.
 * Gate applies only to proposal-intent artifacts (D-5).
 * Pure expressive writing and concepts are ungated.
 */

const STAGED_STATES = ["approved_for_staging", "staged", "approved_for_publication", "published"];

/**
 * Proposal roles that signal deployment/surface/build intent.
 * Artifacts or proposals carrying these roles are treated as proposal-intent work.
 */
const PROPOSAL_INTENT_ROLES = ["habitat_layout", "avatar_layout", "system_proposal", "surface_proposal", "layout_concept"];

export interface ProposalMeta {
  proposal_state: string;
  proposal_role?: string | null;
  target_surface?: string | null;
}

export interface ArtifactMeta {
  target_surface?: string | null;
  artifact_role?: string | null;
}

/**
 * Returns true when the artifact is proposal-intent work that must pass
 * through the staging gate before publication.
 *
 * Proposal-intent signals (any one is sufficient):
 *   - linked proposal_record rows exist
 *   - artifact target_surface is set (non-null)
 *   - any linked proposal has a deployment-intent proposal_role or target_surface
 *   - artifact_role indicates a build/publication intent
 */
export function isProposalIntent(proposals: ProposalMeta[], artifact: ArtifactMeta): boolean {
  if (proposals.length > 0) return true;
  if (artifact.target_surface) return true;
  if (artifact.artifact_role && PROPOSAL_INTENT_ROLES.includes(artifact.artifact_role)) return true;
  return false;
}

/**
 * Staging gate for publish.
 *
 * Returns true (publish allowed) when either:
 *   - the artifact is not proposal-intent work (expressive writing/concept), or
 *   - the artifact is proposal-intent and at least one linked proposal has passed staging.
 *
 * artifact is optional for backwards compatibility; omitting it treats the artifact
 * as having no target_surface or artifact_role.
 */
export function passesStagingGate(proposals: ProposalMeta[], artifact: ArtifactMeta = {}): boolean {
  if (!isProposalIntent(proposals, artifact)) return true;
  return proposals.some((p) => STAGED_STATES.includes(p.proposal_state));
}
