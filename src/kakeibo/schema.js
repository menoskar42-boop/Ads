// Kakeibo (kakeibo.oscardevs.com) — schema. A separate AI financial-coach product
// on the OscarDevs platform, namespaced with `kkb_` so it never touches the
// merchant/tenant tables. Additive & idempotent (safe on every boot).
const { Pool } = require('pg');

async function ensureKakeiboSchema() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`
      -- Accounts (email/password or guest). Google/Apple login added later.
      CREATE TABLE IF NOT EXISTS kkb_users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        display_name TEXT,
        is_guest BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- One profile per user (onboarding data + preferences).
      CREATE TABLE IF NOT EXISTS kkb_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES kkb_users(id) ON DELETE CASCADE,
        monthly_income NUMERIC(14,2) DEFAULT 0,
        salary_day INTEGER DEFAULT 1,          -- day of month the salary lands
        currency TEXT DEFAULT 'EGP',
        saving_goal NUMERIC(14,2) DEFAULT 0,   -- monthly saving target
        lang TEXT DEFAULT 'ar',
        theme TEXT DEFAULT 'system',           -- system | light | dark
        onboarded BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Expenses (the Kakeibo ledger).
      CREATE TABLE IF NOT EXISTS kkb_expenses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES kkb_users(id) ON DELETE CASCADE,
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        description TEXT,
        category TEXT DEFAULT 'other',         -- needs/food/transport/bills/entertainment/health/shopping/investment/other
        payment_method TEXT DEFAULT 'cash',    -- cash/card/wallet/transfer/other
        receipt_url TEXT,
        spent_on DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_kkb_exp_user ON kkb_expenses (user_id);
      CREATE INDEX IF NOT EXISTS idx_kkb_exp_user_date ON kkb_expenses (user_id, spent_on);

      -- Salary schedule type: 'fixed' (salary_day), 'last' (last day of month),
      -- 'before_last' (day before last). Payday is shifted earlier off weekends.
      ALTER TABLE kkb_profiles ADD COLUMN IF NOT EXISTS salary_type TEXT DEFAULT 'fixed';
      -- Weekend definition for the payday shift (varies by country):
      -- 'fri_sat' | 'fri' | 'sat_sun' | 'sun' | 'none'.
      ALTER TABLE kkb_profiles ADD COLUMN IF NOT EXISTS weekend TEXT DEFAULT 'fri_sat';
      -- Country for official public-holiday shifting (ISO-ish code: EG/SA/AE…).
      ALTER TABLE kkb_profiles ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'EG';

      -- Custom / user-added holidays (any org's days off). Combined with the
      -- built-in national list for the payday shift.
      CREATE TABLE IF NOT EXISTS kkb_holidays (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES kkb_users(id) ON DELETE CASCADE,
        holiday_on DATE NOT NULL,
        label TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_kkb_hol_user ON kkb_holidays (user_id, holiday_on);
    `);
    console.log('Kakeibo schema ready.');
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { ensureKakeiboSchema };
