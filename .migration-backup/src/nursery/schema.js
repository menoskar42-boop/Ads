// Nurseries and tutoring centres.
//
// The owner's brief was blunt and correct: the pain is not attendance, it is
// COLLECTING THE FEES. A guardian is two months late, nobody remembers, and the
// manager is too embarrassed to ring and ask. So the money model is the spine of
// this schema and everything else hangs off it:
//
//   1. A MONTH IS A ROW. Fees are not a running balance that somebody adjusts —
//      each child gets one invoice per month, generated once, and a unique index
//      makes "generate this month" safe to press twice. Without that index a
//      nervous manager clicking again double-bills every parent in the place,
//      and nothing on the screen would say so.
//
//   2. WHAT IS OWED IS DERIVED, NEVER STORED. Arrears are invoices minus
//      payments, computed at read time. A stored balance drifts the first time
//      anybody edits a payment, and a wrong arrears figure is worse than none —
//      it is the number the manager reads out loud to a parent.
//
//   3. ATTENDANCE IS ONE ROW PER CHILD PER DAY. Keyed uniquely, so the roll call
//      can be re-saved all morning as children trickle in without ever
//      duplicating a day.
//
// The other thing a real nursery cannot be sold without: WHO IS ALLOWED TO TAKE
// THE CHILD. It is not a feature, it is the reason a nursery is trusted, so the
// authorised-collector list is a first-class table rather than a note field.
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureNurserySchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nursery_settings (
        company_id      INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        business_name   TEXT,
        -- 'nursery' or 'center'. The same engine sells to a nursery and to a
        -- tutoring centre; only the words on the screen differ, and this is the
        -- switch that changes them.
        kind            TEXT NOT NULL DEFAULT 'nursery',
        address         TEXT,
        phone           TEXT,
        whatsapp        TEXT,
        about           TEXT,
        age_from        INTEGER,
        age_to          INTEGER,
        open_from       TEXT,
        open_to         TEXT,
        default_fee     NUMERIC(12,2) NOT NULL DEFAULT 0,
        -- The day of the month the fee is due. A due date is what turns "late"
        -- from an opinion into a fact, and it is the whole basis of the reminder
        -- list.
        due_day         INTEGER NOT NULL DEFAULT 5,
        -- Bill a child who joined on the 20th for eleven days, not for a month.
        -- Off by default: it changes what families are charged, and that is the
        -- nursery's decision to make, not a default we quietly apply to
        -- everybody's existing invoices.
        prorate         BOOLEAN NOT NULL DEFAULT false,
        currency        TEXT NOT NULL DEFAULT 'EGP',
        map_url         TEXT,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS nursery_flags (
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        flag_key   TEXT NOT NULL,
        enabled    BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (company_id, flag_key)
      );

      -- A class (KG1) or a tutoring group (ثالثة ثانوي — رياضيات — سبت وثلاثاء).
      CREATE TABLE IF NOT EXISTS nursery_groups (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        teacher     TEXT,
        schedule    TEXT,
        capacity    INTEGER,
        -- The group's fee is the default for a child in it; a child may still
        -- carry its own.
        monthly_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nursery_groups ON nursery_groups (company_id, is_active, sort_order);

      CREATE TABLE IF NOT EXISTS nursery_staff (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        role        TEXT,
        phone       TEXT,
        note        TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nursery_staff ON nursery_staff (company_id, is_active);

      -- The person who pays and the person who is rung. Separate from the child
      -- because siblings share one, and a family that owes money owes it once.
      CREATE TABLE IF NOT EXISTS nursery_guardians (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        relation    TEXT,
        phone       TEXT,
        whatsapp    TEXT,
        national_id TEXT,
        address     TEXT,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nursery_guardians ON nursery_guardians (company_id, name);
    `);

    await client.query(`
      -- status: active | paused | left. A paused or departed child is not
      -- invoiced, which is the difference between a fee list somebody trusts and
      -- one they stop reading.
      CREATE TABLE IF NOT EXISTS nursery_children (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        guardian_id  INTEGER REFERENCES nursery_guardians(id) ON DELETE SET NULL,
        group_id     INTEGER REFERENCES nursery_groups(id) ON DELETE SET NULL,
        name         TEXT NOT NULL,
        birth_date   DATE,
        gender       TEXT,
        enrolled_on  DATE,
        left_on      DATE,
        status       TEXT NOT NULL DEFAULT 'active',
        monthly_fee  NUMERIC(12,2),
        discount     NUMERIC(12,2) NOT NULL DEFAULT 0,
        -- Not decoration. A nursery is handed a child with an allergy and a
        -- medicine time, and the place that loses that note loses the family.
        allergies    TEXT,
        medical_note TEXT,
        emergency_phone TEXT,
        note         TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nursery_children ON nursery_children (company_id, status, group_id);

      -- Who may collect the child. The reason a nursery is trusted, so it gets a
      -- table rather than a line in "notes".
      CREATE TABLE IF NOT EXISTS nursery_pickups (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        child_id    INTEGER NOT NULL REFERENCES nursery_children(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        relation    TEXT,
        phone       TEXT,
        national_id TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nursery_pickups ON nursery_pickups (company_id, child_id, is_active);

      -- One row per child per day. status: present | absent | late | excused.
      CREATE TABLE IF NOT EXISTS nursery_attendance (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        child_id    INTEGER NOT NULL REFERENCES nursery_children(id) ON DELETE CASCADE,
        day         DATE NOT NULL,
        status      TEXT NOT NULL DEFAULT 'present',
        in_at       TIMESTAMPTZ,
        out_at      TIMESTAMPTZ,
        picked_by   TEXT,
        note        TEXT,
        notified_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nursery_att ON nursery_attendance (company_id, day, status);

      -- The short note a parent actually reads at pickup: ate, slept, mood.
      CREATE TABLE IF NOT EXISTS nursery_day_reports (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        child_id    INTEGER NOT NULL REFERENCES nursery_children(id) ON DELETE CASCADE,
        day         DATE NOT NULL,
        mood        TEXT,
        ate         TEXT,
        slept       TEXT,
        body        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nursery_day_reports ON nursery_day_reports (company_id, child_id, day DESC);
    `);

    // ── The money ────────────────────────────────────────────────────────────
    await client.query(`
      -- period is 'YYYY-MM'. One invoice per child per month, and the index
      -- below makes that a rule rather than a hope.
      CREATE TABLE IF NOT EXISTS nursery_invoices (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        child_id    INTEGER NOT NULL REFERENCES nursery_children(id) ON DELETE CASCADE,
        period      TEXT NOT NULL,
        amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
        discount    NUMERIC(12,2) NOT NULL DEFAULT 0,
        due_on      DATE,
        kind        TEXT NOT NULL DEFAULT 'monthly',
        note        TEXT,
        cancelled   BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nursery_invoices ON nursery_invoices (company_id, child_id, period);
      CREATE INDEX IF NOT EXISTS idx_nursery_invoices_due ON nursery_invoices (company_id, due_on);

      CREATE TABLE IF NOT EXISTS nursery_payments (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        child_id    INTEGER NOT NULL REFERENCES nursery_children(id) ON DELETE CASCADE,
        invoice_id  INTEGER REFERENCES nursery_invoices(id) ON DELETE SET NULL,
        amount      NUMERIC(12,2) NOT NULL,
        method      TEXT NOT NULL DEFAULT 'cash',
        note        TEXT,
        paid_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nursery_payments ON nursery_payments (company_id, child_id, paid_at DESC);

      -- Every reminder that went out, so nobody is nagged twice in a day and the
      -- manager can say exactly when the family was last told.
      CREATE TABLE IF NOT EXISTS nursery_reminders (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        child_id    INTEGER NOT NULL REFERENCES nursery_children(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL DEFAULT 'fees',
        channel     TEXT NOT NULL DEFAULT 'whatsapp',
        amount      NUMERIC(12,2),
        body        TEXT,
        sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nursery_reminders ON nursery_reminders (company_id, child_id, sent_at DESC);

      -- Enrolment enquiries from the public page.
      CREATE TABLE IF NOT EXISTS nursery_enquiries (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        phone       TEXT,
        whatsapp    TEXT,
        child_name  TEXT,
        child_age   TEXT,
        interest    TEXT,
        note        TEXT,
        source      TEXT NOT NULL DEFAULT 'website',
        status      TEXT NOT NULL DEFAULT 'new',
        next_action_on DATE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nursery_enq ON nursery_enquiries (company_id, status, next_action_on);
    `);

    // ── The two indexes that make the product safe to use ────────────────────
    //
    // The invoice one is this file's equivalent of the hall's double-booking
    // guard. "Generate this month's fees" is a button a manager will press
    // again when the page is slow, and without this index the second press
    // silently doubles every family's bill — a mistake that is only discovered
    // by an angry parent.
    //
    // Partial on cancelled so a mistaken invoice can be voided and reissued.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nursery_one_invoice_per_month
        ON nursery_invoices (company_id, child_id, period)
        WHERE cancelled = false AND kind = 'monthly';
    `);
    // The roll call is saved repeatedly through the morning as children arrive.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nursery_one_attendance_per_day
        ON nursery_attendance (company_id, child_id, day);
    `);

    console.log('Nursery schema ready.');
  } catch (err) {
    console.error('[nursery schema]', err.message);
  } finally {
    client.release();
  }
}

module.exports = { ensureNurserySchema };
