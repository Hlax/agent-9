/**
 * Canonical enums from docs/01_foundation/data_model.md.
 * Do not rename or collapse; preserve for governance and schema alignment.
 */

export const artifact_medium = [
  "writing",
  "image",
  "audio",
  "video",
  "concept",
] as const;
export type ArtifactMedium = (typeof artifact_medium)[number];

export const artifact_lifecycle_status = ["draft", "current", "superseded"] as const;
export type ArtifactLifecycleStatus = (typeof artifact_lifecycle_status)[number];

export const session_mode = [
  "continue",
  "return",
  "explore",
  "reflect",
  "rest",
] as const;
export type SessionMode = (typeof session_mode)[number];

export const creative_drive = [
  "coherence",
  "expression",
  "emergence",
  "expansion",
  "return",
  "reflection",
  "curation",
  "habitat",
] as const;
export type CreativeDrive = (typeof creative_drive)[number];

export const feedback_type = [
  "approve",
  "reject",
  "rank",
  "annotate",
  "tag",
  "comment",
  "mark_experimental",
  "mark_revisit",
] as const;
export type FeedbackType = (typeof feedback_type)[number];

export const change_type = [
  "identity_update",
  "workflow_update",
  "system_update",
  "habitat_update",
  "embodiment_update",
  "evaluation_update",
  "governance_update",
  "other",
] as const;
export type ChangeType = (typeof change_type)[number];

export const initiated_by = ["twin", "harvey", "system"] as const;
export type InitiatedBy = (typeof initiated_by)[number];

export const critique_outcome = [
  "continue",
  "branch",
  "shift_medium",
  "reflect",
  "archive_candidate",
  "stop",
] as const;
export type CritiqueOutcome = (typeof critique_outcome)[number];

export const publication_state = [
  "private",
  "internal_only",
  "scheduled",
  "published",
] as const;
export type PublicationState = (typeof publication_state)[number];

export const approval_lane = ["artifact", "surface", "system"] as const;
export type ApprovalLane = (typeof approval_lane)[number];

export const approval_state = [
  "pending_review",
  "approved",
  "approved_with_annotation",
  "needs_revision",
  "rejected",
  "archived",
  "approved_for_publication",
  "approved_for_staging",
  "staged",
  "ignored",
  "published",
] as const;
export type ApprovalState = (typeof approval_state)[number];
