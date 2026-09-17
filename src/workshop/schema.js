// Car workshop vertical.
//
// Reuses the multi-tenant `companies` table with page_type = 'workshop', so
// every workshop gets its own slug.oscardevs.com page, admin and subscription.
// EVERY table carries company_id — a table without a tenant column is one JOIN
// away from showing one workshop another's costs.
//
// The shape deliberately mirrors src/furniture/schema.js: a job card is an
// order, parts are materials with a moving-average cost, technicians are paid
// per job or per day, and warranty starts on handover. Where a workshop differs
// from a showroom it is because of the one thing a showroom does not have —
// the vehicle. Everything hangs off the vehicle, not off the customer, because
// a car outlives its owner's phone number and gets sold with its history.
//
// All statements are additive and idempotent. Ordering matters: an ALTER that
// precedes its CREATE aborts every statement after it in the same string —
// see scripts/check-schema-order.js.
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureWorkshopSchema() {
  const client = await pool.connect();
  try {
    // ── Settings + feature flags ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS workshop_settings (
        company_id     INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        business_name  TEXT,
        logo_url       TEXT,
        address        TEXT,
        phone          TEXT,
        whatsapp       TEXT,
        admin_alert_email TEXT,
        about          TEXT,
        hours          TEXT,
        currency       TEXT NOT NULL DEFAULT 'EGP',
        tax_percent    NUMERIC(5,2) NOT NULL DEFAULT 0,
        -- Default labour rate per hour. Stored per workshop because a body shop
        -- and an oil-change bay are not the same business.
        labour_rate    NUMERIC(10,2) NOT NULL DEFAULT 0,
        -- Default service interval. Used to propose the next visit; every
        -- vehicle can override it.
        service_km     INTEGER NOT NULL DEFAULT 5000,
        service_months INTEGER NOT NULL DEFAULT 6,
        -- How early the automated reminder worker should notify the customer.
        reminder_lead_days INTEGER NOT NULL DEFAULT 7,
        reminder_lead_km   INTEGER NOT NULL DEFAULT 500,
        -- زرار الورشة تقفل بيه استقبال الحجوزات من الموقع العام.
        -- مفتوح افتراضياً: ورشة لسه بتتظبط المفروض تستقبل، مش تفضل
        -- مقفولة لحد ما حد ياخد باله. نفس اللي في العيادة والجيم.
        -- (ولا باك-تيك في التعليق ده: إحنا جوّه template literal،
        --  والباك-تيك بينهيه وبيكسر الملف كله.)
        booking_enabled BOOLEAN NOT NULL DEFAULT true,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS workshop_flags (
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        flag_key    TEXT NOT NULL,
        enabled     BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (company_id, flag_key)
      );

      CREATE TABLE IF NOT EXISTS workshop_team_invitations (
        id           BIGSERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        email        TEXT NOT NULL,
        role         TEXT NOT NULL DEFAULT 'reception',
        token_hash   TEXT NOT NULL UNIQUE,
        invited_by   INTEGER REFERENCES company_users(id) ON DELETE SET NULL,
        expires_at   TIMESTAMPTZ NOT NULL,
        accepted_at  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_team_invites_lookup
        ON workshop_team_invitations (company_id, lower(email), expires_at)
        WHERE accepted_at IS NULL;

      CREATE TABLE IF NOT EXISTS workshop_role_history (
        id           BIGSERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id      INTEGER REFERENCES company_users(id) ON DELETE SET NULL,
        email        TEXT NOT NULL,
        from_role    TEXT,
        to_role      TEXT NOT NULL,
        changed_by   TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_role_history
        ON workshop_role_history (company_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS workshop_alert_email_history (
        id                BIGSERIAL PRIMARY KEY,
        company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        changed_by_user_id INTEGER REFERENCES company_users(id) ON DELETE SET NULL,
        changed_by        TEXT NOT NULL,
        previous_email    TEXT,
        new_email         TEXT,
        change_type       TEXT NOT NULL CHECK (change_type IN ('added', 'changed', 'removed')),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_alert_email_history
        ON workshop_alert_email_history (company_id, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS workshop_security_alert_state (
        company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        actor_kind        TEXT NOT NULL,
        actor_id          INTEGER NOT NULL,
        window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        rejection_count   INTEGER NOT NULL DEFAULT 0,
        alerted_at        TIMESTAMPTZ,
        alert_channel     TEXT,
        alert_status      TEXT,
        PRIMARY KEY (company_id, actor_kind, actor_id)
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_security_alert_state_window
        ON workshop_security_alert_state (window_started_at DESC);

      CREATE TABLE IF NOT EXISTS workshop_security_alert_policy (
        id              SMALLINT PRIMARY KEY CHECK (id=1),
        threshold       INTEGER NOT NULL DEFAULT 5 CHECK (threshold BETWEEN 3 AND 50),
        window_minutes  INTEGER NOT NULL DEFAULT 15 CHECK (window_minutes BETWEEN 5 AND 1440),
        updated_by      INTEGER,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      INSERT INTO workshop_security_alert_policy (id)
      VALUES (1)
      ON CONFLICT (id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS workshop_reminder_runs (
        id             BIGSERIAL PRIMARY KEY,
        company_id     INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at    TIMESTAMPTZ,
        candidate_count INTEGER NOT NULL DEFAULT 0,
        queued_count   INTEGER NOT NULL DEFAULT 0,
        skipped_count  INTEGER NOT NULL DEFAULT 0,
        failed_count   INTEGER NOT NULL DEFAULT 0,
        error          TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_reminder_runs
        ON workshop_reminder_runs (company_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS workshop_reminder_health (
        company_id         INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        state              TEXT NOT NULL DEFAULT 'healthy',
        last_success_at    TIMESTAMPTZ,
        outage_started_at  TIMESTAMPTZ,
        last_alert_at      TIMESTAMPTZ,
        last_alert_channel TEXT,
        last_alert_status  TEXT,
        recovered_at       TIMESTAMPTZ,
        recovery_alert_at      TIMESTAMPTZ,
        recovery_alert_channel TEXT,
        recovery_alert_status  TEXT,
        checked_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE workshop_reminder_health
        ADD COLUMN IF NOT EXISTS last_alert_channel TEXT,
        ADD COLUMN IF NOT EXISTS recovery_alert_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS recovery_alert_channel TEXT,
        ADD COLUMN IF NOT EXISTS recovery_alert_status TEXT;
    `);

    // ── Customers and vehicles ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS workshop_customers (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        phone       TEXT,
        whatsapp    TEXT,
        address     TEXT,
        note        TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_customers ON workshop_customers (company_id, name);

      CREATE TABLE IF NOT EXISTS workshop_customer_activities (
        id             BIGSERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id    INTEGER NOT NULL REFERENCES workshop_customers(id) ON DELETE CASCADE,
        kind           TEXT NOT NULL DEFAULT 'note',
        channel        TEXT,
        body           TEXT NOT NULL,
        followup_on    DATE,
        actor_name     TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_customer_activities
        ON workshop_customer_activities (company_id, customer_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS workshop_crm_leads (
        id                  BIGSERIAL PRIMARY KEY,
        company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id         INTEGER REFERENCES workshop_customers(id) ON DELETE SET NULL,
        name                TEXT NOT NULL,
        phone               TEXT,
        email               TEXT,
        source              TEXT,
        stage               TEXT NOT NULL DEFAULT 'new',
        priority             TEXT NOT NULL DEFAULT 'normal',
        notes               TEXT,
        next_followup_on    DATE,
        last_contacted_at   TIMESTAMPTZ,
        converted_at        TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_crm_leads_pipeline
        ON workshop_crm_leads (company_id, stage, next_followup_on, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_wsh_crm_leads_phone
        ON workshop_crm_leads (company_id, phone);

      CREATE TABLE IF NOT EXISTS workshop_crm_lead_activities (
        id             BIGSERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        lead_id        BIGINT NOT NULL REFERENCES workshop_crm_leads(id) ON DELETE CASCADE,
        kind           TEXT NOT NULL DEFAULT 'note',
        channel        TEXT,
        body           TEXT NOT NULL,
        followup_on    DATE,
        actor_name     TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_crm_lead_activities
        ON workshop_crm_lead_activities (company_id, lead_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS workshop_crm_campaigns (
        id              BIGSERIAL PRIMARY KEY,
        company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        segment         TEXT NOT NULL,
        body            TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'prepared',
        audience_count   INTEGER NOT NULL DEFAULT 0,
        prepared_count   INTEGER NOT NULL DEFAULT 0,
        sent_count       INTEGER NOT NULL DEFAULT 0,
        skipped_count    INTEGER NOT NULL DEFAULT 0,
        failed_count     INTEGER NOT NULL DEFAULT 0,
        created_by       TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at       TIMESTAMPTZ,
        completed_at     TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_crm_campaigns
        ON workshop_crm_campaigns (company_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS workshop_crm_campaign_recipients (
        id              BIGSERIAL PRIMARY KEY,
        company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        campaign_id     BIGINT NOT NULL REFERENCES workshop_crm_campaigns(id) ON DELETE CASCADE,
        customer_id     INTEGER NOT NULL REFERENCES workshop_customers(id) ON DELETE CASCADE,
        message_id      BIGINT,
        status           TEXT NOT NULL DEFAULT 'prepared',
        skip_reason      TEXT,
        result_note      TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (campaign_id, customer_id)
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_crm_campaign_recipients
        ON workshop_crm_campaign_recipients (company_id, campaign_id, status);

      -- The vehicle is the spine of this system. A job card, a reminder and a
      -- warranty all point here rather than at the customer, so a car sold to a
      -- new owner keeps its history and the workshop can still answer "what did
      -- we last do to this car?" from the plate alone.
      CREATE TABLE IF NOT EXISTS workshop_vehicles (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id  INTEGER REFERENCES workshop_customers(id) ON DELETE SET NULL,
        plate        TEXT NOT NULL,
        make         TEXT,
        model        TEXT,
        model_year   INTEGER,
        colour       TEXT,
        vin          TEXT,
        engine       TEXT,
        gearbox      TEXT,
        fuel         TEXT,
        -- Last reading we saw, and when. Kept on the vehicle so a reminder can
        -- be computed without walking every job card.
        odometer     INTEGER,
        odometer_at  TIMESTAMPTZ,
        -- Per-vehicle override of the workshop's default interval.
        service_km      INTEGER,
        service_months  INTEGER,
        note         TEXT,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_vehicles ON workshop_vehicles (company_id, plate);
      CREATE INDEX IF NOT EXISTS idx_wsh_vehicles_cust ON workshop_vehicles (company_id, customer_id);
    `);

    // ── Technicians ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS workshop_technicians (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        phone       TEXT,
        speciality  TEXT,
        -- 'daily' or 'job': paid by the day, or a percentage of the labour on
        -- the jobs they did. Both exist in the same workshop.
        pay_type    TEXT NOT NULL DEFAULT 'daily',
        pay_rate    NUMERIC(10,2) NOT NULL DEFAULT 0,
        commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_techs ON workshop_technicians (company_id, is_active);
    `);

    // ── Parts inventory ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS workshop_parts (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        part_number  TEXT,
        brand        TEXT,
        category     TEXT,
        unit         TEXT NOT NULL DEFAULT 'قطعة',
        qty          NUMERIC(12,3) NOT NULL DEFAULT 0,
        min_qty      NUMERIC(12,3) NOT NULL DEFAULT 0,
        -- Moving average, not last purchase price. What the shelf is worth
        -- today, so a job priced off it shows the margin the workshop has.
        avg_cost     NUMERIC(12,2) NOT NULL DEFAULT 0,
        sell_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
        fits         TEXT,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_parts ON workshop_parts (company_id, is_active);

      CREATE TABLE IF NOT EXISTS workshop_part_moves (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        part_id     INTEGER NOT NULL REFERENCES workshop_parts(id) ON DELETE CASCADE,
        job_id      INTEGER,
        kind        TEXT NOT NULL,
        qty         NUMERIC(12,3) NOT NULL,
        unit_cost   NUMERIC(12,2) NOT NULL DEFAULT 0,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_part_moves ON workshop_part_moves (company_id, part_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS workshop_suppliers (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        phone       TEXT,
        whatsapp    TEXT,
        address     TEXT,
        note        TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_suppliers ON workshop_suppliers (company_id, is_active, name);

      CREATE TABLE IF NOT EXISTS workshop_purchase_orders (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        supplier_id   INTEGER REFERENCES workshop_suppliers(id) ON DELETE SET NULL,
        status        TEXT NOT NULL DEFAULT 'draft',
        expected_on   DATE,
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_purchase_orders ON workshop_purchase_orders (company_id, status, created_at DESC);

      CREATE TABLE IF NOT EXISTS workshop_purchase_order_items (
        id                SERIAL PRIMARY KEY,
        company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        purchase_order_id INTEGER NOT NULL REFERENCES workshop_purchase_orders(id) ON DELETE CASCADE,
        part_id           INTEGER NOT NULL REFERENCES workshop_parts(id) ON DELETE RESTRICT,
        name              TEXT NOT NULL,
        qty_ordered       NUMERIC(12,3) NOT NULL,
        qty_received      NUMERIC(12,3) NOT NULL DEFAULT 0,
        unit_cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (purchase_order_id, part_id)
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_po_items ON workshop_purchase_order_items (company_id, purchase_order_id);

    `);

    // ── Job cards ────────────────────────────────────────────────────────────
    await client.query(`
      -- The job card. Statuses run received → quoted → approved → in_progress →
      -- done → delivered, with 'cancelled' available from any of them.
      --
      -- quote_total and approved_at exist because the single most common
      -- argument in a workshop is "I never agreed to that". A quote the customer
      -- approved, with a timestamp, ends it.
      CREATE TABLE IF NOT EXISTS workshop_jobs (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        vehicle_id    INTEGER REFERENCES workshop_vehicles(id) ON DELETE SET NULL,
        customer_id   INTEGER REFERENCES workshop_customers(id) ON DELETE SET NULL,
        technician_id INTEGER REFERENCES workshop_technicians(id) ON DELETE SET NULL,
        code          TEXT,
        status        TEXT NOT NULL DEFAULT 'received',
        complaint     TEXT,
        diagnosis     TEXT,
        odometer_in   INTEGER,
        received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        promised_at   TIMESTAMPTZ,
         diagnosed_at  TIMESTAMPTZ,
        started_at    TIMESTAMPTZ,
         quality_checked_at TIMESTAMPTZ,
        done_at       TIMESTAMPTZ,
         ready_at      TIMESTAMPTZ,
        delivered_at  TIMESTAMPTZ,
        quote_total   NUMERIC(12,2),
        approved_at   TIMESTAMPTZ,
        approved_by   TEXT,
        discount      NUMERIC(12,2) NOT NULL DEFAULT 0,
        tax_percent   NUMERIC(5,2) NOT NULL DEFAULT 0,
        paid          NUMERIC(12,2) NOT NULL DEFAULT 0,
        warranty_months INTEGER NOT NULL DEFAULT 0,
        note          TEXT,
         technician_note TEXT,
         handover_note TEXT,
         handover_by   TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_jobs ON workshop_jobs (company_id, status, received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_wsh_jobs_vehicle ON workshop_jobs (company_id, vehicle_id);

      CREATE TABLE IF NOT EXISTS workshop_part_reservations (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        part_id     INTEGER NOT NULL REFERENCES workshop_parts(id) ON DELETE CASCADE,
        job_id      INTEGER NOT NULL REFERENCES workshop_jobs(id) ON DELETE CASCADE,
        qty         NUMERIC(12,3) NOT NULL,
        status      TEXT NOT NULL DEFAULT 'reserved',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (part_id, job_id)
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_reservations ON workshop_part_reservations (company_id, part_id, status);

      -- Parts used on a job. unit_cost is captured at the moment of issue, so a
      -- later price change cannot rewrite what an old job actually cost.
      CREATE TABLE IF NOT EXISTS workshop_job_parts (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id      INTEGER NOT NULL REFERENCES workshop_jobs(id) ON DELETE CASCADE,
        part_id     INTEGER REFERENCES workshop_parts(id) ON DELETE SET NULL,
        name        TEXT NOT NULL,
        qty         NUMERIC(12,3) NOT NULL DEFAULT 1,
        unit_cost   NUMERIC(12,2) NOT NULL DEFAULT 0,
        unit_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_job_parts ON workshop_job_parts (company_id, job_id);

      -- Labour lines. Kept separate from parts because the margin on the two is
      -- completely different and mixing them hides which one earns.
      CREATE TABLE IF NOT EXISTS workshop_job_labour (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id      INTEGER NOT NULL REFERENCES workshop_jobs(id) ON DELETE CASCADE,
        technician_id INTEGER REFERENCES workshop_technicians(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        hours       NUMERIC(8,2) NOT NULL DEFAULT 0,
        rate        NUMERIC(12,2) NOT NULL DEFAULT 0,
        amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_job_labour ON workshop_job_labour (company_id, job_id);

      CREATE TABLE IF NOT EXISTS workshop_payments (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id      INTEGER REFERENCES workshop_jobs(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES workshop_customers(id) ON DELETE SET NULL,
        amount      NUMERIC(12,2) NOT NULL,
        method      TEXT NOT NULL DEFAULT 'cash',
        note        TEXT,
        paid_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_payments ON workshop_payments (company_id, job_id);

      -- Photos of the car as it arrived and as it left. The cheapest insurance a
      -- workshop has against "that scratch was not there when I dropped it off".
      CREATE TABLE IF NOT EXISTS workshop_job_photos (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id      INTEGER NOT NULL REFERENCES workshop_jobs(id) ON DELETE CASCADE,
        phase       TEXT NOT NULL DEFAULT 'before',
        image_url   TEXT NOT NULL,
        caption     TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_job_photos ON workshop_job_photos (company_id, job_id);

      CREATE TABLE IF NOT EXISTS workshop_job_access (
        job_id       INTEGER PRIMARY KEY REFERENCES workshop_jobs(id) ON DELETE CASCADE,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        token        TEXT NOT NULL UNIQUE,
        last_viewed_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_job_access_company ON workshop_job_access (company_id, job_id);

      CREATE TABLE IF NOT EXISTS workshop_inspection_items (
        id               SERIAL PRIMARY KEY,
        company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id           INTEGER NOT NULL REFERENCES workshop_jobs(id) ON DELETE CASCADE,
        system           TEXT NOT NULL,
        check_name       TEXT NOT NULL,
        guidance         TEXT,
        status           TEXT NOT NULL DEFAULT 'not_checked',
        note             TEXT,
        recommendation   TEXT,
        estimated_amount NUMERIC(12,2),
        customer_visible BOOLEAN NOT NULL DEFAULT true,
        promoted_at      TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_inspection ON workshop_inspection_items (company_id, job_id, status);

      -- Required final checks before a vehicle can be handed back. These are
      -- separate from the customer-facing inspection: inspection finds work,
      -- quality confirms the completed work is safe to release.
      CREATE TABLE IF NOT EXISTS workshop_quality_checks (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id      INTEGER NOT NULL REFERENCES workshop_jobs(id) ON DELETE CASCADE,
        check_key   TEXT NOT NULL,
        check_name  TEXT NOT NULL,
        required    BOOLEAN NOT NULL DEFAULT true,
        status      TEXT NOT NULL DEFAULT 'pending',
        note        TEXT,
        checked_by  TEXT,
        checked_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (job_id, check_key)
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_quality ON workshop_quality_checks (company_id, job_id, status);

      CREATE TABLE IF NOT EXISTS workshop_activity (
        id          BIGSERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id      INTEGER REFERENCES workshop_jobs(id) ON DELETE SET NULL,
        action      TEXT NOT NULL,
        details     TEXT,
        actor_name  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_activity ON workshop_activity (company_id, job_id, created_at DESC);
    `);

    // ── Scheduling ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS workshop_appointments (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id  INTEGER REFERENCES workshop_customers(id) ON DELETE SET NULL,
        vehicle_id   INTEGER REFERENCES workshop_vehicles(id) ON DELETE SET NULL,
        job_id       INTEGER REFERENCES workshop_jobs(id) ON DELETE SET NULL,
        starts_at    TIMESTAMPTZ NOT NULL,
        ends_at      TIMESTAMPTZ,
        status       TEXT NOT NULL DEFAULT 'booked',
        service_type TEXT,
        concern      TEXT,
        notes        TEXT,
        source       TEXT NOT NULL DEFAULT 'staff',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_appointments ON workshop_appointments (company_id, starts_at, status);
      CREATE TABLE IF NOT EXISTS workshop_appointment_photos (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        appointment_id INTEGER NOT NULL REFERENCES workshop_appointments(id) ON DELETE CASCADE,
        image_url      TEXT NOT NULL,
        caption        TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_appointment_photos
        ON workshop_appointment_photos (company_id, appointment_id);
    `);

    // ── Service reminders ────────────────────────────────────────────────────
    await client.query(`
      -- The feature that brings the customer back. One row per vehicle per due
      -- service; created when a job is delivered, closed when the car returns.
      --
      -- Both a due date and a due odometer are stored because a taxi hits the
      -- kilometres first and a second car hits the months first, and a workshop
      -- that only tracks one of them chases the wrong half of its customers.
      CREATE TABLE IF NOT EXISTS workshop_reminders (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        vehicle_id   INTEGER NOT NULL REFERENCES workshop_vehicles(id) ON DELETE CASCADE,
        job_id       INTEGER REFERENCES workshop_jobs(id) ON DELETE SET NULL,
        kind         TEXT NOT NULL DEFAULT 'service',
        due_on       DATE,
        due_odometer INTEGER,
        note         TEXT,
        status       TEXT NOT NULL DEFAULT 'open',
        contacted_at TIMESTAMPTZ,
        reminder_notified_at TIMESTAMPTZ,
        reminder_message_id BIGINT,
        closed_at    TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_reminders ON workshop_reminders (company_id, status, due_on);
      CREATE INDEX IF NOT EXISTS idx_wsh_reminders_vehicle ON workshop_reminders (company_id, vehicle_id);
    `);

    // ── Expenses ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS workshop_expenses (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        category    TEXT,
        description TEXT,
        amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
        spent_on    DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_expenses ON workshop_expenses (company_id, spent_on DESC);
    `);

    // ── Advanced operations ───────────────────────────────────────────────────
    // These tables are deliberately additive. Existing jobs, parts and warranty
    // rows remain valid while the workshop gradually adopts the richer flow.
    await client.query(`
      CREATE TABLE IF NOT EXISTS workshop_change_orders (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id        INTEGER NOT NULL REFERENCES workshop_jobs(id) ON DELETE CASCADE,
        status        TEXT NOT NULL DEFAULT 'proposed',
        reason        TEXT NOT NULL,
        customer_note TEXT,
        approved_by   TEXT,
        approved_at   TIMESTAMPTZ,
        rejected_by   TEXT,
        rejected_at   TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_change_orders
        ON workshop_change_orders (company_id, job_id, status, created_at DESC);

      CREATE TABLE IF NOT EXISTS workshop_change_order_items (
        id              SERIAL PRIMARY KEY,
        company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        change_order_id INTEGER NOT NULL REFERENCES workshop_change_orders(id) ON DELETE CASCADE,
        kind            TEXT NOT NULL DEFAULT 'labour',
        description     TEXT NOT NULL,
        qty             NUMERIC(12,3) NOT NULL DEFAULT 1,
        unit_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
        unit_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_change_items
        ON workshop_change_order_items (company_id, change_order_id);

      CREATE TABLE IF NOT EXISTS workshop_estimate_versions (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id      INTEGER NOT NULL REFERENCES workshop_jobs(id) ON DELETE CASCADE,
        version_no  INTEGER NOT NULL,
        status      TEXT NOT NULL DEFAULT 'draft',
        subtotal    NUMERIC(12,2) NOT NULL DEFAULT 0,
        total       NUMERIC(12,2) NOT NULL DEFAULT 0,
        snapshot    JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_by  TEXT,
        approved_by TEXT,
        approved_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, job_id, version_no)
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_estimate_versions
        ON workshop_estimate_versions (company_id, job_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS workshop_work_bays (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        bay_type    TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_bays
        ON workshop_work_bays (company_id, is_active, name);

      CREATE TABLE IF NOT EXISTS workshop_time_entries (
        id            BIGSERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id        INTEGER NOT NULL REFERENCES workshop_jobs(id) ON DELETE CASCADE,
        technician_id INTEGER REFERENCES workshop_technicians(id) ON DELETE SET NULL,
        started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        ended_at      TIMESTAMPTZ,
        note          TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_time_entries
        ON workshop_time_entries (company_id, job_id, started_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wsh_active_time_by_tech
        ON workshop_time_entries (company_id, technician_id)
        WHERE ended_at IS NULL AND technician_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS workshop_warranty_claims (
        id              SERIAL PRIMARY KEY,
        company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        original_job_id INTEGER REFERENCES workshop_jobs(id) ON DELETE SET NULL,
        return_job_id   INTEGER REFERENCES workshop_jobs(id) ON DELETE SET NULL,
        vehicle_id      INTEGER REFERENCES workshop_vehicles(id) ON DELETE SET NULL,
        customer_id     INTEGER REFERENCES workshop_customers(id) ON DELETE SET NULL,
        status          TEXT NOT NULL DEFAULT 'open',
        complaint       TEXT NOT NULL,
        diagnosis       TEXT,
        resolution      TEXT,
        decision        TEXT,
        opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        closed_at       TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_warranty_claims
        ON workshop_warranty_claims (company_id, status, opened_at DESC);

      CREATE TABLE IF NOT EXISTS workshop_messages (
        id          BIGSERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id      INTEGER REFERENCES workshop_jobs(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES workshop_customers(id) ON DELETE SET NULL,
        channel     TEXT NOT NULL DEFAULT 'whatsapp',
         provider    TEXT,
        recipient   TEXT,
        event_key   TEXT,
        body        TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'prepared',
        sent_at     TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        failed_at   TIMESTAMPTZ,
        delivery_updated_at TIMESTAMPTZ,
        error       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_messages
        ON workshop_messages (company_id, created_at DESC);

      -- Each workshop connects its own Twilio or Meta account. Credentials are
      -- encrypted before storage; the settings page only exposes configured
      -- indicators, never the secret values.
      CREATE TABLE IF NOT EXISTS workshop_message_settings (
        company_id              INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        active                  BOOLEAN NOT NULL DEFAULT false,
        sms_provider            TEXT NOT NULL DEFAULT 'none',
        whatsapp_provider       TEXT NOT NULL DEFAULT 'none',
        twilio_account_sid_enc  TEXT,
        twilio_auth_token_enc   TEXT,
        twilio_sms_from         TEXT,
        twilio_whatsapp_from    TEXT,
        meta_phone_number_id    TEXT,
        meta_access_token_enc   TEXT,
        meta_app_secret_enc     TEXT,
        meta_verify_token_enc   TEXT,
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_message_settings_active
        ON workshop_message_settings (company_id, active);

      CREATE TABLE IF NOT EXISTS workshop_payment_attempts (
        id                 BIGSERIAL PRIMARY KEY,
        company_id         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        job_id             INTEGER NOT NULL REFERENCES workshop_jobs(id) ON DELETE CASCADE,
        merchant_order_id  TEXT NOT NULL UNIQUE,
        provider            TEXT NOT NULL DEFAULT 'paymob',
        amount_cents       INTEGER NOT NULL,
        status              TEXT NOT NULL DEFAULT 'pending',
        provider_order_id  TEXT,
        payment_ref        TEXT,
        payment_url        TEXT,
        error              TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        paid_at            TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_wsh_payment_attempts_job
        ON workshop_payment_attempts (company_id, job_id, created_at DESC);
    `);

    // Existing installations need the new relationship/lookup columns too.
    await client.query(`
      ALTER TABLE workshop_jobs
        ADD COLUMN IF NOT EXISTS bay_id INTEGER,
        ADD COLUMN IF NOT EXISTS diagnosed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS quality_checked_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS handover_note TEXT,
        ADD COLUMN IF NOT EXISTS handover_by TEXT,
        ADD COLUMN IF NOT EXISTS technician_note TEXT;
      ALTER TABLE workshop_parts
        ADD COLUMN IF NOT EXISTS barcode TEXT;
      ALTER TABLE workshop_reminders
        ADD COLUMN IF NOT EXISTS reminder_notified_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reminder_message_id BIGINT;
      CREATE INDEX IF NOT EXISTS idx_wsh_reminder_notifications
        ON workshop_reminders (company_id, reminder_notified_at, status);
      ALTER TABLE workshop_messages
        ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS campaign_id BIGINT,
        ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
         ADD COLUMN IF NOT EXISTS provider TEXT,
         ADD COLUMN IF NOT EXISTS provider_status TEXT,
         ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS final_failure_alert_at TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS final_failure_alert_channel TEXT,
         ADD COLUMN IF NOT EXISTS final_failure_alert_status TEXT;
      CREATE INDEX IF NOT EXISTS idx_wsh_messages_provider_id
        ON workshop_messages (company_id, provider_message_id);
      CREATE INDEX IF NOT EXISTS idx_wsh_messages_campaign
        ON workshop_messages (company_id, campaign_id);
      ALTER TABLE workshop_message_settings
        ADD COLUMN IF NOT EXISTS meta_app_secret_enc TEXT,
        ADD COLUMN IF NOT EXISTS meta_verify_token_enc TEXT;
      CREATE INDEX IF NOT EXISTS idx_wsh_jobs_bay
        ON workshop_jobs (company_id, bay_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wsh_parts_barcode
        ON workshop_parts (company_id, barcode)
        WHERE barcode IS NOT NULL AND barcode <> '';
    `);

    /* الورش اللي اتعملت قبل الزرار ده جدولها من غير العمود، و`CREATE
     * TABLE IF NOT EXISTS` مابيزوّدش عمود على جدول موجود. من غير الـALTER
     * دي `bookingOpen` بترمي، وهي بترجّع `true` عند الخطأ — فالزرار كان
     * هيبان في الإعدادات وما يقفلش حاجة. */
    await client.query(`
      ALTER TABLE workshop_settings
        ADD COLUMN IF NOT EXISTS booking_enabled BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS reminder_lead_days INTEGER NOT NULL DEFAULT 7,
        ADD COLUMN IF NOT EXISTS reminder_lead_km INTEGER NOT NULL DEFAULT 500,
        ADD COLUMN IF NOT EXISTS admin_alert_email TEXT;
      ALTER TABLE workshop_customers
        ADD COLUMN IF NOT EXISTS segment TEXT NOT NULL DEFAULT 'regular',
        ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS preferred_channel TEXT NOT NULL DEFAULT 'whatsapp',
        ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS marketing_opted_out_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS source TEXT,
        ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS next_followup_on DATE;
      CREATE INDEX IF NOT EXISTS idx_wsh_customers_crm
        ON workshop_customers (company_id, segment, lifecycle_stage, next_followup_on);
    `);

    console.log('Workshop schema ready.');
  } catch (err) {
    console.error('[workshop schema]', err.message);
  } finally {
    client.release();
  }
}

module.exports = { ensureWorkshopSchema };
