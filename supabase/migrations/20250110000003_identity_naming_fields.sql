-- Naming feature: readiness and proposal state. Canon: docs/05_build/twin_naming_design.md

ALTER TABLE identity
  ADD COLUMN IF NOT EXISTS name_status TEXT,
  ADD COLUMN IF NOT EXISTS name_rationale TEXT,
  ADD COLUMN IF NOT EXISTS naming_readiness_score NUMERIC,
  ADD COLUMN IF NOT EXISTS naming_readiness_notes TEXT,
  ADD COLUMN IF NOT EXISTS last_naming_evaluated_at TIMESTAMPTZ;

COMMENT ON COLUMN identity.name_status IS 'unnamed | proposed | accepted | rejected';
COMMENT ON COLUMN identity.naming_readiness_score IS '0.0-1.0 from evaluator';
