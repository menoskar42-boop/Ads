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

    // ── Clinical + billing layer (visits, records, invoices) ─────────────────
    await client.query(`
      -- Services a clinic bills for (each carries the doctor's share %).
      CREATE TABLE IF NOT EXISTS clinic_services (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        price       NUMERIC(10,2) NOT NULL DEFAULT 0,
        doctor_pct  NUMERIC(5,2) NOT NULL DEFAULT 60,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_services_company ON clinic_services (company_id, is_active);

      -- Visit types (كشف / استشارة / متابعة) with price + duration.
      CREATE TABLE IF NOT EXISTS clinic_visit_types (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        price       NUMERIC(10,2) NOT NULL DEFAULT 0,
        duration_min INTEGER NOT NULL DEFAULT 20,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );

      -- Weekly working hours per doctor (day 0=Sun..6=Sat).
      CREATE TABLE IF NOT EXISTS clinic_doctor_schedules (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        doctor_id   INTEGER NOT NULL REFERENCES clinic_doctors(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL,
        start_time  TIME NOT NULL,
        end_time    TIME NOT NULL,
        is_active   BOOLEAN NOT NULL DEFAULT true
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_sched_doctor ON clinic_doctor_schedules (company_id, doctor_id, day_of_week);

      -- A visit (encounter). arrival_at doubles as the queue sort key (Egyptian
      -- clinic rule: order by arrival/payment time).
      CREATE TABLE IF NOT EXISTS clinic_visits (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id     INTEGER REFERENCES clinic_patients(id) ON DELETE SET NULL,
        doctor_id      INTEGER REFERENCES clinic_doctors(id) ON DELETE SET NULL,
        appointment_id INTEGER REFERENCES clinic_appointments(id) ON DELETE SET NULL,
        visit_type_id  INTEGER REFERENCES clinic_visit_types(id) ON DELETE SET NULL,
        status         TEXT NOT NULL DEFAULT 'waiting', -- waiting|in_room|done|cancelled
        visit_date     DATE NOT NULL DEFAULT CURRENT_DATE, -- app sets Cairo date explicitly on insert
        arrival_at     TIMESTAMPTZ,
        is_urgent      BOOLEAN NOT NULL DEFAULT false,
        diagnosis      TEXT,
        notes          TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_visits_company ON clinic_visits (company_id, visit_date, status);
      CREATE INDEX IF NOT EXISTS idx_clinic_visits_patient ON clinic_visits (company_id, patient_id);

      -- Vital signs per visit.
      CREATE TABLE IF NOT EXISTS clinic_vitals (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        visit_id    INTEGER REFERENCES clinic_visits(id) ON DELETE CASCADE,
        patient_id  INTEGER REFERENCES clinic_patients(id) ON DELETE SET NULL,
        systolic    INTEGER, diastolic INTEGER, heart_rate INTEGER,
        temperature NUMERIC(4,1), weight NUMERIC(5,1), height NUMERIC(5,1), spo2 INTEGER,
        notes       TEXT,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Clinical notes per visit.
      CREATE TABLE IF NOT EXISTS clinic_notes (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        visit_id    INTEGER REFERENCES clinic_visits(id) ON DELETE CASCADE,
        patient_id  INTEGER REFERENCES clinic_patients(id) ON DELETE SET NULL,
        doctor_id   INTEGER REFERENCES clinic_doctors(id) ON DELETE SET NULL,
        category    TEXT NOT NULL DEFAULT 'general',
        title       TEXT,
        content     TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_notes_patient ON clinic_notes (company_id, patient_id);

      -- Prescriptions (medications stored as JSONB list).
      CREATE TABLE IF NOT EXISTS clinic_prescriptions (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        visit_id     INTEGER REFERENCES clinic_visits(id) ON DELETE CASCADE,
        patient_id   INTEGER REFERENCES clinic_patients(id) ON DELETE SET NULL,
        doctor_id    INTEGER REFERENCES clinic_doctors(id) ON DELETE SET NULL,
        medications  JSONB NOT NULL DEFAULT '[]',
        notes        TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_rx_patient ON clinic_prescriptions (company_id, patient_id);

      -- Invoices + items + payments. paid_at = the queue-priority time.
      CREATE TABLE IF NOT EXISTS clinic_invoices (
        id              SERIAL PRIMARY KEY,
        company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id      INTEGER REFERENCES clinic_patients(id) ON DELETE SET NULL,
        visit_id        INTEGER REFERENCES clinic_visits(id) ON DELETE SET NULL,
        status          TEXT NOT NULL DEFAULT 'pending', -- pending|partial|paid|cancelled
        discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
        paid_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
        paid_at         TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_inv_company ON clinic_invoices (company_id, status, created_at);
      -- Attribute an invoice directly to a doctor so the finance report can
      -- compute the doctor's share even when the invoice isn't tied to a visit.
      ALTER TABLE clinic_invoices ADD COLUMN IF NOT EXISTS doctor_id INTEGER REFERENCES clinic_doctors(id) ON DELETE SET NULL;
      CREATE TABLE IF NOT EXISTS clinic_invoice_items (
        id           SERIAL PRIMARY KEY,
        invoice_id   INTEGER NOT NULL REFERENCES clinic_invoices(id) ON DELETE CASCADE,
        service_id   INTEGER REFERENCES clinic_services(id) ON DELETE SET NULL,
        name         TEXT NOT NULL,
        quantity     INTEGER NOT NULL DEFAULT 1,
        unit_price   NUMERIC(10,2) NOT NULL DEFAULT 0,
        total_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
        doctor_share NUMERIC(10,2) NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS clinic_payments (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        invoice_id  INTEGER NOT NULL REFERENCES clinic_invoices(id) ON DELETE CASCADE,
        amount      NUMERIC(10,2) NOT NULL,
        method      TEXT NOT NULL DEFAULT 'cash',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_pay_company ON clinic_payments (company_id, created_at);
    `);

    // ── Optional (enterprise) modules — toggled per-clinic from super-admin ──
    await client.query(`
      -- Per-clinic module on/off switches (controlled by OscarDevs super-admin).
      CREATE TABLE IF NOT EXISTS clinic_modules (
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        module_key  TEXT NOT NULL,
        enabled     BOOLEAN NOT NULL DEFAULT false,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (company_id, module_key)
      );

      -- Inventory: clinic supplies/items + stock movements.
      CREATE TABLE IF NOT EXISTS clinic_inventory_items (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        unit          TEXT NOT NULL DEFAULT 'قطعة',
        quantity      NUMERIC(12,2) NOT NULL DEFAULT 0,
        reorder_level NUMERIC(12,2) NOT NULL DEFAULT 0,
        price         NUMERIC(10,2) NOT NULL DEFAULT 0,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_inv_items_company ON clinic_inventory_items (company_id, is_active);
      CREATE TABLE IF NOT EXISTS clinic_stock_moves (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        item_id     INTEGER NOT NULL REFERENCES clinic_inventory_items(id) ON DELETE CASCADE,
        change      NUMERIC(12,2) NOT NULL, -- +in / -out
        reason      TEXT NOT NULL DEFAULT 'adjust', -- in|dispense|adjust
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_stock_moves ON clinic_stock_moves (company_id, item_id, created_at);

      -- Insurance: insurers + claims.
      CREATE TABLE IF NOT EXISTS clinic_insurers (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        coverage_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        phone        TEXT,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS clinic_claims (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        insurer_id  INTEGER REFERENCES clinic_insurers(id) ON DELETE SET NULL,
        patient_id  INTEGER REFERENCES clinic_patients(id) ON DELETE SET NULL,
        invoice_id  INTEGER REFERENCES clinic_invoices(id) ON DELETE SET NULL,
        amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
        status      TEXT NOT NULL DEFAULT 'pending', -- pending|approved|paid|rejected
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_claims_company ON clinic_claims (company_id, status, created_at);

      -- Branches.
      CREATE TABLE IF NOT EXISTS clinic_branches (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        address     TEXT,
        phone       TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- HR: staff + attendance.
      CREATE TABLE IF NOT EXISTS clinic_staff (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        role        TEXT,
        phone       TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS clinic_attendance (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        staff_id    INTEGER NOT NULL REFERENCES clinic_staff(id) ON DELETE CASCADE,
        work_date   DATE NOT NULL DEFAULT CURRENT_DATE, -- app sets Cairo date explicitly on insert
        check_in    TIMESTAMPTZ,
        check_out   TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_attendance ON clinic_attendance (company_id, staff_id, work_date);

      -- ── Dental module ────────────────────────────────────────────────────
      -- Only used by clinics with the 'dental' module on. Teeth are keyed by
      -- FDI number (11-18, 21-28, 31-38, 41-48 permanent; 51-85 primary), which
      -- is what Egyptian dentists write on paper charts, so the stored value
      -- matches what the doctor already says out loud.
      CREATE TABLE IF NOT EXISTS clinic_dental_chart (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id   INTEGER NOT NULL REFERENCES clinic_patients(id) ON DELETE CASCADE,
        tooth        SMALLINT NOT NULL,        -- FDI number
        status       TEXT NOT NULL DEFAULT 'sound',
                     -- sound|caries|filled|crown|bridge|implant|root_canal|missing|veneer|denture
        surfaces     TEXT,                     -- affected surfaces, e.g. "MOD"
        note         TEXT,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- One row per tooth per patient; the chart upserts on this.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dental_chart_tooth
        ON clinic_dental_chart (company_id, patient_id, tooth);

      -- Treatment planned for a single tooth. Kept separate from the chart so
      -- history survives: the chart shows the tooth now, this shows what was
      -- planned, what it cost, and whether it was actually done.
      CREATE TABLE IF NOT EXISTS clinic_dental_plan (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id   INTEGER NOT NULL REFERENCES clinic_patients(id) ON DELETE CASCADE,
        tooth        SMALLINT,                 -- NULL = whole-mouth work (e.g. scaling)
        procedure    TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'planned', -- planned|in_progress|done|cancelled
        phase        SMALLINT NOT NULL DEFAULT 1,     -- treatment phases
        cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
        note         TEXT,
        doctor_id    INTEGER REFERENCES clinic_doctors(id) ON DELETE SET NULL,
        done_at      TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_dental_plan_patient
        ON clinic_dental_plan (company_id, patient_id, status);

      -- Lab orders: crowns, bridges, dentures… tracked from sent to delivered,
      -- because a case stuck at the lab is the most common reason a dental
      -- appointment gets wasted.
      CREATE TABLE IF NOT EXISTS clinic_lab_orders (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id    INTEGER REFERENCES clinic_patients(id) ON DELETE SET NULL,
        doctor_id     INTEGER REFERENCES clinic_doctors(id) ON DELETE SET NULL,
        lab_name      TEXT,
        work_type     TEXT NOT NULL,           -- تاج / جسر / فينير / طقم …
        tooth_numbers TEXT,                    -- free text: "11,12,21"
        shade         TEXT,                    -- e.g. A2
        status        TEXT NOT NULL DEFAULT 'sent', -- sent|in_lab|received|delivered|redo
        cost          NUMERIC(12,2) NOT NULL DEFAULT 0,
        sent_at       DATE,
        due_at        DATE,
        received_at   DATE,
        delivered_at  DATE,
        note          TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_lab_orders_company
        ON clinic_lab_orders (company_id, status, due_at);

      -- Before/after photos. Stored as uploaded file paths, same as other
      -- uploads in the platform.
      CREATE TABLE IF NOT EXISTS clinic_patient_photos (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id   INTEGER NOT NULL REFERENCES clinic_patients(id) ON DELETE CASCADE,
        visit_id     INTEGER REFERENCES clinic_visits(id) ON DELETE SET NULL,
        kind         TEXT NOT NULL DEFAULT 'before', -- before|after|xray
        image_url    TEXT NOT NULL,
        caption      TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_patient_photos
        ON clinic_patient_photos (company_id, patient_id, created_at);

      -- Call center: call / follow-up log.
      CREATE TABLE IF NOT EXISTS clinic_calls (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id   INTEGER REFERENCES clinic_patients(id) ON DELETE SET NULL,
        phone        TEXT,
        direction    TEXT NOT NULL DEFAULT 'out', -- in|out
        purpose      TEXT,
        outcome      TEXT,
        follow_up_at DATE,
        note         TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_clinic_calls_company ON clinic_calls (company_id, created_at);

      -- API / webhooks integration config.
      CREATE TABLE IF NOT EXISTS clinic_api_keys (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        label        TEXT NOT NULL,
        prefix       TEXT NOT NULL,
        token_hash   TEXT NOT NULL,
        last_used_at TIMESTAMPTZ,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Per-clinic WhatsApp API config. Each clinic stores ITS OWN credentials
      -- so messages come from the clinic's own number. provider: cloud|generic.
      CREATE TABLE IF NOT EXISTS clinic_whatsapp (
        company_id       INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        provider         TEXT NOT NULL DEFAULT 'cloud', -- cloud (Meta) | generic (API URL)
        phone_number_id  TEXT,   -- Cloud API: WhatsApp phone number ID
        access_token     TEXT,   -- Cloud API: permanent access token
        api_url          TEXT,   -- generic: gateway endpoint
        api_token        TEXT,   -- generic: gateway token/key
        sender_number    TEXT,   -- display/sender number (informational)
        active           BOOLEAN NOT NULL DEFAULT false, -- clinic switched sending on
        auto_confirm     BOOLEAN NOT NULL DEFAULT false, -- auto-send on new booking
        confirm_template TEXT,
        reminder_template TEXT,
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Every WhatsApp we send, so a reminder goes out once per appointment no
      -- matter how often the job runs, and a clinic can see what was actually
      -- delivered when a patient says "ماوصلنيش".
      CREATE TABLE IF NOT EXISTS clinic_whatsapp_log (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        appointment_id INTEGER REFERENCES clinic_appointments(id) ON DELETE CASCADE,
        kind           TEXT NOT NULL,          -- reminder|confirm|followup|manual
        phone          TEXT,
        ok             BOOLEAN NOT NULL DEFAULT false,
        error          TEXT,
        sent_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- The dedupe guard: one successful message of a given kind per appointment.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_log_once
        ON clinic_whatsapp_log (appointment_id, kind) WHERE appointment_id IS NOT NULL AND ok;
      CREATE INDEX IF NOT EXISTS idx_wa_log_company
        ON clinic_whatsapp_log (company_id, sent_at);

      CREATE TABLE IF NOT EXISTS clinic_webhooks (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        url         TEXT NOT NULL,
        event       TEXT NOT NULL DEFAULT 'appointment.created',
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Self-heal installs created before the migration-safe fix: older dev/prod
    // tables may still carry the DEFAULT (now() AT TIME ZONE 'Africa/Cairo')::date
    // that some migration generators cannot serialize. Reset to CURRENT_DATE
    // (idempotent; no-op on fresh installs which already use CURRENT_DATE).
    await client.query(`
      ALTER TABLE clinic_visits     ALTER COLUMN visit_date SET DEFAULT CURRENT_DATE;
      ALTER TABLE clinic_attendance ALTER COLUMN work_date  SET DEFAULT CURRENT_DATE;
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
  const existing = await client.query('SELECT id, page_type, is_active FROM companies WHERE slug = $1', [DEMO_SLUG]);
  let companyId;
  if (existing.rows.length) {
    companyId = existing.rows[0].id;
    // Self-heal: if the demo clinic row was created earlier as another page_type
    // (e.g. a leftover portfolio), the storefront + admin would render the wrong
    // module and the clinic screens would be missing. Force it back to a live
    // clinic so clinic.oscardevs.com (via the wildcard) always serves the clinic.
    if (existing.rows[0].page_type !== 'clinic' || existing.rows[0].is_active !== true) {
      await client.query(
        "UPDATE companies SET page_type = 'clinic', is_active = true WHERE id = $1",
        [companyId]
      );
      console.log('[clinic] self-healed demo company page_type → clinic');
    }
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

  // Demo visit types + services (only seed once) so the queue/billing screens
  // have realistic data to show. Idempotent: skip if any already exist.
  const vtCount = await client.query('SELECT COUNT(*)::int AS n FROM clinic_visit_types WHERE company_id = $1', [companyId]);
  if (!vtCount.rows[0].n) {
    const vts = [ ['كشف', 200, 20], ['استشارة', 150, 15], ['متابعة', 100, 10] ];
    for (let i = 0; i < vts.length; i++) {
      await client.query(
        'INSERT INTO clinic_visit_types (company_id, name, price, duration_min, sort_order) VALUES ($1,$2,$3,$4,$5)',
        [companyId, vts[i][0], vts[i][1], vts[i][2], i]
      );
    }
  }
  const svCount = await client.query('SELECT COUNT(*)::int AS n FROM clinic_services WHERE company_id = $1', [companyId]);
  if (!svCount.rows[0].n) {
    const svs = [ ['كشف', 200, 60], ['استشارة', 150, 70], ['جلسة ليزر', 500, 50], ['تنظيف أسنان', 350, 55], ['تطعيم', 120, 40] ];
    for (const s of svs) {
      await client.query('INSERT INTO clinic_services (company_id, name, price, doctor_pct) VALUES ($1,$2,$3,$4)', [companyId, s[0], s[1], s[2]]);
    }
  }

  // Enable every optional module for the demo clinic so all screens are visible.
  const { MODULE_KEYS } = require('./modules');
  for (const k of MODULE_KEYS) {
    await client.query(
      `INSERT INTO clinic_modules (company_id, module_key, enabled) VALUES ($1,$2,true)
       ON CONFLICT (company_id, module_key) DO NOTHING`,
      [companyId, k]
    );
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
