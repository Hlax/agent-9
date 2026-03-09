-- Persistent conversation state: store OpenAI Responses API response id per thread
-- so we can pass previous_response_id on the next turn (Option 2 conversation state).
ALTER TABLE chat_thread
  ADD COLUMN IF NOT EXISTS openai_response_id TEXT;

COMMENT ON COLUMN chat_thread.openai_response_id IS 'Last OpenAI Responses API response id for this thread; used as previous_response_id on next turn.';
