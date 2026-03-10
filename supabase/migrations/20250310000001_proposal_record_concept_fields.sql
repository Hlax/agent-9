-- Concept-to-proposal flow: link proposals to source concept artifact and target surface.
-- Canon: docs/02_runtime/concept_to_proposal_flow.md

ALTER TABLE proposal_record
  ADD COLUMN IF NOT EXISTS artifact_id UUID REFERENCES artifact(artifact_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_surface TEXT,
  ADD COLUMN IF NOT EXISTS proposal_type TEXT;

COMMENT ON COLUMN proposal_record.artifact_id IS 'Source concept artifact when proposal is created from a concept.';
COMMENT ON COLUMN proposal_record.target_surface IS 'Where the proposal would take effect: studio | staging_habitat | public_habitat.';
COMMENT ON COLUMN proposal_record.proposal_type IS 'Kind of change: layout | component | navigation | workflow | visual_system | publishing.';
