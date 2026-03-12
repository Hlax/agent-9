-- Human feedback table for explicit Harvey reviews.
-- Aligns with packages/core/src/types.ts::HumanFeedback and feedback_type enum.

CREATE TABLE IF NOT EXISTS human_feedback (
  feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  feedback_type feedback_type NOT NULL,
  score REAL,
  note TEXT,
  tags TEXT[],
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feedback_score_0_1 CHECK (
    score IS NULL OR (score >= 0 AND score <= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_human_feedback_target
  ON human_feedback (target_type, target_id);

