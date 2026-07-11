-- 011_branches.sql
-- Multi-branch support: branches table + branch_id on core tables

-- ─── Branches ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name          text NOT NULL,
  name_ar       text,
  address       text,
  address_ar    text,
  phone         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branches_clinic_id ON branches(clinic_id);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branches_clinic_read"  ON branches FOR SELECT USING (clinic_id = auth_clinic_id() OR is_super_admin());
CREATE POLICY "branches_clinic_write" ON branches FOR ALL   USING (clinic_id = auth_clinic_id() OR is_super_admin());

-- ─── User → Branch Access ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_branch_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_uba_user_id   ON user_branch_access(user_id);
CREATE INDEX IF NOT EXISTS idx_uba_branch_id ON user_branch_access(branch_id);

ALTER TABLE user_branch_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uba_clinic_read"  ON user_branch_access FOR SELECT USING (
  EXISTS (SELECT 1 FROM branches b WHERE b.id = branch_id AND (b.clinic_id = auth_clinic_id() OR is_super_admin()))
);
CREATE POLICY "uba_clinic_write" ON user_branch_access FOR ALL USING (
  EXISTS (SELECT 1 FROM branches b WHERE b.id = branch_id AND (b.clinic_id = auth_clinic_id() OR is_super_admin()))
);

-- ─── Add branch_id to core tables (nullable, defaults null = all branches) ──
ALTER TABLE patients     ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE invoices     ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_branch_id     ON patients(branch_id);
CREATE INDEX IF NOT EXISTS idx_appointments_branch_id ON appointments(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch_id     ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_queue_branch_id        ON queue_entries(branch_id);
