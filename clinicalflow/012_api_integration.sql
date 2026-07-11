-- 012_api_integration.sql
-- External API keys, webhooks, and integration tables

-- ─── API Keys ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid    NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name         text    NOT NULL,
  api_key      text    NOT NULL UNIQUE,
  scopes       text[]  NOT NULL DEFAULT '{"patients:read","appointments:read","invoices:read"}',
  is_active    boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_clinic_id ON api_keys(clinic_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key       ON api_keys(api_key);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys_clinic" ON api_keys FOR ALL USING (clinic_id = auth_clinic_id() OR is_super_admin());

-- ─── Webhooks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid    NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name       text    NOT NULL DEFAULT '',
  event_type text    NOT NULL,   -- appointment_created | payment_done | patient_created | lab_result
  url        text    NOT NULL,
  secret     text,               -- HMAC-SHA256 signing secret (optional)
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_clinic_event ON webhooks(clinic_id, event_type);

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhooks_clinic" ON webhooks FOR ALL USING (clinic_id = auth_clinic_id() OR is_super_admin());

-- ─── Webhook Delivery Log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id   uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  status_code  int,
  error        text,
  delivered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wh_deliveries_webhook ON webhook_deliveries(webhook_id);

-- ─── API Request Log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_request_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid REFERENCES clinics(id) ON DELETE SET NULL,
  api_key_id  uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  method      text NOT NULL,
  path        text NOT NULL,
  status_code int  NOT NULL,
  duration_ms int,
  ip          text,
  logged_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_clinic    ON api_request_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_logged_at ON api_request_logs(logged_at);
