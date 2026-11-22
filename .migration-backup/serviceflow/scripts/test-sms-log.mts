/*
 * تسجيل رسالة SMS المتابعة (قرار المالك ٢٠٢٦-٠٩-٣٠): السوبر أدمن بيأكّد «تم الإرسال»،
 * والرسالة بتظهر فى سجل «الاتصالات» بتفاصيل الخط — من غير ما تلمس جدول الاتصالات
 * (تقارير «آخر اتصال» ماتتحسبش فيها). على Postgres حقيقى بكود routes.ts زى ما هو.
 *
 *   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-sms-log.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.log("⏭️  DATABASE_URL مش متحدد"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url });
const src = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const cut = (a: string, b: string) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) { console.log("❌ مالقيتش " + a); process.exit(1); } return src.slice(i, j); };
const getLogs = cut('  // GET /api/customer-contact-logs', '  // POST /api/customer-contact-logs');
const postLog = cut('  // POST /api/sms/log', '  app.get("/api/phone-lines/lookup",');
const tmp = `/tmp/sms-log-${process.pid}.mts`;
writeFileSync(tmp, `import { normalizeEgMobile } from ${JSON.stringify(new URL("../shared/sms-message.ts", import.meta.url).pathname)};
import { phoneNormSql } from ${JSON.stringify(new URL("../server/phone-norm.ts", import.meta.url).pathname)};
const sp = phoneNormSql;
export default function make(pool: any) {
  const h: Record<string, any> = {}; const requireAuth = 0, requireSuperAdmin = 0;
  const app = { get(p: string, ...a: any[]) { h["GET " + p] = a[a.length - 1]; }, post(p: string, ...a: any[]) { h["POST " + p] = a[a.length - 1]; } };
  ${getLogs}
  ${postLog}
  return h;
}`);
const h = (await import(pathToFileURL(tmp).href)).default(pool);
const call = async (k: string, req: any) => { let out: any, code = 200; await h[k](req, { status(c: number) { code = c; return this; }, json(b: any) { out = b; } }); return { code, out }; };
const q = (t: string, v: any[] = []) => pool.query(t, v);
let bad = 0; const ok = (l: string, c: boolean, x = "") => { console.log((c ? "  ✅ " : "  ❌ ") + l + (x ? "  " + x : "")); if (!c) bad++; };

await q(`DROP TABLE IF EXISTS customer_contact_logs, customer_sms_logs`);
await q(`CREATE TABLE customer_contact_logs (id serial PRIMARY KEY, full_phone text NOT NULL, outcome text NOT NULL, notes text,
  contacted_at timestamptz NOT NULL DEFAULT now(), contacted_by_id integer, contacted_by_name text)`);
const db = readFileSync(new URL("../server/db.ts", import.meta.url), "utf8");
const ddl = db.slice(db.indexOf("CREATE TABLE IF NOT EXISTS customer_sms_logs"), db.indexOf("`);", db.indexOf("CREATE TABLE IF NOT EXISTS customer_sms_logs")));
await q(ddl.replace("REFERENCES users(id)", ""));
await q(`INSERT INTO customer_contact_logs (full_phone, outcome, contacted_at, contacted_by_name) VALUES ('882821905','answered', now() - interval '1 hour', 'على')`);

const admin = { id: 1, username: "superadmin", fullName: "المالك" };
let r = await call("POST /api/sms/log", { user: admin, body: { phone: "882821905", mobile: "1012345678" } });
ok("التسجيل: 201", r.code === 201, JSON.stringify(r.out));
ok("رقم محمول غلط → 400", (await call("POST /api/sms/log", { user: admin, body: { phone: "882821905", mobile: "0882" } })).code === 400);
ok("رقم خط غلط → 400", (await call("POST /api/sms/log", { user: admin, body: { phone: "", mobile: "01012345678" } })).code === 400);

r = await call("GET /api/customer-contact-logs", { query: { phone: "882821905" } });
const rows = r.out.data;
ok("السجل فيه الاتصال والرسالة، الأحدث الأول", rows.length === 2 && rows[0].outcome === "sms_sent" && rows[1].outcome === "answered", JSON.stringify(rows.map((x: any) => x.outcome)));
ok("الرسالة: إلى المحمول + مين بعت", rows[0].notes === "إلى 01012345678" && rows[0].contactedByName === "المالك");
ok("مفتاح الرسالة مايتصادمش مع الاتصالات", rows[0].id < 0 && rows[1].id > 0);
r = await call("GET /api/customer-contact-logs", { query: { phone: "2821905" } });
ok("النافذة بالرقم القصير: الرسالة بتظهر برضه", r.out.data.some((x: any) => x.outcome === "sms_sent"));
ok("جدول الاتصالات ماتلمسش (تقارير «آخر اتصال» زى ما هى)", (await q(`SELECT COUNT(*)::int n FROM customer_contact_logs`)).rows[0].n === 1);

await q(`DROP TABLE IF EXISTS customer_contact_logs, customer_sms_logs`);
await pool.end();
console.log(`\n${bad ? "❌ " + bad + " فشل" : "✅ كله نجح"}`);
process.exit(bad ? 1 : 0);
