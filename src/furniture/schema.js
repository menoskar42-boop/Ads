// Furniture showroom + workshop vertical.
//
// Reuses the multi-tenant `companies` table with page_type = 'furniture', so
// every showroom gets its own slug.oscardevs.com page, admin and subscription.
// EVERY table below carries company_id: the spec this was built from described a
// single-owner app, but this is sold to many showrooms, and a table without a
// tenant column is one JOIN away from showing one workshop another's costs.
//
// All statements are additive and idempotent (CREATE TABLE / ADD COLUMN
// IF NOT EXISTS). Ordering matters: an ALTER that precedes its CREATE aborts
// every statement after it in the same string — see scripts/check-schema-order.js.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureFurnitureSchema() {
  const client = await pool.connect();
  try {
    // ── Settings + feature flags ─────────────────────────────────────────────
    await client.query(`
      -- Per-showroom settings. Currency and tax live here rather than in code
      -- because a workshop that never charges VAT should not see a tax line.
      CREATE TABLE IF NOT EXISTS furniture_settings (
        company_id   INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        business_name TEXT,
        logo_url     TEXT,
        address      TEXT,
        phone        TEXT,
        whatsapp     TEXT,
        currency     TEXT NOT NULL DEFAULT 'EGP',
        tax_percent  NUMERIC(5,2) NOT NULL DEFAULT 0,
        theme        TEXT NOT NULL DEFAULT 'light',
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- One row per optional feature per showroom, so each toggles independently.
      CREATE TABLE IF NOT EXISTS furniture_flags (
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        flag_key    TEXT NOT NULL,
        enabled     BOOLEAN NOT NULL DEFAULT false,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (company_id, flag_key)
      );
    `);

    // ── Master data ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS furniture_suppliers (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        phone      TEXT,
        address    TEXT,
        note       TEXT,
        is_active  BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_suppliers ON furniture_suppliers (company_id, name);

      CREATE TABLE IF NOT EXISTS furniture_customers (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        phone      TEXT,
        address    TEXT,
        note       TEXT,
        is_active  BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_customers ON furniture_customers (company_id, name);

      -- pay_type drives payroll: a daily labourer, a weekly foreman and a
      -- piece-rate carpenter are all paid from the same run but not the same way.
      CREATE TABLE IF NOT EXISTS furniture_workers (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        phone      TEXT,
        job_title  TEXT,
        pay_type   TEXT NOT NULL DEFAULT 'daily',   -- daily | weekly | piece
        pay_rate   NUMERIC(12,2) NOT NULL DEFAULT 0,
        is_active  BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_workers ON furniture_workers (company_id, is_active);

      -- avg_cost is the moving average used to value stock; last_purchase_price
      -- is what it cost most recently. Quoting from one and valuing from the
      -- other is the difference between a real margin and a guessed one.
      CREATE TABLE IF NOT EXISTS furniture_materials (
        id                   SERIAL PRIMARY KEY,
        company_id           INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name                 TEXT NOT NULL,
        unit                 TEXT NOT NULL DEFAULT 'قطعة',
        qty                  NUMERIC(14,3) NOT NULL DEFAULT 0,
        min_qty              NUMERIC(14,3) NOT NULL DEFAULT 0,
        last_purchase_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
        avg_cost             NUMERIC(12,2) NOT NULL DEFAULT 0,
        is_active            BOOLEAN NOT NULL DEFAULT true,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_materials ON furniture_materials (company_id, name);

      CREATE TABLE IF NOT EXISTS furniture_products (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name           TEXT NOT NULL,
        category       TEXT,
        selling_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
        estimated_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
        notes          TEXT,
        image_path     TEXT,
        is_active      BOOLEAN NOT NULL DEFAULT true,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_products ON furniture_products (company_id, name);

      -- Master data is archived, never deleted, once it has history: a supplier
      -- with past orders must still name itself on those orders. Added by ALTER
      -- as well as in the CREATE above so a database made before this change
      -- picks the column up too.
      ALTER TABLE furniture_customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
    `);

    // ── Purchasing + stock ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS furniture_purchase_orders (
        id                SERIAL PRIMARY KEY,
        company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        supplier_id       INTEGER REFERENCES furniture_suppliers(id) ON DELETE SET NULL,
        order_date        DATE NOT NULL DEFAULT CURRENT_DATE,
        expected_delivery DATE,
        status            TEXT NOT NULL DEFAULT 'pending',
                          -- pending | partial | delivered | cancelled
        total             NUMERIC(14,2) NOT NULL DEFAULT 0,
        paid              NUMERIC(14,2) NOT NULL DEFAULT 0,
        note              TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_po ON furniture_purchase_orders (company_id, status, order_date);

      -- qty_received is tracked per line, not per order: a supplier delivering
      -- the wood but not the handles is the normal case, not the exception.
      CREATE TABLE IF NOT EXISTS furniture_purchase_order_items (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        po_id        INTEGER NOT NULL REFERENCES furniture_purchase_orders(id) ON DELETE CASCADE,
        material_id  INTEGER REFERENCES furniture_materials(id) ON DELETE SET NULL,
        qty          NUMERIC(14,3) NOT NULL DEFAULT 0,
        qty_received NUMERIC(14,3) NOT NULL DEFAULT 0,
        unit         TEXT,
        unit_cost    NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_cost   NUMERIC(14,2) NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_furn_po_items ON furniture_purchase_order_items (po_id);

      CREATE TABLE IF NOT EXISTS furniture_supplier_payments (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        supplier_id INTEGER REFERENCES furniture_suppliers(id) ON DELETE SET NULL,
        amount      NUMERIC(14,2) NOT NULL,
        pay_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_supp_pay ON furniture_supplier_payments (company_id, supplier_id);

      -- Every change to a material's quantity leaves a row here, whatever caused
      -- it. Without this a wrong stock figure has no story and cannot be traced.
      CREATE TABLE IF NOT EXISTS furniture_stock_movements (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        material_id INTEGER REFERENCES furniture_materials(id) ON DELETE SET NULL,
        move_type   TEXT NOT NULL,          -- in | out | adjust
        qty         NUMERIC(14,3) NOT NULL,
        ref_type    TEXT,                   -- purchase_order | sale | manual …
        ref_id      INTEGER,
        move_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_moves ON furniture_stock_movements (company_id, material_id, move_date);
    `);

    // ── Bill of materials ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS furniture_product_components (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        product_id  INTEGER NOT NULL REFERENCES furniture_products(id) ON DELETE CASCADE,
        material_id INTEGER REFERENCES furniture_materials(id) ON DELETE SET NULL,
        qty_required NUMERIC(14,3) NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_furn_components ON furniture_product_components (product_id);
    `);

    // ── Sales ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS furniture_sales (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES furniture_customers(id) ON DELETE SET NULL,
        sale_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        subtotal    NUMERIC(14,2) NOT NULL DEFAULT 0,
        tax         NUMERIC(14,2) NOT NULL DEFAULT 0,
        total       NUMERIC(14,2) NOT NULL DEFAULT 0,
        paid        NUMERIC(14,2) NOT NULL DEFAULT 0,
        status      TEXT NOT NULL DEFAULT 'open',   -- open | paid | cancelled
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_sales ON furniture_sales (company_id, status, sale_date);

      CREATE TABLE IF NOT EXISTS furniture_sale_items (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        sale_id    INTEGER NOT NULL REFERENCES furniture_sales(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES furniture_products(id) ON DELETE SET NULL,
        qty        NUMERIC(14,3) NOT NULL DEFAULT 1,
        unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
        total      NUMERIC(14,2) NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_furn_sale_items ON furniture_sale_items (sale_id);

      -- A deposit then instalments is how furniture is actually bought here, so
      -- payments are their own rows rather than a single "paid" figure.
      CREATE TABLE IF NOT EXISTS furniture_customer_payments (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        sale_id     INTEGER REFERENCES furniture_sales(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES furniture_customers(id) ON DELETE SET NULL,
        amount      NUMERIC(14,2) NOT NULL,
        pay_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        method      TEXT NOT NULL DEFAULT 'cash',   -- cash | card | transfer
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_cust_pay ON furniture_customer_payments (company_id, customer_id);
    `);

    // ── People: attendance, payroll, canteen ─────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS furniture_attendance (
        id               SERIAL PRIMARY KEY,
        company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        worker_id        INTEGER NOT NULL REFERENCES furniture_workers(id) ON DELETE CASCADE,
        work_date        DATE NOT NULL,
        status           TEXT NOT NULL DEFAULT 'present',  -- present|absent|half|vacation
        permission_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
        note             TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- One record per worker per day: marking attendance twice must correct the
      -- day, not create a second one that quietly doubles a deduction.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_furn_attend_day
        ON furniture_attendance (company_id, worker_id, work_date);

      CREATE TABLE IF NOT EXISTS furniture_payroll_adjustments (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        worker_id  INTEGER NOT NULL REFERENCES furniture_workers(id) ON DELETE CASCADE,
        adj_type   TEXT NOT NULL,            -- bonus | penalty | advance
        amount     NUMERIC(12,2) NOT NULL,
        adj_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        note       TEXT,
        payroll_id INTEGER,                  -- set once swept into a run
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_adjust ON furniture_payroll_adjustments (company_id, worker_id, adj_date);

      CREATE TABLE IF NOT EXISTS furniture_canteen_purchases (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        worker_id  INTEGER NOT NULL REFERENCES furniture_workers(id) ON DELETE CASCADE,
        item       TEXT,
        amount     NUMERIC(12,2) NOT NULL,
        paid_cash  BOOLEAN NOT NULL DEFAULT false,  -- false = on account, deducted at payroll
        buy_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        payroll_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_canteen ON furniture_canteen_purchases (company_id, worker_id, paid_cash);

      -- Every component of the payslip is stored, not just the net. A worker who
      -- disputes a figure needs the breakdown that produced it, months later.
      CREATE TABLE IF NOT EXISTS furniture_payroll_runs (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        worker_id    INTEGER NOT NULL REFERENCES furniture_workers(id) ON DELETE CASCADE,
        period_start DATE NOT NULL,
        period_end   DATE NOT NULL,
        base         NUMERIC(12,2) NOT NULL DEFAULT 0,
        bonuses      NUMERIC(12,2) NOT NULL DEFAULT 0,
        penalties    NUMERIC(12,2) NOT NULL DEFAULT 0,
        advances     NUMERIC(12,2) NOT NULL DEFAULT 0,
        canteen      NUMERIC(12,2) NOT NULL DEFAULT 0,
        deductions   NUMERIC(12,2) NOT NULL DEFAULT 0,
        net          NUMERIC(12,2) NOT NULL DEFAULT 0,
        paid         BOOLEAN NOT NULL DEFAULT false,
        run_date     DATE NOT NULL DEFAULT CURRENT_DATE,
        note         TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_payroll ON furniture_payroll_runs (company_id, worker_id, period_start);
    `);

    // ── Returns (phase 8) ────────────────────────────────────────────────────
    await client.query(`
      -- A return is a CREDIT NOTE, not a deleted invoice. The original sale
      -- happened, the money moved, and the piece came back — erasing any of
      -- that would leave the customer's statement unable to explain itself.
      CREATE TABLE IF NOT EXISTS furniture_returns (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        sale_id     INTEGER REFERENCES furniture_sales(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES furniture_customers(id) ON DELETE SET NULL,
        return_date DATE NOT NULL DEFAULT CURRENT_DATE,
        total       NUMERIC(14,2) NOT NULL DEFAULT 0,
        -- Cash actually handed back. Kept apart from the total because
        -- crediting an account and paying money out are two different events,
        -- often days apart, and a workshop needs to see which have happened.
        refunded    NUMERIC(14,2) NOT NULL DEFAULT 0,
        reason      TEXT,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_returns ON furniture_returns (company_id, return_date);

      CREATE TABLE IF NOT EXISTS furniture_return_items (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        return_id  INTEGER NOT NULL REFERENCES furniture_returns(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES furniture_products(id) ON DELETE SET NULL,
        qty        NUMERIC(14,3) NOT NULL DEFAULT 1,
        unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
        total      NUMERIC(14,2) NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_furn_return_items ON furniture_return_items (return_id);
    `);

    // ── Delivery + installation (phase 8) ────────────────────────────────────
    await client.query(`
      -- A job the workshop owes someone on a date: deliver the piece, or go
      -- and install it. Kept apart from the invoice because the two have
      -- different lives — an invoice can be fully paid weeks before the wardrobe
      -- is fitted, and a delivery can be re-arranged three times without the
      -- money changing at all.
      CREATE TABLE IF NOT EXISTS furniture_deliveries (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        sale_id        INTEGER REFERENCES furniture_sales(id) ON DELETE SET NULL,
        customer_id    INTEGER REFERENCES furniture_customers(id) ON DELETE SET NULL,
        kind           TEXT NOT NULL DEFAULT 'delivery',   -- delivery | install
        scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
        slot           TEXT,                               -- morning | afternoon | evening
        status         TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | out | done | failed
        crew           TEXT,
        -- Copied, not joined: the customer's address on file may change, and a
        -- van sent last month went to the address written that day.
        address        TEXT,
        phone          TEXT,
        note           TEXT,
        done_at        TIMESTAMPTZ,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_deliveries ON furniture_deliveries (company_id, scheduled_date);
      CREATE INDEX IF NOT EXISTS idx_furn_deliveries_open ON furniture_deliveries (company_id, status);

      -- The trip is charged for. Two columns for the same reason returns have
      -- two: fee is what the customer owes for this trip, fee_paid is what has
      -- actually been handed over, and the gap between them is the point.
      ALTER TABLE furniture_deliveries ADD COLUMN IF NOT EXISTS fee      NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE furniture_deliveries ADD COLUMN IF NOT EXISTS fee_paid NUMERIC(12,2) NOT NULL DEFAULT 0;

      -- How this showroom sells: 'prepaid' means nothing leaves the workshop
      -- until the invoice AND the delivery fee are settled; 'cod' means the
      -- crew collects at the door. Default is prepaid — it is the safer of the
      -- two to be wrong about, because the piece is still in the building.
      ALTER TABLE furniture_settings ADD COLUMN IF NOT EXISTS delivery_policy TEXT NOT NULL DEFAULT 'prepaid';
    `);

    // ── Codes for labels (phase 8) ───────────────────────────────────────────
    await client.query(`
      -- The showroom's own code for a piece or a material. Free text, not a
      -- generated number: workshops already have codes written on the shelves,
      -- and a system that insists on its own makes them keep two.
      ALTER TABLE furniture_products  ADD COLUMN IF NOT EXISTS code TEXT;
      ALTER TABLE furniture_materials ADD COLUMN IF NOT EXISTS code TEXT;
      CREATE INDEX IF NOT EXISTS idx_furn_prod_code ON furniture_products (company_id, code);
      CREATE INDEX IF NOT EXISTS idx_furn_mat_code ON furniture_materials (company_id, code);
    `);

    // ── Warranty (phase 8) ───────────────────────────────────────────────────
    await client.query(`
      -- How long each piece is guaranteed for. Zero means no warranty, which
      -- is different from an unknown warranty and is the honest default: the
      -- system must not invent a guarantee the workshop never gave.
      ALTER TABLE furniture_products ADD COLUMN IF NOT EXISTS warranty_months INTEGER NOT NULL DEFAULT 0;

      -- One row per guaranteed piece sold.
      --
      -- starts_on is NULL until the piece is actually DELIVERED. A wardrobe
      -- that sat in the workshop for six weeks has not been in use for six
      -- weeks, and starting its guarantee at the invoice date quietly robs the
      -- customer of that time. The delivery marks it started.
      CREATE TABLE IF NOT EXISTS furniture_warranties (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        sale_id     INTEGER REFERENCES furniture_sales(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES furniture_customers(id) ON DELETE SET NULL,
        product_id  INTEGER REFERENCES furniture_products(id) ON DELETE SET NULL,
        -- Copied at the time of sale: the product's warranty may be changed
        -- later, but this customer was promised the figure printed that day.
        months      INTEGER NOT NULL DEFAULT 0,
        product_name TEXT,
        qty         NUMERIC(14,3) NOT NULL DEFAULT 1,
        starts_on   DATE,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_warranty ON furniture_warranties (company_id, starts_on);
      CREATE INDEX IF NOT EXISTS idx_furn_warranty_sale ON furniture_warranties (sale_id);
    `);

    // ── Expenses + audit ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS furniture_expenses (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        category   TEXT,
        amount     NUMERIC(14,2) NOT NULL,
        spend_date DATE NOT NULL DEFAULT CURRENT_DATE,
        note       TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_expenses ON furniture_expenses (company_id, spend_date);

      CREATE TABLE IF NOT EXISTS furniture_activity_log (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        actor      TEXT,
        action     TEXT NOT NULL,
        entity     TEXT,
        entity_id  INTEGER,
        detail     TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_furn_activity ON furniture_activity_log (company_id, created_at DESC);
    `);
  } finally {
    client.release();
  }
}

module.exports = { ensureFurnitureSchema };
