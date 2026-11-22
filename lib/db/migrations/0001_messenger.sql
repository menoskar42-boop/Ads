-- Oscar Messaging initial schema. Apply only after reviewing the target database.
-- This migration is intentionally not run by the app build or preview.

CREATE TABLE IF NOT EXISTS messenger_profiles (
  user_id text PRIMARY KEY,
  username text NOT NULL,
  username_lower text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messenger_conversations (
  id text PRIMARY KEY,
  user_a text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  user_b text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messenger_conversations_pair_key UNIQUE (user_a, user_b),
  CONSTRAINT messenger_conversations_distinct_pair CHECK (user_a <> user_b)
);

CREATE INDEX IF NOT EXISTS messenger_conversations_user_a_idx
  ON messenger_conversations (user_a, updated_at DESC);
CREATE INDEX IF NOT EXISTS messenger_conversations_user_b_idx
  ON messenger_conversations (user_b, updated_at DESC);

CREATE TABLE IF NOT EXISTS messenger_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL
    REFERENCES messenger_conversations(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  client_message_id text NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  read_at timestamptz,
  attachment_count integer NOT NULL DEFAULT 0 CHECK (attachment_count >= 0),
  CONSTRAINT messenger_messages_client_key
    UNIQUE (conversation_id, sender_id, client_message_id)
);

CREATE INDEX IF NOT EXISTS messenger_messages_conversation_created_idx
  ON messenger_messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messenger_messages_conversation_unread_idx
  ON messenger_messages (conversation_id, read_at)
  WHERE read_at IS NULL;
