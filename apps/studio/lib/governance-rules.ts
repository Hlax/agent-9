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
