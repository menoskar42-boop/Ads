// Orders module schema + demo seed (page_type = 'orders').
//
// The third tenant type next to 'portfolio', 'shop' and 'pharmacy'. One
// merchant page can carry a restaurant and/or a supermarket outlet on the same
// slug.oscardevs.com page. All tables are prefixed `food_` so they never clash
// with the shop tables (products/orders/customers). Everything is additive and
// idempotent (CREATE TABLE / ADD COLUMN IF NOT EXISTS) so it is safe on every
// boot — same contract as the pharmacy module.

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DEMO_SLUG = 'orders';
const DEMO_EMAIL = 'orders@demo.oscardevs.com';
const DEMO_PASSWORD = 'orders123';

async function ensureFoodSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query(`
      -- One merchant's outlets: a restaurant and/or a supermarket.
      CREATE TABLE IF NOT EXISTS food_outlets (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        vertical TEXT NOT NULL DEFAULT 'restaurant',
        name TEXT NOT NULL,
        name_ar TEXT,
        description TEXT,
        image_url TEXT,
        opening_time TEXT DEFAULT '09:00',
        closing_time TEXT DEFAULT '23:00',
        delivery_fee NUMERIC(10,2) DEFAULT 0,
        delivery_time_min INTEGER DEFAULT 30,
        min_order NUMERIC(10,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_food_outlet_uniq ON food_outlets (company_id, vertical);

      CREATE TABLE IF NOT EXISTS food_categories (
        id SERIAL PRIMARY KEY,
        outlet_id INTEGER REFERENCES food_outlets(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        name_ar TEXT,
        sort_order INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_food_cat_outlet ON food_categories (outlet_id);

      CREATE TABLE IF NOT EXISTS food_items (
        id SERIAL PRIMARY KEY,
        outlet_id INTEGER REFERENCES food_outlets(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES food_categories(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        name_ar TEXT,
        description TEXT,
        price NUMERIC(10,2) NOT NULL DEFAULT 0,
        image_url TEXT,
        is_available BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_food_item_outlet ON food_items (outlet_id);
      CREATE INDEX IF NOT EXISTS idx_food_item_cat ON food_items (category_id);

      CREATE TABLE IF NOT EXISTS food_orders (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        outlet_id INTEGER REFERENCES food_outlets(id),
        customer_id INTEGER REFERENCES customers(id),
        customer_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        total NUMERIC(10,2) NOT NULL DEFAULT 0,
        delivery_fee NUMERIC(10,2) DEFAULT 0,
        delivery_address TEXT,
        phone TEXT,
        notes TEXT,
        coupon_code TEXT,
        discount_amount NUMERIC(10,2) DEFAULT 0,
        points_used INTEGER DEFAULT 0,
        points_discount NUMERIC(10,2) DEFAULT 0,
        payment_method TEXT DEFAULT 'cod',
        via_ai BOOLEAN DEFAULT false,
        track_token TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_food_orders_company ON food_orders (company_id);
      CREATE INDEX IF NOT EXISTS idx_food_orders_token ON food_orders (track_token);

      CREATE TABLE IF NOT EXISTS food_order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES food_orders(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES food_items(id),
        name_snapshot TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        price NUMERIC(10,2) NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS food_order_events (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES food_orders(id) ON DELETE CASCADE,
        status TEXT,
        note TEXT,
        actor TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_food_order_events_order ON food_order_events (order_id);

      CREATE TABLE IF NOT EXISTS food_coupons (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        code TEXT,
        discount_percent INTEGER,
        max_discount NUMERIC(10,2),
        min_order NUMERIC(10,2),
        usage_limit INTEGER,
        used_count INTEGER DEFAULT 0,
        expires_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT true
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_food_coupon_uniq ON food_coupons (company_id, code);

      CREATE TABLE IF NOT EXISTS food_reviews (
        id SERIAL PRIMARY KEY,
        outlet_id INTEGER REFERENCES food_outlets(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id),
        order_id INTEGER REFERENCES food_orders(id),
        rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_food_reviews_outlet ON food_reviews (outlet_id);

      CREATE TABLE IF NOT EXISTS food_favorites (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES food_items(id) ON DELETE CASCADE,
        UNIQUE(customer_id, item_id)
      );

      -- Paid AI-assistant subscription per merchant (site free, AI paid).
      CREATE TABLE IF NOT EXISTS food_ai_subscriptions (
        company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        plan TEXT DEFAULT 'none',
        status TEXT DEFAULT 'inactive',
        started_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        monthly_quota INTEGER DEFAULT 0,
        used_this_period INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS food_ai_messages (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER,
        role TEXT,
        content TEXT,
        tokens INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await seedDemoOrders(client);
    console.log('Orders (food) schema ready.');
  } finally {
    client.release();
    await pool.end();
  }
}

// A demo merchant (slug 'orders') with a restaurant + supermarket so
// orders.oscardevs.com resolves to a working sample — kept off the homepage
// until the vertical is complete.
async function seedDemoOrders(client) {
  const existing = await client.query('SELECT id FROM companies WHERE slug = $1', [DEMO_SLUG]);
  let companyId;
  if (existing.rows.length) {
    companyId = existing.rows[0].id;
  } else {
    const ins = await client.query(
      `INSERT INTO companies (slug, company_name, description, page_type, theme_color, is_active)
       VALUES ($1,$2,$3,'orders','#e8734a', true) RETURNING id`,
      [
        DEMO_SLUG,
        'مطعم وماركت أوسكار — نموذج تجريبي',
        'نموذج تجريبي لصفحة الطلبات من OscarDevs: منيو مطعم + سوبر ماركت وطلب أونلاين.',
      ]
    );
    companyId = ins.rows[0].id;
  }

  const hasOutlet = await client.query('SELECT 1 FROM food_outlets WHERE company_id = $1 LIMIT 1', [companyId]);
  if (!hasOutlet.rows.length) {
    // Restaurant outlet + menu.
    const rest = (await client.query(
      `INSERT INTO food_outlets (company_id, vertical, name, name_ar, description, delivery_fee, delivery_time_min, min_order)
       VALUES ($1,'restaurant',$2,$3,$4,15,30,50) RETURNING id`,
      [companyId, 'Oscar Restaurant', 'مطعم أوسكار', 'وجبات طازة وسريعة']
    )).rows[0].id;
    const rCat1 = (await client.query(`INSERT INTO food_categories (outlet_id, name, name_ar, sort_order) VALUES ($1,'Burgers','برجر',1) RETURNING id`, [rest])).rows[0].id;
    const rCat2 = (await client.query(`INSERT INTO food_categories (outlet_id, name, name_ar, sort_order) VALUES ($1,'Drinks','مشروبات',2) RETURNING id`, [rest])).rows[0].id;
    const restItems = [
      [rCat1, 'Beef Burger', 'برجر لحم', 'برجر لحم بلدي مع جبنة', 75],
      [rCat1, 'Chicken Burger', 'برجر فراخ', 'صدور فراخ مقرمشة', 65],
      [rCat1, 'Double Burger', 'برجر دابل', 'قطعتين لحم وجبنة', 110],
      [rCat2, 'Soft Drink', 'مشروب غازي', 'علبة 330 مل', 20],
      [rCat2, 'Fresh Juice', 'عصير طازة', 'برتقال أو مانجو', 35],
    ];
    for (const [cat, en, ar, desc, price] of restItems) {
      await client.query(
        `INSERT INTO food_items (outlet_id, category_id, name, name_ar, description, price) VALUES ($1,$2,$3,$4,$5,$6)`,
        [rest, cat, en, ar, desc, price]
      );
    }

    // Supermarket outlet + menu.
    const mkt = (await client.query(
      `INSERT INTO food_outlets (company_id, vertical, name, name_ar, description, delivery_fee, delivery_time_min, min_order)
       VALUES ($1,'supermarket',$2,$3,$4,20,45,100) RETURNING id`,
      [companyId, 'Oscar Market', 'ماركت أوسكار', 'بقالة ومستلزمات المنزل']
    )).rows[0].id;
    const mCat1 = (await client.query(`INSERT INTO food_categories (outlet_id, name, name_ar, sort_order) VALUES ($1,'Groceries','بقالة',1) RETURNING id`, [mkt])).rows[0].id;
    const mktItems = [
      [mCat1, 'Sugar 1kg', 'سكر ١ كيلو', '', 40],
      [mCat1, 'Cooking Oil 1L', 'زيت طعام ١ لتر', '', 70],
      [mCat1, 'Rice 1kg', 'أرز ١ كيلو', '', 45],
    ];
    for (const [cat, en, ar, desc, price] of mktItems) {
      await client.query(
        `INSERT INTO food_items (outlet_id, category_id, name, name_ar, description, price) VALUES ($1,$2,$3,$4,$5,$6)`,
        [mkt, cat, en, ar, desc, price]
      );
    }
    console.log('Seeded demo orders outlets + menu.');
  }

  // Demo login for the /company area (owner).
  const hasUser = await client.query('SELECT 1 FROM company_users WHERE company_id = $1 LIMIT 1', [companyId]);
  if (!hasUser.rows.length) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await client.query(
      `INSERT INTO company_users (company_id, email, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO NOTHING`,
      [companyId, DEMO_EMAIL, hash]
    );
    console.log('Seeded demo orders login:', DEMO_EMAIL);
  }

  // Give the demo merchant an active AI-assistant subscription so the paid
  // widget is demonstrable on the sample store (needs GROQ_API_KEY to actually
  // reply; without it the endpoint fails closed with a friendly message).
  await client.query(
    `INSERT INTO food_ai_subscriptions (company_id, plan, status, started_at, expires_at, monthly_quota, used_this_period)
     VALUES ($1,'demo','active', now(), now() + interval '365 days', 1000, 0)
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId]
  );
}

module.exports = { ensureFoodSchema, DEMO_SLUG };
