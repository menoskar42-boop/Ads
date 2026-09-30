/*
 * تقارير «الكروت (شيلف/سلوت)» و«الفاضى لكل نوع بورت» و«الخطوط المرفوعة» للفنيين —
 * كل فنى كباينه بس (قرار المالك ٢٠٢٦-٠٩-٣٠). على Postgres حقيقى بكود routes.ts زى ما هو.
 *
 *   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-tech-port-reports.mts
 *   (قاعدة تجربة — بيعمل جداوله وبيمسحها)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) { console.log("⏭️  DATABASE_URL مش متحدد"); process.exit(2); }
const pool = new pg.Pool({ connectionString: url });
const src = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const cut = (from: string, to: string) => {
  const i = src.indexOf(from); const j = src.indexOf(to, i);
  if (i < 0 || j < 0) { console.log("❌ مالقيتش: " + from); process.exit(1); }
  return src.slice(i, j);
};
const helpers = cut("  // كباين الفنى بأكواد MSAN", "  async function coverageCodes(");
const removed = cut('  app.get("/api/phone-ports/removed"', "  // GET /api/phone-ports/slot-cards");
const slots = cut('  app.get("/api/phone-ports/slot-cards"', "  // GET /api/phone-ports/cabinet-free");
const tmp = `/tmp/tech-port-reports-${process.pid}.mts`;
writeFileSync(tmp, `
export default function make(pool: any) {
  const ROLES = { TECH: "tech" };
  const n = (c: string) => c; const arQ = (q: string) => "%" + q + "%";
  const handlers: Record<string, any> = {};
  const app = { get(p: string, _a: any, h: any) { handlers[p] = h; } }; const requireAuth = 0;
  ${helpers}
  ${removed}
  ${slots}
  return { techMsanCodes, handlers };
}`);
const { techMsanCodes, handlers } = (await import(pathToFileURL(tmp).href)).default(pool);
const q = (t: string, v: any[] = []) => pool.query(t, v);
let bad = 0; const ok = (l: string, c: boolean, x = "") => { console.log((c ? "  ✅ " : "  ❌ ") + l + (x ? "  " + x : "")); if (!c) bad++; };
const call = async (path: string, user: any, query: any = {}) => {
  let out: any; let code = 200;
  await handlers[path]({ user, query }, { status(c: number) { code = c; return this; }, json(b: any) { out = b; } });
  if (code !== 200) throw new Error(JSON.stringify(out));
  return out.data as any[];
};
const codesOf = (rows: any[]) => [...new Set(rows.map((r) => r.msanCode))].sort().join(",");

await q(`DROP TABLE IF EXISTS technician_names, cabinet_technicians, msan_tech_overrides, phone_ports, removed_phone_ports`);
await q(`CREATE TABLE technician_names (id serial PRIMARY KEY, worker_code text, tech_name text)`);
await q(`CREATE TABLE cabinet_technicians (id serial PRIMARY KEY, worker_code text, cabin_code text)`);
await q(`CREATE TABLE msan_tech_overrides (id serial PRIMARY KEY, cabin_code text UNIQUE, tech_name text)`);
await q(`CREATE TABLE phone_ports (phone_number text, msan_code text, shelf text, slot text, port_type text, frame text)`);
await q(`CREATE TABLE removed_phone_ports (phone_number text, area_code text, msan_code text, frame text, shelf text, slot text,
  port_number text, port_type text, voice_status text, data_status text, operator text, onu text,
  last_uploaded_at timestamptz, removed_at timestamptz DEFAULT now(), removed_source text)`);

await q(`INSERT INTO technician_names (worker_code, tech_name) VALUES ('W1','حسن'), ('W2','على')`);
await q(`INSERT INTO cabinet_technicians (worker_code, cabin_code) VALUES
  ('W1','11-2-227-01'), ('W1',' 11-2-227-20 '), ('W2','11-2-26-01'), ('W2','11-2-26-02')`);
// إسناد يدوى: 11-2-26-02 لحسن مع زميل (قائمة بفاصلة)
await q(`INSERT INTO msan_tech_overrides (cabin_code, tech_name) VALUES ('11-2-26-02', 'حسن , سعيد')`);
for (const code of ["11-2-227-01", "11-2-227-20", "11-2-26-01", "11-2-26-02", "11-2-26-07"]) {
  await q(`INSERT INTO phone_ports VALUES ($1||'-a', $1, '1', '2', 'VDSL', 'F'), ($1||'-b', $1, '1', '2', 'VDSL', NULL)`, [code]);
  await q(`INSERT INTO removed_phone_ports (phone_number, msan_code) VALUES ($1||'-r', $1)`, [code]);
}

const hasan = { role: "tech", workerCode: "W1", username: "hasan" };
const ali = { role: "tech", workerCode: "W2", username: "ali" };
const nobody = { role: "tech", workerCode: "", username: "x" };
const admin = { role: "admin", workerCode: "" };

ok("كباين حسن: كود العامل + الإسناد اليدوى باسمه", (await techMsanCodes(hasan)).map((c: string) => c.trim()).sort().join() === "11-2-227-01,11-2-227-20,11-2-26-02");
ok("غير الفنى = null (الكل)", (await techMsanCodes(admin)) === null);

let r = await call("/api/phone-ports/slot-cards", hasan);
ok("الكروت: حسن يشوف كباينه بس (المسافات فى الكود مابتفرقش)", codesOf(r) === "11-2-227-01,11-2-227-20,11-2-26-02", codesOf(r));
ok("الكروت: عدد الشغّال زى ما هو", r.every((x) => x.workingCount === 1 && x.portsCount === 2));
r = await call("/api/phone-ports/slot-cards", ali);
ok("الكروت: على يشوف كباينه (بما فيها المسنودة لحسن يدوياً — ليه برقم العامل)", codesOf(r) === "11-2-26-01,11-2-26-02", codesOf(r));
ok("الكروت: فنى مالوش كباين مايشوفش حاجة", (await call("/api/phone-ports/slot-cards", nobody)).length === 0);
ok("الكروت: الأدمن يشوف الكل", codesOf(await call("/api/phone-ports/slot-cards", admin)).split(",").length === 5);
r = await call("/api/phone-ports/slot-cards", hasan, { q: "11-2-26" });
ok("الكروت: البحث جوّه كباين الفنى بس", codesOf(r) === "11-2-26-02", codesOf(r));
r = await call("/api/phone-ports/slot-cards", hasan, { phone: "11-2-26-07-a" });
ok("الكروت: بحث برقم مش فى كباينه مايجيبش حاجة", r.length === 0);

r = await call("/api/phone-ports/removed", hasan);
ok("المرفوعة: حسن يشوف كباينه بس", codesOf(r) === "11-2-227-01,11-2-227-20,11-2-26-02", codesOf(r));
ok("المرفوعة: فنى مالوش كباين مايشوفش حاجة", (await call("/api/phone-ports/removed", nobody)).length === 0);
ok("المرفوعة: الأدمن يشوف الكل", (await call("/api/phone-ports/removed", admin)).length === 5);

await q(`DROP TABLE IF EXISTS technician_names, cabinet_technicians, msan_tech_overrides, phone_ports, removed_phone_ports`);
await pool.end();
console.log(`\n${bad ? "❌ " + bad + " فشل" : "✅ كله نجح"}`);
process.exit(bad ? 1 : 0);
