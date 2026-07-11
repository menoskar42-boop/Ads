-- Subscription Usage Tracking
-- Run once in Supabase SQL editor (or via psql)

-- ── subscription_usage: monthly counters per clinic ──────────────────────────
CREATE TABLE IF NOT EXISTS subscription_usage (
  clinic_id        text          NOT NULL,
  month            text          NOT NULL,  -- YYYY-MM
  ai_requests      int           NOT NULL DEFAULT 0,
  whatsapp_messages int          NOT NULL DEFAULT 0,
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, month)
);

CREATE INDEX IF NOT EXISTS subscription_usage_clinic_idx ON subscription_usage (clinic_id, month DESC);

-- ── RPC: atomically increment one counter ────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_subscription_usage(
  p_clinic_id text,
  p_month     text,
  p_field     text  -- 'ai_requests' | 'whatsapp_messages'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO subscription_usage (clinic_id, month, ai_requests, whatsapp_messages, updated_at)
  VALUES (p_clinic_id, p_month, 0, 0, now())
  ON CONFLICT (clinic_id, month) DO NOTHING;

  IF p_field = 'ai_requests' THEN
    UPDATE subscription_usage
       SET ai_requests = ai_requests + 1, updated_at = now()
     WHERE clinic_id = p_clinic_id AND month = p_month;
  ELSIF p_field = 'whatsapp_messages' THEN
    UPDATE subscription_usage
       SET whatsapp_messages = whatsapp_messages + 1, updated_at = now()
     WHERE clinic_id = p_clinic_id AND month = p_month;
  END IF;
END;
$$;
