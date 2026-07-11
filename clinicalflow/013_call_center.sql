-- 013_call_center.sql

-- ─── Call Logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id  uuid REFERENCES patients(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  notes       text,
  outcome     text CHECK (outcome IN ('booked','rescheduled','cancelled','inquiry','no_answer')),
  call_time   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_clinic    ON call_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_patient   ON call_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_time ON call_logs(call_time DESC);

ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_logs_clinic" ON call_logs FOR ALL
  USING (clinic_id = auth_clinic_id() OR is_super_admin());

-- ─── VIP flag on patients ──────────────────────────────────────────────────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false;
