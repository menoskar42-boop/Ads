-- ============================================================
-- ClinicFlow — Migration 010: Security & Audit System
-- ============================================================

-- ── 1. Audit Logs ────────────────────────────────────────────
create table if not exists audit_logs (
  id          text primary key default gen_random_uuid()::text,
  user_id     text,                   -- null = unauthenticated / system
  clinic_id   text,
  action      text not null           -- create, update, delete, view, login, logout, export
    check (action in ('create','update','delete','view','login','logout','export','denied')),
  entity      text not null,          -- patient, appointment, invoice, user, prescription, document
  entity_id   text,
  description text,
  ip_address  inet,
  user_agent  text,
  metadata    jsonb,
  severity    text not null default 'info'
    check (severity in ('info','warn','critical')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_clinic    on audit_logs (clinic_id, created_at desc);
create index if not exists idx_audit_user      on audit_logs (user_id, created_at desc);
create index if not exists idx_audit_entity    on audit_logs (entity, entity_id);
create index if not exists idx_audit_severity  on audit_logs (severity, created_at desc) where severity != 'info';

alter table audit_logs enable row level security;

create policy "admins read audit logs"
  on audit_logs for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin' or is_super_admin());

create policy "server inserts audit logs"
  on audit_logs for insert
  with check (true);  -- inserts go through service-role key only

-- ── 2. Login Sessions ────────────────────────────────────────
create table if not exists login_sessions (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  clinic_id     text,
  ip_address    inet,
  user_agent    text,
  logged_in_at  timestamptz not null default now(),
  last_active   timestamptz not null default now(),
  logged_out_at timestamptz,
  is_active     boolean not null default true,
  logout_reason text  -- 'user', 'timeout', 'forced'
);

create index if not exists idx_sessions_user   on login_sessions (user_id, logged_in_at desc);
create index if not exists idx_sessions_active on login_sessions (is_active, last_active desc) where is_active;

alter table login_sessions enable row level security;

create policy "user sees own sessions"
  on login_sessions for select
  using (user_id = auth.uid()::text or is_super_admin());

create policy "server manages sessions"
  on login_sessions for all
  using (true);

-- ── 3. Security events (suspicious activity) ─────────────────
create table if not exists security_events (
  id          text primary key default gen_random_uuid()::text,
  user_id     text,
  clinic_id   text,
  event_type  text not null
    check (event_type in ('failed_login','brute_force','mass_export','unauthorized_access','session_expired','concurrent_session')),
  description text,
  ip_address  inet,
  metadata    jsonb,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_sec_events_clinic on security_events (clinic_id, created_at desc);
create index if not exists idx_sec_events_unresolved on security_events (resolved, created_at desc) where not resolved;

alter table security_events enable row level security;

create policy "admins read security events"
  on security_events for select
  using (clinic_id = auth_clinic_id() and auth_role() = 'admin' or is_super_admin());

create policy "server inserts security events"
  on security_events for insert
  with check (true);
