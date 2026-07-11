-- ============================================================
-- ClinicFlow — Migration 003: WhatsApp Integration
-- ============================================================

-- ── 1. Add source column to appointments ────────────────────
-- Tracks how the booking originated: reception, online portal, or WhatsApp bot.
alter table appointments
  add column if not exists source text not null default 'reception'
    check (source in ('reception', 'online', 'whatsapp'));

-- ── 2. WhatsApp settings per clinic ─────────────────────────
create table if not exists whatsapp_settings (
  id              uuid primary key default uuid_generate_v4(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  verify_token    text not null default '',
  api_token       text not null default '',
  phone_number_id text not null default '',
  is_active       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (clinic_id)   -- one row per clinic
);

-- ── 3. RLS: only admins of the same clinic may read/write ───
alter table whatsapp_settings enable row level security;

create policy "whatsapp_settings_clinic_admin_select"
  on whatsapp_settings for select
  using (clinic_id = auth_clinic_id() and auth_role() in ('admin', 'super_admin'));

create policy "whatsapp_settings_clinic_admin_insert"
  on whatsapp_settings for insert
  with check (clinic_id = auth_clinic_id() and auth_role() in ('admin', 'super_admin'));

create policy "whatsapp_settings_clinic_admin_update"
  on whatsapp_settings for update
  using (clinic_id = auth_clinic_id() and auth_role() in ('admin', 'super_admin'));

-- Super admin bypass (already covered by existing is_super_admin() helper pattern)
create policy "whatsapp_settings_super_admin"
  on whatsapp_settings for all
  using (is_super_admin());

-- ── 4. Service-role reads (used by the bot in server.js) ────
-- The bot authenticates with service_role key (bypasses RLS), so no
-- additional policy is needed for server-side reads.
