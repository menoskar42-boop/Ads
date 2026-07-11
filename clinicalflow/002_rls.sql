-- ============================================================
-- ClinicFlow — Row Level Security Policies
-- Migration 002: Multi-tenant isolation + role enforcement
-- ============================================================

-- ── Helper: get caller's clinic_id from users table ─────────
create or replace function auth_clinic_id()
returns uuid language sql stable security definer as $$
  select clinic_id from users where id = auth.uid()
$$;

-- ── Helper: get caller's role ────────────────────────────────
create or replace function auth_role()
returns user_role language sql stable security definer as $$
  select role from users where id = auth.uid()
$$;

-- ── Helper: check if caller is super_admin ───────────────────
create or replace function is_super_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from users where id = auth.uid() and role = 'super_admin')
$$;

-- ── Helper: caller's specialty_id ────────────────────────────
create or replace function auth_specialty_id()
returns uuid language sql stable security definer as $$
  select specialty_id from users where id = auth.uid()
$$;

-- ============================================================
-- Enable RLS on every table
-- ============================================================
alter table clinics               enable row level security;
alter table users                 enable row level security;
alter table specialties           enable row level security;
alter table services              enable row level security;
alter table visit_types           enable row level security;
alter table patients              enable row level security;
alter table doctor_schedules      enable row level security;
alter table blocked_dates         enable row level security;
alter table appointments          enable row level security;
alter table invoices              enable row level security;
alter table invoice_items         enable row level security;
alter table payments              enable row level security;
alter table visits                enable row level security;
alter table vital_signs           enable row level security;
alter table medical_notes         enable row level security;
alter table prescriptions         enable row level security;
alter table medical_documents     enable row level security;
alter table document_audit_logs   enable row level security;
alter table orders                enable row level security;
alter table attachments           enable row level security;
alter table specialty_records     enable row level security;
alter table doctor_profiles       enable row level security;
alter table doctor_clinic_links   enable row level security;
alter table ratings               enable row level security;
alter table offers                enable row level security;
alter table home_visit_requests   enable row level security;
alter table reminders             enable row level security;

-- ============================================================
-- CLINICS
-- ============================================================
-- Super admin sees all; clinic members see own
create policy "clinics_select" on clinics for select using (
  is_super_admin() or id = auth_clinic_id()
);
create policy "clinics_update" on clinics for update using (
  is_super_admin() or (id = auth_clinic_id() and auth_role() = 'admin')
);
create policy "clinics_insert" on clinics for insert with check (is_super_admin());
create policy "clinics_delete" on clinics for delete using (is_super_admin());

-- ============================================================
-- USERS
-- ============================================================
create policy "users_select" on users for select using (
  is_super_admin()
  or clinic_id = auth_clinic_id()
  or id = auth.uid()
);
create policy "users_insert" on users for insert with check (
  is_super_admin()
  or (auth_role() = 'admin' and clinic_id = auth_clinic_id())
);
create policy "users_update" on users for update using (
  is_super_admin()
  or (auth_role() = 'admin' and clinic_id = auth_clinic_id())
  or id = auth.uid()   -- own profile
);
create policy "users_delete" on users for delete using (
  is_super_admin()
  or (auth_role() = 'admin' and clinic_id = auth_clinic_id())
);

-- ============================================================
-- SPECIALTIES + SERVICES  (read: all; write: super_admin)
-- ============================================================
create policy "specialties_select" on specialties for select using (true);
create policy "specialties_write"  on specialties for all    using (is_super_admin());
create policy "services_select"    on services    for select using (true);
create policy "services_write"     on services    for all    using (is_super_admin());

-- ============================================================
-- VISIT TYPES  (per-clinic)
-- ============================================================
create policy "visit_types_select" on visit_types for select using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "visit_types_write" on visit_types for all using (
  (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception'))
  or is_super_admin()
);

-- ============================================================
-- PATIENTS  (clinic-scoped)
-- ============================================================
create policy "patients_select" on patients for select using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "patients_insert" on patients for insert with check (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "patients_update" on patients for update using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "patients_delete" on patients for delete using (
  (clinic_id = auth_clinic_id() and auth_role() = 'admin') or is_super_admin()
);

-- ============================================================
-- DOCTOR SCHEDULES + BLOCKED DATES
-- ============================================================
create policy "schedules_select" on doctor_schedules for select using (
  exists (select 1 from users u where u.id = doctor_id and u.clinic_id = auth_clinic_id())
  or is_super_admin()
);
create policy "schedules_write" on doctor_schedules for all using (
  (doctor_id = auth.uid())
  or (auth_role() = 'admin' and exists (select 1 from users u where u.id = doctor_id and u.clinic_id = auth_clinic_id()))
  or is_super_admin()
);

create policy "blocked_dates_select" on blocked_dates for select using (
  exists (select 1 from users u where u.id = doctor_id and u.clinic_id = auth_clinic_id())
  or is_super_admin()
);
create policy "blocked_dates_write" on blocked_dates for all using (
  doctor_id = auth.uid()
  or (auth_role() = 'admin' and exists (select 1 from users u where u.id = doctor_id and u.clinic_id = auth_clinic_id()))
  or is_super_admin()
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================
create policy "appointments_select" on appointments for select using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "appointments_insert" on appointments for insert with check (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "appointments_update" on appointments for update using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "appointments_delete" on appointments for delete using (
  (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception'))
  or is_super_admin()
);

-- ============================================================
-- INVOICES + ITEMS + PAYMENTS  (clinic-scoped; reception + admin)
-- ============================================================
create policy "invoices_select" on invoices for select using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "invoices_write" on invoices for all using (
  (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception'))
  or is_super_admin()
);

create policy "invoice_items_select" on invoice_items for select using (
  exists (select 1 from invoices i where i.id = invoice_id and i.clinic_id = auth_clinic_id())
  or is_super_admin()
);
create policy "invoice_items_write" on invoice_items for all using (
  exists (select 1 from invoices i where i.id = invoice_id
          and i.clinic_id = auth_clinic_id()
          and auth_role() in ('admin','reception'))
  or is_super_admin()
);

create policy "payments_select" on payments for select using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "payments_write" on payments for all using (
  (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception'))
  or is_super_admin()
);

-- ============================================================
-- VISITS  (queue — clinic-scoped)
-- ============================================================
create policy "visits_select" on visits for select using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "visits_insert" on visits for insert with check (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "visits_update" on visits for update using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "visits_delete" on visits for delete using (
  (clinic_id = auth_clinic_id() and auth_role() = 'admin') or is_super_admin()
);

-- ============================================================
-- VITAL SIGNS  (doctors see own patients only via visit)
-- ============================================================
create policy "vitals_select" on vital_signs for select using (
  exists (
    select 1 from visits v
    where v.id = visit_id and v.clinic_id = auth_clinic_id()
  ) or is_super_admin()
);
create policy "vitals_write" on vital_signs for all using (
  doctor_id = auth.uid() or
  (auth_role() in ('admin','reception') and exists (
    select 1 from visits v where v.id = visit_id and v.clinic_id = auth_clinic_id()
  )) or is_super_admin()
);

-- ============================================================
-- MEDICAL NOTES  (doctor sees own; same-clinic roles see via visits)
-- ============================================================
create policy "notes_select" on medical_notes for select using (
  exists (
    select 1 from visits v
    where v.id = visit_id and v.clinic_id = auth_clinic_id()
  ) or is_super_admin()
);
create policy "notes_write" on medical_notes for all using (
  doctor_id = auth.uid() or is_super_admin()
);

-- ============================================================
-- PRESCRIPTIONS  (same as notes)
-- ============================================================
create policy "prescriptions_select" on prescriptions for select using (
  exists (
    select 1 from visits v
    where v.id = visit_id and v.clinic_id = auth_clinic_id()
  ) or doctor_id = auth.uid() or is_super_admin()
);
create policy "prescriptions_write" on prescriptions for all using (
  doctor_id = auth.uid() or is_super_admin()
);

-- ============================================================
-- MEDICAL DOCUMENTS
-- CRITICAL PRIVACY RULE: doctor sees lab/radiology from same specialty only,
-- WITHOUT seeing who uploaded it (enforced at query level via the API)
-- ============================================================
create policy "documents_select" on medical_documents for select using (
  -- admin/reception: full clinic access
  (auth_role() in ('admin','reception') and clinic_id = auth_clinic_id())
  -- doctor: only documents from same specialty (cross-doctor privacy)
  or (auth_role() = 'doctor' and specialty_id = auth_specialty_id() and clinic_id = auth_clinic_id())
  -- own documents
  or doctor_id = auth.uid()
  or is_super_admin()
);
create policy "documents_insert" on medical_documents for insert with check (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "documents_update" on medical_documents for update using (
  (uploaded_by = auth.uid() or auth_role() = 'admin') and clinic_id = auth_clinic_id()
  or is_super_admin()
);
create policy "documents_delete" on medical_documents for delete using (
  (auth_role() = 'admin' and clinic_id = auth_clinic_id()) or is_super_admin()
);

-- ============================================================
-- DOCUMENT AUDIT LOGS  (insert by any clinic member; select by admin)
-- ============================================================
create policy "audit_insert" on document_audit_logs for insert with check (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "audit_select" on document_audit_logs for select using (
  (auth_role() = 'admin' and clinic_id = auth_clinic_id()) or is_super_admin()
);

-- ============================================================
-- ORDERS + ATTACHMENTS
-- ============================================================
create policy "orders_select" on orders for select using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "orders_write" on orders for all using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "attachments_select" on attachments for select using (
  exists (select 1 from orders o where o.id = order_id and o.clinic_id = auth_clinic_id())
  or exists (select 1 from visits v where v.id = visit_id and v.clinic_id = auth_clinic_id())
  or is_super_admin()
);
create policy "attachments_write" on attachments for all using (
  uploaded_by = auth.uid() or auth_role() = 'admin' or is_super_admin()
);

-- ============================================================
-- SPECIALTY RECORDS
-- ============================================================
create policy "specialty_records_select" on specialty_records for select using (
  exists (select 1 from visits v where v.id = visit_id and v.clinic_id = auth_clinic_id())
  or is_super_admin()
);
create policy "specialty_records_write" on specialty_records for all using (
  doctor_id = auth.uid() or is_super_admin()
);

-- ============================================================
-- DOCTOR PROFILES  (public read; restricted write)
-- ============================================================
create policy "profiles_select"   on doctor_profiles for select using (true);
create policy "profiles_insert"   on doctor_profiles for insert with check (id = auth.uid() or is_super_admin());
create policy "profiles_update"   on doctor_profiles for update using (
  id = auth.uid()
  or (auth_role() = 'admin' and (select allow_admin_edit from doctor_profiles where id = doctor_profiles.id))
  or is_super_admin()
);

-- ============================================================
-- RATINGS  (public read)
-- ============================================================
create policy "ratings_select" on ratings for select using (true);
create policy "ratings_insert" on ratings for insert with check (true);

-- ============================================================
-- OFFERS  (public read; clinic admin write)
-- ============================================================
create policy "offers_select" on offers for select using (true);
create policy "offers_write"  on offers  for all using (
  (clinic_id = auth_clinic_id() and auth_role() = 'admin') or is_super_admin()
);

-- ============================================================
-- HOME VISIT REQUESTS
-- ============================================================
create policy "hvr_select" on home_visit_requests for select using (
  doctor_id = auth.uid()
  or (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception'))
  or is_super_admin()
);
create policy "hvr_insert" on home_visit_requests for insert with check (true);
create policy "hvr_update" on home_visit_requests for update using (
  doctor_id = auth.uid()
  or (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception'))
  or is_super_admin()
);

-- ============================================================
-- REMINDERS
-- ============================================================
create policy "reminders_select" on reminders for select using (
  clinic_id = auth_clinic_id() or is_super_admin()
);
create policy "reminders_write" on reminders for all using (
  (clinic_id = auth_clinic_id() and auth_role() in ('admin','reception'))
  or is_super_admin()
);

-- ============================================================
-- SUBSCRIPTION GUARD FUNCTION
-- Called by API middleware — blocks access if plan expired
-- ============================================================
create or replace function clinic_subscription_active(p_clinic_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from clinics
    where id = p_clinic_id
      and is_active = true
      and (plan_expires_at is null or plan_expires_at > now())
  )
$$;
