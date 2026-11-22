/**
 * db-sync.ts — يُزامن dev DB مع schema.ts بشكل آمن (بدون أي DROP)
 * شغّله قبل أي Replit Publish: npm run db:sync
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const migrations = [
  // group_messages — أعمدة الشات المتقدم
  `ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS image_url text`,
  `ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reply_to_id integer`,
  `ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reply_to_text text`,
  `ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reply_to_user_name text`,
  `ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reactions jsonb DEFAULT '[]'::jsonb`,

  // reading_groups — إعدادات القراءة التلقائية
  `ALTER TABLE reading_groups ADD COLUMN IF NOT EXISTS auto_reading_config jsonb DEFAULT NULL`,

  // group_push_subscriptions — إشعارات الدفع
  `CREATE TABLE IF NOT EXISTS group_push_subscriptions (
    id serial PRIMARY KEY,
    group_id integer NOT NULL,
    group_code text NOT NULL,
    user_name text NOT NULL,
    member_key text NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now(),
    UNIQUE(group_id, endpoint)
  )`,

  // ترقية constraint على قواعد موجودة: UNIQUE(endpoint) → UNIQUE(group_id, endpoint)
  `ALTER TABLE group_push_subscriptions DROP CONSTRAINT IF EXISTS group_push_subscriptions_endpoint_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS gps_group_endpoint_idx ON group_push_subscriptions(group_id, endpoint)`,

  // app_settings — إعدادات التطبيق (تاريخ آخر إشعار يومي)
  `CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamp DEFAULT now()
  )`,

  // reading_groups — تفعيل الدخول الضيف
  `ALTER TABLE reading_groups ADD COLUMN IF NOT EXISTS guest_access_enabled boolean DEFAULT false`,

  // group_guest_tokens — رموز الدخول الضيف (ثابتة per device+group)
  `CREATE TABLE IF NOT EXISTS group_guest_tokens (
    id serial PRIMARY KEY,
    token text NOT NULL,
    group_id integer NOT NULL,
    group_code text NOT NULL,
    member_number integer NOT NULL,
    member_key text NOT NULL,
    phone text,
    created_at timestamp DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ggt_token_group_idx ON group_guest_tokens(token, group_code)`,
];

async function run() {
  console.log("🔄 بدء مزامنة قاعدة البيانات...");
  for (const sql of migrations) {
    const label = sql.split("\n")[0].trim().slice(0, 70);
    try {
      await pool.query(sql);
      console.log(`  ✅ ${label}`);
    } catch (e: any) {
      console.error(`  ❌ ${label}\n     ${e.message}`);
    }
  }
  console.log("✅ اكتملت المزامنة — الآن Replit لن يولّد أي DROP عند Publish");
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
