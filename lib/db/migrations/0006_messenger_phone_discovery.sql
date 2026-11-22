-- Optional, private phone discovery for Oscar Messaging.
-- Stores only a keyed lookup digest, never the normalized phone number.
-- Apply only after reviewing the target database; the app does not run migrations.

ALTER TABLE messenger_profiles
  ADD COLUMN IF NOT EXISTS phone_lookup_hash text,
  ADD COLUMN IF NOT EXISTS phone_discoverable boolean NOT NULL DEFAULT false;

ALTER TABLE messenger_profiles
  ADD CONSTRAINT messenger_profiles_phone_lookup_hash_check
    CHECK (phone_lookup_hash IS NULL OR phone_lookup_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT messenger_profiles_phone_discoverable_check
    CHECK (NOT phone_discoverable OR phone_lookup_hash IS NOT NULL);

CREATE INDEX IF NOT EXISTS messenger_profiles_phone_discoverable_idx
  ON messenger_profiles (phone_lookup_hash)
  WHERE phone_discoverable = true AND phone_lookup_hash IS NOT NULL;
