-- Adds private attachment metadata and per-account message tools.
-- Binary files remain in private object storage; do not apply this automatically.

ALTER TABLE messenger_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id text
    REFERENCES messenger_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_from_message_id text
    REFERENCES messenger_messages(id) ON DELETE SET NULL;

ALTER TABLE messenger_messages
  DROP CONSTRAINT IF EXISTS messenger_messages_audio_metadata_check;

ALTER TABLE messenger_messages
  ADD CONSTRAINT messenger_messages_audio_metadata_check
  CHECK (
    (
      message_type = 'text'
      AND audio_duration_ms IS NULL
      AND audio_content_type IS NULL
      AND audio_size_bytes IS NULL
    )
    OR
    (
      message_type = 'audio'
      AND audio_duration_ms IS NOT NULL
      AND audio_duration_ms BETWEEN 1 AND 120000
      AND audio_content_type IS NOT NULL
      AND audio_content_type IN ('audio/mp4', 'audio/webm')
      AND audio_size_bytes IS NOT NULL
      AND audio_size_bytes BETWEEN 1 AND 4194304
      AND attachment_count = 1
    )
    OR
    (
      message_type = 'media'
      AND audio_duration_ms IS NULL
      AND audio_content_type IS NULL
      AND audio_size_bytes IS NULL
      AND attachment_count = 1
    )
  );

CREATE TABLE IF NOT EXISTS messenger_message_media (
  message_id text PRIMARY KEY
    REFERENCES messenger_messages(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  original_filename text NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 180),
  content_type text NOT NULL CHECK (
    content_type IN (
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/webm',
      'application/pdf', 'text/plain'
    )
  ),
  kind text NOT NULL CHECK (kind IN ('image', 'video', 'file')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 8388608),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messenger_message_reactions (
  message_id text NOT NULL
    REFERENCES messenger_messages(id) ON DELETE CASCADE,
  user_id text NOT NULL
    REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '😮', '🙏')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS messenger_conversation_settings (
  conversation_id text NOT NULL
    REFERENCES messenger_conversations(id) ON DELETE CASCADE,
  user_id text NOT NULL
    REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  is_pinned boolean NOT NULL DEFAULT false,
  is_muted boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS messenger_message_media_kind_idx
  ON messenger_message_media (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS messenger_message_reactions_message_idx
  ON messenger_message_reactions (message_id);
CREATE INDEX IF NOT EXISTS messenger_conversation_settings_user_idx
  ON messenger_conversation_settings (user_id, is_archived, is_pinned);
