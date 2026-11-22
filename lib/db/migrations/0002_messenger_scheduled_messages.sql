-- Oscar Messaging scheduled messages. Apply only after reviewing the target database.
-- This additive migration is not run by the app build or preview.

CREATE TABLE IF NOT EXISTS messenger_scheduled_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL
    REFERENCES messenger_conversations(id) ON DELETE CASCADE,
  sender_id text NOT NULL
    REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  client_schedule_id text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  sent_message_id text REFERENCES messenger_messages(id) ON DELETE SET NULL,
  failure_code text,
  CONSTRAINT messenger_scheduled_messages_client_key
    UNIQUE (conversation_id, sender_id, client_schedule_id)
);

CREATE INDEX IF NOT EXISTS messenger_scheduled_messages_due_idx
  ON messenger_scheduled_messages (status, scheduled_at);
CREATE INDEX IF NOT EXISTS messenger_scheduled_messages_sender_idx
  ON messenger_scheduled_messages (sender_id, status, scheduled_at);
