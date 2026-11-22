// Wedding and event halls.
//
// Built as a booking engine first and a back-office second, because the pain a
// hall actually feels is not record-keeping — it is the enquiry that came in on
// WhatsApp on a Thursday and was never followed up, and the day that got
// promised to two families.
//
// Three things shape the tables:
//
//   1. A DATE CAN ONLY BE SOLD ONCE. Everything else in a hall is recoverable;
//      a double-booked wedding is not. So the hold on a date lives in the
//      database with a unique constraint behind it, not in a calendar view.
//
//   2. An ENQUIRY IS A RECORD, not a message. It has a date, a headcount, a
//      budget and a next action — because the money is lost between "they
//      asked" and "they came to see it", and a WhatsApp thread cannot be
//      reported on.
//
//   3. HEADCOUNT CHANGES UNTIL THE LAST WEEK, and the per-head price is where
//      the margin is. So the guest count is a live number with its own history,
//      not something typed once into a contract.
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureHallSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS hall_settings (
        company_id     INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        business_name  TEXT,
        address        TEXT,
        phone          TEXT,
        whatsapp       TEXT,
        about          TEXT,
        capacity_min   INTEGER,
        capacity_max   INTEGER,
        -- What a family is quoted before anything is customised. Shown on the
        -- public page because a hall that hides its price gets enquiries it
        -- cannot convert and loses the ones it could.
        base_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
        price_per_head NUMERIC(12,2) NOT NULL DEFAULT 0,
        deposit_percent NUMERIC(5,2) NOT NULL DEFAULT 25,
        currency       TEXT NOT NULL DEFAULT 'EGP',
        map_url        TEXT,
        video_url      TEXT,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS hall_flags (
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        flag_key   TEXT NOT NULL,
        enabled    BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (company_id, flag_key)
      );

      -- A hall may have more than one space. Each is booked independently, so
      -- the double-booking guard is per venue, not per company.
      CREATE TABLE IF NOT EXISTS hall_venues (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        capacity    INTEGER,
        note        TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_hall_venues ON hall_venues (company_id, is_active);

      CREATE TABLE IF NOT EXISTS hall_packages (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name           TEXT NOT NULL,
        description    TEXT,
        base_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
        price_per_head NUMERIC(12,2) NOT NULL DEFAULT 0,
        min_guests     INTEGER,
        includes       TEXT,
        is_active      BOOLEAN NOT NULL DEFAULT true,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_hall_packages ON hall_packages (company_id, is_active, sort_order);
    `);

    // ── The enquiry funnel ───────────────────────────────────────────────────
    await client.query(`
      -- Where the money is won or lost. status runs
      -- new → contacted → viewing_booked → viewed → quoted → won | lost.
      CREATE TABLE IF NOT EXISTS hall_enquiries (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        phone        TEXT,
        whatsapp     TEXT,
        event_date   DATE,
        event_type   TEXT,
        guests       INTEGER,
        budget       NUMERIC(12,2),
        city         TEXT,
        note         TEXT,
        source       TEXT NOT NULL DEFAULT 'website',
        status       TEXT NOT NULL DEFAULT 'new',
        -- The single field that stops an enquiry going quiet. Every open
        -- enquiry has a date on which somebody must do something.
        next_action_on DATE,
        viewing_at   TIMESTAMPTZ,
        lost_reason  TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_hall_enq ON hall_enquiries (company_id, status, next_action_on);
      CREATE INDEX IF NOT EXISTS idx_hall_enq_date ON hall_enquiries (company_id, event_date);

      CREATE TABLE IF NOT EXISTS hall_enquiry_notes (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        enquiry_id  INTEGER NOT NULL REFERENCES hall_enquiries(id) ON DELETE CASCADE,
        body        TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_hall_enq_notes ON hall_enquiry_notes (company_id, enquiry_id, created_at DESC);
    `);

    // ── Bookings ─────────────────────────────────────────────────────────────
    await client.query(`
      -- status: held → confirmed → done, plus 'cancelled'.
      -- A 'held' booking is a date taken off the market while a deposit is
      -- being collected; it blocks the day exactly like a confirmed one,
      -- because a date promised on the phone is a date sold.
      CREATE TABLE IF NOT EXISTS hall_bookings (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        venue_id     INTEGER REFERENCES hall_venues(id) ON DELETE SET NULL,
        enquiry_id   INTEGER REFERENCES hall_enquiries(id) ON DELETE SET NULL,
        package_id   INTEGER REFERENCES hall_packages(id) ON DELETE SET NULL,
        code         TEXT,
        customer_name TEXT NOT NULL,
        phone        TEXT,
        whatsapp     TEXT,
        event_date   DATE NOT NULL,
        -- 'evening' | 'afternoon' | 'full'. A hall that runs two events a day
        -- sells the slot, not the date.
        slot         TEXT NOT NULL DEFAULT 'evening',
        event_type   TEXT,
        guests       INTEGER NOT NULL DEFAULT 0,
        base_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
        price_per_head NUMERIC(12,2) NOT NULL DEFAULT 0,
        extras_total   NUMERIC(12,2) NOT NULL DEFAULT 0,
        discount       NUMERIC(12,2) NOT NULL DEFAULT 0,
        status       TEXT NOT NULL DEFAULT 'held',
        hold_until   DATE,
        note         TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_hall_bookings ON hall_bookings (company_id, event_date, status);

      -- Extras added after the contract: an extra hour, a photographer, a
      -- different centrepiece. Their own rows so the change is visible rather
      -- than folded into a total nobody can explain later.
      CREATE TABLE IF NOT EXISTS hall_booking_extras (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        booking_id  INTEGER NOT NULL REFERENCES hall_bookings(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        qty         NUMERIC(10,2) NOT NULL DEFAULT 1,
        unit_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_hall_extras ON hall_booking_extras (company_id, booking_id);

      -- Guest count changes until the last week and the per-head price is where
      -- the margin lives, so each change is a row rather than an overwrite.
      CREATE TABLE IF NOT EXISTS hall_guest_changes (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        booking_id  INTEGER NOT NULL REFERENCES hall_bookings(id) ON DELETE CASCADE,
        old_guests  INTEGER,
        new_guests  INTEGER NOT NULL,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_hall_guest_changes ON hall_guest_changes (company_id, booking_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS hall_payments (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        booking_id  INTEGER NOT NULL REFERENCES hall_bookings(id) ON DELETE CASCADE,
        amount      NUMERIC(12,2) NOT NULL,
        kind        TEXT NOT NULL DEFAULT 'deposit',
        method      TEXT NOT NULL DEFAULT 'cash',
        note        TEXT,
        paid_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_hall_payments ON hall_payments (company_id, booking_id);

      -- Instalments between the deposit and the event.
      CREATE TABLE IF NOT EXISTS hall_installments (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        booking_id  INTEGER NOT NULL REFERENCES hall_bookings(id) ON DELETE CASCADE,
        amount      NUMERIC(12,2) NOT NULL,
        due_on      DATE NOT NULL,
        paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        paid_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_hall_installments ON hall_installments (company_id, due_on);
    `);

    // ── The double-booking guard ─────────────────────────────────────────────
    //
    // This index is the single most important line in the file. A calendar that
    // merely LOOKS full still lets two people save at the same moment; the
    // database is the only place the rule can actually hold.
    //
    // Partial, so a cancelled booking frees the date immediately, and keyed on
    // the slot because a hall that runs an afternoon and an evening event sells
    // two things on one day.
    //
    // COALESCE around venue_id is not decoration. Postgres does not treat two
    // NULLs as equal, so a hall with a single space and no venue row would have
    // had every booking pass the constraint — the exact double-booking the
    // index exists to stop, and only on the halls least likely to notice.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_hall_no_double_booking
        ON hall_bookings (company_id, COALESCE(venue_id, 0), event_date, slot)
        WHERE status IN ('held', 'confirmed', 'done');
    `);

    console.log('Hall schema ready.');
  } catch (err) {
    console.error('[hall schema]', err.message);
  } finally {
    client.release();
  }
}

module.exports = { ensureHallSchema };
