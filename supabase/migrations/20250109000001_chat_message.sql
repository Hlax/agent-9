-- Studio chat: Harvey–agent communication. One thread per operator for V1.
-- Chat is operator communication and session triggers; important moments can be promoted to memory (see plan §7.10).

CREATE TABLE chat_thread (
  thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_message (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES chat_thread(thread_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('harvey', 'twin')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_message_thread ON chat_message(thread_id, created_at ASC);
