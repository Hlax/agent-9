-- Fix: Add missing columns referenced in session-runner.ts but absent from the schema.
-- Without these, concept-to-proposal flow and session trace updates silently fail.

-- proposal_role: identifies the functional role of a proposal (e.g. habitat_layout, avatar_candidate).
-- Required by session-runner.ts for filtering and inserting concept-to-proposal records.
ALTER TABLE proposal_record
  ADD COLUMN IF NOT EXISTS proposal_role TEXT;

COMMENT ON COLUMN proposal_record.proposal_role IS 'Functional role of this proposal: habitat_layout, avatar_candidate, etc. Used to filter backlog by role.';

CREATE INDEX IF NOT EXISTS idx_proposal_record_role
  ON proposal_record(proposal_role)
  WHERE proposal_role IS NOT NULL;

-- decision_summary: JSONB session decision chain persisted after each run.
-- Stores project/thread/idea selection reasoning, rejected alternatives, next_action, and confidence.
-- Required by session-runner.ts trace update; missing column caused the trace update to fail silently.
ALTER TABLE creative_session
  ADD COLUMN IF NOT EXISTS decision_summary JSONB;

COMMENT ON COLUMN creative_session.decision_summary IS 'Session decision chain: why this project/thread/idea was selected, rejected alternatives, next_action, confidence.';
