// Gym / fitness vertical schema + demo seed (competitor-informed roadmap).
// Gyms reuse the multi-tenant `companies` table with page_type = 'gym', so each
// gym gets its own slug.oscardevs.com page + admin + subscription. All statements
// are additive + idempotent (CREATE TABLE / ADD COLUMN IF NOT EXISTS).

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DEMO_SLUG = 'gym';
const DEMO_EMAIL = 'gym@demo.oscardevs.com';
// The demo password comes from the environment, never from this file.
// It used to be a literal here, which meant a public repository published a
// working login for a live demo tenant — anybody could sign in and edit it.
// With no variable set, no demo user is created at all: a demo nobody can log
// into is a small loss, a demo everybody can log into is not.
const DEMO_PASSWORD = process.env.DEMO_GYM_PASSWORD || process.env.DEMO_PASSWORD || null;

async function ensureGymSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Per-gym settings (about, contact, hours, self-booking toggle).
      CREATE TABLE IF NOT EXISTS gym_settings (
        company_id      INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        tagline         TEXT,
        about           TEXT,
        address         TEXT,
        phone           TEXT,
        whatsapp        TEXT,
        hours           TEXT,
        map_lat         NUMERIC(9,6),
        map_lng         NUMERIC(9,6),
        booking_enabled BOOLEAN NOT NULL DEFAULT true,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Membership plans (monthly / quarterly / yearly …).
      CREATE TABLE IF NOT EXISTS gym_plans (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        price         NUMERIC(10,2) NOT NULL DEFAULT 0,
        duration_days INTEGER NOT NULL DEFAULT 30,
        features      TEXT,
        is_popular    BOOLEAN NOT NULL DEFAULT false,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_gym_plans_company ON gym_plans (company_id, is_active, sort_order);
      -- Trainers (each with an optional public profile).
      CREATE TABLE IF NOT EXISTS gym_trainers (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        slug        TEXT NOT NULL,
        name        TEXT NOT NULL,
        specialty   TEXT,
        bio         TEXT,
        photo_url   TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_trainers_slug ON gym_trainers (company_id, slug);
      -- Weekly class schedule.
      CREATE TABLE IF NOT EXISTS gym_classes (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        day_of_week  INTEGER NOT NULL DEFAULT 6, -- 0=Sun … 6=Sat
        start_time   TEXT,                        -- "18:00"
        duration_min INTEGER NOT NULL DEFAULT 60,
        trainer_id   INTEGER REFERENCES gym_trainers(id) ON DELETE SET NULL,
        capacity     INTEGER NOT NULL DEFAULT 20,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_gym_classes_company ON gym_classes (company_id, is_active, day_of_week, sort_order);
      -- Members + their memberships (the core of the idea: track who's active and
      -- who's about to expire so the owner never loses a renewal).
      CREATE TABLE IF NOT EXISTS gym_members (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        phone       TEXT,
        code        TEXT,
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_gym_members_company ON gym_members (company_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS gym_memberships (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        member_id   INTEGER NOT NULL REFERENCES gym_members(id) ON DELETE CASCADE,
        plan_id     INTEGER REFERENCES gym_plans(id) ON DELETE SET NULL,
        plan_name   TEXT,
        price       NUMERIC(10,2) NOT NULL DEFAULT 0,
        start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date    DATE NOT NULL,
        status      TEXT NOT NULL DEFAULT 'active', -- active|frozen|cancelled
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_gym_memberships ON gym_memberships (company_id, status, end_date);
      CREATE INDEX IF NOT EXISTS idx_gym_memberships_member ON gym_memberships (member_id, end_date DESC);
      -- Attendance (self / front-desk check-in) + self-service class bookings.
      CREATE TABLE IF NOT EXISTS gym_attendance (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        member_id     INTEGER NOT NULL REFERENCES gym_members(id) ON DELETE CASCADE,
        checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_gym_attendance ON gym_attendance (company_id, checked_in_at DESC);
      CREATE TABLE IF NOT EXISTS gym_bookings (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        class_id     INTEGER NOT NULL REFERENCES gym_classes(id) ON DELETE CASCADE,
        member_id    INTEGER REFERENCES gym_members(id) ON DELETE SET NULL,
        member_name  TEXT,
        member_phone TEXT,
        booking_date DATE NOT NULL,
        status       TEXT NOT NULL DEFAULT 'booked', -- booked|waitlist|cancelled
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_gym_bookings ON gym_bookings (company_id, class_id, booking_date);
      -- POS + trainer commissions (phase 5).
      ALTER TABLE gym_trainers ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS gym_products (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        price       NUMERIC(10,2) NOT NULL DEFAULT 0,
        stock       INTEGER NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_gym_products ON gym_products (company_id, is_active);
      CREATE TABLE IF NOT EXISTS gym_sales (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        product_id     INTEGER REFERENCES gym_products(id) ON DELETE SET NULL,
        member_id      INTEGER REFERENCES gym_members(id) ON DELETE SET NULL,
        trainer_id     INTEGER REFERENCES gym_trainers(id) ON DELETE SET NULL,
        item_name      TEXT NOT NULL,
        unit_price     NUMERIC(10,2) NOT NULL DEFAULT 0,
        quantity       INTEGER NOT NULL DEFAULT 1,
        total          NUMERIC(10,2) NOT NULL DEFAULT 0,
        commission     NUMERIC(10,2) NOT NULL DEFAULT 0,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_gym_sales ON gym_sales (company_id, created_at DESC);
      -- Progress tracking / body measurements (phase 6) — key for bodybuilding.
      CREATE TABLE IF NOT EXISTS gym_measurements (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        member_id   INTEGER NOT NULL REFERENCES gym_members(id) ON DELETE CASCADE,
        measured_on DATE NOT NULL DEFAULT CURRENT_DATE,
        weight      NUMERIC(6,2),
        body_fat    NUMERIC(5,2),
        chest       NUMERIC(6,2),
        waist       NUMERIC(6,2),
        arm         NUMERIC(6,2),
        notes       TEXT,
        photo_url   TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_gym_measurements ON gym_measurements (member_id, measured_on);
      -- Gym media: a hero image + a gallery, so the landing shows real photos.
      ALTER TABLE gym_settings ADD COLUMN IF NOT EXISTS hero_url TEXT;
      CREATE TABLE IF NOT EXISTS gym_gallery (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        url         TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_gym_gallery ON gym_gallery (company_id, sort_order);
    `);

    await seedDemoGym(client);
  } catch (e) {
    console.error('[gym schema]', e.message);
  } finally {
    client.release();
  }
}

async function seedDemoGym(client) {
  const existing = await client.query('SELECT id, page_type, is_active FROM companies WHERE slug = $1', [DEMO_SLUG]);
  let companyId;
  if (existing.rows.length) {
    companyId = existing.rows[0].id;
    // Self-heal: keep the demo a live gym even if the row pre-existed otherwise.
    if (existing.rows[0].page_type !== 'gym' || existing.rows[0].is_active !== true) {
      await client.query("UPDATE companies SET page_type='gym', is_active=true WHERE id=$1", [companyId]);
    }
  } else {
    const ins = await client.query(
      `INSERT INTO companies (slug, company_name, description, page_type, theme_color, is_active)
       VALUES ($1,$2,$3,'gym','#E4FF1A', true) RETURNING id`,
      [DEMO_SLUG, 'OscarFit — جيم نموذجي',
       'جيم نموذجي لتجربة نظام إدارة الجيم من OscarDevs: باقات اشتراك، جدول كلاسات، مدرّبون، وحجز أونلاين.']
    );
    companyId = ins.rows[0].id;
  }

  await client.query(
    `INSERT INTO gym_settings (company_id, tagline, about, address, phone, whatsapp, hours, booking_enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT (company_id) DO NOTHING`,
    [companyId, 'ابنِ جسمك. اكسر حدودك.',
     'جيم مجهّز بأحدث الأجهزة ومنطقة أوزان حرة وكارديو، مع مدرّبين معتمدين وكلاسات يومية متنوّعة.',
     'أسيوط، مصر', '201552406406', '201552406406', 'يومياً: 8ص–12م']
  );

  const planCount = await client.query('SELECT COUNT(*)::int AS n FROM gym_plans WHERE company_id=$1', [companyId]);
  if (!planCount.rows[0].n) {
    const plans = [
      ['شهري', 500, 30, 'دخول غير محدود\nكل الأجهزة والأوزان\nكلاسات جماعية', false, 0],
      ['3 شهور', 1200, 90, 'كل مميزات الشهري\nتوفير 300ج\nتقييم لياقة مجاني', true, 1],
      ['سنوي', 3600, 365, 'كل المميزات\nحصتين تدريب شخصي\nخطة تغذية', false, 2],
    ];
    for (const p of plans) {
      await client.query(
        'INSERT INTO gym_plans (company_id, name, price, duration_days, features, is_popular, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [companyId, p[0], p[1], p[2], p[3], p[4], p[5]]
      );
    }
  }

  const trCount = await client.query('SELECT COUNT(*)::int AS n FROM gym_trainers WHERE company_id=$1', [companyId]);
  if (!trCount.rows[0].n) {
    const trainers = [
      ['ahmed-fit', 'كابتن أحمد', 'كمال أجسام وقوة', 'مدرّب معتمد بخبرة 10 سنين في بناء العضلات والتضخيم.'],
      ['mostafa-hiit', 'كابتن مصطفى', 'HIIT وحرق دهون', 'متخصص في التخسيس وتحسين اللياقة القلبية.'],
      ['sara-fitness', 'كابتن سارة', 'لياقة السيدات', 'مدرّبة لياقة وتغذية متخصّصة في تدريب السيدات.'],
    ];
    for (let i = 0; i < trainers.length; i++) {
      const t = trainers[i];
      await client.query(
        'INSERT INTO gym_trainers (company_id, slug, name, specialty, bio, sort_order) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (company_id, slug) DO NOTHING',
        [companyId, t[0], t[1], t[2], t[3], i]
      );
    }
  }

  const clCount = await client.query('SELECT COUNT(*)::int AS n FROM gym_classes WHERE company_id=$1', [companyId]);
  if (!clCount.rows[0].n) {
    const classes = [
      ['كروس فيت', 6, '18:00', 60, 20], ['بوكس', 0, '19:00', 60, 15],
      ['HIIT', 1, '18:30', 45, 25], ['حديد وقوة', 2, '20:00', 90, 30],
      ['يوجا', 3, '17:00', 60, 15], ['كارديو', 4, '18:00', 45, 25],
    ];
    for (let i = 0; i < classes.length; i++) {
      const c = classes[i];
      await client.query(
        'INSERT INTO gym_classes (company_id, name, day_of_week, start_time, duration_min, capacity, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [companyId, c[0], c[1], c[2], c[3], c[4], i]
      );
    }
  }

  const hasUser = await client.query('SELECT 1 FROM company_users WHERE company_id = $1 LIMIT 1', [companyId]);
  if (!hasUser.rows.length && DEMO_PASSWORD) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await client.query(
      `INSERT INTO company_users (company_id, email, password_hash) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING`,
      [companyId, DEMO_EMAIL, hash]
    );
    console.log('Seeded demo gym login:', DEMO_EMAIL);
  }
}

module.exports = { ensureGymSchema };
