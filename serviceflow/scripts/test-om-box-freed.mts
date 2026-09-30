/*
 * «متعذرات تم توفير خطوط بها» (قرار المالك ٢٠٢٦-٠٩-٣٠) — على Postgres حقيقى، بكود
 * routes.ts زى ما هو: الشغّال على البكس بيتسجّل وقت رد «بوكس مليان» (والمتعذرات الحالية
 * القديمة بيتسجّل لها الشغّال الحالى)، والتقرير بيعرض اللى الشغّال فيها قلّ.
 *
 *   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-om-box-freed.mts
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
const helpers = cut("const hasFrameSql =", "// ── تطبيق «تصحيح البيان»");
const snapshot = cut("  const OM_BOX_KEY_SQL", "  // POST /api/om-rejections/response");
const reportSrc = cut("  // GET /api/reports/om-box-freed", "  // GET /api/reports/installations-by-tech");
const tmp = `/tmp/om-box-freed-${process.pid}.mts`;
writeFileSync(tmp, `
${helpers}
export default function make(pool: any) {
  const ROLES = { SALES: "sales" };
  const ORDER_STATUS = { FEASIBLE: "feasible", EXTERNAL_FEASIBLE: "external_feasible" };
  const REJECTION_REASONS = { BOX_FULL: "بوكس مليان" };
  const handlers: Record<string, any> = {};
  const app = { get(p: string, _a: any, h: any) { handlers[p] = h; } }; const requireAuth = 0;
  ${snapshot}
  ${reportSrc}
  return { snapshotOmBoxFullWorking, report: handlers["/api/reports/om-box-freed"] };
}`);
const { snapshotOmBoxFullWorking, report } = (await import(pathToFileURL(tmp).href)).default(pool);
const q = (t: string, v: any[] = []) => pool.query(t, v);
let bad = 0; const ok = (l: string, c: boolean, x = "") => { console.log((c ? "  ✅ " : "  ❌ ") + l + (x ? "  " + x : "")); if (!c) bad++; };
const call = async (all = false) => {
  let out: any; let code = 200;
  await report({ user: { role: "admin" }, query: all ? { all: "1" } : {} },
    { status(c: number) { code = c; return this; }, json(b: any) { out = b; } });
  if (code !== 200) throw new Error(JSON.stringify(out));
  return out as any[];
};
const snap = async (s: string) => (await q(`SELECT box_working_at_response AS n, box_working_key AS k FROM om_responses WHERE serial_number = $1`, [s])).rows[0];

await q(`DROP TABLE IF EXISTS phone_lines, phone_ports, om_responses, ftth_orders_current`);
await q(`CREATE TABLE phone_lines (full_phone text, tel_no text, central text, cabin_number text, box_number text)`);
await q(`CREATE TABLE phone_ports (phone_number text, frame text)`);
await q(`CREATE TABLE ftth_orders_current (serial_number text, service_number text, customer_name text, msan_code text)`);
// نفس DDL الـensureSchema (الأعمدة اللى بنستخدمها)
await q(`CREATE TABLE om_responses (serial_number text PRIMARY KEY, status text NOT NULL DEFAULT 'pending',
  is_feasible boolean, rejection_reason text, central_name text, cabin_number text, box_number text,
  tech_name text, responded_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())`);
const db = readFileSync(new URL("../server/db.ts", import.meta.url), "utf8");
for (const m of db.matchAll(/ALTER TABLE om_responses ADD COLUMN IF NOT EXISTS [^`]+/g)) await q(m[0]);

// بكس ١ (الغنايم/ك٥/ب٧): ٥ خطوط على البكس — ٤ لها بورت + ١ من غير بورت (مابيتحسبش)
const line = async (p: string, box: string, frame: string | null, cab = "5") => {
  await q(`INSERT INTO phone_lines VALUES ($1,$1,'الغنايم',$2,$3)`, [p, cab, box]);
  if (frame !== null) await q(`INSERT INTO phone_ports VALUES ($1,$2)`, [p, frame]);
};
for (const p of ["881", "882", "883", "884"]) await line(p, "7", "F1");
await line("885", "7", null);
await line("886", "7", "  ");               // فريم فاضى = مالوش بورت
await line("887", "7", "F1", "9");          // نفس البكس على كابينة تانية — مابيتحسبش
for (const p of ["891", "892"]) await line(p, "8", "F2");

await q(`INSERT INTO ftth_orders_current VALUES ('S-OLD','5001','قديم','M1'), ('S-NEW','5002','جديد','M1'),
          ('S-OTHER','5003','سبب تانى','M1'), ('S-B8','5004','بكس ٨','M1'), ('S-FEAS','5005','اتنفّذ','M1')`);
// متعذرات «بوكس مليان» مردود عليها **قبل** الميزة (مالهاش رقم) + واحد مش حالى
await q(`INSERT INTO om_responses (serial_number, status, is_feasible, rejection_reason, central_name, cabin_number, box_number, tech_name, responded_at) VALUES
  ('S-OLD','not_feasible',false,'بوكس مليان','الغنايم','5','7','t1', now() - interval '20 days'),
  ('S-OTHER','not_feasible',false,'مسافة بعيدة','الغنايم','5','7','t1', now()),
  ('S-B8','needs_external',false,'بوكس مليان','الغنايم','5','8','t2', now()),
  ('S-FEAS','external_feasible',false,'بوكس مليان','الغنايم','5','8','t2', now()),
  ('S-GONE','not_feasible',false,'بوكس مليان','الغنايم','5','7','t1', now())`);

const n1 = await snapshotOmBoxFullWorking();
ok("المتعذرات الحالية القديمة اتسجّل لها الشغّال الحالى", (await snap("S-OLD")).n === 4, JSON.stringify(await snap("S-OLD")));
ok("الشغّال = له بورت بس، ونفس الكابينة", (await snap("S-OLD")).n === 4);
ok("بكس ٨ (محوَّل للشئون الخارجية) اتسجّل", (await snap("S-B8")).n === 2);
ok("سبب غير «بوكس مليان» مابيتسجّلش", (await snap("S-OTHER")).n === null);
ok("متعذر مش فى الحالية مابيتسجّلش", (await snap("S-GONE")).n === null);
ok("اتسجّل ٣ (القديم + بكس ٨ + اللى اتنفّذ — التقرير هو اللى بيستبعده)", n1 === 3, String(n1));
ok("تشغيل تانى: مابيعدّش تانى (idempotent)", (await snapshotOmBoxFullWorking()) === 0);
ok("التقرير فاضى — مفيش حاجة قلّت", (await call()).length === 0);

// رد جديد (نفس اللى route الرد بيعمله: يمسح الرقم وبعدين يسجّل) على بكس ٧ لما بقى ٤
await q(`INSERT INTO ftth_orders_current VALUES ('S-NEW2','5006','جديد ٢','M1')`);
await q(`INSERT INTO om_responses (serial_number, status, is_feasible, rejection_reason, central_name, cabin_number, box_number, tech_name, responded_at)
         VALUES ('S-NEW2','not_feasible',false,'بوكس مليان','الغنايم','5','7','t3', now())`);
await snapshotOmBoxFullWorking("S-NEW2");
ok("رد جديد: اتسجّل الشغّال وقت الرد", (await snap("S-NEW2")).n === 4);

// خط اتفكّ من بكس ٧ (البورت اتشال) → الشغّال ٣ < ٤
await q(`DELETE FROM phone_ports WHERE phone_number = '884'`);
let r = await call();
ok("بعد فك خط: متعذرات بكس ٧ ظهرت", r.map((x) => x.serial).sort().join() === "S-NEW2,S-OLD", JSON.stringify(r.map((x) => x.serial)));
ok("الأرقام: ٤ وقت الرد ← ٣ دلوقتى، اتوفّر ١", r.every((x) => x.recorded === 4 && x.current === 3 && x.freed === 1));
ok("بيرجّع بيانات العميل من المتعذرات الحالية", r.find((x) => x.serial === "S-OLD")?.serviceNumber === "5001");
ok("زيادة الشغّال فى بكس تانى مابتظهرش", !r.some((x) => x.serial === "S-B8"));

await q(`DELETE FROM phone_lines WHERE full_phone = '892'`);
r = await call();
ok("بكس ٨ قلّ → المحوَّل للشئون الخارجية ظهر", r.some((x) => x.serial === "S-B8"));
ok("اللى الشئون الخارجية قالت يمكن تنفيذه مابيظهرش", !r.some((x) => x.serial === "S-FEAS"));
ok("الترتيب: الأكتر توفيراً الأول", r[0].freed >= r[r.length - 1].freed);

// all=1: كل «بوكس مليان» الحالى بالرقمين
const all = await call(true);
ok("all=1 بيعرض كل «بوكس مليان» الحالى (من غير اللى اتنفّذ)", all.length === 3, String(all.length));

// السبب اتغيّر → الرقم يتشال؛ رجع «بوكس مليان» → يتسجّل من جديد بالشغّال وقتها
await q(`UPDATE om_responses SET rejection_reason = 'مسافة بعيدة' WHERE serial_number = 'S-OLD'`);
await snapshotOmBoxFullWorking();
ok("السبب اتغيّر: الرقم اتشال", (await snap("S-OLD")).n === null);
await q(`UPDATE om_responses SET rejection_reason = 'بوكس مليان' WHERE serial_number = 'S-OLD'`);
await snapshotOmBoxFullWorking();
ok("رجع «بوكس مليان»: اتسجّل الشغّال وقتها (٣)", (await snap("S-OLD")).n === 3);

// البكس اتصحّح فى الرد → يتعدّ على البكس الجديد
await q(`UPDATE om_responses SET box_number = '8' WHERE serial_number = 'S-OLD'`);
await snapshotOmBoxFullWorking();
ok("البكس اتغيّر: اتعدّ على البكس الجديد", (await snap("S-OLD")).n === 1 && (await snap("S-OLD")).k === "الغنايم|5|8");

await q(`DROP TABLE IF EXISTS phone_lines, phone_ports, om_responses, ftth_orders_current`);
await pool.end();
console.log(`\n${bad ? "❌ " + bad + " فشل" : "✅ كله نجح"}`);
process.exit(bad ? 1 : 0);
