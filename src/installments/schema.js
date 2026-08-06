// قسّطلي — instalment collection as a product on its own.
//
// The cheapest thing on the price list and the widest market: any shop in Egypt
// that sells on instalments has the same three questions and no system that
// answers them — who paid, who is late, and how much exactly.
//
// Three decisions shape these tables:
//
//   1. THE SCHEDULE IS ROWS, NOT A FORMULA. Every instalment is its own row with
//      its own due date, written once when the plan is created. A schedule
//      recomputed on every page load cannot be edited — and a real shop moves a
//      due date the week the customer's salary is late, which is exactly the
//      flexibility that keeps the customer paying at all.
//
//   2. PAYMENTS ARE NOT TIED TO INSTALMENTS. A customer hands over 500 against
//      a 300 instalment and nobody wants a dialog about allocation. The money is
//      recorded as money, and FIFO allocation happens at read time — so the
//      figure on the shop's screen and the figure on the customer's statement
//      are computed by the same code and can never disagree.
//
//   3. THE CUSTOMER GETS A LINK. A public, unguessable statement URL is the
//      whole differentiator: "كشف حسابك من اللينك ده" ends the phone call that
//      starts with "أنا فاضلي كام؟". It is a random token, never the row id,
//      because a sequential id in a URL is every other customer's statement.
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureInstallmentsSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS inst_settings (
        company_id     INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        business_name  TEXT,
        activity       TEXT,
        address        TEXT,
        phone          TEXT,
        whatsapp       TEXT,
        about          TEXT,
        currency       TEXT NOT NULL DEFAULT 'EGP',
        -- Days before a due date to start showing it on the "coming up" list.
        -- A reminder sent the day after is a chase; sent two days before it is
        -- a courtesy, and it is the difference in whether the money arrives.
        remind_before  INTEGER NOT NULL DEFAULT 2,
        -- Grace days after the due date before the plan is called late at all.
        grace_days     INTEGER NOT NULL DEFAULT 0,
        map_url        TEXT,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS inst_flags (
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        flag_key   TEXT NOT NULL,
        enabled    BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (company_id, flag_key)
      );

      CREATE TABLE IF NOT EXISTS inst_customers (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        phone       TEXT,
        whatsapp    TEXT,
        national_id TEXT,
        address     TEXT,
        job         TEXT,
        -- The person who vouched for them. Standard practice in Egyptian
        -- instalment selling and the first thing a shop reaches for when a
        -- customer stops answering.
        guarantor_name  TEXT,
        guarantor_phone TEXT,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_inst_customers ON inst_customers (company_id, name);
    `);

    await client.query(`
      -- One purchase paid over time. status: active | completed | defaulted | cancelled.
      CREATE TABLE IF NOT EXISTS inst_plans (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id  INTEGER NOT NULL REFERENCES inst_customers(id) ON DELETE CASCADE,
        item         TEXT,
        total        NUMERIC(12,2) NOT NULL DEFAULT 0,
        down_payment NUMERIC(12,2) NOT NULL DEFAULT 0,
        count        INTEGER NOT NULL DEFAULT 1,
        interval     TEXT NOT NULL DEFAULT 'monthly',
        start_on     DATE,
        status       TEXT NOT NULL DEFAULT 'active',
        -- The customer's statement link. Random, never derived from the id: a
        -- sequential number in a public URL is everybody else's statement.
        token        TEXT UNIQUE,
        note         TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_inst_plans ON inst_plans (company_id, status);
      CREATE INDEX IF NOT EXISTS idx_inst_plans_customer ON inst_plans (company_id, customer_id);

      -- The schedule, written once and editable afterwards. seq is the
      -- instalment number the customer counts by ("القسط التالت").
      CREATE TABLE IF NOT EXISTS inst_items (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        plan_id     INTEGER NOT NULL REFERENCES inst_plans(id) ON DELETE CASCADE,
        seq         INTEGER NOT NULL,
        amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
        due_on      DATE NOT NULL,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_inst_items ON inst_items (company_id, plan_id, seq);
      CREATE INDEX IF NOT EXISTS idx_inst_items_due ON inst_items (company_id, due_on);

      -- Money, recorded as money. Allocation to instalments is FIFO at read
      -- time so the shop's screen and the customer's statement always agree.
      CREATE TABLE IF NOT EXISTS inst_payments (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        plan_id     INTEGER NOT NULL REFERENCES inst_plans(id) ON DELETE CASCADE,
        amount      NUMERIC(12,2) NOT NULL,
        method      TEXT NOT NULL DEFAULT 'cash',
        note        TEXT,
        paid_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_inst_payments ON inst_payments (company_id, plan_id, paid_at DESC);

      CREATE TABLE IF NOT EXISTS inst_reminders (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        plan_id     INTEGER NOT NULL REFERENCES inst_plans(id) ON DELETE CASCADE,
        channel     TEXT NOT NULL DEFAULT 'whatsapp',
        amount      NUMERIC(12,2),
        body        TEXT,
        sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_inst_reminders ON inst_reminders (company_id, plan_id, sent_at DESC);
    `);

    // The unique index behind the schedule: one row per instalment number per
    // plan. Without it, an edit that regenerates a schedule while an old one is
    // still there doubles every instalment and the customer's statement shows a
    // debt twice the size of the one they agreed to.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_inst_one_seq_per_plan
        ON inst_items (plan_id, seq);
    `);

    console.log('Installments (Qastly) schema ready.');
  } catch (err) {
    console.error('[installments schema]', err.message);
  } finally {
    client.release();
  }
}

module.exports = { ensureInstallmentsSchema };
