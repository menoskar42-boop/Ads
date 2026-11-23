-- Optional, private contact nicknames for Oscar Messaging.
-- Do not apply automatically; nickname rows are scoped to their owner.

CREATE TABLE IF NOT EXISTS messenger_contact_nicknames (
  owner_user_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  peer_user_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  nickname text NOT NULL CHECK (char_length(btrim(nickname)) BETWEEN 1 AND 60),
  nickname_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messenger_contact_nicknames_pkey PRIMARY KEY (owner_user_id, peer_user_id),
  CONSTRAINT messenger_contact_nicknames_owner_peer_check CHECK (owner_user_id <> peer_user_id)
);

CREATE INDEX IF NOT EXISTS messenger_contact_nicknames_owner_key_idx
  ON messenger_contact_nicknames (owner_user_id, nickname_key);
