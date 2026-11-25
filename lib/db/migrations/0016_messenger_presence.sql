-- Presence privacy and last-seen timestamps; this migration is not applied automatically.
BEGIN;

ALTER TABLE messenger_profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE messenger_profiles
  ADD COLUMN IF NOT EXISTS presence_visible boolean NOT NULL DEFAULT true;

COMMIT;
