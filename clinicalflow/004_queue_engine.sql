-- ============================================================
-- ClinicFlow — Migration 004: Smart Queue Strategy Engine
-- ============================================================

-- ── 1. Extend appointments table ─────────────────────────────

-- New queue-status values (additive — existing values are unchanged)
alter type appointment_status add value if not exists 'expected';
alter type appointment_status add value if not exists 'in_queue';
alter type appointment_status add value if not exists 'with_doctor';
alter type appointment_status add value if not exists 'done';

-- Emergency escalation flag (higher than is_urgent; jumps ahead in queue)
alter table appointments
  add column if not exists is_emergency boolean not null default false;

-- Set true when payment is confirmed OR staff override is applied
alter table appointments
  add column if not exists payment_confirmed boolean not null default false;

-- Exact timestamp when patient entered the queue (used as the sort key)
alter table appointments
  add column if not exists checked_in_at timestamptz;

-- Visit classification used by consult_mix / consult_first strategies
alter table appointments
  add column if not exists visit_type text
    check (visit_type in ('checkup', 'consultation'));

-- ── 2. Queue settings per clinic ─────────────────────────────
create table if not exists queue_settings (
  id              uuid primary key default uuid_generate_v4(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  strategy_type   text not null default 'fifo'
    check (strategy_type in ('fifo', 'urgent_first', 'consult_mix', 'consult_first', 'custom')),
  custom_pattern  jsonb not null default '[]',
  allow_emergency boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (clinic_id)
);

-- ── 3. RLS for queue_settings ─────────────────────────────────
alter table queue_settings enable row level security;

create policy "queue_settings_select"
  on queue_settings for select
  using (clinic_id = auth_clinic_id() and auth_role() in ('admin', 'super_admin', 'doctor', 'reception'));

create policy "queue_settings_insert"
  on queue_settings for insert
  with check (clinic_id = auth_clinic_id() and auth_role() in ('admin', 'super_admin'));

create policy "queue_settings_update"
  on queue_settings for update
  using (clinic_id = auth_clinic_id() and auth_role() in ('admin', 'super_admin'));

create policy "queue_settings_super_admin"
  on queue_settings for all
  using (is_super_admin());
