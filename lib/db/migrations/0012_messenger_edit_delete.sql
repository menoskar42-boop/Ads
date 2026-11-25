-- Oscar Messaging: edit text messages and soft-delete messages for everyone.
-- Review and apply separately; this file is not run by the app build.

BEGIN;

ALTER TABLE messenger_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE messenger_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

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
    OR
    (
      message_type = 'location'
      AND audio_duration_ms IS NULL
      AND audio_content_type IS NULL
      AND audio_size_bytes IS NULL
      AND attachment_count = 0
      AND location_lat IS NOT NULL
      AND location_lat BETWEEN -90 AND 90
      AND location_lng IS NOT NULL
      AND location_lng BETWEEN -180 AND 180
      AND location_captured_at IS NOT NULL
    )
    OR
    (
      deleted_at IS NOT NULL
      AND audio_duration_ms IS NULL
      AND audio_content_type IS NULL
      AND audio_size_bytes IS NULL
      AND attachment_count = 0
      AND location_lat IS NULL
      AND location_lng IS NULL
      AND location_accuracy_m IS NULL
      AND location_captured_at IS NULL
    )
  );

COMMIT;
