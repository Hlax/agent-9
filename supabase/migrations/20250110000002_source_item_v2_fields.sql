-- Source item V2 minimal fields for media ingestion and annotations.
-- Canon: docs/05_build/source_item_schema_v2, implementation_assessment_media_identity.
-- Guardrail: source_item is evidence only; this migration does not touch identity.

ALTER TABLE source_item
  ADD COLUMN IF NOT EXISTS source_role TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[],
  ADD COLUMN IF NOT EXISTS ontology_notes TEXT,
  ADD COLUMN IF NOT EXISTS identity_relevance_notes TEXT,
  ADD COLUMN IF NOT EXISTS general_notes TEXT,
  ADD COLUMN IF NOT EXISTS media_kind TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS preview_uri TEXT,
  ADD COLUMN IF NOT EXISTS extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS transcript_text TEXT,
  ADD COLUMN IF NOT EXISTS identity_weight NUMERIC,
  ADD COLUMN IF NOT EXISTS source_metadata JSONB,
  ADD COLUMN IF NOT EXISTS processing_metadata JSONB;

COMMENT ON COLUMN source_item.source_role IS 'Runtime role: identity_seed, reference, inspiration, contextual, archive_only';
COMMENT ON COLUMN source_item.tags IS 'Flexible retrieval labels';
COMMENT ON COLUMN source_item.ontology_notes IS 'What terms mean in this system';
COMMENT ON COLUMN source_item.identity_relevance_notes IS 'Why this source matters to identity formation';
COMMENT ON COLUMN source_item.extracted_text IS 'AI-generated description, OCR, frame summary, vision output';
COMMENT ON COLUMN source_item.transcript_text IS 'Speech transcript for audio/video';
COMMENT ON COLUMN source_item.identity_weight IS '0.0-1.0 how strongly this source influences identity aggregation';
