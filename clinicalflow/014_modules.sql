-- 014_modules.sql
-- Matches schema applied directly to Supabase DB

-- ─── visits: add priority + is_urgent columns ────────────────────────────────
ALTER TABLE visits ADD COLUMN IF NOT EXISTS priority  text    DEFAULT 'normal';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false;

-- ─── invoices: add discount columns ──────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type  text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0;

-- ─── Module Registry ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules (
  id          SERIAL PRIMARY KEY,
  name        text UNIQUE,
  description text
);

INSERT INTO modules (name, description) VALUES
  ('finance',   'Finance & Accounting'),
  ('inventory', 'Inventory & Pharmacy'),
  ('ai',        'AI Copilot'),
  ('insurance', 'Insurance System'),
  ('reports',   'Analytics & BI')
ON CONFLICT (name) DO NOTHING;

-- ─── Per-Clinic Module Toggles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_modules (
  id          SERIAL PRIMARY KEY,
  clinic_id   uuid,
  module_name text,
  is_enabled  boolean DEFAULT true
);

-- Unique constraint needed for upsert logic in API toggle route
ALTER TABLE clinic_modules
  ADD CONSTRAINT IF NOT EXISTS uq_clinic_modules UNIQUE (clinic_id, module_name);

CREATE INDEX IF NOT EXISTS idx_clinic_modules_clinic ON clinic_modules(clinic_id);
