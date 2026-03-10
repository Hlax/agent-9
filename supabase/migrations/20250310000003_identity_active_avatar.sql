-- Avatar V1: one active public avatar as an approved image artifact.
-- Canon: identity holds active_avatar_artifact_id; only one at a time; Harvey approval-gated.
ALTER TABLE identity
  ADD COLUMN IF NOT EXISTS active_avatar_artifact_id UUID REFERENCES artifact(artifact_id) ON DELETE SET NULL;

COMMENT ON COLUMN identity.active_avatar_artifact_id IS 'V1: the single public avatar artifact (image); set by Harvey from approved image artifacts.';
