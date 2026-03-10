-- Runtime config for scheduler and mode (slow / default / steady / turbo).
-- Keys: mode, always_on, last_run_at (ISO timestamp).
CREATE TABLE IF NOT EXISTS runtime_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE runtime_config IS 'Key-value config for scheduler: mode (slow|default|steady|turbo), always_on (true|false), last_run_at (ISO).';

ALTER TABLE runtime_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_runtime_config" ON runtime_config FOR ALL USING (true) WITH CHECK (true);
