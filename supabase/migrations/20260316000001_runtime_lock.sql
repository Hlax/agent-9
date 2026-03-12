-- Runtime lock (lease) to prevent overlapping cron-triggered session runs.
-- Only one row; lock_until expires so a crashed runner auto-releases.
CREATE TABLE IF NOT EXISTS runtime_lock (
  lock_id TEXT PRIMARY KEY DEFAULT 'default',
  locked_until TIMESTAMPTZ NOT NULL,
  owner_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE runtime_lock IS 'Singleton lease for cron session runner; locked_until prevents overlapping runs.';

ALTER TABLE runtime_lock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_runtime_lock" ON runtime_lock FOR ALL USING (true) WITH CHECK (true);

-- Ensure single row exists (idempotent).
INSERT INTO runtime_lock (lock_id, locked_until, owner_id, updated_at)
VALUES ('default', '1970-01-01T00:00:00Z', '', now())
ON CONFLICT (lock_id) DO NOTHING;
