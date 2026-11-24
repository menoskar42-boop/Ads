// Oscar Drive + Oscar Security — جداول السيرفر (drive.oscardevs.com). تفاصيل: docs/OSCAR_SECURITY.md
//
//   od_cars      — كل شاشة عربية: توكن سرّى (متخزّن هاش) · وضع الحماية ورقم نسخته · آخر مكان وآخر تواصل.
//   od_owners    — كل موبايل اتربط بكود من الشاشة: توكن سرّى (هاش). مفيش إيميل ولا باسورد.
//   od_points    — سجل الأماكن (٣٠ يوم). المفتاح (car_id, at) بيمنع التكرار لو الشاشة بعتت نفس الدفعة مرتين.
//   od_events    — أحداث الحماية (اشتغلت · اتحركت · رقم غلط · تسجيل). uuid من الشاشة بيمنع التكرار.
//   od_clips     — بيانات تسجيلات الكاميرا (الفيديو نفسه بيفضل على الشاشة).
//   od_shots     — صور الطريق لتدريب موديل المطبات (الصورة نفسها BYTEA، ١٥٠٠ بالكتير لكل عربية).
//   od_hazards   — ذاكرة الطريق (المطبات/الحفر/الرادارات) عشان ماتضيعش مع مسح التطبيق. uuid بيمنع التكرار، والمسح deleted_at.
//   od_inbox     — «📲 ابعت للشاشة» من الموبايل (مكان · مهمة/ملاحظة/تذكير · تفويلة) لحد ما الشاشة تستلم؛ النص بيتمسح بعد الاستلام.
//   od_push_subs — إشعارات الموبايل (Web Push).
'use strict';

async function ensureDriveSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS od_cars (
      id             SERIAL PRIMARY KEY,
      token_hash     TEXT NOT NULL UNIQUE,
      name           TEXT NOT NULL DEFAULT 'عربيتى',
      armed          BOOLEAN NOT NULL DEFAULT false,
      armed_ver      INTEGER NOT NULL DEFAULT 0,
      armed_at       TIMESTAMPTZ,
      armed_by       TEXT,
      pair_code      TEXT,
      pair_expires   TIMESTAMPTZ,
      last_seen      TIMESTAMPTZ,
      last_lat       DOUBLE PRECISION,
      last_lng       DOUBLE PRECISION,
      last_speed     REAL,
      last_heading   REAL,
      last_fix_at    TIMESTAMPTZ,
      lost_alerted   BOOLEAN NOT NULL DEFAULT false,
      app_version    TEXT,
      contacts       JSONB NOT NULL DEFAULT '[]'::jsonb,
      contacts_sync_enabled BOOLEAN NOT NULL DEFAULT false,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS contacts JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS contacts_sync_enabled BOOLEAN NOT NULL DEFAULT false;
    CREATE UNIQUE INDEX IF NOT EXISTS od_cars_pair_code ON od_cars(pair_code) WHERE pair_code IS NOT NULL;
    CREATE TABLE IF NOT EXISTS od_owners (
      id          SERIAL PRIMARY KEY,
      car_id      INTEGER NOT NULL REFERENCES od_cars(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL UNIQUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used   TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS od_points (
      car_id   INTEGER NOT NULL REFERENCES od_cars(id) ON DELETE CASCADE,
      at       TIMESTAMPTZ NOT NULL,
      lat      DOUBLE PRECISION NOT NULL,
      lng      DOUBLE PRECISION NOT NULL,
      speed    REAL,
      heading  REAL,
      acc      REAL,
      PRIMARY KEY (car_id, at)
    );
    CREATE TABLE IF NOT EXISTS od_events (
      id          BIGSERIAL PRIMARY KEY,
      car_id      INTEGER NOT NULL REFERENCES od_cars(id) ON DELETE CASCADE,
      uuid        TEXT NOT NULL UNIQUE,
      kind        TEXT NOT NULL,
      at          TIMESTAMPTZ NOT NULL,
      lat         DOUBLE PRECISION,
      lng         DOUBLE PRECISION,
      detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS od_events_car_at ON od_events(car_id, at DESC);
    CREATE TABLE IF NOT EXISTS od_clips (
      id       BIGSERIAL PRIMARY KEY,
      car_id   INTEGER NOT NULL REFERENCES od_cars(id) ON DELETE CASCADE,
      uuid     TEXT NOT NULL UNIQUE,
      at       TIMESTAMPTZ NOT NULL,
      seconds  INTEGER,
      bytes    BIGINT,
      reason   TEXT
    );
    -- المرحلة ٤ (٢٠٢٦-١١-١٠): آخر ملخّص من الشاشة (الركنات · العدّاد · الصيانة · البنزين · الشهور) — صف واحد بيتكتب فوقه،
    -- عشان صفحة الموبايل تعرض «عربيتك فين» والتقارير. مفيش تاريخ بيتجمّع هنا (التاريخ على الشاشة).
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS report JSONB;
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS report_at TIMESTAMPTZ;
    -- صور الطريق لتدريب موديل المطبات (٢٠٢٦-١١-١٨): «اوسكار اسكرين شوت» · زرار «📸 صوّر الطريق» · ولوحدها قبل المطب المتسجّل
    -- (٨٠/٥٠/٢٥ متر). الصورة نفسها هنا (JPEG ≤ ٦٠٠ ك.ب) — بحد أقصى ١٥٠٠ لكل عربية، والقديم اللى اتنزّل بيتمسح الأول.
    CREATE TABLE IF NOT EXISTS od_shots (
      id          BIGSERIAL PRIMARY KEY,
      car_id      INTEGER NOT NULL REFERENCES od_cars(id) ON DELETE CASCADE,
      uuid        TEXT NOT NULL UNIQUE,
      at          TIMESTAMPTZ NOT NULL,
      reason      TEXT,
      hazard_type TEXT,
      distance_m  INTEGER,
      meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
      bytes       INTEGER NOT NULL,
      jpg         BYTEA NOT NULL,
      exported_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS od_shots_car_at ON od_shots(car_id, at DESC);
    -- صور الطريق على Cloudflare R2 (المالك ٢٠٢٦-١١-١٨: «يحفظ فى cloudflare r2 علشان مساحه قاعده البيانات»): لو أسرار R2 موجودة الصورة
    -- بتروح R2 (r2_key) والعمود jpg بيفضل فاضى؛ من غيرها زى الأول (BYTEA). القديم مابيتنقلش.
    ALTER TABLE od_shots ALTER COLUMN jpg DROP NOT NULL;
    ALTER TABLE od_shots ADD COLUMN IF NOT EXISTS r2_key TEXT;
    -- «وضع تجربة» (المالك ٢٠٢٦-١١-١٨): صور التجربة فى فولدر لوحدها على R2 (shots-test) ومابتدخلش التدريب ولا الـzip العادى.
    ALTER TABLE od_shots ADD COLUMN IF NOT EXISTS test BOOLEAN NOT NULL DEFAULT false;
    -- مراجعة صور التدريب (#18): pending/approved/rejected — مابيدخلش التدريب غير approved
    ALTER TABLE od_shots ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE od_shots ADD COLUMN IF NOT EXISTS review_label TEXT;
    ALTER TABLE od_shots ADD COLUMN IF NOT EXISTS review_boxes JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE od_shots ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
    -- ذاكرة الطريق على السيرفر (المالك ٢٠٢٦-١١-١٨): المطبات/الحفر/الرادارات اللى السواق سجّلها كانت على الشاشة بس وبتضيع مع
    -- مسح التطبيق. uuid من الشاشة بيمنع التكرار، والمسح = deleted_at (مفيش DELETE). الشاشة الجديدة بتاخد نفس العربية بكود
    -- «ربط شاشة جديدة» من صفحة الموبايل (relink_code) وبتنزّل الذاكرة.
    CREATE TABLE IF NOT EXISTS od_hazards (
      id          BIGSERIAL PRIMARY KEY,
      car_id      INTEGER NOT NULL REFERENCES od_cars(id) ON DELETE CASCADE,
      uuid        TEXT NOT NULL UNIQUE,
      type        TEXT NOT NULL,
      lat         DOUBLE PRECISION NOT NULL,
      lng         DOUBLE PRECISION NOT NULL,
      bearing     REAL,
      accuracy    REAL,
      altitude    REAL,
      note        TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL,
      deleted_at  TIMESTAMPTZ,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS od_hazards_car ON od_hazards(car_id);
    -- «وضع تجربة» من صفحة الموبايل (٢٠٢٦-١١-١٨): مطبات وهمية للتجربة — مابتنزلش على شاشة العربية، وبتتمسح بزرار واحد.
    ALTER TABLE od_hazards ADD COLUMN IF NOT EXISTS test BOOLEAN NOT NULL DEFAULT false;
    -- مطب «اتجاه واحد» (البرومبت ٥ — ٢٠٢٦-١١-٢٠): كل اللى قبله (المعتمد والتجربة) بيفضل «اتجاهين» زى ما كان بيتنبّه — مفيش صف بيتغيّر.
    ALTER TABLE od_hazards ADD COLUMN IF NOT EXISTS oneway BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS relink_code TEXT;
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS relink_expires TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS od_cars_relink_code ON od_cars(relink_code) WHERE relink_code IS NOT NULL;
    -- الربط بـQR (٢٠٢٦-١١-١٨): الشاشة بتعرض رقم ٨ أرقام فى QR والموبايل المربوط بيأكّده. relinked_at = الشاشة تعرف إنها اتربطت.
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS claim_code TEXT;
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS claim_expires TIMESTAMPTZ;
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS relinked_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS od_cars_claim_code ON od_cars(claim_code) WHERE claim_code IS NOT NULL;
    -- «الموبايل لوحده» (المالك ٢٠٢٦-١١-١٨: «المفروض أدخل على الصفحة عادى ولو عاوز أربط يبقى فيه زرار ربط»): عربية افتراضية للموبايل
    -- من غير شاشة، عشان المطبات والصور ورسايل الشاشة يبقى ليها مكان. لما يربط شاشة حقيقية بياناتها بتتنقل لها والافتراضية بتتشال.
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS solo BOOLEAN NOT NULL DEFAULT false;
    -- «🩺 فحص الجهاز» + «وضع المقارنة» (٢٠٢٦-١١-١٩): آخر تقرير فحص بس للشاشة ولكل موبايل (نوع الجهاز والقدرات وجودة الـGPS).
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS diag JSONB;
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS diag_at TIMESTAMPTZ;
    ALTER TABLE od_owners ADD COLUMN IF NOT EXISTS diag JSONB;
    ALTER TABLE od_owners ADD COLUMN IF NOT EXISTS diag_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS od_inbox (
      id           BIGSERIAL PRIMARY KEY,
      car_id       INTEGER NOT NULL REFERENCES od_cars(id) ON DELETE CASCADE,
      uuid         TEXT NOT NULL UNIQUE,
      kind         TEXT NOT NULL,
      payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
      label        TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      delivered_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS od_inbox_car ON od_inbox(car_id, delivered_at);
    CREATE TABLE IF NOT EXISTS od_push_subs (
      endpoint  TEXT PRIMARY KEY,
      owner_id  INTEGER NOT NULL REFERENCES od_owners(id) ON DELETE CASCADE,
      p256dh    TEXT NOT NULL,
      auth      TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

module.exports = { ensureDriveSchema };
