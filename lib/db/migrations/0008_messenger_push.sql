-- Adds Web Push subscriptions and the per-user notification preview setting.
-- Do not apply automatically.

CREATE TABLE IF NOT EXISTS messenger_push_subscriptions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);

CREATE INDEX IF NOT EXISTS messenger_push_subscriptions_user_idx
  ON messenger_push_subscriptions (user_id);

ALTER TABLE messenger_profiles
  ADD COLUMN IF NOT EXISTS push_show_preview boolean NOT NULL DEFAULT false;
