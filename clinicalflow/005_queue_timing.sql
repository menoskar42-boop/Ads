-- ============================================================
-- ClinicFlow — Migration 005: Queue Timing & Optimization
-- ============================================================

-- ── 1. Appointment time-tracking columns ─────────────────────

-- Exact moment doctor pressed "Start" for this appointment
alter table appointments
  add column if not exists started_at timestamptz;

-- Exact moment doctor pressed "Done"
alter table appointments
  add column if not exists finished_at timestamptz;

-- AI-lite predicted duration in minutes (set before patient is called)
alter table appointments
  add column if not exists estimated_duration integer;

-- Actual duration computed after Done (stored for future averaging)
alter table appointments
  add column if not exists actual_duration integer;

-- Computed waiting-time prediction: ISO timestamp of expected start
alter table appointments
  add column if not exists expected_start_at timestamptz;

-- No-show risk score 0–100 (0=low, 100=high risk)
alter table appointments
  add column if not exists no_show_score integer not null default 0
    check (no_show_score between 0 and 100);

-- ── 2. Smart Queue settings extension ────────────────────────

-- Persists the "smart optimization" on/off toggle per clinic
alter table queue_settings
  add column if not exists smart_optimization_enabled boolean not null default true;
