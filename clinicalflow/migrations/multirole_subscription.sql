-- Multi-Role Subscription System
-- Adds solo-doctor subscription support without breaking clinic-level subscriptions.
-- Run once in Supabase SQL editor (or via psql).

-- ── Doctors can now have their own subscription (when practice_type = 'solo') ─
ALTER TABLE users ADD COLUMN IF NOT EXISTS practice_type     text DEFAULT 'clinic_member';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan text;          -- 'basic' | 'pro' | 'ai'  (only for solo doctors)
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at   timestamptz;   -- only for solo doctors

CREATE INDEX IF NOT EXISTS users_practice_type_idx ON users (practice_type);
CREATE INDEX IF NOT EXISTS users_subscription_plan_idx ON users (subscription_plan);

-- ── Optional: tighten role enum if you use a CHECK constraint elsewhere ──────
-- Existing roles: 'super_admin' | 'admin' | 'doctor' | 'reception' | 'patient'
-- (No DDL change needed — the role column is plain text.)
