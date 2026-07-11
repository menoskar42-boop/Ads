-- ============================================================
-- ClinicFlow — Complete Database Schema
-- Migration 001: Core tables + RLS policies
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
create type user_role          as enum ('super_admin', 'admin', 'doctor', 'reception');
create type subscription_plan  as enum ('basic', 'pro', 'ai');
create type visit_status       as enum ('booked', 'checked_in', 'waiting', 'in_consultation', 'completed', 'no_show', 'cancelled');
create type appointment_status as enum ('scheduled', 'confirmed', 'cancelled', 'completed', 'converted', 'no_show');
create type invoice_status     as enum ('pending', 'paid', 'partially_paid', 'refunded');
create type payment_method     as enum ('cash', 'card', 'insurance', 'bank_transfer');
create type order_type         as enum ('lab', 'radiology');
create type order_status       as enum ('requested', 'completed');
create type document_type      as enum ('prescription', 'lab_test', 'radiology', 'medical_report');
create type offer_type         as enum ('percentage_discount','fixed_discount','free_followup','consultation_package','family_package','first_visit','urgent_visit','reward_points','home_visit_discount','home_visit_package');
create type offer_service_type as enum ('consultation','followup','urgent','all','home_visit');
create type note_category      as enum ('general','diagnosis','prescription','allergy','chronic_condition','surgical_history','follow_up');
create type medication_freq    as enum ('once_daily','twice_daily','three_times_daily','four_times_daily','as_needed','weekly');
create type audit_action       as enum ('view','upload','download','delete','view_patient','view_prescription','edit_prescription','view_lab','view_radiology');
create type discount_type      as enum ('none', 'percentage', 'fixed');

-- ============================================================
-- CLINICS
-- ============================================================
create table clinics (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  name_ar           text not null,
  address           text not null default '',
  address_ar        text not null default '',
  phone             text not null default '',
  city              text not null default '',
  city_ar           text not null default '',
  subscription_plan subscription_plan not null default 'basic',
  is_active         boolean not null default true,
  max_doctors       integer not null default 3,
  ai_enabled        boolean not null default false,
  advanced_reports  boolean not null default false,
  -- public profile
  description       text,
  description_ar    text,
  cover_image_url   text,
  working_hours     text,
  working_hours_ar  text,
  latitude          double precision,
  longitude         double precision,
  website           text,
  social_links      jsonb default '{}',
  -- subscription management
  plan_expires_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- USERS  (mirrors Supabase Auth)
-- ============================================================
create table users (
  id                         uuid primary key references auth.users(id) on delete cascade,
  name                       text not null,
  name_ar                    text not null default '',
  email                      text not null,
  role                       user_role not null,
  specialty_id               uuid,                          -- FK added after specialties table
  clinic_id                  uuid references clinics(id),
  is_active                  boolean not null default true,
  -- home visit config (doctors only)
  home_visit_enabled         boolean not null default false,
  home_visit_price           numeric(10,2),
  home_visit_duration_min    integer,
  home_visit_daily_limit     integer,
  home_visit_radius_km       integer,
  home_visit_areas           text[] default '{}',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- ============================================================
-- SPECIALTIES + SERVICES
-- ============================================================
create table specialties (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  name_ar     text not null,
  form_schema jsonb not null default '[]',  -- FormField[]
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- back-fill FK now that specialties exists
alter table users
  add constraint fk_users_specialty
  foreign key (specialty_id) references specialties(id);

create table services (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  name_ar           text not null,
  specialty_id      uuid not null references specialties(id),
  price             numeric(10,2) not null default 0,
  doctor_percentage numeric(5,2) not null default 60   check (doctor_percentage between 0 and 100),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ============================================================
-- VISIT TYPES  (per-clinic, drives queue sort order)
-- ============================================================
create table visit_types (
  id               uuid primary key default uuid_generate_v4(),
  clinic_id        uuid not null references clinics(id) on delete cascade,
  name             text not null,
  name_ar          text not null,
  price            numeric(10,2) not null default 0,
  duration_minutes integer not null default 20,
  is_urgent        boolean not null default false,
  is_enabled       boolean not null default true,
  sort_order       integer not null default 1,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- PATIENTS
-- ============================================================
create table patients (
  id            uuid primary key default uuid_generate_v4(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  name          text not null,
  name_ar       text not null default '',
  phone         text not null,
  email         text,
  date_of_birth date,
  gender        text check (gender in ('male','female')),
  national_id   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- DOCTOR SCHEDULES + BLOCKED DATES
-- ============================================================
create table doctor_schedules (
  id           uuid primary key default uuid_generate_v4(),
  doctor_id    uuid not null references users(id) on delete cascade,
  day_of_week  integer not null check (day_of_week between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  is_active    boolean not null default true,
  unique (doctor_id, day_of_week)
);

create table blocked_dates (
  id        uuid primary key default uuid_generate_v4(),
  doctor_id uuid not null references users(id) on delete cascade,
  date      date not null,
  reason    text,
  unique (doctor_id, date)
);

-- ============================================================
-- APPOINTMENTS  (bookings before becoming visits)
-- ============================================================
create table appointments (
  id                          uuid primary key default uuid_generate_v4(),
  clinic_id                   uuid not null references clinics(id) on delete cascade,
  patient_id                  uuid not null references patients(id),
  doctor_id                   uuid not null references users(id),
  specialty_id                uuid references specialties(id),
  visit_type_id               uuid references visit_types(id),
  date                        date not null,
  time                        time not null,
  status                      appointment_status not null default 'scheduled',
  is_urgent                   boolean not null default false,
  notes                       text,
  -- reminders
  reminder_sent_confirmation  boolean not null default false,
  reminder_sent_24h           boolean not null default false,
  reminder_sent_2h            boolean not null default false,
  -- home visit
  is_home_visit               boolean not null default false,
  home_address                text,
  home_area                   text,
  home_city                   text,
  home_location_pin           text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ============================================================
-- INVOICES  (created at payment → triggers queue entry)
-- ============================================================
create table invoices (
  id              uuid primary key default uuid_generate_v4(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  patient_id      uuid not null references patients(id),
  visit_id        uuid,                              -- FK added after visits table
  status          invoice_status not null default 'pending',
  discount_type   discount_type not null default 'none',
  discount_value  numeric(10,2) not null default 0,
  is_active       boolean not null default true,
  -- computed totals (updated by trigger)
  subtotal        numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  total_amount    numeric(10,2) not null default 0,
  paid_amount     numeric(10,2) not null default 0,
  -- payment time = queue priority time (CRITICAL spec rule)
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table invoice_items (
  id             uuid primary key default uuid_generate_v4(),
  invoice_id     uuid not null references invoices(id) on delete cascade,
  service_id     uuid not null references services(id),
  quantity       integer not null default 1 check (quantity > 0),
  unit_price     numeric(10,2) not null,
  total_price    numeric(10,2) not null,   -- quantity × unit_price
  doctor_share   numeric(10,2) not null,   -- total_price × (doctor_percentage/100)
  created_at     timestamptz not null default now()
);

create table payments (
  id           uuid primary key default uuid_generate_v4(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  clinic_id    uuid not null references clinics(id) on delete cascade,
  amount       numeric(10,2) not null check (amount > 0),
  method       payment_method not null default 'cash',
  date         date not null default current_date,
  received_by  uuid not null references users(id),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- VISITS  (the live queue entry — created when invoice is paid)
-- ============================================================
create table visits (
  id              uuid primary key default uuid_generate_v4(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  appointment_id  uuid references appointments(id),
  patient_id      uuid not null references patients(id),
  doctor_id       uuid not null references users(id),
  specialty_id    uuid references specialties(id),
  visit_type_id   uuid references visit_types(id),
  invoice_id      uuid references invoices(id),
  status          visit_status not null default 'booked',
  date            date not null default current_date,
  time            time not null,
  is_urgent       boolean not null default false,
  -- CRITICAL: arrival_time = payment time = queue sort key
  arrival_time    timestamptz,
  notes           text,
  -- home visit
  is_home_visit   boolean not null default false,
  home_address    text,
  home_area       text,
  home_city       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- back-fill FK on invoices
alter table invoices
  add constraint fk_invoices_visit
  foreign key (visit_id) references visits(id);

-- ============================================================
-- QUEUE VIEW  (real-time sorted queue — the core feature)
-- ============================================================
create or replace view queue_today as
select
  v.id,
  v.clinic_id,
  v.patient_id,
  v.doctor_id,
  v.specialty_id,
  v.visit_type_id,
  v.invoice_id,
  v.status,
  v.date,
  v.time,
  v.is_urgent,
  v.arrival_time,
  v.notes,
  -- queue position: urgent first, then by payment/arrival time
  row_number() over (
    partition by v.clinic_id, v.doctor_id
    order by
      case when v.is_urgent then 0 else 1 end,   -- urgent override
      v.arrival_time asc nulls last               -- payment time = priority
  ) as queue_position,
  p.name      as patient_name,
  p.name_ar   as patient_name_ar,
  p.phone     as patient_phone,
  u.name      as doctor_name,
  u.name_ar   as doctor_name_ar,
  vt.name     as visit_type_name,
  vt.name_ar  as visit_type_name_ar,
  vt.is_urgent as visit_type_is_urgent
from visits v
join patients  p  on p.id = v.patient_id
join users     u  on u.id = v.doctor_id
left join visit_types vt on vt.id = v.visit_type_id
where
  v.date = current_date
  and v.status in ('checked_in', 'waiting', 'in_consultation');

-- ============================================================
-- VITAL SIGNS
-- ============================================================
create table vital_signs (
  id                uuid primary key default uuid_generate_v4(),
  patient_id        uuid not null references patients(id) on delete cascade,
  visit_id          uuid references visits(id),
  doctor_id         uuid not null references users(id),
  systolic          integer,          -- mmHg
  diastolic         integer,          -- mmHg
  heart_rate        integer,          -- bpm
  temperature       numeric(4,1),     -- °C
  weight            numeric(5,1),     -- kg
  height            numeric(5,1),     -- cm
  oxygen_saturation integer,          -- %
  notes             text,
  recorded_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- ============================================================
-- MEDICAL NOTES
-- ============================================================
create table medical_notes (
  id          uuid primary key default uuid_generate_v4(),
  patient_id  uuid not null references patients(id) on delete cascade,
  visit_id    uuid references visits(id),
  doctor_id   uuid not null references users(id),
  category    note_category not null default 'general',
  title       text not null,
  content     text not null,
  attachments jsonb not null default '[]',  -- NoteAttachment[]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- PRESCRIPTIONS
-- ============================================================
create table prescriptions (
  id           uuid primary key default uuid_generate_v4(),
  patient_id   uuid not null references patients(id) on delete cascade,
  doctor_id    uuid not null references users(id),
  visit_id     uuid references visits(id),
  status       text not null default 'active' check (status in ('active','completed','cancelled')),
  medications  jsonb not null default '[]',  -- PrescriptionMedication[]
  notes        text,
  prescribed_at timestamptz not null default now(),
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- MEDICAL DOCUMENTS + AUDIT
-- ============================================================
create table medical_documents (
  id             uuid primary key default uuid_generate_v4(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  patient_id     uuid not null references patients(id) on delete cascade,
  specialty_id   uuid references specialties(id),
  doctor_id      uuid not null references users(id),
  uploaded_by    uuid not null references users(id),
  document_type  document_type not null,
  title          text not null,
  title_ar       text not null default '',
  file_name      text not null,
  mime_type      text not null,
  file_url       text not null,
  file_size      bigint not null default 0,
  notes          text,
  upload_date    date not null default current_date,
  created_at     timestamptz not null default now()
);

create table document_audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  user_id     uuid not null references users(id),
  patient_id  uuid references patients(id),
  document_id uuid references medical_documents(id),
  action      audit_action not null,
  metadata    jsonb default '{}',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ORDERS (lab / radiology)
-- ============================================================
create table orders (
  id            uuid primary key default uuid_generate_v4(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  visit_id      uuid not null references visits(id) on delete cascade,
  patient_id    uuid not null references patients(id),
  type          order_type not null,
  title         text not null,
  title_ar      text not null default '',
  status        order_status not null default 'requested',
  requested_by  uuid not null references users(id),
  notes         text,
  created_at    timestamptz not null default now()
);

create table attachments (
  id           uuid primary key default uuid_generate_v4(),
  order_id     uuid references orders(id),
  patient_id   uuid not null references patients(id),
  visit_id     uuid references visits(id),
  file_name    text not null,
  mime_type    text not null,
  file_url     text not null,
  uploaded_by  uuid not null references users(id),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- SPECIALTY RECORDS  (dynamic consultation form data)
-- ============================================================
create table specialty_records (
  id           uuid primary key default uuid_generate_v4(),
  patient_id   uuid not null references patients(id) on delete cascade,
  visit_id     uuid not null references visits(id) on delete cascade,
  specialty_id uuid not null references specialties(id),
  doctor_id    uuid not null references users(id),
  data         jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- DOCTOR PROFILES  (rich public-facing info)
-- ============================================================
create table doctor_profiles (
  id                  uuid primary key references users(id) on delete cascade,
  bio                 text not null default '',
  bio_ar              text not null default '',
  photo_url           text,
  graduation_year     integer,
  graduation_univ     text,
  graduation_univ_ar  text,
  postgrad            jsonb not null default '[]',
  certifications      jsonb not null default '[]',
  conferences         jsonb not null default '[]',
  positions           jsonb not null default '[]',
  achievements        jsonb not null default '[]',
  additional_info     text not null default '',
  additional_info_ar  text not null default '',
  allow_admin_edit    boolean not null default true,
  allow_reception_edit boolean not null default false,
  social_links        jsonb default '{}',
  updated_at          timestamptz not null default now()
);

-- ============================================================
-- DOCTOR ↔ CLINIC LINKS  (multi-clinic doctors)
-- ============================================================
create table doctor_clinic_links (
  id         uuid primary key default uuid_generate_v4(),
  doctor_id  uuid not null references users(id) on delete cascade,
  clinic_id  uuid not null references clinics(id) on delete cascade,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (doctor_id, clinic_id)
);

-- ============================================================
-- RATINGS
-- ============================================================
create table ratings (
  id           uuid primary key default uuid_generate_v4(),
  target_id    uuid not null,
  target_type  text not null check (target_type in ('doctor','clinic')),
  patient_id   uuid not null references patients(id),
  stars        integer not null check (stars between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- OFFERS
-- ============================================================
create table offers (
  id               uuid primary key default uuid_generate_v4(),
  clinic_id        uuid not null references clinics(id) on delete cascade,
  doctor_id        uuid references users(id),
  title            text not null,
  title_ar         text not null default '',
  description      text not null default '',
  description_ar   text not null default '',
  offer_type       offer_type not null,
  service_type     offer_service_type not null default 'all',
  start_date       date not null,
  expires_at       date not null,
  original_price   numeric(10,2),
  discounted_price numeric(10,2),
  discount_percent numeric(5,2),
  max_uses         integer,
  used_count       integer not null default 0,
  conditions       jsonb default '{}',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- HOME VISIT REQUESTS
-- ============================================================
create table home_visit_requests (
  id           uuid primary key default uuid_generate_v4(),
  clinic_id    uuid references clinics(id),
  doctor_id    uuid not null references users(id),
  patient_id   uuid references patients(id),
  patient_name text not null,
  patient_phone text not null,
  address      text not null,
  area         text not null,
  city         text not null,
  notes        text,
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected','completed','cancelled')),
  scheduled_at timestamptz,
  price        numeric(10,2),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- REMINDERS
-- ============================================================
create table reminders (
  id             uuid primary key default uuid_generate_v4(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  type           text not null check (type in ('confirmation','24h','2h')),
  sent_at        timestamptz,
  is_sent        boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- INDEXES  (performance)
-- ============================================================
-- queue lookup (most frequent query)
create index idx_visits_clinic_date_status on visits(clinic_id, date, status);
create index idx_visits_doctor_date        on visits(doctor_id, date);
create index idx_visits_arrival_time       on visits(arrival_time);
create index idx_visits_is_urgent          on visits(is_urgent) where is_urgent = true;

-- appointments
create index idx_appointments_clinic_date  on appointments(clinic_id, date);
create index idx_appointments_doctor_date  on appointments(doctor_id, date);
create index idx_appointments_patient      on appointments(patient_id);

-- invoices + payments
create index idx_invoices_clinic           on invoices(clinic_id);
create index idx_invoices_patient          on invoices(patient_id);
create index idx_invoices_paid_at          on invoices(paid_at);
create index idx_payments_invoice          on payments(invoice_id);

-- patients
create index idx_patients_clinic           on patients(clinic_id);
create index idx_patients_phone            on patients(clinic_id, phone);

-- documents
create index idx_docs_patient              on medical_documents(patient_id);
create index idx_docs_specialty            on medical_documents(specialty_id);
create index idx_docs_clinic               on medical_documents(clinic_id);

-- audit
create index idx_audit_clinic_date         on document_audit_logs(clinic_id, created_at);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- updated_at auto-maintenance
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_clinics_updated_at   before update on clinics   for each row execute function set_updated_at();
create trigger trg_users_updated_at     before update on users      for each row execute function set_updated_at();
create trigger trg_patients_updated_at  before update on patients   for each row execute function set_updated_at();
create trigger trg_visits_updated_at    before update on visits     for each row execute function set_updated_at();
create trigger trg_invoices_updated_at  before update on invoices   for each row execute function set_updated_at();
create trigger trg_appt_updated_at      before update on appointments for each row execute function set_updated_at();
create trigger trg_notes_updated_at     before update on medical_notes for each row execute function set_updated_at();
create trigger trg_presc_updated_at     before update on prescriptions for each row execute function set_updated_at();
create trigger trg_hr_updated_at        before update on home_visit_requests for each row execute function set_updated_at();

-- invoice totals auto-recalculation
create or replace function recalc_invoice_totals()
returns trigger language plpgsql as $$
declare
  v_subtotal      numeric(10,2);
  v_discount_amt  numeric(10,2);
  v_total         numeric(10,2);
  v_paid          numeric(10,2);
  v_inv           invoices%rowtype;
begin
  -- get invoice
  select * into v_inv from invoices where id = coalesce(new.invoice_id, old.invoice_id);

  -- subtotal from items
  select coalesce(sum(total_price), 0) into v_subtotal
  from invoice_items where invoice_id = v_inv.id;

  -- discount
  v_discount_amt := case v_inv.discount_type
    when 'percentage' then round(v_subtotal * v_inv.discount_value / 100, 2)
    when 'fixed'      then least(v_inv.discount_value, v_subtotal)
    else 0
  end;

  v_total := greatest(v_subtotal - v_discount_amt, 0);

  -- paid amount from active payments
  select coalesce(sum(amount), 0) into v_paid
  from payments where invoice_id = v_inv.id and is_active = true;

  -- update invoice status
  update invoices set
    subtotal        = v_subtotal,
    discount_amount = v_discount_amt,
    total_amount    = v_total,
    paid_amount     = v_paid,
    status = case
      when v_paid = 0                         then 'pending'
      when v_paid >= v_total and v_total > 0  then 'paid'
      else                                         'partially_paid'
    end,
    paid_at = case
      when v_paid >= v_total and v_total > 0 and v_inv.paid_at is null then now()
      else v_inv.paid_at
    end
  where id = v_inv.id;

  return new;
end; $$;

create trigger trg_invoice_items_recalc
  after insert or update or delete on invoice_items
  for each row execute function recalc_invoice_totals();

create trigger trg_payments_recalc
  after insert or update or delete on payments
  for each row execute function recalc_invoice_totals();

-- queue entry on payment: set arrival_time on visit when invoice is paid
create or replace function set_visit_arrival_on_payment()
returns trigger language plpgsql as $$
begin
  if new.paid_at is not null and old.paid_at is null and new.visit_id is not null then
    update visits
    set arrival_time = new.paid_at,
        status = case when status = 'booked' then 'checked_in' else status end
    where id = new.visit_id and arrival_time is null;
  end if;
  return new;
end; $$;

create trigger trg_set_arrival_on_payment
  after update on invoices
  for each row execute function set_visit_arrival_on_payment();
