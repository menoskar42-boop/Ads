-- Private group voice and media metadata. Apply only after separate owner approval.
-- Files remain in private R2 storage; this migration does not copy or delete data.

BEGIN;

ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS audio_duration_ms integer,
  ADD COLUMN IF NOT EXISTS audio_content_type text,
  ADD COLUMN IF NOT EXISTS audio_size_bytes integer;

ALTER TABLE messenger_group_messages
  DROP CONSTRAINT IF EXISTS messenger_group_messages_type_check;

ALTER TABLE messenger_group_messages
  ADD CONSTRAINT messenger_group_messages_type_check
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
    )
    OR
    (
      message_type = 'media'
      AND audio_duration_ms IS NULL
      AND audio_content_type IS NULL
      AND audio_size_bytes IS NULL
    )
  );

CREATE TABLE IF NOT EXISTS messenger_group_message_media (
  message_id text PRIMARY KEY
    REFERENCES messenger_group_messages(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  original_filename text NOT NULL
    CHECK (char_length(original_filename) BETWEEN 1 AND 180),
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

COMMIT;
