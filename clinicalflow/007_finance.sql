-- ============================================================
-- ClinicFlow — Migration 007: Finance & Accounting Engine
-- ============================================================

-- ── 1. Unified transactions ledger ───────────────────────────
create table if not exists transactions (
  id              text primary key default gen_random_uuid()::text,
  clinic_id       text not null,
  type            text not null check (type in ('income', 'expense')),
  category        text not null,   -- visit, procedure, salary, rent, utilities, supplies, other
  amount          numeric(12,2) not null check (amount > 0),
  payment_method  text check (payment_method in ('cash', 'card', 'insurance', 'bank_transfer', 'check')),
  reference_id    text,            -- appointment_id, invoice_id, or expense_id
  description     text,
  description_ar  text,
  created_by      text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_transactions_clinic_date on transactions (clinic_id, created_at desc);
create index if not exists idx_transactions_type        on transactions (clinic_id, type, created_at desc);

alter table transactions enable row level security;

create policy "clinic staff can read transactions"
  on transactions for select
  using (clinic_id = auth_clinic_id() or is_super_admin());

create policy "admin and reception can insert transactions"
  on transactions for insert
  with check (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception'));

create policy "service role manages transactions"
  on transactions for all
  using (is_super_admin());

-- ── 2. Cashbox / shift sessions ──────────────────────────────
create table if not exists cashbox_sessions (
  id              text primary key default gen_random_uuid()::text,
  clinic_id       text not null,
  user_id         text not null,
  start_amount    numeric(12,2) not null default 0,
  end_amount      numeric(12,2),
  total_income    numeric(12,2) not null default 0,
  total_expense   numeric(12,2) not null default 0,
  difference      numeric(12,2),   -- end_amount - (start_amount + total_income - total_expense)
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  status          text not null default 'open' check (status in ('open', 'closed'))
);

create index if not exists idx_cashbox_clinic on cashbox_sessions (clinic_id, opened_at desc);

alter table cashbox_sessions enable row level security;

create policy "clinic staff can read cashbox"
  on cashbox_sessions for select
  using (clinic_id = auth_clinic_id() or is_super_admin());

create policy "admin and reception manage cashbox"
  on cashbox_sessions for all
  using (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception'));

-- ── 3. Doctor earnings / commissions ─────────────────────────
create table if not exists doctor_earnings (
  id                text primary key default gen_random_uuid()::text,
  clinic_id         text not null,
  doctor_id         text not null,
  appointment_id    text,
  invoice_id        text,
  base_amount       numeric(12,2) not null,   -- invoice item total
  commission_type   text not null check (commission_type in ('percentage', 'fixed')),
  commission_value  numeric(10,2) not null,   -- % or EGP
  earned_amount     numeric(12,2) not null,   -- computed payout
  status            text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at        timestamptz not null default now()
);

create index if not exists idx_doctor_earnings_doctor on doctor_earnings (doctor_id, created_at desc);
create index if not exists idx_doctor_earnings_clinic on doctor_earnings (clinic_id, created_at desc);

alter table doctor_earnings enable row level security;

create policy "doctors see their own earnings"
  on doctor_earnings for select
  using (doctor_id = auth.uid()::text or clinic_id = auth_clinic_id() or is_super_admin());

create policy "admin manages doctor earnings"
  on doctor_earnings for all
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin');
