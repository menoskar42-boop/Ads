-- Voice files stay in private object storage. This table stores metadata only.
-- Apply only after reviewing the target database; the app does not run migrations.

ALTER TABLE messenger_messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS audio_duration_ms integer,
  ADD COLUMN IF NOT EXISTS audio_content_type text,
  ADD COLUMN IF NOT EXISTS audio_size_bytes integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messenger_messages_audio_metadata_check'
      AND conrelid = 'messenger_messages'::regclass
  ) THEN
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
          AND audio_duration_ms BETWEEN 1 AND 120000
          AND audio_content_type IN ('audio/mp4', 'audio/webm')
          AND audio_size_bytes BETWEEN 1 AND 4194304
        )
      );
  END IF;
END
$$;
