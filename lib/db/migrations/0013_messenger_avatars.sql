BEGIN;

ALTER TABLE messenger_profiles
  ADD COLUMN IF NOT EXISTS avatar_object_key text NULL;
ALTER TABLE messenger_profiles
  ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz NULL;

COMMIT;
