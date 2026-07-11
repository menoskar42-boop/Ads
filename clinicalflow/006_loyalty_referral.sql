-- 006_loyalty_referral.sql
-- Adds referral_code + referred_by to patients; tracks referral events

-- Add columns to patients table
alter table patients
  add column if not exists referral_code text unique,
  add column if not exists referred_by   text;      -- stores the referral_code of the referrer

-- Index for fast lookup by referral code
create index if not exists idx_patients_referral_code on patients (referral_code);
create index if not exists idx_patients_referred_by   on patients (referred_by);

-- Referral events table: prevents duplicate bonuses, tracks chain
create table if not exists referral_events (
  id            text primary key default gen_random_uuid()::text,
  referrer_id   text not null references patients(id) on delete cascade,
  referee_id    text not null references patients(id) on delete cascade,
  clinic_id     text not null,
  points_given  integer not null default 20,
  created_at    timestamptz not null default now(),
  unique (referrer_id, referee_id)           -- no duplicate bonus per pair
);

-- RLS
alter table referral_events enable row level security;

create policy "clinic staff can read referral events"
  on referral_events for select
  using (clinic_id = auth_clinic_id() or is_super_admin());

create policy "service role manages referral events"
  on referral_events for all
  using (is_super_admin());
