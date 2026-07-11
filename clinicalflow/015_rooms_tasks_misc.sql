-- ============================================================
-- ClinicFlow — Migration 015: Rooms, Tasks, Attendance, Clinic Settings, Feedback
-- ============================================================

-- ─── ROOMS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name                text NOT NULL,
  name_ar             text NOT NULL DEFAULT '',
  number              text NOT NULL DEFAULT '',
  type                text NOT NULL CHECK (type IN ('consultation','procedure','waiting','lab','imaging','other')),
  status              text NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','cleaning','out_of_service')),
  color               text NOT NULL DEFAULT '#6366f1',
  floor               text,
  current_patient_id  uuid REFERENCES patients(id) ON DELETE SET NULL,
  current_visit_id    uuid REFERENCES visits(id) ON DELETE SET NULL,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rooms_clinic_id ON rooms(clinic_id);
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms_clinic_read"  ON rooms FOR SELECT USING (clinic_id = auth_clinic_id() OR is_super_admin());
CREATE POLICY "rooms_clinic_write" ON rooms FOR ALL   USING (clinic_id = auth_clinic_id() OR is_super_admin());

-- ─── TASKS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES users(id),
  assigned_to uuid REFERENCES users(id),
  patient_id  uuid REFERENCES patients(id) ON DELETE SET NULL,
  title       text NOT NULL,
  title_ar    text NOT NULL DEFAULT '',
  description text,
  priority    text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','cancelled')),
  due_date    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_clinic_id ON tasks(clinic_id);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_clinic_read"  ON tasks FOR SELECT USING (clinic_id = auth_clinic_id() OR is_super_admin());
CREATE POLICY "tasks_clinic_write" ON tasks FOR ALL   USING (clinic_id = auth_clinic_id() OR is_super_admin());

-- ─── ATTENDANCE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  check_in    timestamptz NOT NULL DEFAULT now(),
  check_out   timestamptz,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_clinic_user ON attendance(clinic_id, user_id);
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_clinic_read"  ON attendance FOR SELECT USING (clinic_id = auth_clinic_id() OR is_super_admin());
CREATE POLICY "attendance_clinic_write" ON attendance FOR ALL   USING (clinic_id = auth_clinic_id() OR is_super_admin());

-- ─── CLINIC SETTINGS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid UNIQUE NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  timezone              text NOT NULL DEFAULT 'Africa/Cairo',
  currency              text NOT NULL DEFAULT 'EGP',
  language              text NOT NULL DEFAULT 'ar',
  date_format           text NOT NULL DEFAULT 'DD/MM/YYYY',
  working_hours         jsonb NOT NULL DEFAULT '{}',
  appointment_duration  integer NOT NULL DEFAULT 20,
  max_daily_patients    integer,
  sms_enabled           boolean NOT NULL DEFAULT false,
  whatsapp_enabled      boolean NOT NULL DEFAULT false,
  email_notifications   boolean NOT NULL DEFAULT false,
  logo_url              text,
  primary_color         text NOT NULL DEFAULT '#6366f1',
  extra                 jsonb NOT NULL DEFAULT '{}',
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clinic_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_clinic_read"  ON clinic_settings FOR SELECT USING (clinic_id = auth_clinic_id() OR is_super_admin());
CREATE POLICY "settings_clinic_write" ON clinic_settings FOR ALL   USING (clinic_id = auth_clinic_id() OR is_super_admin());

-- ─── PATIENT FEEDBACK ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id  uuid REFERENCES patients(id) ON DELETE SET NULL,
  doctor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  visit_id    uuid REFERENCES visits(id) ON DELETE SET NULL,
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_clinic_id ON patient_feedback(clinic_id);
ALTER TABLE patient_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback_clinic_read"  ON patient_feedback FOR SELECT USING (clinic_id = auth_clinic_id() OR is_super_admin());
CREATE POLICY "feedback_insert"       ON patient_feedback FOR INSERT WITH CHECK (true);
