/*
 * قياس سرعة «أرقام لها شكاوى بدون رقم موبايل» بكود routes.ts زى ما هو، على بيانات بحجم
 * الحقيقى (٢٥ ألف خط، ١٥٠ ألف شكوى تفاصيل، ٦ آلاف متبقى…).
 *   DATABASE_URL=postgres://… SEED=1 npx tsx serviceflow/scripts/bench-no-mobile-complaints.mts
 *   (قاعدة تجربة — SEED بيمسح الجداول ويعيد زرعها؛ من غيره بيقيس على الموجود)
 * ٢٠٢٦-٠٩-٣٠: من غير فهرس phone_lines.full_phone المطبَّع > ١٥ دقيقة، وبعده ~١ث.
 * ⚠️ الزرع بيعمل الفهارس اللى فى ensureSchema يدوياً — لو اتضاف فهرس هناك ضيفه هنا.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (t: string, v: any[] = []) => pool.query(t, v);
const src = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const cut = (a: string, b: string) => { const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i)); };
const hasMob = cut("const HAS_MOBILE_SET =", "// أرقام البورتات الصالحة");
const route = cut('  app.get("/api/phone-lines/no-mobile-complaints"', '  // POST /api/line-mobile-checked');
const tmp = `/tmp/bench-${process.pid}.mts`;
writeFileSync(tmp, `import { phoneNormSql } from ${JSON.stringify(new URL("../server/phone-norm.ts", import.meta.url).pathname)};
const sp = phoneNormSql;
${hasMob}
export default function make(pool: any) {
  const h: any = {}; const requireAuth = 0;
  const app = { get(p: string, _a: any, f: any) { h[p] = f; } };
  const n = (c: string) => \`lower(\${c})\`; const arQ = (s: string) => "%" + s + "%";
  ${route}
  return h["/api/phone-lines/no-mobile-complaints"];
}`);
const handler = (await import(pathToFileURL(tmp).href)).default(pool);
if (process.env.SEED) {
  await q(`DROP TABLE IF EXISTS complaint_details, remaining_complaints, manual_faults, ticket_dsl_current, ticket_dsl_sod, phone_lines, phone_ports, line_subscriber_info, cabinet_technicians, technician_names, line_mobiles, maintenance_orders, ftth_orders_current, line_mobile_checked`);
  await q(`CREATE TABLE complaint_details (id serial, complain_no text, phone_number text, exchange_name text, cabinet_no text, msan_id text, close_code text, complain_type_name text, complain_time timestamptz, close_time timestamptz, close_by text)`);
  await q(`CREATE TABLE remaining_complaints (id serial, complain_no text, phone_number text, exchange_name text, cabinet_no text, msan_id text, close_code text, complain_type text, complain_time timestamptz, close_time timestamptz, close_by text, status_code text)`);
  await q(`CREATE TABLE manual_faults (id serial, full_phone text, phone_short text, central text, cabin_number text, box_number text, msan_code text, close_code text, status text, regularized_at timestamptz, regularized_by text)`);
  await q(`CREATE TABLE ticket_dsl_current (ticket_id text, phone_number text, central_name text, cabinet_no text, complain_type_name text, complaint_time timestamptz, close_date timestamptz, status_code text)`);
  await q(`CREATE TABLE ticket_dsl_sod (ticket_id text, phone_number text, central_name text, cabinet_no text, complain_type_name text, complaint_time timestamptz, status_code text)`);
  await q(`CREATE TABLE phone_lines (id serial, full_phone text, tel_no text, central text, cabin_number text, box_number text, dp_terminal text)`);
  await q(`CREATE TABLE phone_ports (phone_number text, msan_code text, frame text)`);
  await q(`CREATE TABLE line_subscriber_info (phone_number text, sub_name text, sub_add text)`);
  await q(`CREATE TABLE cabinet_technicians (central_name text, cabin_number text, worker_code text, cabin_code text)`);
  await q(`CREATE TABLE technician_names (worker_code text, tech_name text)`);
  await q(`CREATE TABLE line_mobiles (full_phone text, mobile text)`);
  await q(`CREATE TABLE maintenance_orders (phone_number text, mobile text)`);
  await q(`CREATE TABLE ftth_orders_current (service_number text, customer_mobile text)`);
  await q(`CREATE TABLE line_mobile_checked (full_phone text)`);
  const N = 25000;
  await q(`INSERT INTO phone_lines (full_phone, tel_no, central, cabin_number, box_number) SELECT '88'||(2000000+g), (2000000+g)::text, 'الغنايم', (g%60)::text, (g%30)::text FROM generate_series(1,$1) g`, [N]);
  await q(`INSERT INTO phone_ports SELECT '88'||(2000000+g), '11-2-'||(g%60), 'F' FROM generate_series(1,$1) g`, [N + 3000]);
  await q(`INSERT INTO line_subscriber_info SELECT '88'||(2000000+g), 'اسم '||g, 'عنوان' FROM generate_series(1,$1) g`, [N]);
  await q(`INSERT INTO cabinet_technicians SELECT 'الغنايم', g::text, 'W'||(g%20), '11-2-'||g FROM generate_series(0,59) g`);
  await q(`INSERT INTO technician_names SELECT 'W'||g, 'فنى '||g FROM generate_series(0,19) g`);
  await q(`INSERT INTO line_mobiles SELECT '88'||(2000000+g), '010'||g FROM generate_series(1,$1,5) g`, [N]);
  await q(`INSERT INTO maintenance_orders SELECT (2000000+(g % $1))::text, '011'||g FROM generate_series(1,60000) g WHERE g % 3 = 0`, [N]);
  await q(`INSERT INTO ftth_orders_current SELECT (2000000+g)::text, '012'||g FROM generate_series(1,1500) g`);
  await q(`INSERT INTO complaint_details (complain_no, phone_number, exchange_name, cabinet_no, complain_type_name, complain_time, close_time)
           SELECT 'C'||g, (2000000+(g*7 % $1))::text, 'الغنايم', (g%60)::text, 'نوع', now() - (g % 365) * interval '1 day' - interval '2 hours', now() - (g % 365) * interval '1 day' FROM generate_series(1,150000) g`, [N]);
  await q(`INSERT INTO remaining_complaints (complain_no, phone_number, exchange_name, cabinet_no, complain_type, complain_time, close_time, status_code)
           SELECT 'R'||g, (2000000+(g*11 % $1))::text, 'الغنايم', (g%60)::text, 'نوع', now() - (g % 120) * interval '1 day', now() - (g % 120) * interval '1 day', CASE WHEN g%2=0 THEN '138' ELSE '135' END FROM generate_series(1,6000) g`, [N]);
  await q(`INSERT INTO ticket_dsl_current SELECT 'T'||g, (2000000+(g*13 % $1))::text, 'الغنايم', (g%60)::text, '160 x', now() - (g%30)*interval '1 day', CASE WHEN g%5=0 THEN now() ELSE NULL END, '160' FROM generate_series(1,800) g`, [N]);
  await q(`INSERT INTO ticket_dsl_sod SELECT 'S'||g, (2000000+(g*17 % $1))::text, 'الغنايم', (g%60)::text, '160 x', now(), '160' FROM generate_series(1,800) g`, [N]);
  await q(`INSERT INTO manual_faults (full_phone, phone_short, central, status, regularized_at) SELECT '88'||(2000000+g), (2000000+g)::text, 'الغنايم', 'regularized', now() - (g%60)*interval '1 day' FROM generate_series(1,400) g`);
  await q(`INSERT INTO line_mobile_checked SELECT '88'||(2000000+g) FROM generate_series(1,800) g`);
  const { phoneNormSql } = await import(new URL("../server/phone-norm.ts", import.meta.url).href);
  for (const [t, c] of [["phone_lines","full_phone"],["complaint_details","phone_number"],["remaining_complaints","phone_number"],["ticket_dsl_current","phone_number"],["manual_faults","phone_short"],["manual_faults","full_phone"],["line_subscriber_info","phone_number"],["phone_ports","phone_number"]])
    await q(`CREATE INDEX ON ${t} ((${phoneNormSql(c)}))`);
  await q(`ANALYZE`);
  console.log("seeded");
}
for (let i = 0; i < 2; i++) {
  const t = Date.now(); let out: any, code = 200;
  await handler({ user: { role: "super_admin" }, query: { dateFrom: "2026-07-30", dateTo: "2026-09-30" } }, { status(c: number) { code = c; return this; }, json(b: any) { out = b; } });
  console.log(`run ${i + 1}: ${Date.now() - t} ms  code=${code} total=${out?.total} rows=${out?.data?.length} ${out?.message ?? ""}`);
}
await pool.end();
