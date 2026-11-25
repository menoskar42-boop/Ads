-- Private, expiring live-location sharing; retain only the latest point.
BEGIN;

CREATE TABLE IF NOT EXISTS messenger_live_locations (
  id text PRIMARY KEY,
  conversation_id text NOT NULL
    REFERENCES messenger_conversations(id) ON DELETE CASCADE,
  sharer_id text NOT NULL
    REFERENCES messenger_profiles(user_id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  stopped_at timestamptz,
  last_lat double precision,
  last_lng double precision,
  last_accuracy_m integer,
  last_updated_at timestamptz,
  CONSTRAINT messenger_live_locations_expiry_check
    CHECK (
      expires_at > started_at
      AND expires_at <= started_at + interval '8 hours'
    ),
  CONSTRAINT messenger_live_locations_last_point_check
    CHECK (
      (
        last_lat IS NULL AND last_lng IS NULL AND last_accuracy_m IS NULL
      )
      OR
      (
        last_lat IS NOT NULL AND last_lat BETWEEN -90 AND 90
        AND last_lng IS NOT NULL AND last_lng BETWEEN -180 AND 180
        AND (last_accuracy_m IS NULL OR last_accuracy_m BETWEEN 0 AND 100000)
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS messenger_live_locations_active_sharer_idx
  ON messenger_live_locations (conversation_id, sharer_id)
  WHERE stopped_at IS NULL;

CREATE INDEX IF NOT EXISTS messenger_live_locations_conversation_expiry_idx
  ON messenger_live_locations (conversation_id, expires_at);

COMMIT;
