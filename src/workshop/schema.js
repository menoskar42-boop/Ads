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
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS workshop_flags (
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        flag_key    TEXT NOT NULL,
        enabled     BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (company_id, flag_key)
      );
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
        started_at    TIMESTAMPTZ,
        done_at       TIMESTAMPTZ,
        delivered_at  TIMESTAMPTZ,
        quote_total   NUMERIC(12,2),
        approved_at   TIMESTAMPTZ,
        approved_by   TEXT,
        discount      NUMERIC(12,2) NOT NULL DEFAULT 0,
        tax_percent   NUMERIC(5,2) NOT NULL DEFAULT 0,
        paid          NUMERIC(12,2) NOT NULL DEFAULT 0,
        warranty_months INTEGER NOT NULL DEFAULT 0,
        note          TEXT,
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

    console.log('Workshop schema ready.');
  } catch (err) {
    console.error('[workshop schema]', err.message);
  } finally {
    client.release();
  }
}

module.exports = { ensureWorkshopSchema };
