-- Retrieval-friendly indexes and optional metadata for memory_record. Plan §6, §7.7.

CREATE INDEX IF NOT EXISTS idx_memory_record_created_at
  ON memory_record(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_record_project_created
  ON memory_record(project_id, created_at DESC);

-- Optional JSONB for flexible signals without new columns.
ALTER TABLE memory_record
  ADD COLUMN IF NOT EXISTS metadata JSONB;
