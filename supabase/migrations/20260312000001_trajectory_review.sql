-- Trajectory review: post-session diagnostic layer (V1).
-- Single row per session; does not alter governance or session results.

CREATE TABLE trajectory_review (
  trajectory_review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES creative_session(session_id) ON DELETE CASCADE,
  deliberation_trace_id UUID REFERENCES deliberation_trace(deliberation_trace_id) ON DELETE SET NULL,
  review_version TEXT NOT NULL DEFAULT 'v1',
  narrative_state TEXT,
  action_kind TEXT,
  outcome_kind TEXT,
  trajectory_quality REAL NOT NULL,
  alignment_score REAL NOT NULL,
  movement_score REAL NOT NULL,
  novelty_score REAL NOT NULL,
  governance_score REAL NOT NULL,
  confidence_calibration_score REAL NOT NULL,
  issues_json JSONB,
  strengths_json JSONB,
  learning_signal TEXT,
  recommended_next_action_kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trajectory_review_session_idx ON trajectory_review(session_id);
CREATE INDEX trajectory_review_created_idx ON trajectory_review(created_at DESC);
