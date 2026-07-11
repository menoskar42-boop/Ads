-- AI Cost Tracking + Event System
-- Run once in Supabase SQL editor (or via psql)

-- ── ai_logs: one row per OpenAI API call ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_logs (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     text,                         -- null = platform-level call
  feature       text          NOT NULL,        -- callAI type (e.g. 'detect-specialty')
  model         text          NOT NULL,
  prompt_tokens int           NOT NULL DEFAULT 0,
  completion_tokens int       NOT NULL DEFAULT 0,
  total_tokens  int           NOT NULL DEFAULT 0,
  cost_usd      numeric(10,6) NOT NULL DEFAULT 0, -- estimated cost in USD
  response_ms   int           NOT NULL DEFAULT 0,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_logs_clinic_id_idx  ON ai_logs (clinic_id);
CREATE INDEX IF NOT EXISTS ai_logs_created_at_idx ON ai_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_logs_feature_idx    ON ai_logs (feature);

-- ── ai_events: patient interaction events (booking intent, etc.) ──────────────
CREATE TABLE IF NOT EXISTS ai_events (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     text,
  patient_id    text,
  phone         text,
  event_type    text          NOT NULL,  -- 'intent_booking', 'booking_completed', 'nudge_sent'
  status        text          NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'nudged' | 'expired'
  meta          jsonb,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_events_status_idx     ON ai_events (status, created_at);
CREATE INDEX IF NOT EXISTS ai_events_phone_idx      ON ai_events (phone);
CREATE INDEX IF NOT EXISTS ai_events_clinic_id_idx  ON ai_events (clinic_id);
