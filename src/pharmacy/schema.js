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
const DEMO_PASSWORD = 'pharmacy123';

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
    `);

    await seedCatalog(client);
    await seedDemoPharmacy(client);
    console.log('Pharmacy schema ready.');
  } finally {
    client.release();
    await pool.end();
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
  if (!hasUser.rows.length) {
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
