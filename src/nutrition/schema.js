// Nutrition practice vertical.
//
// Reuses the multi-tenant `companies` table with page_type = 'nutrition', so
// every dietitian gets their own slug.oscardevs.com page, admin and
// subscription. EVERY table carries company_id: one practice must never be one
// JOIN away from another practice's patient list.
//
// This holds health data about named people. Two rules follow from that and are
// enforced here rather than left to the routes:
//   - patients are ARCHIVED, never deleted, so a measurement history cannot be
//     orphaned or silently rewritten;
//   - the patient's own login lives in its own table with its own password
//     hash, so a practice account being compromised does not hand over every
//     patient account with it.
//
// All statements are additive and idempotent. Ordering matters: an ALTER that
// precedes its CREATE aborts every statement after it in the same string —
// see scripts/check-schema-order.js.
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureNutritionSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nutrition_settings (
        company_id     INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        practice_name  TEXT,
        about          TEXT,
        address        TEXT,
        phone          TEXT,
        whatsapp       TEXT,
        hours          TEXT,
        booking_enabled BOOLEAN NOT NULL DEFAULT true,
        -- The dietitian's own default split. Overridable per patient, because
        -- a clinician who disagrees with the default must be able to say so
        -- rather than work around the software.
        protein_per_kg NUMERIC(5,2) NOT NULL DEFAULT 1.8,
        fat_percent    NUMERIC(5,2) NOT NULL DEFAULT 25,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Paid portal access (roadmap phase 6). OFF by default: charging patients
      -- is the practice's decision, not a default somebody discovers.
      ALTER TABLE nutrition_settings ADD COLUMN IF NOT EXISTS subscription_enabled BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE nutrition_settings ADD COLUMN IF NOT EXISTS subscription_price NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE nutrition_settings ADD COLUMN IF NOT EXISTS subscription_months INTEGER NOT NULL DEFAULT 1;
      -- WHEN the practice started charging. Patients who were already using the
      -- portal get a grace period measured from this, not from their own start.
      ALTER TABLE nutrition_settings ADD COLUMN IF NOT EXISTS subscription_since DATE;
      -- خدمات العيادة، سطر لكل خدمة، **بكلام الأخصائي نفسه** (البند ٩٧).
      -- الصفحة العامة كانت ٩٦ كلمة: اسم وتليفون وزرار حجز. المريض اللي بيدوّر
      -- مش لاقي إجابة على «بتعملوا إيه»، والصفحة رقيقة عند محركات البحث.
      -- نص جاهز من عندنا كان هيبقى حشو — ودي بالظبط الحاجة اللي البند بيقول
      -- «مش حشو». فالخانة فاضية لحد ما الأخصائي يكتبها.
      ALTER TABLE nutrition_settings ADD COLUMN IF NOT EXISTS services TEXT;

      -- ── مواعيد الحجز (البند ٨٤) ────────────────────────────────────────
      -- الزرار اللي كان على الصفحة بيفتح واتساب بجملة جاهزة. ده مش حجز:
      -- الأخصائي بيرد بعد ساعتين يقول «الميعاد محجوز»، والمريض راح لغيره.
      -- ومفيش أي حاجة كانت بتمنع إن اتنين يتفقوا على نفس الساعة.
      --
      -- الخانات **بتتحسب** من الإعدادات دي كل مرة، مش متخزّنة كصفوف: جدول
      -- خانات متخزّن معناه إن تغيير المواعيد بيسيب خانات قديمة شغّالة.
      ALTER TABLE nutrition_settings ADD COLUMN IF NOT EXISTS work_days TEXT;      -- '0,1,2,3,4,6'
      ALTER TABLE nutrition_settings ADD COLUMN IF NOT EXISTS work_from TEXT;      -- '16:00'
      ALTER TABLE nutrition_settings ADD COLUMN IF NOT EXISTS work_to TEXT;        -- '22:00'
      ALTER TABLE nutrition_settings ADD COLUMN IF NOT EXISTS slot_minutes INTEGER;

      CREATE TABLE IF NOT EXISTS nutrition_appointments (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        -- المريض الجديد مالوش ملف لسه، فالاسم والموبايل بيتخزّنوا على الحجز
        -- نفسه. واللي عنده ملف بيترابط بيه عشان تاريخه يبان.
        patient_id    INTEGER REFERENCES nutrition_patients(id) ON DELETE SET NULL,
        patient_name  TEXT NOT NULL,
        patient_phone TEXT NOT NULL,
        slot_at       TIMESTAMPTZ NOT NULL,
        note          TEXT,
        status        TEXT NOT NULL DEFAULT 'pending',  -- pending|confirmed|done|cancelled
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_appts ON nutrition_appointments (company_id, slot_at);
      CREATE INDEX IF NOT EXISTS idx_nut_appts_open ON nutrition_appointments (company_id, status, slot_at);

      -- ── القوالب العلاجية (البند ٨٤) ────────────────────────────────────
      -- «إنقاص وزن ١٥٠٠ سعرة» و«بروتوكول سكري» بتتكتب لكل مريض من الأول.
      -- القالب بيخزّن **الوصفة** (وجبة · صنف · جرامات) — مش القيم المحسوبة،
      -- لأنه مش خطة مسلّمة لمريض: القيم بتتحسب وقت التطبيق من الصنف الحي.
      -- ── رسايل آمنة (البند ٨٤) ──────────────────────────────────────────
      -- المريض كان بيبعت سؤاله وصورة تحليله على واتساب رقم شخصي. هنا الكلام
      -- جوّه النظام جنب ملفه.
      --
      -- **مقفولة افتراضياً**: استقبال أسئلة طبية التزام، وعيادة ما تعرفش إن
      -- فيه صندوق وارد هتسيب مرضى مستنيين رد.
      ALTER TABLE nutrition_settings ADD COLUMN IF NOT EXISTS messages_enabled BOOLEAN NOT NULL DEFAULT false;
      -- وقت الرد اللي العيادة بتوعد بيه، بكلامها هي — عشان الصفحة تقول للمريض
      -- «الرد خلال كذا» بدل ما تسيبه يخمّن.
      ALTER TABLE nutrition_settings ADD COLUMN IF NOT EXISTS messages_reply_note TEXT;

      CREATE TABLE IF NOT EXISTS nutrition_messages (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id  INTEGER NOT NULL REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        sender      TEXT NOT NULL,          -- 'patient' | 'practice'
        -- اسم اللي رد من العيادة: المريض يعرف إنه بيكلّم الأخصائي ولا الاستقبال.
        author_name TEXT,
        body        TEXT NOT NULL,
        -- «اتقرت» بتتكتب لما الطرف التاني يفتح الخيط فعلاً — مش وقت الوصول.
        read_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_messages ON nutrition_messages (company_id, patient_id, created_at);

      CREATE TABLE IF NOT EXISTS nutrition_templates (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        note       TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_templates ON nutrition_templates (company_id, name);

      CREATE TABLE IF NOT EXISTS nutrition_template_items (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        template_id INTEGER NOT NULL REFERENCES nutrition_templates(id) ON DELETE CASCADE,
        food_id     INTEGER REFERENCES nutrition_foods(id) ON DELETE SET NULL,
        -- الاسم متنسوخ عشان القالب يفضل مقروء حتى لو الصنف اتمسح — والتطبيق
        -- ساعتها بيرفض السطر **باسمه** بدل ما يختفي بصمت.
        food_name   TEXT,
        meal        TEXT NOT NULL DEFAULT 'breakfast',
        grams       NUMERIC(7,2) NOT NULL DEFAULT 100,
        note        TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_nut_template_items ON nutrition_template_items (template_id, sort_order);

      -- The practice's own staff: an assistant with a scale, somebody on the
      -- phone. Small practices, which is exactly why this matters — the
      -- assistant used to sign in as the dietitian, so a blood panel was one
      -- click from the front desk. Roles live in src/nutrition/perms.js.
      CREATE TABLE IF NOT EXISTS nutrition_staff (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        username      TEXT,
        password_hash TEXT,
        perm_role     TEXT NOT NULL DEFAULT 'reception',
        phone         TEXT,
        login_enabled BOOLEAN NOT NULL DEFAULT false,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nutri_staff_company ON nutrition_staff (company_id);
      -- Partial: a name on the rota with no login is a perfectly normal row.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nutri_staff_username
        ON nutrition_staff (lower(username)) WHERE username IS NOT NULL;

      CREATE TABLE IF NOT EXISTS nutrition_patients (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        phone         TEXT,
        email         TEXT,
        gender        TEXT,                      -- male | female
        birth_date    DATE,
        height_cm     NUMERIC(5,1),
        activity      TEXT NOT NULL DEFAULT 'light',
        goal          TEXT NOT NULL DEFAULT 'maintain',   -- loss | gain | maintain
        -- Per-patient overrides of the practice defaults. NULL means "use the
        -- practice setting", which is different from a stored copy of it: the
        -- copy would stop following the setting the day it changed.
        protein_per_kg NUMERIC(5,2),
        fat_percent    NUMERIC(5,2),
        target_weight_kg NUMERIC(5,1),
        notes         TEXT,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_patients ON nutrition_patients (company_id, is_active, name);

      -- The history the whole system is for. Never updated in place: a
      -- corrected weight is a new reading with its own date, because a curve
      -- that can be edited backwards is not evidence of progress.
      CREATE TABLE IF NOT EXISTS nutrition_measurements (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id   INTEGER NOT NULL REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        taken_on     DATE NOT NULL DEFAULT CURRENT_DATE,
        weight_kg    NUMERIC(5,1),
        body_fat_pct NUMERIC(4,1),
        waist_cm     NUMERIC(5,1),
        muscle_kg    NUMERIC(5,1),
        -- Who wrote it. A reading the patient logged from their phone and one
        -- the dietitian took on a clinic scale are not the same evidence.
        source       TEXT NOT NULL DEFAULT 'clinic',   -- clinic | patient
        notes        TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_meas ON nutrition_measurements (patient_id, taken_on DESC);

      CREATE TABLE IF NOT EXISTS nutrition_labs (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        taken_on   DATE NOT NULL DEFAULT CURRENT_DATE,
        title      TEXT NOT NULL,
        value      TEXT,
        unit       TEXT,
        notes      TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_labs ON nutrition_labs (patient_id, taken_on DESC);
    `);

    await client.query(`
      -- Foods are per practice. A shared global table sounds tidier until two
      -- dietitians disagree about the calories in a local dish and one of them
      -- silently edits the other's plans.
      CREATE TABLE IF NOT EXISTS nutrition_foods (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        -- Everything is stored PER 100g and converted at use. Storing "per
        -- serving" would make every number depend on a serving size that gets
        -- edited later, silently restating plans already given to patients.
        kcal         NUMERIC(7,2) NOT NULL DEFAULT 0,
        protein_g    NUMERIC(6,2) NOT NULL DEFAULT 0,
        carbs_g      NUMERIC(6,2) NOT NULL DEFAULT 0,
        fat_g        NUMERIC(6,2) NOT NULL DEFAULT 0,
        serving_desc TEXT,
        serving_g    NUMERIC(7,2),
        category     TEXT,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_foods ON nutrition_foods (company_id, is_active, name);

      -- ── العناصر الدقيقة (البند ٨٤) ─────────────────────────────────────
      -- كلها **بتقبل NULL** ومن غير افتراضي — ودي كل النقطة: إحنا مانشحنش
      -- قاعدة تركيب أغذية (الأرقام دي ليها مصادر ورخص وبتختلف بالبلد وطريقة
      -- الطبخ)، فالخانة بتفضل فاضية لحد ما الأخصائي يملاها من مرجعه.
      -- افتراضي صفر هنا كان هيخلي كل صنف في كل عيادة يدّعي إن فيه صفر حديد.
      ALTER TABLE nutrition_foods ADD COLUMN IF NOT EXISTS fiber_g      NUMERIC(6,2);
      ALTER TABLE nutrition_foods ADD COLUMN IF NOT EXISTS sodium_mg    NUMERIC(9,2);
      ALTER TABLE nutrition_foods ADD COLUMN IF NOT EXISTS potassium_mg NUMERIC(9,2);
      ALTER TABLE nutrition_foods ADD COLUMN IF NOT EXISTS calcium_mg   NUMERIC(9,2);
      ALTER TABLE nutrition_foods ADD COLUMN IF NOT EXISTS iron_mg      NUMERIC(8,2);
      ALTER TABLE nutrition_foods ADD COLUMN IF NOT EXISTS vit_d_ug     NUMERIC(8,2);
      ALTER TABLE nutrition_foods ADD COLUMN IF NOT EXISTS vit_b12_ug   NUMERIC(8,2);

      CREATE TABLE IF NOT EXISTS nutrition_plans (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id     INTEGER NOT NULL REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        title          TEXT,
        -- The targets are FROZEN onto the plan when it is written. The engine
        -- recomputes as the patient's weight changes, but the plan the patient
        -- is following was built for the numbers of that day, and a plan whose
        -- targets move underneath it cannot be reviewed.
        target_kcal    INTEGER,
        target_protein INTEGER,
        target_carbs   INTEGER,
        target_fat     INTEGER,
        start_date     DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date       DATE,
        is_active      BOOLEAN NOT NULL DEFAULT true,
        notes          TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_plans ON nutrition_plans (patient_id, is_active);
      -- One active plan per patient, enforced by the database rather than by
      -- the order of two statements. "Deactivate the old one, then insert the
      -- new one" is correct until two tabs do it at once, and then the patient
      -- portal has two plans to choose between and picks wrong.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nut_one_active_plan
        ON nutrition_plans (patient_id) WHERE is_active;

      CREATE TABLE IF NOT EXISTS nutrition_plan_items (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        plan_id    INTEGER NOT NULL REFERENCES nutrition_plans(id) ON DELETE CASCADE,
        food_id    INTEGER REFERENCES nutrition_foods(id) ON DELETE SET NULL,
        meal       TEXT NOT NULL DEFAULT 'breakfast',
        -- The food's name and its per-100g figures are copied onto the line.
        -- A food edited or archived next month must not silently restate a plan
        -- the patient is already eating from.
        food_name  TEXT,
        grams      NUMERIC(7,2) NOT NULL DEFAULT 100,
        kcal       NUMERIC(7,2) NOT NULL DEFAULT 0,
        protein_g  NUMERIC(6,2) NOT NULL DEFAULT 0,
        carbs_g    NUMERIC(6,2) NOT NULL DEFAULT 0,
        fat_g      NUMERIC(6,2) NOT NULL DEFAULT 0,
        note       TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_nut_plan_items ON nutrition_plan_items (plan_id, meal, sort_order);
    `);

    await client.query(`
      -- The patient's own login. Separate table, separate hash: a compromised
      -- practice account must not hand over every patient account with it.
      CREATE TABLE IF NOT EXISTS nutrition_patient_users (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id    INTEGER NOT NULL UNIQUE REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        login         TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        last_login_at TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Unique per practice, not globally: two dietitians may each have a
      -- patient whose phone number is the login, and neither should block the
      -- other.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nut_pu_login ON nutrition_patient_users (company_id, lower(login));

      -- What the patient actually ate, against the plan. Logged by the patient,
      -- so it is kept apart from the plan itself: the plan is what was
      -- prescribed, this is what happened, and merging them loses the gap that
      -- the whole follow-up is about.
      -- One paid period per patient. Renewals are new rows, so the history of
      -- what somebody paid for stays readable — an UPDATE would erase it.
      CREATE TABLE IF NOT EXISTS nutrition_subscriptions (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id  INTEGER NOT NULL REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        price       NUMERIC(10,2) NOT NULL DEFAULT 0,
        months      INTEGER NOT NULL DEFAULT 1,
        starts_on   DATE NOT NULL DEFAULT CURRENT_DATE,
        ends_on     DATE NOT NULL,
        -- unpaid → paid → (expires by date) · cancelled
        status      TEXT NOT NULL DEFAULT 'unpaid',
        method      TEXT,                       -- cash | instapay | wallet | gateway | …
        paid_at     TIMESTAMPTZ,
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS nutrition_subs_idx
        ON nutrition_subscriptions(company_id, patient_id, ends_on DESC);

      CREATE TABLE IF NOT EXISTS nutrition_diary (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        on_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        meal       TEXT NOT NULL DEFAULT 'breakfast',
        item_id    INTEGER REFERENCES nutrition_plan_items(id) ON DELETE SET NULL,
        done       BOOLEAN NOT NULL DEFAULT true,
        note       TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_diary ON nutrition_diary (patient_id, on_date);
      /* دفتر أكل حقيقي (backlog 84).
       *
       * What was here was a tick: the plan said "grilled chicken 150g" and the
       * patient pressed done. That answers "did you follow the plan" and
       * nothing else — and people eat things that are NOT on the plan, which is
       * the entire problem a dietitian is solving. A diary of ticks shows a
       * perfect week for a patient who gained two kilos.
       *
       * So an entry can now be a food with a quantity, or a line the patient
       * typed. The old ticks keep working: item_id and done are untouched.
       */
      ALTER TABLE nutrition_diary ADD COLUMN IF NOT EXISTS food_id  INTEGER REFERENCES nutrition_foods(id) ON DELETE SET NULL;
      ALTER TABLE nutrition_diary ADD COLUMN IF NOT EXISTS grams    NUMERIC(7,1);
      ALTER TABLE nutrition_diary ADD COLUMN IF NOT EXISTS free_text TEXT;
      ALTER TABLE nutrition_diary ADD COLUMN IF NOT EXISTS kind     TEXT NOT NULL DEFAULT 'tick';  -- tick | ate
      CREATE INDEX IF NOT EXISTS idx_nut_diary_ate ON nutrition_diary (patient_id, on_date, kind);

      /* ماء ونوم وخطوات ومزاج (backlog 84).
       *
       * A weight once a week is a thin picture of a month, and the things that
       * explain a stalled week — no sleep, no water, a bad fortnight — were
       * nowhere, so the follow-up ran on the patient's memory of a Tuesday two
       * weeks ago.
       *
       * One row per patient per day: a second check-in on the same day is a
       * correction, not a new day, and the unique index makes that true rather
       * than hoped for.
       */
      CREATE TABLE IF NOT EXISTS nutrition_checkins (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id    INTEGER NOT NULL REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        on_date       DATE NOT NULL DEFAULT CURRENT_DATE,
        water_glasses INTEGER,
        sleep_hours   NUMERIC(4,1),
        steps         INTEGER,
        mood          TEXT,
        note          TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nut_checkin_day ON nutrition_checkins (patient_id, on_date);

      /* حساسية وأمراض وأدوية وتفضيلات (backlog 84).
       *
       * The practice stored a patient's height, weight and goal and nothing
       * about what would harm them — so a plan could hand a peanut allergy a
       * peanut and no screen would notice. See src/nutrition/safety.js for what
       * the matching does and, more importantly, what it refuses to claim.
       */
      ALTER TABLE nutrition_patients ADD COLUMN IF NOT EXISTS allergies    TEXT;
      ALTER TABLE nutrition_patients ADD COLUMN IF NOT EXISTS conditions   TEXT;
      ALTER TABLE nutrition_patients ADD COLUMN IF NOT EXISTS medications  TEXT;
      ALTER TABLE nutrition_patients ADD COLUMN IF NOT EXISTS avoid_foods  TEXT;
      ALTER TABLE nutrition_patients ADD COLUMN IF NOT EXISTS diet_style   TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE nutrition_patients ADD COLUMN IF NOT EXISTS stage        TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE nutrition_patients ADD COLUMN IF NOT EXISTS budget       TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nut_diary_one ON nutrition_diary (patient_id, on_date, item_id);
    `);
  } finally {
    client.release();
  }
}

module.exports = { ensureNutritionSchema };
