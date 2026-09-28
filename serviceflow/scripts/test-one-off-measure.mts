/*
 * اختبار «القياس الاستثنائى بعد النشر» + شرط اليومين على Postgres حقيقى.
 * بياخد كود الباتشات اليومية من server/routes.ts زى ما هو ويشغّله على جداول تجربة.
 *
 *   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-one-off-measure.mts
 *   (قاعدة تجربة فاضية — بيعمل جداوله وبيمسحها)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.log("⏭️  DATABASE_URL مش متحدد"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url });
const src = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
// باتش إيقاف PO مش موضوع الاختبار ده (ليه اختباره) — بيرجّع فاضى هنا
const block = src.slice(src.indexOf("  const AUTO_BATCH_HOUR ="), src.indexOf("  // فحص دورى كل ٥ دقايق"))
  .replace(/const autoPoStopAccounts = async \(\): Promise<string\[\]> => \{[\s\S]*?\n  \};\n/,
           "const autoPoStopAccounts = async (): Promise<string[]> => [];\n");
if (!/const autoPoStopAccounts = async \(\): Promise<string\[\]> => \[\];/.test(block)) { console.log("❌ مالقيتش autoPoStopAccounts"); process.exit(1); }
const notQueued = src.slice(src.indexOf("const notQueuedSql ="), src.indexOf("`;", src.indexOf("const notQueuedSql =")) + 2);
const hasFrame = src.slice(src.indexOf("const hasFrameSql ="), src.indexOf("`;", src.indexOf("const hasFrameSql =")) + 2);
const tmp = `/tmp/oneoff-${process.pid}.mts`;
writeFileSync(tmp, `
import { phoneNormSql } from ${JSON.stringify(new URL("../server/phone-norm.ts", import.meta.url).pathname)};
const sp = phoneNormSql;
${notQueued}
${hasFrame}
export default function make(pool: any, cairoNow: () => { date: string; hour: number }) {
  const app = { get() {}, post() {} }; const requireAuth = 0, requireSuperAdmin = 0;
  const SITE_OF_TYPE: Record<string, string> = {};
  ${block}
  return { runOneOffMeasure, runDailyAutoBatches, autoMeasureAccounts, AUTO_MEASURE_STALE_DAYS };
}`);
let HOUR = 10;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const m = (await import(pathToFileURL(tmp).href)).default(pool, () => ({ date: today, hour: HOUR }));
const q = (t: string, v: any[] = []) => pool.query(t, v);
let bad = 0; const ok = (l: string, c: boolean, x = "") => { console.log((c ? "  ✅ " : "  ❌ ") + l + " " + x); if (!c) bad++; };

await q(`DROP TABLE IF EXISTS app_state, exec_jobs, line_accounts, case_138, phone_ports, complaint_details, remaining_complaints`);
await q(`CREATE TABLE app_state (key text PRIMARY KEY, value text, updated_at timestamptz)`);
await q(`CREATE TABLE exec_jobs (id serial PRIMARY KEY, type text, accounts jsonb, requested_by text, note text,
          priority int DEFAULT 0, batch_id text, site text, requested_from text, status text DEFAULT 'pending',
          created_at timestamptz DEFAULT now())`);
await q(`CREATE TABLE line_accounts (full_phone text, account_no text)`);
await q(`CREATE TABLE case_138 (id serial PRIMARY KEY, full_phone text, uploaded_at timestamptz)`);
await q(`CREATE TABLE phone_ports (phone_number text, frame text)`);
await q(`CREATE TABLE complaint_details (phone_number text, close_time timestamptz, exchange_name text)`);
await q(`CREATE TABLE remaining_complaints (phone_number text, status_code text, close_time timestamptz, complain_time timestamptz, exchange_name text)`);

// كل خط: أكونت + فريم. وقياس بعمر معيّن (null = لم يُقس)
const line = async (acc: string, phone: string, daysAgo: number | null) => {
  await q(`INSERT INTO line_accounts VALUES ($1, $2)`, [phone, acc]);
  await q(`INSERT INTO phone_ports VALUES ($1, 'F1')`, [phone]);
  if (daysAgo != null) await q(`INSERT INTO case_138 (full_phone, uploaded_at) VALUES ($1, now() - make_interval(hours => $2))`, [phone, Math.round(daysAgo * 24)]);
};
await line("D1", "88011", 1);      // يوم واحد → لأ
await line("D3", "88013", 3);      // ٣ أيام → أيوه (مع شرط الـ٤ كان هيتساب)
await line("D5", "88015", 5);      // ٥ أيام → أيوه
await line("NEVER", "88019", null); // لم يُقس → أيوه
await line("QUEUED", "88017", 6);  // قديم بس فى الطابور → لأ
await line("INBATCH", "88018", 6); // مهمته اتنفّذت بس باتشه لسه شغّال → لأ
await q(`INSERT INTO exec_jobs (type, accounts, note, batch_id, status) VALUES
  ('measure', '["QUEUED"]', 'باتش ٩ الصبح', 'bOLD', 'pending'),
  ('measure', '["INBATCH"]', 'باتش ٩ الصبح', 'bOLD', 'done')`);
await q(`INSERT INTO app_state VALUES ('auto_batches_last_day', $1, now())`, [today]);

ok("الشرط بقى يومين", m.AUTO_MEASURE_STALE_DAYS === 2);
await m.runOneOffMeasure("test");
const batch = async () => (await q(`SELECT batch_id, array_agg(accounts->>0 ORDER BY id) accs, max(note) note, count(*)::int n
  FROM exec_jobs WHERE batch_id <> 'bOLD' GROUP BY batch_id`)).rows;
let b = await batch();
ok("التشغيل الاستثنائى فتح باتش واحد", b.length === 1, String(b.length));
const accs: string[] = b[0]?.accs || [];
ok("خد اللى أقدم من يومين واللى ماتقاسش", ["D3", "D5", "NEVER"].every((a) => accs.includes(a)), JSON.stringify(accs));
ok("ماخدش قياس امبارح", !accs.includes("D1"));
ok("ماخدش اللى فى الطابور ولا اللى باتشه لسه شغّال", !accs.includes("QUEUED") && !accs.includes("INBATCH"));
ok("مهمة لكل خط وبدون Real", b[0]?.n === accs.length && /تشغيل استثنائى/.test(b[0]?.note) && /بدون Real/.test(b[0]?.note), b[0]?.note);

await m.runOneOffMeasure("tick"); await m.runOneOffMeasure("boot");
ok("مابيتكررش (ريستارت / tick)", (await batch()).length === 1);
const st = (await q(`SELECT value FROM app_state WHERE key = 'auto_batches_last_day'`)).rows[0]?.value;
ok("مالمسش علامة باتش ٩ الصبح", st === today, st);

// بكرة ٩ الصبح: الباتش اليومى بيشتغل عادى، ومابيكررش اللى لسه فى الطابور
await q(`UPDATE app_state SET value = '2000-01-01' WHERE key = 'auto_batches_last_day'`);
HOUR = 9;
const r = await m.runDailyAutoBatches("tick");
ok("باتش ٩ الصبح اشتغل عادى بعد الاستثنائى", r.ran === true, JSON.stringify(r));
ok("ومافيهوش خطوط الاستثنائى اللى لسه فى الطابور", r.measure === 0, String(r.measure));

// فشل الإضافة → الحجز بيتفك والمحاولة الجاية بتنجح
await q(`DELETE FROM app_state WHERE key = 'auto_measure_one_off'`);
await q(`DELETE FROM exec_jobs WHERE batch_id <> 'bOLD'`);
await q(`ALTER TABLE exec_jobs RENAME COLUMN requested_from TO rf`);
await m.runOneOffMeasure("tick");
const held = (await q(`SELECT 1 FROM app_state WHERE key = 'auto_measure_one_off'`)).rowCount;
ok("لو الإضافة فشلت الحجز بيتفك", held === 0);
await q(`ALTER TABLE exec_jobs RENAME COLUMN rf TO requested_from`);
await m.runOneOffMeasure("tick");
ok("والمحاولة الجاية بتفتح الباتش", (await batch()).length === 1);

await q(`DROP TABLE IF EXISTS app_state, exec_jobs, line_accounts, case_138, phone_ports, complaint_details, remaining_complaints`);
await pool.end();
console.log(`\n${bad ? "❌" : "✅"} ${bad ? bad + " فشل" : "كله نجح"}`);
process.exit(bad ? 1 : 0);
