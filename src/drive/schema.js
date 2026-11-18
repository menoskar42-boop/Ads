// Oscar Drive + Oscar Security — جداول السيرفر (drive.oscardevs.com). تفاصيل: docs/OSCAR_SECURITY.md
//
//   od_cars      — كل شاشة عربية: توكن سرّى (متخزّن هاش) · وضع الحماية ورقم نسخته · آخر مكان وآخر تواصل.
//   od_owners    — كل موبايل اتربط بكود من الشاشة: توكن سرّى (هاش). مفيش إيميل ولا باسورد.
//   od_points    — سجل الأماكن (٣٠ يوم). المفتاح (car_id, at) بيمنع التكرار لو الشاشة بعتت نفس الدفعة مرتين.
//   od_events    — أحداث الحماية (اشتغلت · اتحركت · رقم غلط · تسجيل). uuid من الشاشة بيمنع التكرار.
//   od_clips     — بيانات تسجيلات الكاميرا (الفيديو نفسه بيفضل على الشاشة).
//   od_shots     — صور الطريق لتدريب موديل المطبات (الصورة نفسها BYTEA، ١٥٠٠ بالكتير لكل عربية).
//   od_hazards   — ذاكرة الطريق (المطبات/الحفر/الرادارات) عشان ماتضيعش مع مسح التطبيق. uuid بيمنع التكرار، والمسح deleted_at.
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
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
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
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS relink_code TEXT;
    ALTER TABLE od_cars ADD COLUMN IF NOT EXISTS relink_expires TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS od_cars_relink_code ON od_cars(relink_code) WHERE relink_code IS NOT NULL;
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
