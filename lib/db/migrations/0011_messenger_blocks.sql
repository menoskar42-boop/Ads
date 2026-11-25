-- Optional user blocking and expanded content reports for Oscar Messaging.
-- Do not apply automatically. Review and approve before applying to any database.

CREATE TABLE IF NOT EXISTS messenger_blocks (
  blocker_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  blocked_id text NOT NULL REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messenger_blocks_pkey PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT messenger_blocks_no_self_check CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS messenger_blocks_blocked_idx
  ON messenger_blocks (blocked_id);

ALTER TABLE messenger_content_reports
  DROP CONSTRAINT IF EXISTS messenger_content_reports_target_type_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messenger_content_reports_target_type_check'
      AND conrelid = 'messenger_content_reports'::regclass
  ) THEN
    ALTER TABLE messenger_content_reports
      ADD CONSTRAINT messenger_content_reports_target_type_check
      CHECK (target_type IN ('group_message', 'status', 'user', 'direct_message'));
  END IF;
END
$$;
