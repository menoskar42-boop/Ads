/*
 * مراجعة البيان الفنى اليومية ١٢ الضهر لأرقام «بورتات MSAN بلا بيان فنى أو اسم/عنوان»
 * (قرار المالك ٢٠٢٦-٠٩-٢٩) — على Postgres حقيقى، بكود routes.ts زى ما هو.
 *
 *   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-ports-subinfo.mts
 *   (قاعدة تجربة — بيعمل جداوله وبيمسحها)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.log("⏭️  DATABASE_URL مش متحدد"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url });
const src = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const cut = (from: string, to: string) => { const i = src.indexOf(from); return src.slice(i, src.indexOf(to, i)); };
const block = src.slice(src.indexOf("  const AUTO_BATCH_HOUR ="), src.indexOf("  // فحص دورى كل ٥ دقايق"));
const notQueued = src.slice(src.indexOf("const notQueuedSql ="), src.indexOf("`;", src.indexOf("const notQueuedSql =")) + 2);
const portsMissing = cut("const PORTS_MISSING_TECH_SQL", "const hasFrameSql");
const hasFrame = src.slice(src.indexOf("const hasFrameSql ="), src.indexOf("`;", src.indexOf("const hasFrameSql =")) + 2);
const tmp = `/tmp/ports-subinfo-${process.pid}.mts`;
writeFileSync(tmp, `
import { phoneNormSql } from ${JSON.stringify(new URL("../server/phone-norm.ts", import.meta.url).pathname)};
const sp = phoneNormSql;
${notQueued}
${portsMissing}
${hasFrame}
export default function make(pool: any, cairoNow: () => { date: string; hour: number }) {
  const app = { get() {}, post() {} }; const requireAuth = 0, requireSuperAdmin = 0;
  const SITE_OF_TYPE: Record<string, string> = { subinfo: "fcc.te.eg" };
  ${block}
  return { runPortsMissingSubinfo };
}`);
let HOUR = 11;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const make = (await import(pathToFileURL(tmp).href)).default;
const q = (t: string, v: any[] = []) => pool.query(t, v);
let bad = 0; const ok = (l: string, c: boolean, x = "") => { console.log((c ? "  ✅ " : "  ❌ ") + l + (x ? "  " + x : "")); if (!c) bad++; };

await q(`DROP TABLE IF EXISTS app_state, exec_jobs, phone_ports, phone_lines, line_subscriber_info`);
await q(`CREATE TABLE app_state (key text PRIMARY KEY, value text, updated_at timestamptz)`);
await q(`CREATE TABLE exec_jobs (id serial PRIMARY KEY, type text, accounts jsonb, requested_by text, note text,
          priority int DEFAULT 0, batch_id text, site text, requested_from text, status text DEFAULT 'pending',
          created_at timestamptz DEFAULT now())`);
await q(`CREATE TABLE phone_ports (phone_number text, frame text)`);
await q(`CREATE TABLE phone_lines (full_phone text, cabin_number text, box_number text)`);
await q(`CREATE TABLE line_subscriber_info (phone_number text, sub_name text, sub_add text)`);
const port = (p: string) => q(`INSERT INTO phone_ports VALUES ($1, 'F1')`, [p]);
const line = (p: string, cab: string | null, box: string | null) => q(`INSERT INTO phone_lines VALUES ($1, $2, $3)`, [p, cab, box]);
const sub = (p: string, n: string | null, a: string | null) => q(`INSERT INTO line_subscriber_info VALUES ($1, $2, $3)`, [p, n, a]);

await port("882650001"); await line("882650001", "1-1", "3"); await sub("882650001", "أحمد", "الغنايم");   // كامل → لأ
await port("882650002"); await line("882650002", "1-1", null); await sub("882650002", "محمد", "الغنايم"); // بكس ناقص → أيوه
await port("882650003"); await line("882650003", "1-1", "4"); await sub("882650003", "على", null);       // عنوان ناقص → أيوه
await port("882650004");                                                                                 // مالوش أى بيان → أيوه
await port("882650005"); await line("882650005", "1-2", "5");                                            // مالوش اسم → أيوه، بس فى الطابور
await port("SERVICE-X");                                                                                 // مش رقم محلى → لأ
await q(`INSERT INTO exec_jobs (type, accounts, batch_id) VALUES ('subinfo', '["882650005"]', 'bQ')`);

const m1 = make(pool, () => ({ date: today, hour: HOUR }));
await m1.runPortsMissingSubinfo("tick");
ok("قبل ١٢ الضهر مابيعملش حاجة", (await q(`SELECT 1 FROM exec_jobs WHERE batch_id <> 'bQ'`)).rowCount === 0);

HOUR = 12;
await m1.runPortsMissingSubinfo("heartbeat");
const jobs = (await q(`SELECT accounts->>0 AS acc, type, priority, site, note FROM exec_jobs WHERE batch_id <> 'bQ' ORDER BY 1`)).rows;
const accs = jobs.map((j: any) => j.acc);
ok("١٢ الضهر: نفس أرقام التقرير (بكس/عنوان ناقص + مالوش بيان)", JSON.stringify(accs) === JSON.stringify(["882650002", "882650003", "882650004"]), JSON.stringify(accs));
ok("مابيعيدش الرقم اللى مكتمل ولا اللى فى الطابور ولا غير المحلى", !accs.includes("882650001") && !accs.includes("882650005") && !accs.includes("SERVICE-X"));
ok("subinfo — مهمة لكل رقم، أولوية عادية، على FCC",
  jobs.every((j: any) => j.type === "subinfo" && j.priority === 0 && j.site === "fcc.te.eg") && /تشغيل يومى ١٢ ظ/.test(jobs[0]?.note || ""));

await m1.runPortsMissingSubinfo("tick");
const m2 = make(pool, () => ({ date: today, hour: 13 }));          // عملية تانية / ريستارت
await m2.runPortsMissingSubinfo("boot");
ok("مرة واحدة فى اليوم (tick + ريستارت)", (await q(`SELECT 1 FROM exec_jobs WHERE batch_id <> 'bQ'`)).rowCount === 3);

// فشل الإضافة → الحجز يتفك والمحاولة الجاية تنجح
await q(`DELETE FROM exec_jobs WHERE batch_id <> 'bQ'`); await q(`DELETE FROM app_state`);
await q(`ALTER TABLE exec_jobs RENAME COLUMN requested_from TO rf`);
const m3 = make(pool, () => ({ date: today, hour: 12 }));
await m3.runPortsMissingSubinfo("tick");
ok("لو الإضافة فشلت الحجز بيتفك", (await q(`SELECT 1 FROM app_state WHERE key = 'ports_missing_subinfo_last_day'`)).rowCount === 0);
await q(`ALTER TABLE exec_jobs RENAME COLUMN rf TO requested_from`);
await m3.runPortsMissingSubinfo("tick");
ok("والمحاولة الجاية بتضيف", (await q(`SELECT 1 FROM exec_jobs WHERE batch_id <> 'bQ'`)).rowCount === 3);

await q(`DROP TABLE IF EXISTS app_state, exec_jobs, phone_ports, phone_lines, line_subscriber_info`);
await pool.end();
console.log(`\n${bad ? "❌ " + bad + " فشل" : "✅ كله نجح"}`);
process.exit(bad ? 1 : 0);
