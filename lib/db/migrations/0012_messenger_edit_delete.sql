-- Oscar Messaging: edit text messages and soft-delete messages for everyone.
-- Review and apply separately; this file is not run by the app build.

ALTER TABLE messenger_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE messenger_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
