-- Habitat V2: structured payloads for proposals and public habitat.
-- Canon: docs/04_product/habitat_v2.md

ALTER TABLE proposal_record
  ADD COLUMN IF NOT EXISTS habitat_payload_json JSONB;

COMMENT ON COLUMN proposal_record.habitat_payload_json IS 'Validated Habitat V2 structured payload when target_surface is public_habitat.';

ALTER TABLE public_habitat_content
  ADD COLUMN IF NOT EXISTS payload_json JSONB;

COMMENT ON COLUMN public_habitat_content.payload_json IS 'Approved Habitat V2 structured payload for the page (slug). Rendered by public site when present.';
