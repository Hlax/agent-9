-- Session Intent / Continuity Layer (Active Session Intent).
-- One record per active intention; status transitions: active -> fulfilled | abandoned | superseded.
-- Helps the runtime "lean" across sessions (what we're in the middle of).

CREATE TABLE runtime_intent (
  intent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'fulfilled', 'abandoned', 'superseded')),
  intent_kind TEXT NOT NULL
    CHECK (intent_kind IN ('explore', 'refine', 'consolidate', 'reflect', 'return')),
  target_project_id UUID REFERENCES project(project_id) ON DELETE SET NULL,
  target_thread_id UUID REFERENCES idea_thread(idea_thread_id) ON DELETE SET NULL,
  target_artifact_family TEXT,
  reason_summary TEXT,
  evidence_json JSONB,
  confidence REAL,
  exit_conditions_json JSONB,
  source_session_id UUID REFERENCES creative_session(session_id) ON DELETE SET NULL,
  last_reinforced_session_id UUID REFERENCES creative_session(session_id) ON DELETE SET NULL
);

CREATE INDEX runtime_intent_status_created_idx ON runtime_intent(status, created_at DESC);
CREATE INDEX runtime_intent_active_idx ON runtime_intent(created_at DESC) WHERE status = 'active';

COMMENT ON TABLE runtime_intent IS 'Active session intent: short-lived operating intention for continuity across sessions (explore/refine/consolidate/reflect/return).';
