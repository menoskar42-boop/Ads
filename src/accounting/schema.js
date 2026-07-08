// Accounting + payments schema — a unified financial layer that works for every
// merchant type (shop / pharmacy / orders). Additive & idempotent (safe on every
// boot). Revenue is read from each vertical's own orders tables; this module adds
// the cost/expense/staff/tax/payment pieces on top.
const { Pool } = require('pg');

async function ensureAccountingSchema() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`
      -- Per-merchant financial settings (tax, auto-markup, delivery policy).
      CREATE TABLE IF NOT EXISTS accounting_settings (
        company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        tax_enabled BOOLEAN DEFAULT false,          -- default: NO tax (owner rule)
        tax_base TEXT DEFAULT 'profit',             -- 'profit' | 'sales'
        tax_rate NUMERIC(6,2) DEFAULT 14,           -- Egypt VAT default when enabled
        markup_enabled BOOLEAN DEFAULT false,       -- auto public price = cost × (1+markup)
        markup_percent NUMERIC(7,2) DEFAULT 30,
        delivery_enabled BOOLEAN DEFAULT false,     -- merchant delivery policy (shop/orders)
        delivery_fee NUMERIC(10,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Fixed / recurring expenses (salaries, rent, utilities, supplies…).
      CREATE TABLE IF NOT EXISTS merchant_expenses (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        label TEXT,
        category TEXT DEFAULT 'other',              -- salary/rent/utilities/supplies/other
        amount NUMERIC(12,2) DEFAULT 0,
        recurrence TEXT DEFAULT 'monthly',          -- 'monthly' | 'once'
        incurred_on DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_expenses_company ON merchant_expenses (company_id);

      -- Staff + commission rules (delivery / chef / receptionist / cashier…).
      CREATE TABLE IF NOT EXISTS merchant_staff (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT,
        role TEXT DEFAULT 'other',                  -- delivery/chef/receptionist/cashier/other
        commission_type TEXT DEFAULT 'none',        -- none/per_order/percent_sales/fixed_monthly
        commission_value NUMERIC(12,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_staff_company ON merchant_staff (company_id);

      -- Per-merchant payment configuration. Infrastructure is prepared for online
      -- gateways; manual methods (InstaPay / wallet / Payoneer / bank) work now.
      CREATE TABLE IF NOT EXISTS payment_settings (
        company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        cod_enabled BOOLEAN DEFAULT true,
        instapay_handle TEXT,                       -- InstaPay address (IPA)
        wallet_number TEXT,                         -- Vodafone/Etisalat/Orange Cash
        payoneer_email TEXT,
        bank_details TEXT,
        gateway TEXT DEFAULT 'none',                -- none/paymob/fawry/stripe/paypal (scaffold)
        gateway_public_key TEXT,
        gateway_config JSONB,                       -- provider-specific, kept generic
        instructions TEXT,                          -- shown to the buyer at checkout
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      -- Admin can rename/redefine the default method (e.g. "50% deposit + 50% on
      -- delivery"), add free-form custom methods, and choose whether enabling a
      -- gateway replaces the other methods or coexists with them.
      ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS cod_terms TEXT;
      ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS custom_methods TEXT;
      ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS gateway_exclusive BOOLEAN DEFAULT false;
      -- Per-merchant gateway credentials (each admin enters their OWN keys). The
      -- platform transacts with the merchant's own gateway account; nothing is
      -- shared/global. secret = API key; integration_id + iframe_id are Paymob's.
      ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS gateway_secret TEXT;
      ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS gateway_integration_id TEXT;
      ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS gateway_iframe_id TEXT;
      ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS gateway_hmac TEXT;

      -- Online-payment state on orders (COD orders stay 'unpaid'/'cod').
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_ref TEXT;
      ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
      ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS payment_ref TEXT;
      ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
      ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS payment_ref TEXT;

      -- Cost columns for COGS (pharmacy_inventory already has cost + price).
      ALTER TABLE products   ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) DEFAULT 0;
      ALTER TABLE food_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) DEFAULT 0;
      -- Pharmacy free samples: units received free (zero cost) that still get sold.
      ALTER TABLE pharmacy_inventory ADD COLUMN IF NOT EXISTS free_sample_qty INTEGER DEFAULT 0;
    `);
    console.log('Accounting + payments schema ready.');
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { ensureAccountingSchema };
