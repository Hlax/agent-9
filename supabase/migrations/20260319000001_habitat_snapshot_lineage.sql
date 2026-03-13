-- Snapshot Lineage + Identity Trajectory V1.
-- Canon: docs/05_build/SNAPSHOT_LINEAGE_IDENTITY_TRAJECTORY_V1.md
-- Immutable habitat snapshots with identity-scoped lineage; trait_summary for trajectory (derived on read).

CREATE TABLE IF NOT EXISTS habitat_snapshot (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identity(identity_id) ON DELETE CASCADE,
  parent_snapshot_id UUID REFERENCES habitat_snapshot(snapshot_id) ON DELETE SET NULL,
  snapshot_kind TEXT NOT NULL CHECK (snapshot_kind IN ('staging', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_session_ids UUID[] NOT NULL DEFAULT '{}',
  trait_summary JSONB,
  lineage_metadata JSONB,
  payload_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_habitat_snapshot_identity_created
  ON habitat_snapshot(identity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_habitat_snapshot_identity_kind
  ON habitat_snapshot(identity_id, snapshot_kind);

COMMENT ON TABLE habitat_snapshot IS 'V1: Immutable habitat snapshots; lineage is identity-scoped. Public = linear chain; staging points to public at capture.';
COMMENT ON COLUMN habitat_snapshot.identity_id IS 'Required for multi-identity; all reads filter by identity_id.';
COMMENT ON COLUMN habitat_snapshot.parent_snapshot_id IS 'Public: previous public snapshot. Staging: public snapshot current at capture time.';
COMMENT ON COLUMN habitat_snapshot.trait_summary IS 'Derived at creation only; closed enum block_profile (hero, text, artifact_grid, artifact, extension, other).';
COMMENT ON COLUMN habitat_snapshot.payload_json IS 'Immutable payload: habitat_pages (array of {slug, payload}), avatar_state, extensions (optional).';

-- Optional lineage refs on promotion record for evidence (V1: backward compatible).
ALTER TABLE habitat_promotion_record
  ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES habitat_snapshot(snapshot_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_public_snapshot_id UUID REFERENCES habitat_snapshot(snapshot_id) ON DELETE SET NULL;
COMMENT ON COLUMN habitat_promotion_record.snapshot_id IS 'V1: public snapshot created by this promotion (lineage).';
COMMENT ON COLUMN habitat_promotion_record.previous_public_snapshot_id IS 'V1: previous public snapshot for this identity (chain).';
