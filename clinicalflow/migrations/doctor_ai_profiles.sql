-- Doctor Learning AI — persisted per-doctor profile
-- Run once in Supabase SQL editor (or via psql)

-- ── doctor_ai_profiles: one row per doctor, upserted daily ───────────────────
CREATE TABLE IF NOT EXISTS doctor_ai_profiles (
  doctor_id          text          PRIMARY KEY,
  clinic_id          text,
  avg_visit_time     int           NOT NULL DEFAULT 20,  -- minutes
  common_medications text[]        NOT NULL DEFAULT '{}',
  booking_style      text          NOT NULL DEFAULT 'standard', -- 'fast' | 'standard' | 'thorough'
  visit_count        int           NOT NULL DEFAULT 0,   -- total completed visits used
  updated_at         timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doctor_ai_profiles_clinic_id_idx ON doctor_ai_profiles (clinic_id);

-- ── doctor_medication_log: counts how often each doctor prescribes each med ───
CREATE TABLE IF NOT EXISTS doctor_medication_log (
  doctor_id       text          NOT NULL,
  medication_name text          NOT NULL,
  use_count       int           NOT NULL DEFAULT 1,
  last_used_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (doctor_id, medication_name)
);

CREATE INDEX IF NOT EXISTS doctor_medication_log_doctor_idx ON doctor_medication_log (doctor_id, use_count DESC);

-- ── Helper RPC: atomically increment use_count ────────────────────────────────
CREATE OR REPLACE FUNCTION increment_med_count(p_doctor_id text, p_med_name text)
RETURNS void LANGUAGE sql AS $$
  UPDATE doctor_medication_log
     SET use_count    = use_count + 1,
         last_used_at = now()
   WHERE doctor_id = p_doctor_id AND medication_name = p_med_name;
$$;
