-- ============================================================
-- ClinicFlow — Migration 009: Insurance & Contracts Engine
-- ============================================================

-- ── 1. Insurance companies ───────────────────────────────────
create table if not exists insurance_companies (
  id                   text primary key default gen_random_uuid()::text,
  name                 text not null,
  name_ar              text not null default '',
  contact_phone        text,
  contact_email        text,
  default_copay_pct    numeric(5,2) not null default 20,  -- % patient pays
  notes                text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now()
);

alter table insurance_companies enable row level security;

create policy "authenticated can read insurance companies"
  on insurance_companies for select
  using (auth.role() = 'authenticated' or is_super_admin());

create policy "super admin manages insurance companies"
  on insurance_companies for all
  using (is_super_admin());

-- ── 2. Contracts (clinic ↔ insurance company, per service) ──
create table if not exists contracts (
  id                   text primary key default gen_random_uuid()::text,
  clinic_id            text not null,
  insurance_company_id text not null references insurance_companies(id) on delete cascade,
  service_name         text not null,
  service_name_ar      text not null default '',
  agreed_price         numeric(10,2) not null default 0,
  copay_pct            numeric(5,2) not null default 20,  -- % patient pays
  is_active            boolean not null default true,
  valid_from           date,
  valid_until          date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_contracts_clinic   on contracts (clinic_id) where is_active;
create index if not exists idx_contracts_insurer  on contracts (insurance_company_id) where is_active;

alter table contracts enable row level security;

create policy "clinic staff can read contracts"
  on contracts for select
  using (clinic_id = auth_clinic_id() or is_super_admin());

create policy "admin manages contracts"
  on contracts for all
  using (clinic_id = auth_clinic_id() and auth_role() in ('admin') or is_super_admin());

-- ── 3. Patient insurance cards ───────────────────────────────
alter table patients
  add column if not exists insurance_company_id text references insurance_companies(id),
  add column if not exists insurance_number     text,
  add column if not exists insurance_expiry     date;

-- ── 4. Claims ────────────────────────────────────────────────
create table if not exists claims (
  id                   text primary key default gen_random_uuid()::text,
  clinic_id            text not null,
  insurance_company_id text not null references insurance_companies(id),
  invoice_id           text,            -- references invoices(id)
  patient_id           text,
  service_name         text not null,
  total_amount         numeric(10,2) not null,
  insurance_amount     numeric(10,2) not null,  -- what insurer owes
  copay_amount         numeric(10,2) not null,  -- what patient paid
  status               text not null default 'pending'
                         check (status in ('pending','sent','paid','rejected')),
  submitted_at         timestamptz,
  paid_at              timestamptz,
  rejection_reason     text,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_claims_clinic    on claims (clinic_id, created_at desc);
create index if not exists idx_claims_insurer   on claims (insurance_company_id, status);
create index if not exists idx_claims_invoice   on claims (invoice_id);

alter table claims enable row level security;

create policy "clinic staff can read claims"
  on claims for select
  using (clinic_id = auth_clinic_id() or is_super_admin());

create policy "admin manages claims"
  on claims for all
  using (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception') or is_super_admin());
