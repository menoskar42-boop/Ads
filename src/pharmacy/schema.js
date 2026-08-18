// Pharmacy module schema + demo seed.
//
// Pharmacies reuse the existing multi-tenant `companies` table with
// page_type = 'pharmacy' (a third type next to 'portfolio' and 'shop'), so
// each pharmacy gets its own slug.oscardevs.com page and its own admin — the
// same model OscarDevs already uses. These extra tables hold the pharmacy-
// specific data (global medicine catalog, per-pharmacy inventory, online
// orders, POS sales, staff, settings).
//
// All statements are additive and idempotent (CREATE TABLE / ADD COLUMN IF
// NOT EXISTS) so it is safe to run on every boot against the shared prod DB,
// exactly like the core initDb() migration.

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DEMO_SLUG = 'pharmacy';
// Demo login for the sample pharmacy so the admin area can be tried out.
const DEMO_EMAIL = 'pharmacy@demo.oscardevs.com';
// The demo password comes from the environment, never from this file.
// It used to be a literal here, which meant a public repository published a
// working login for a live demo tenant — anybody could sign in and edit it.
// With no variable set, no demo user is created at all: a demo nobody can log
// into is a small loss, a demo everybody can log into is not.
const DEMO_PASSWORD = process.env.DEMO_PHARMACY_PASSWORD || process.env.DEMO_PASSWORD || null;

// A small starter set of well-known medicines sold in Egypt, used to seed the
// global catalog the first time (pharmacy admins add/extend their own later).
const SEED_MEDICINES = [
  { ar: 'بنادول إكسترا', en: 'Panadol Extra', form: 'أقراص', maker: 'GSK', price: 30 },
  { ar: 'بروفين 400', en: 'Brufen 400', form: 'أقراص', maker: 'Kahira', price: 27 },
  { ar: 'كتافلام 50', en: 'Cataflam 50', form: 'أقراص', maker: 'Novartis', price: 34 },
  { ar: 'أوجمنتين 1g', en: 'Augmentin 1g', form: 'أقراص', maker: 'GSK', price: 96 },
  { ar: 'كومتركس', en: 'Comtrex', form: 'أقراص', maker: 'Bristol', price: 25 },
  { ar: 'كونجستال', en: 'Congestal', form: 'أقراص', maker: 'Sigma', price: 20 },
  { ar: 'أنتينال', en: 'Antinal', form: 'كبسول', maker: 'Amoun', price: 22 },
  { ar: 'فيفادول', en: 'Fevadol', form: 'أقراص', maker: 'SPIMACO', price: 18 },
  { ar: 'فلاجيل 500', en: 'Flagyl 500', form: 'أقراص', maker: 'Sanofi', price: 15 },
  { ar: 'فولتارين 50', en: 'Voltaren 50', form: 'أقراص', maker: 'Novartis', price: 30 },
  { ar: 'تلفاست 180', en: 'Telfast 180', form: 'أقراص', maker: 'Sanofi', price: 78 },
  { ar: 'ريفو 500', en: 'Rivo 500', form: 'فوار', maker: 'Amoun', price: 12 },
  { ar: 'فيتامين سي 1000', en: 'Vitamin C 1000', form: 'فوار', maker: 'Various', price: 35 },
  { ar: 'زنك شراب', en: 'Zinc Syrup', form: 'شراب', maker: 'EIPICO', price: 24 },
  { ar: 'كلاريتين', en: 'Claritine', form: 'أقراص', maker: 'Bayer', price: 55 },
];

async function ensurePharmacySchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query(`
      -- Global medicine catalog (shared by all pharmacies).
      CREATE TABLE IF NOT EXISTS medicines (
        id SERIAL PRIMARY KEY,
        name_ar TEXT NOT NULL,
        name_en TEXT,
        barcode TEXT,
        manufacturer TEXT,
        form TEXT,
        unit TEXT,
        default_price NUMERIC(10,2),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_medicines_name_ar ON medicines (name_ar);
      CREATE INDEX IF NOT EXISTS idx_medicines_name_en ON medicines (name_en);
      CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines (barcode);
      -- Extra fields carried from the public Egyptian drug database + a stable
      -- source_key so the automatic importer can upsert (update prices) instead
      -- of duplicating on every refresh. NULL source_key = manually-added rows.
      ALTER TABLE medicines ADD COLUMN IF NOT EXISTS scientific_name TEXT;
      ALTER TABLE medicines ADD COLUMN IF NOT EXISTS drug_class TEXT;
      ALTER TABLE medicines ADD COLUMN IF NOT EXISTS source_key TEXT;
      ALTER TABLE medicines ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
      CREATE UNIQUE INDEX IF NOT EXISTS idx_medicines_source_key ON medicines (source_key);
      CREATE INDEX IF NOT EXISTS idx_medicines_sci ON medicines (scientific_name);

      -- Tiny key/value store for app-wide metadata (e.g. last catalog sync
      -- time) so the auto-importer knows whether a refresh is due.
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      -- Per-pharmacy stock. reserved_qty backs the "reserve when ordered
      -- online" rule so an item held for a web order isn't sold at the counter.
      CREATE TABLE IF NOT EXISTS pharmacy_inventory (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        medicine_id INTEGER REFERENCES medicines(id),
        qty INTEGER NOT NULL DEFAULT 0,
        reserved_qty INTEGER NOT NULL DEFAULT 0,
        price NUMERIC(10,2),
        cost NUMERIC(10,2),
        min_qty INTEGER DEFAULT 0,
        expiry DATE,
        barcode TEXT,
        updated_at TIMESTAMPTZ DEFAULT now(),
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_pharm_inv_company ON pharmacy_inventory (company_id);
      CREATE INDEX IF NOT EXISTS idx_pharm_inv_med ON pharmacy_inventory (medicine_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pharm_inv_uniq ON pharmacy_inventory (company_id, medicine_id);
      -- Optional product photo + description for the storefront card (per-pharmacy).
      ALTER TABLE pharmacy_inventory ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE pharmacy_inventory ADD COLUMN IF NOT EXISTS description TEXT;

      /* Batches (تشغيلات).
       *
       * The inventory row above is ONE row per medicine with ONE expiry date and
       * ONE cost. A pharmacy does not work that way: the same medicine arrives in
       * batches, each with its own lot number, its own expiry and its own price
       * from the supplier. Without this there is no way to answer "which lot is
       * this box from", no way to pull a recalled lot off the shelf, no way to
       * sell the nearest-expiry stock first, and no true cost per sale.
       *
       * The design decision that keeps this from being a rewrite: batches are a
       * DETAIL layer under the aggregate, not a replacement for it.
       * pharmacy_inventory.qty stays the number the till, the storefront and the
       * reservations all read, exactly as before. A pharmacy that does not track
       * lots simply has no batch rows and behaves precisely as it does today.
       * Where batches DO exist they are consumed nearest-expiry-first, and the
       * part of the stock no batch covers is shown as untracked rather than
       * quietly implied to be zero.
       *
       * Nearest EXPIRY, not first received: for medicine, FEFO is the correct
       * rule and FIFO is the wrong one. A box received last month that expires
       * next week must go before one received today that expires next year.
       */
      CREATE TABLE IF NOT EXISTS pharmacy_batches (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        medicine_id  INTEGER NOT NULL REFERENCES medicines(id),
        batch_no     TEXT,
        expiry       DATE,
        qty          INTEGER NOT NULL DEFAULT 0,
        cost         NUMERIC(10,2),
        supplier     TEXT,
        -- A recalled or quarantined lot is still physically on the premises and
        -- still has to be counted and returned to the supplier, so it is not
        -- deleted — it is taken out of what may be sold.
        status       TEXT NOT NULL DEFAULT 'active',   -- active | recalled
        recall_note  TEXT,
        received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_pharm_batch_med
        ON pharmacy_batches (company_id, medicine_id, expiry);
      -- The dispensing order, as an index: nearest expiry first, and a batch
      -- with no expiry date last (an unknown date is not an early one).
      CREATE INDEX IF NOT EXISTS idx_pharm_batch_fefo
        ON pharmacy_batches (company_id, medicine_id, expiry NULLS LAST, id)
        WHERE status = 'active' AND qty > 0;

      -- Which batch each sold line came out of. This is the record that answers
      -- "who did we sell the recalled lot to" — the question a recall is.
      CREATE TABLE IF NOT EXISTS pharmacy_sale_batches (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        batch_id     INTEGER REFERENCES pharmacy_batches(id) ON DELETE SET NULL,
        medicine_id  INTEGER,
        sale_id      INTEGER,
        order_id     INTEGER,
        qty          INTEGER NOT NULL DEFAULT 0,
        cost         NUMERIC(10,2),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_pharm_sale_batch
        ON pharmacy_sale_batches (company_id, batch_id, created_at DESC);

      -- Online orders (patient -> pharmacy).
      CREATE TABLE IF NOT EXISTS pharmacy_orders (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        customer_name TEXT,
        customer_phone TEXT,
        customer_address TEXT,
        total_amount NUMERIC(10,2) DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_pharm_orders_company ON pharmacy_orders (company_id);

      CREATE TABLE IF NOT EXISTS pharmacy_order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES pharmacy_orders(id) ON DELETE CASCADE,
        medicine_id INTEGER REFERENCES medicines(id),
        name TEXT,
        qty INTEGER NOT NULL DEFAULT 1,
        price NUMERIC(10,2)
      );
      -- Unguessable token for the customer order-tracking page.
      ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS track_token TEXT;
      CREATE INDEX IF NOT EXISTS idx_pharm_orders_token ON pharmacy_orders (track_token);

      -- Customer push subscriptions, tied to a single order, so the patient
      -- gets a notification when the pharmacy updates the status (Talabat-style).
      CREATE TABLE IF NOT EXISTS pharmacy_order_subs (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES pharmacy_orders(id) ON DELETE CASCADE,
        endpoint TEXT UNIQUE,
        p256dh TEXT,
        auth TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Audit trail: who changed an order's status and when.
      CREATE TABLE IF NOT EXISTS pharmacy_order_events (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES pharmacy_orders(id) ON DELETE CASCADE,
        status TEXT,
        actor TEXT,
        actor_role TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_pharm_order_events_order ON pharmacy_order_events (order_id);

      -- (pharmacy_staff extras moved below its CREATE — see note there.)
      -- Optional per-order assignment to a delivery driver (used by GPS phase).
      ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS assigned_staff INTEGER;
      -- Live delivery-driver location for an out-for-delivery order (GPS phase),
      -- shown to the pharmacy and the customer on a map.
      ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS driver_lat NUMERIC(9,6);
      ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS driver_lng NUMERIC(9,6);
      ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS driver_loc_at TIMESTAMPTZ;

      -- POS movements: sale (صادر) / purchase (وارد) / adjust. offline_uid gives
      -- idempotent replay when the offline POS syncs queued transactions.
      CREATE TABLE IF NOT EXISTS pharmacy_sales (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'sale',
        total_amount NUMERIC(10,2) DEFAULT 0,
        profit NUMERIC(10,2) DEFAULT 0,
        staff_id INTEGER,
        offline_uid TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_pharm_sales_company ON pharmacy_sales (company_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pharm_sales_offline
        ON pharmacy_sales (company_id, offline_uid) WHERE offline_uid IS NOT NULL;
      -- An offline sale that took more off the shelf than the system thought
      -- was there. The sale still stands (the customer left with the box) —
      -- but somebody has to go and count that shelf, so it is flagged instead
      -- of being floored at zero in silence.
      ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS review_note TEXT;
      ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_pharm_sales_review
        ON pharmacy_sales (company_id, created_at DESC) WHERE needs_review;

      /* Returns (مرتجعات).
       *
       * A pharmacy takes returns every day and there was nowhere to record one,
       * so the day's takings counted money that had already gone back over the
       * counter, and the shelf count stayed short of a box that was standing on
       * it. Both numbers were wrong, quietly, every day.
       *
       * A return is a row in this same table with kind='return', so the takings
       * are a plain SUM and net themselves. The convention, stated once here
       * because it is the sort of thing that gets guessed wrong later: the
       * HEADER carries signed money — a return's total_amount and profit are
       * NEGATIVE, money leaving the till — while the ITEM rows carry positive
       * quantities and the kind column says which way the boxes moved.
       *
       * (No backticks in this comment. It lives INSIDE a JS template literal,
       * and one of them ends the template two hundred lines early — which is
       * how this file stopped parsing at all, and with it the whole server.)
       *
       * ref_sale_id ties it to what was actually sold, so nobody can return
       * three of something that was sold twice.
       */
      ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS ref_sale_id INTEGER;
      -- Whether the goods went back on the shelf. Not every return is
      -- resellable — an opened box, or a fridge item that spent the afternoon
      -- in a car, is a loss and not stock. The pharmacist decides per return,
      -- and 'false' is the one that costs money, so it is never the default by
      -- accident.
      ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS restock BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS reason TEXT;
      CREATE INDEX IF NOT EXISTS idx_pharm_sales_ref
        ON pharmacy_sales (company_id, ref_sale_id) WHERE ref_sale_id IS NOT NULL;

      /* Discounts, and who allowed them.
       *
       * A cashier who can discount without limit can hand the shop away one
       * pound at a time, and a cashier who cannot discount at all sends every
       * regular customer to find the owner. So there is a per-pharmacy ceiling
       * a cashier may apply alone, and anything above it needs a manager to
       * sign in — on the spot, at the till.
       *
       * The amount is stored as well as the percent, because the percent is the
       * input and the money is the fact. Recomputing "15% of what it was" later
       * needs a price that may since have changed.
       */
      ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
      -- Who approved an over-limit discount. NULL means it was within the
      -- cashier's own ceiling and needed nobody.
      ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS discount_by INTEGER;
      ALTER TABLE pharmacy_sales ADD COLUMN IF NOT EXISTS discount_by_name TEXT;

      CREATE TABLE IF NOT EXISTS pharmacy_sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER REFERENCES pharmacy_sales(id) ON DELETE CASCADE,
        medicine_id INTEGER REFERENCES medicines(id),
        name TEXT,
        qty INTEGER NOT NULL DEFAULT 1,
        price NUMERIC(10,2),
        cost NUMERIC(10,2)
      );

      -- Staff with role + finance visibility (a "seller" cashier never sees
      -- profits/finance — can_see_finance = false).
      CREATE TABLE IF NOT EXISTS pharmacy_staff (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT,
        username TEXT,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'cashier',
        can_see_finance BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_pharm_staff_company ON pharmacy_staff (company_id);
      -- Staff extras: contact phone + sales commission percent. These must come
      -- AFTER the CREATE above: the whole block is one statement string, so an
      -- ALTER on a table that does not exist yet aborts everything after it —
      -- on a fresh database that silently skips the rest of the schema.
      ALTER TABLE pharmacy_staff ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE pharmacy_staff ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(5,2) DEFAULT 0;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pharm_staff_username ON pharmacy_staff (lower(username));

      -- Per-pharmacy settings (online store toggle, delivery, hours…).
      CREATE TABLE IF NOT EXISTS pharmacy_settings (
        company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        online_store_enabled BOOLEAN DEFAULT false,
        delivery_enabled BOOLEAN DEFAULT true,
        delivery_fee NUMERIC(10,2) DEFAULT 0,
        open_hour INTEGER,
        close_hour INTEGER,
        is_night_shift BOOLEAN DEFAULT false,
        whatsapp TEXT,
        address TEXT,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      -- Optional map location for local/GEO SEO (Google Maps, "pharmacy near me",
      -- and Schema.org geo). Set by the pharmacy from the settings map picker.
      ALTER TABLE pharmacy_settings ADD COLUMN IF NOT EXISTS lat NUMERIC(9,6);
      ALTER TABLE pharmacy_settings ADD COLUMN IF NOT EXISTS lng NUMERIC(9,6);
      -- Storefront: show product photos, or list medicines as names only.
      ALTER TABLE pharmacy_settings ADD COLUMN IF NOT EXISTS show_images BOOLEAN DEFAULT true;
      -- The most a cashier may discount at the till without a manager signing
      -- in. Zero by default: a pharmacy that has not thought about this has not
      -- authorised anybody to give money away. (Lives here and not with the
      -- sales columns above, because the ALTER has to follow its own CREATE.)
      ALTER TABLE pharmacy_settings ADD COLUMN IF NOT EXISTS cashier_discount_max NUMERIC(5,2) NOT NULL DEFAULT 0;
    `);

    await enforceReservedNeverExceedsQty(client);
    await seedCatalog(client);
    await seedDemoPharmacy(client);
    console.log('Pharmacy schema ready.');
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * reserved_qty must never exceed qty.
 *
 * Availability is `qty - reserved_qty` everywhere, and every screen wraps it in
 * `GREATEST(…, 0)` — so when a recalled lot cut qty and left the holds behind,
 * the number read as a harmless zero while the row said the shelf owed eight
 * boxes it did not have. Then the inventory form refused to let the pharmacist
 * correct the count, "because 8 are reserved", for orders that could never be
 * filled from a recalled lot. The bug hid itself and blocked its own fix.
 *
 * Every path that lowers qty now lowers the holds with it. This repairs rows
 * written before that and then makes the invariant a rule the database keeps,
 * so the next path to touch qty cannot get it wrong quietly.
 *
 * The constraint is added inside its own try: a row that still violates it
 * would otherwise stop the whole schema boot, and being unable to start is a
 * worse outcome than a wrong reserved count on one medicine.
 */
async function enforceReservedNeverExceedsQty(client) {
  try {
    const fixed = await client.query(
      'UPDATE pharmacy_inventory SET reserved_qty = qty WHERE reserved_qty > qty'
    );
    if (fixed.rowCount) {
      console.log(`Pharmacy: repaired ${fixed.rowCount} row(s) where reserved stock exceeded the shelf.`);
    }
  } catch (e) {
    console.error('[pharmacy reserved repair]', e.message);
  }
  try {
    await client.query(`
      ALTER TABLE pharmacy_inventory
        ADD CONSTRAINT pharmacy_inventory_reserved_le_qty CHECK (reserved_qty <= qty) NOT VALID;
    `);
  } catch (e) {
    // Already there is the normal case on every boot after the first.
    if (!/already exists/i.test(e.message)) console.error('[pharmacy reserved check]', e.message);
  }
}

// Seed the shared catalog additively: insert any medicine from the list that
// isn't already there (matched by Arabic name), so extending SEED_MEDICINES
// adds the new ones on the next boot without duplicating existing rows.
async function seedCatalog(client) {
  let added = 0;
  for (const m of SEED_MEDICINES) {
    const r = await client.query(
      `INSERT INTO medicines (name_ar, name_en, manufacturer, form, unit, default_price)
       SELECT $1,$2,$3,$4,'علبة',$5
       WHERE NOT EXISTS (SELECT 1 FROM medicines WHERE name_ar = $1)`,
      [m.ar, m.en, m.maker, m.form, m.price]
    );
    added += r.rowCount || 0;
  }
  if (added) console.log(`Seeded ${added} new medicines.`);
}

// Seed a demo pharmacy tenant (slug 'pharmacy') the first time, so
// pharmacy.oscardevs.com resolves to a working sample the owner can try —
// kept off the homepage until the product is complete.
async function seedDemoPharmacy(client) {
  const existing = await client.query('SELECT id FROM companies WHERE slug = $1', [DEMO_SLUG]);
  let companyId;
  if (existing.rows.length) {
    companyId = existing.rows[0].id;
  } else {
    const ins = await client.query(
      `INSERT INTO companies (slug, company_name, description, page_type, theme_color, is_active)
       VALUES ($1,$2,$3,'pharmacy','#0e7c66', true) RETURNING id`,
      [
        DEMO_SLUG,
        'صيدلية أوسكار — نموذج تجريبي',
        'صيدلية تجريبية لتجربة نظام إدارة الصيدليات من OscarDevs: بحث بالأدوية، توافر لحظي، وطلب أونلاين.',
      ]
    );
    companyId = ins.rows[0].id;
  }

  // Settings (online store ON for the demo so ordering is visible).
  await client.query(
    `INSERT INTO pharmacy_settings (company_id, online_store_enabled, delivery_enabled, whatsapp, address, is_night_shift)
     VALUES ($1, true, true, '201552406406', 'أسيوط، مصر', true)
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId]
  );

  // Demo login (only if the pharmacy has no user yet) so the /pharmacy admin
  // area can be tried. Safe: fake pharmacy, no real customer data.
  const hasUser = await client.query('SELECT 1 FROM company_users WHERE company_id = $1 LIMIT 1', [companyId]);
  if (!hasUser.rows.length && DEMO_PASSWORD) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await client.query(
      `INSERT INTO company_users (company_id, email, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO NOTHING`,
      [companyId, DEMO_EMAIL, hash]
    );
    console.log('Seeded demo pharmacy login:', DEMO_EMAIL);
  }

  // Give the demo pharmacy stock for the seeded catalog (only if it has none).
  const invCount = await client.query(
    'SELECT COUNT(*)::int AS n FROM pharmacy_inventory WHERE company_id = $1',
    [companyId]
  );
  if (invCount.rows[0].n === 0) {
    // Only stock a handful for the demo — the full imported catalog can be
    // ~25k rows, we don't want that many inventory rows for the sample.
    const meds = await client.query('SELECT id, default_price FROM medicines ORDER BY id LIMIT 30');
    let i = 0;
    for (const med of meds.rows) {
      // vary stock so the demo shows in-stock / low / out states
      const qty = [12, 4, 0, 30, 7][i % 5];
      const price = Number(med.default_price) || 20;
      await client.query(
        `INSERT INTO pharmacy_inventory (company_id, medicine_id, qty, price, cost, min_qty, expiry)
         VALUES ($1,$2,$3,$4,$5,5, now() + interval '10 months')
         ON CONFLICT (company_id, medicine_id) DO NOTHING`,
        [companyId, med.id, qty, price, Math.round(price * 0.7 * 100) / 100]
      );
      i++;
    }
    console.log('Seeded demo pharmacy inventory.');
  }

  // Seed a couple of demo banner slides so the storefront carousel is visible
  // on the sample (self-contained SVG data-URIs — no external image needed).
  const hasBanner = await client.query('SELECT 1 FROM banner_slides WHERE company_id = $1 LIMIT 1', [companyId]);
  if (!hasBanner.rows.length) {
    const demo = [
      { img: svgBanner('#0e7c66', '#0c3b36'), cap: 'توصيل سريع لكل مناطق أسيوط خلال 45 دقيقة' },
      { img: svgBanner('#e8734a', '#c85630'), cap: 'خصومات على أدوية البرد والمناعة' },
    ];
    let bi = 0;
    for (const b of demo) {
      await client.query(
        'INSERT INTO banner_slides (company_id, image_url, caption, order_index) VALUES ($1,$2,$3,$4)',
        [companyId, b.img, b.cap, bi++]
      );
    }
    console.log('Seeded demo pharmacy banners.');
  }
}

// Build a self-contained gradient banner as an SVG data-URI (no external file).
function svgBanner(c1, c2) {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='600'>"
    + "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
    + "<stop offset='0' stop-color='" + c1 + "'/><stop offset='1' stop-color='" + c2 + "'/>"
    + "</linearGradient></defs><rect width='1600' height='600' fill='url(#g)'/></svg>";
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

module.exports = { ensurePharmacySchema, DEMO_SLUG };
