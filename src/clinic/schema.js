// Clinic module schema + demo seed.
//
// Clinics reuse the multi-tenant `companies` table with page_type = 'clinic'
// (next to portfolio / shop / pharmacy / orders), so EACH clinic gets its own
// slug.oscardevs.com page + its own admin + its own subscription — NOT a shared
// directory of all clinics (no Vezeeta-style listing). These tables hold the
// clinic-specific data: the clinic's doctors (each with their own public page),
// appointments (online booking), and optional patient records.
//
// All statements are additive + idempotent (CREATE TABLE / ADD COLUMN IF NOT
// EXISTS) so it is safe to run on every boot against the shared prod DB.
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DEMO_SLUG = 'clinic';
const DEMO_EMAIL = 'clinic@demo.oscardevs.com';
const DEMO_PASSWORD = 'clinic123';

async function ensureClinicSchema() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query(`
      -- Per-clinic settings (specialty, contact, hours, booking toggle).
      CREATE TABLE IF NOT EXISTS clinic_settings (
        company_id     INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        specialty      TEXT,                       -- e.g. أسنان / جلدية / أطفال
        about          TEXT,
        address        TEXT,
        phone          TEXT,
        whatsapp       TEXT,
        map_lat        NUMERIC(10,6),
        map_lng        NUMERIC(10,6),
        hours          TEXT,                       -- free text working hours
        booking_enabled BOOLEAN NOT NULL DEFAULT true,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Doctors that belong to a clinic. Each has its OWN public page at
      -- <slug>.oscardevs.com/doctor/<doctor-slug>.
      CREATE TABLE IF NOT EXISTS clinic_doctors (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        slug         TEXT NOT NULL,                -- unique within the clinic
        name         TEXT NOT NULL,
        title        TEXT,                         -- استشاري / أخصائي / دكتور
        specialty    TEXT,
        bio          TEXT,
        photo_url    TEXT,
        fee          NUMERIC(10,2),                -- consultation fee (EGP)
        schedule     TEXT,                         -- free-text days/times
        is_active    BOOLEAN NOT NULL DEFAULT true,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_doctors_company ON clinic_doctors (company_id, is_active, sort_order);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_doctors_slug ON clinic_doctors (company_id, slug);

      -- Online appointment bookings.
      CREATE TABLE IF NOT EXISTS clinic_appointments (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        doctor_id     INTEGER REFERENCES clinic_doctors(id) ON DELETE SET NULL,
        patient_name  TEXT NOT NULL,
        patient_phone TEXT NOT NULL,
        slot_at       TIMESTAMPTZ,                 -- requested date/time
        reason        TEXT,
        status        TEXT NOT NULL DEFAULT 'pending', -- pending|confirmed|done|cancelled
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_appts_company ON clinic_appointments (company_id, status, slot_at);

      -- Optional patient records the clinic keeps (private — never public).
      CREATE TABLE IF NOT EXISTS clinic_patients (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        phone       TEXT,
        gender      TEXT,
        birth_year  INTEGER,
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_patients_company ON clinic_patients (company_id, name);
    `);
    await seedDemoClinic(client);
    console.log('Clinic schema ready.');
  } catch (e) {
    console.error('[clinic schema]', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

// Seed a demo clinic tenant (slug 'clinic') so clinic.oscardevs.com resolves to
// a working sample — kept OFF the homepage until the product ships.
async function seedDemoClinic(client) {
  const existing = await client.query('SELECT id FROM companies WHERE slug = $1', [DEMO_SLUG]);
  let companyId;
  if (existing.rows.length) {
    companyId = existing.rows[0].id;
  } else {
    const ins = await client.query(
      `INSERT INTO companies (slug, company_name, description, page_type, theme_color, is_active)
       VALUES ($1,$2,$3,'clinic','#0ea5a5', true) RETURNING id`,
      [
        DEMO_SLUG,
        'عيادة أوسكار — نموذج تجريبي',
        'عيادة تجريبية لتجربة نظام إدارة العيادات من OscarDevs: صفحة للعيادة، صفحات للأطباء، وحجز مواعيد أونلاين.',
      ]
    );
    companyId = ins.rows[0].id;
  }

  await client.query(
    `INSERT INTO clinic_settings (company_id, specialty, about, address, phone, whatsapp, hours, booking_enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true)
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId, 'متعددة التخصصات',
      'عيادة نموذجية تضم نخبة من الأطباء في تخصصات مختلفة، مع حجز مواعيد إلكتروني سهل وسريع.',
      'أسيوط، مصر', '201552406406', '201552406406', 'السبت–الخميس: 4م–10م']
  );

  // Demo doctors (only if the clinic has none) — each gets its own public page.
  const docCount = await client.query('SELECT COUNT(*)::int AS n FROM clinic_doctors WHERE company_id = $1', [companyId]);
  if (!docCount.rows[0].n) {
    const docs = [
      { slug: 'ahmed-hassan', name: 'د. أحمد حسن', title: 'استشاري', specialty: 'الأسنان وتجميلها', fee: 300, schedule: 'السبت والاثنين والأربعاء: 5م–9م', bio: 'استشاري طب وتجميل الأسنان بخبرة أكثر من 12 عامًا في حشو العصب، التقويم، وابتسامة هوليوود.' },
      { slug: 'mona-adel', name: 'د. منى عادل', title: 'أخصائية', specialty: 'الجلدية والليزر', fee: 250, schedule: 'الأحد والثلاثاء والخميس: 4م–8م', bio: 'أخصائية أمراض جلدية وتجميل وليزر، متخصصة في علاج حب الشباب، التصبغات، ونضارة البشرة.' },
      { slug: 'khaled-samir', name: 'د. خالد سمير', title: 'استشاري', specialty: 'الأطفال وحديثي الولادة', fee: 200, schedule: 'يوميًا عدا الجمعة: 6م–10م', bio: 'استشاري طب الأطفال وحديثي الولادة، متابعة النمو والتطعيمات وحالات الحساسية والمناعة.' },
    ];
    for (let i = 0; i < docs.length; i++) {
      const d = docs[i];
      await client.query(
        `INSERT INTO clinic_doctors (company_id, slug, name, title, specialty, bio, fee, schedule, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (company_id, slug) DO NOTHING`,
        [companyId, d.slug, d.name, d.title, d.specialty, d.bio, d.fee, d.schedule, i]
      );
    }
  }

  // Demo login (only if the clinic has no user yet) so the /clinic admin can be tried.
  const hasUser = await client.query('SELECT 1 FROM company_users WHERE company_id = $1 LIMIT 1', [companyId]);
  if (!hasUser.rows.length) {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await client.query(
      `INSERT INTO company_users (company_id, email, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO NOTHING`,
      [companyId, DEMO_EMAIL, hash]
    );
    console.log('Seeded demo clinic login:', DEMO_EMAIL);
  }
}

module.exports = { ensureClinicSchema };
