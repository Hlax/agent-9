-- Canonical enums from docs/01_foundation/data_model.md

CREATE TYPE artifact_medium AS ENUM (
  'writing', 'image', 'audio', 'video', 'concept'
);

CREATE TYPE artifact_lifecycle_status AS ENUM (
  'draft', 'current', 'superseded'
);

CREATE TYPE session_mode AS ENUM (
  'continue', 'return', 'explore', 'reflect', 'rest'
);

CREATE TYPE creative_drive AS ENUM (
  'coherence', 'expression', 'emergence', 'expansion',
  'return', 'reflection', 'curation', 'habitat'
);

CREATE TYPE feedback_type AS ENUM (
  'approve', 'reject', 'rank', 'annotate', 'tag', 'comment',
  'mark_experimental', 'mark_revisit'
);

CREATE TYPE change_type AS ENUM (
  'identity_update', 'workflow_update', 'system_update', 'habitat_update',
  'embodiment_update', 'evaluation_update', 'governance_update', 'other'
);

CREATE TYPE initiated_by AS ENUM ('twin', 'harvey', 'system');

CREATE TYPE critique_outcome AS ENUM (
  'continue', 'branch', 'shift_medium', 'reflect', 'archive_candidate', 'stop'
);

CREATE TYPE publication_state AS ENUM (
  'private', 'internal_only', 'scheduled', 'published'
);

CREATE TYPE approval_lane AS ENUM ('artifact', 'surface', 'system');

CREATE TYPE approval_state AS ENUM (
  'pending_review', 'approved', 'approved_with_annotation', 'needs_revision',
  'rejected', 'archived', 'approved_for_publication'
);
