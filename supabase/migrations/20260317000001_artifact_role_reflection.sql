-- Support artifact_role for runtime-inferred roles (layout_concept, image_concept, reflection_note).
-- Enables persisted reflection artifacts without changing artifact_medium enum.
ALTER TABLE artifact
  ADD COLUMN IF NOT EXISTS artifact_role TEXT;

COMMENT ON COLUMN artifact.artifact_role IS 'Runtime role: layout_concept, image_concept, reflection_note, or null. Used for filtering and staging intent.';
