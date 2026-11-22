-- Oscar Messaging groups, private statuses, and user-submitted content reports.
-- Apply only after separate review/approval; the application never runs this file.

CREATE TABLE IF NOT EXISTS messenger_groups (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  owner_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messenger_groups_updated_idx
  ON messenger_groups (updated_at DESC);

CREATE TABLE IF NOT EXISTS messenger_group_members (
  group_id text NOT NULL REFERENCES messenger_groups(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messenger_group_members_pkey PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS messenger_group_members_user_idx
  ON messenger_group_members (user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS messenger_group_messages (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES messenger_groups(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  client_message_id text NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messenger_group_messages_client_key
    UNIQUE (group_id, sender_id, client_message_id)
);

CREATE INDEX IF NOT EXISTS messenger_group_messages_created_idx
  ON messenger_group_messages (group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS messenger_group_settings (
  group_id text NOT NULL REFERENCES messenger_groups(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  is_muted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messenger_group_settings_pkey PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS messenger_group_settings_user_idx
  ON messenger_group_settings (user_id, is_muted);

CREATE TABLE IF NOT EXISTS messenger_status_updates (
  id text PRIMARY KEY,
  author_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 500),
  audience_mode text NOT NULL CHECK (audience_mode IN ('contacts', 'selected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS messenger_status_updates_expiry_idx
  ON messenger_status_updates (expires_at);
CREATE INDEX IF NOT EXISTS messenger_status_updates_author_idx
  ON messenger_status_updates (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS messenger_status_audience (
  status_id text NOT NULL
    REFERENCES messenger_status_updates(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  CONSTRAINT messenger_status_audience_pkey PRIMARY KEY (status_id, user_id)
);

CREATE INDEX IF NOT EXISTS messenger_status_audience_user_idx
  ON messenger_status_audience (user_id, status_id);

CREATE TABLE IF NOT EXISTS messenger_content_reports (
  id text PRIMARY KEY,
  reporter_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('group_message', 'status')),
  target_id text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messenger_content_reports_reporter_target_key
    UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS messenger_content_reports_created_idx
  ON messenger_content_reports (created_at DESC);
