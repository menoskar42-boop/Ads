-- ============================================================
-- ClinicFlow — Migration 008: Inventory & Pharmacy Engine
-- ============================================================

-- ── 1. Products table (maps to InventoryItem) ────────────────
create table if not exists products (
  id                  text primary key default gen_random_uuid()::text,
  clinic_id           text not null,
  name                text not null,
  name_ar             text not null default '',
  type                text not null check (type in ('drug', 'supply', 'consumable', 'material', 'instrument', 'equipment', 'other')),
  unit                text not null default 'piece',   -- box, piece, ml, g, pack …
  unit_price          numeric(10,2) not null default 0,
  low_stock_threshold integer not null default 5,
  current_stock       integer not null default 0,
  location            text,
  supplier_id         text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_products_clinic on products (clinic_id) where is_active;

alter table products enable row level security;

create policy "clinic staff can read products"
  on products for select
  using (clinic_id = auth_clinic_id() or is_super_admin());

create policy "admin manages products"
  on products for all
  using (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception'));

-- ── 2. Batches table ─────────────────────────────────────────
create table if not exists batches (
  id             text primary key default gen_random_uuid()::text,
  product_id     text not null references products(id) on delete cascade,
  clinic_id      text not null,
  batch_number   text not null,
  quantity       integer not null check (quantity >= 0),
  cost_price     numeric(10,2),
  expiry_date    date,
  received_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists idx_batches_product    on batches (product_id, received_at asc);
create index if not exists idx_batches_expiry     on batches (clinic_id, expiry_date asc) where quantity > 0;

alter table batches enable row level security;

create policy "clinic staff can read batches"
  on batches for select
  using (clinic_id = auth_clinic_id() or is_super_admin());

create policy "admin manages batches"
  on batches for all
  using (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception'));

-- ── 3. Dispense log (patient-linked) ─────────────────────────
create table if not exists dispense_log (
  id             text primary key default gen_random_uuid()::text,
  clinic_id      text not null,
  product_id     text not null references products(id),
  batch_id       text references batches(id),
  patient_id     text,
  prescription_id text,
  quantity       integer not null check (quantity > 0),
  dispensed_by   text,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_dispense_clinic   on dispense_log (clinic_id, created_at desc);
create index if not exists idx_dispense_patient  on dispense_log (patient_id, created_at desc);
create index if not exists idx_dispense_product  on dispense_log (product_id, created_at desc);

alter table dispense_log enable row level security;

create policy "clinic staff can read dispense log"
  on dispense_log for select
  using (clinic_id = auth_clinic_id() or is_super_admin());

create policy "admin and reception log dispenses"
  on dispense_log for insert
  with check (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception','doctor'));
