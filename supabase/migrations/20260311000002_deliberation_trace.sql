-- Deliberation trace: structured reasoning layer for creative sessions.
-- Captures observations, tensions, hypotheses, evidence, decisions, and outcomes.

CREATE TABLE deliberation_trace (
  deliberation_trace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES creative_session(session_id) ON DELETE CASCADE,
  observations_json JSONB,
  state_summary TEXT,
  tensions_json JSONB,
  hypotheses_json JSONB,
  evidence_checked_json JSONB,
  rejected_alternatives_json JSONB,
  chosen_action TEXT,
  confidence REAL,
  execution_mode TEXT,
  human_gate_reason TEXT,
  outcome_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX deliberation_trace_session_idx
  ON deliberation_trace(session_id, created_at DESC);

