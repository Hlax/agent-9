-- Core entities from docs/01_foundation/data_model.md
-- Approval and publication remain separate; proposal_record for surface/system lanes.

CREATE TABLE identity (
  identity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label TEXT NOT NULL DEFAULT 'v0',
  name TEXT,
  summary TEXT,
  philosophy TEXT,
  creative_values JSONB,
  embodiment_direction TEXT,
  habitat_direction TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  summary TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idea_thread (
  idea_thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES project(project_id),
  title TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  parent_thread_id UUID REFERENCES idea_thread(idea_thread_id),
  primary_theme_ids UUID[],
  status TEXT NOT NULL DEFAULT 'active',
  recurrence_score REAL CHECK (recurrence_score >= 0 AND recurrence_score <= 1),
  creative_pull REAL CHECK (creative_pull >= 0 AND creative_pull <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE creative_session (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES project(project_id),
  mode session_mode NOT NULL,
  selected_drive creative_drive,
  title TEXT,
  prompt_context TEXT,
  reflection_notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idea (
  idea_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES project(project_id),
  origin_session_id UUID REFERENCES creative_session(session_id),
  title TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  recurrence_score REAL CHECK (recurrence_score >= 0 AND recurrence_score <= 1),
  creative_pull REAL CHECK (creative_pull >= 0 AND creative_pull <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idea_to_thread (
  idea_to_thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES idea(idea_id),
  idea_thread_id UUID NOT NULL REFERENCES idea_thread(idea_thread_id),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(idea_id, idea_thread_id)
);

CREATE TABLE creative_state_snapshot (
  state_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES creative_session(session_id) ON DELETE CASCADE,
  identity_stability REAL,
  avatar_alignment REAL,
  expression_diversity REAL,
  unfinished_projects REAL,
  recent_exploration_rate REAL,
  creative_tension REAL,
  curiosity_level REAL,
  reflection_need REAL,
  idea_recurrence REAL,
  public_curation_backlog REAL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT state_scores_0_1 CHECK (
    (identity_stability IS NULL OR (identity_stability >= 0 AND identity_stability <= 1)) AND
    (avatar_alignment IS NULL OR (avatar_alignment >= 0 AND avatar_alignment <= 1)) AND
    (expression_diversity IS NULL OR (expression_diversity >= 0 AND expression_diversity <= 1)) AND
    (unfinished_projects IS NULL OR (unfinished_projects >= 0 AND unfinished_projects <= 1)) AND
    (recent_exploration_rate IS NULL OR (recent_exploration_rate >= 0 AND recent_exploration_rate <= 1)) AND
    (creative_tension IS NULL OR (creative_tension >= 0 AND creative_tension <= 1)) AND
    (curiosity_level IS NULL OR (curiosity_level >= 0 AND curiosity_level <= 1)) AND
    (reflection_need IS NULL OR (reflection_need >= 0 AND reflection_need <= 1)) AND
    (idea_recurrence IS NULL OR (idea_recurrence >= 0 AND idea_recurrence <= 1)) AND
    (public_curation_backlog IS NULL OR (public_curation_backlog >= 0 AND public_curation_backlog <= 1))
  )
);

CREATE TABLE artifact (
  artifact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES project(project_id),
  session_id UUID REFERENCES creative_session(session_id),
  primary_idea_id UUID REFERENCES idea(idea_id),
  primary_thread_id UUID REFERENCES idea_thread(idea_thread_id),
  title TEXT NOT NULL,
  summary TEXT,
  medium artifact_medium NOT NULL,
  lifecycle_status artifact_lifecycle_status NOT NULL DEFAULT 'draft',
  current_approval_state approval_state,
  current_publication_state publication_state DEFAULT 'private',
  content_text TEXT,
  content_uri TEXT,
  preview_uri TEXT,
  notes TEXT,
  alignment_score REAL,
  emergence_score REAL,
  fertility_score REAL,
  pull_score REAL,
  recurrence_score REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT artifact_scores_0_1 CHECK (
    (alignment_score IS NULL OR (alignment_score >= 0 AND alignment_score <= 1)) AND
    (emergence_score IS NULL OR (emergence_score >= 0 AND emergence_score <= 1)) AND
    (fertility_score IS NULL OR (fertility_score >= 0 AND fertility_score <= 1)) AND
    (pull_score IS NULL OR (pull_score >= 0 AND pull_score <= 1)) AND
    (recurrence_score IS NULL OR (recurrence_score >= 0 AND recurrence_score <= 1))
  )
);

CREATE TABLE artifact_to_idea (
  artifact_to_idea_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES artifact(artifact_id) ON DELETE CASCADE,
  idea_id UUID NOT NULL REFERENCES idea(idea_id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(artifact_id, idea_id)
);

CREATE TABLE artifact_to_thread (
  artifact_to_thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES artifact(artifact_id) ON DELETE CASCADE,
  idea_thread_id UUID NOT NULL REFERENCES idea_thread(idea_thread_id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(artifact_id, idea_thread_id)
);

CREATE TABLE critique_record (
  critique_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES artifact(artifact_id) ON DELETE CASCADE,
  session_id UUID REFERENCES creative_session(session_id),
  intent_note TEXT,
  strength_note TEXT,
  originality_note TEXT,
  energy_note TEXT,
  potential_note TEXT,
  medium_fit_note TEXT,
  coherence_note TEXT,
  fertility_note TEXT,
  overall_summary TEXT,
  critique_outcome critique_outcome,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evaluation_signal (
  evaluation_signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('artifact', 'idea', 'idea_thread', 'session')),
  target_id UUID NOT NULL,
  alignment_score REAL,
  emergence_score REAL,
  fertility_score REAL,
  pull_score REAL,
  recurrence_score REAL,
  resonance_score REAL,
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT eval_scores_0_1 CHECK (
    (alignment_score IS NULL OR (alignment_score >= 0 AND alignment_score <= 1)) AND
    (emergence_score IS NULL OR (emergence_score >= 0 AND emergence_score <= 1)) AND
    (fertility_score IS NULL OR (fertility_score >= 0 AND fertility_score <= 1)) AND
    (pull_score IS NULL OR (pull_score >= 0 AND pull_score <= 1)) AND
    (recurrence_score IS NULL OR (recurrence_score >= 0 AND recurrence_score <= 1)) AND
    (resonance_score IS NULL OR (resonance_score >= 0 AND resonance_score <= 1))
  )
);

CREATE TABLE approval_record (
  approval_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES artifact(artifact_id) ON DELETE CASCADE,
  approval_state approval_state NOT NULL,
  reviewer TEXT,
  review_note TEXT,
  annotation_note TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE publication_record (
  publication_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES artifact(artifact_id) ON DELETE CASCADE,
  publication_state publication_state NOT NULL,
  changed_by TEXT,
  note TEXT,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Surface and system lane proposals; artifact lane uses approval_record.
CREATE TABLE proposal_record (
  proposal_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_type approval_lane NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  title TEXT NOT NULL,
  summary TEXT,
  proposal_state TEXT NOT NULL DEFAULT 'pending_review',
  preview_uri TEXT,
  review_note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE generation_run (
  generation_run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES creative_session(session_id) ON DELETE CASCADE,
  artifact_id UUID REFERENCES artifact(artifact_id) ON DELETE SET NULL,
  medium artifact_medium NOT NULL,
  provider_name TEXT,
  model_name TEXT,
  prompt_snapshot TEXT,
  context_snapshot TEXT,
  run_status TEXT NOT NULL DEFAULT 'completed',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE archive_entry (
  archive_entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES project(project_id),
  artifact_id UUID REFERENCES artifact(artifact_id),
  idea_id UUID REFERENCES idea(idea_id),
  idea_thread_id UUID REFERENCES idea_thread(idea_thread_id),
  reason_paused TEXT,
  unresolved_question TEXT,
  creative_pull REAL,
  recurrence_score REAL,
  notes_from_harvey TEXT,
  last_session_id UUID REFERENCES creative_session(session_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE change_record (
  change_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_type change_type NOT NULL,
  initiated_by initiated_by NOT NULL,
  target_type TEXT,
  target_id UUID,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reason TEXT,
  approved BOOLEAN,
  approved_by TEXT,
  effective_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE source_item (
  source_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES project(project_id),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  summary TEXT,
  content_text TEXT,
  content_uri TEXT,
  origin_reference TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memory_record (
  memory_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES project(project_id),
  memory_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT,
  source_session_id UUID REFERENCES creative_session(session_id),
  source_artifact_id UUID REFERENCES artifact(artifact_id),
  importance_score REAL,
  recurrence_score REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE theme (
  theme_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tag (
  tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common access patterns
CREATE INDEX idx_artifact_session ON artifact(session_id);
CREATE INDEX idx_artifact_approval ON artifact(current_approval_state);
CREATE INDEX idx_artifact_publication ON artifact(current_publication_state);
CREATE INDEX idx_approval_record_artifact ON approval_record(artifact_id);
CREATE INDEX idx_publication_record_artifact ON publication_record(artifact_id);
CREATE INDEX idx_proposal_record_lane ON proposal_record(lane_type);
CREATE INDEX idx_proposal_record_state ON proposal_record(proposal_state);
CREATE INDEX idx_creative_session_project ON creative_session(project_id);
CREATE INDEX idx_evaluation_signal_target ON evaluation_signal(target_type, target_id);
