-- Session trace: decision chain for each creative session (runtime introspection).
ALTER TABLE creative_session
  ADD COLUMN IF NOT EXISTS trace JSONB NULL;

COMMENT ON COLUMN creative_session.trace IS 'Decision chain: mode, drive, project/thread/idea ids and names, artifact_id, proposal_id, tokens_used, start/end_time.';
