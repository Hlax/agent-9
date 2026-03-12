-- Staging habitat composition: first-class staging workspace (branch model).
-- Canon: docs/architecture/habitat_branch_staging_design.md
-- When a habitat proposal is approved_for_staging, its payload is merged here (per-page).
-- Public habitat is updated only by promotion (copy staging → public); no runner self-publish.

CREATE TABLE IF NOT EXISTS staging_habitat_content (
  slug TEXT PRIMARY KEY,
  title TEXT,
  body TEXT,
  payload_json JSONB,
  source_proposal_id UUID REFERENCES proposal_record(proposal_record_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE staging_habitat_content IS 'Current staging habitat composition; one row per page (slug). Merged from approved habitat proposals.';
COMMENT ON COLUMN staging_habitat_content.source_proposal_id IS 'Proposal that last supplied this page (provenance).';

CREATE TABLE IF NOT EXISTS habitat_promotion_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_by TEXT,
  slugs_updated TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE habitat_promotion_record IS 'Audit log: each push of staging to public.';
