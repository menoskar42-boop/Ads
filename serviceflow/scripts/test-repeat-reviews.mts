// اختبار حقيقى لـ«رد التكرار» على Postgres (server/repeat-reviews.ts):
//   DATABASE_URL=postgres://… npx tsx serviceflow/scripts/test-repeat-reviews.mts
// بيعمل جداول الصيانة المصغّرة + بيانات شكاوى فى سكيمة/صفوف تجربة، ويشغّل الـendpoints
// الحقيقية على express ببيان خط وهمى، ويمسح كل اللى عمله فى الآخر.
import express from "express";
import pg from "pg";
import http from "node:http";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) { console.log("⏭️  DATABASE_URL مش متحدد"); process.exit(2); }

// موقع صيانة وهمى (ensure-box) — قبل استيراد box-full-inspection عشان MAINT_BASE
const maintStub = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c));
  req.on("end", () => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ boxId: 777 })); });
});
await new Promise<void>((r) => maintStub.listen(0, r));
process.env.MAINTENANCE_API_BASE = `http://127.0.0.1:${(maintStub.address() as any).port}`;

const { registerRepeatReviews } = await import("../server/repeat-reviews.ts");
const pool = new pg.Pool({ connectionString: url });
let fails = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${label} ${extra}`); if (!cond) fails++;
};

const PH = "2999001", MONTH = "2026-09";
const dbSrc = readFileSync(new URL("../server/db.ts", import.meta.url), "utf8");
const ddl = dbSrc.slice(dbSrc.indexOf("CREATE TABLE IF NOT EXISTS repeat_reviews"), dbSrc.indexOf("`);", dbSrc.indexOf("CREATE TABLE IF NOT EXISTS repeat_reviews")));

async function setup() {
  await pool.query(ddl);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS maintenance`);
  await pool.query(`CREATE TABLE IF NOT EXISTS maintenance.exchanges (id serial PRIMARY KEY, name text)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS maintenance.cabinets (id serial PRIMARY KEY, exchange_id int, number text)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS maintenance.boxes (id serial PRIMARY KEY, cabinet_id int, number text)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS maintenance.users (id serial PRIMARY KEY, username text, full_name text, role text, is_active int DEFAULT 1)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS maintenance.inspections (id serial PRIMARY KEY, box_id int, inspector_id int, date date, is_archived int DEFAULT 0, auto_created int DEFAULT 0)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS maintenance.inspection_items (id serial PRIMARY KEY, inspection_id int, item_key text, value text)`);
  await cleanup();
  const ex = (await pool.query(`INSERT INTO maintenance.exchanges (name) VALUES ('سنترال تجربة') RETURNING id`)).rows[0].id;
  const cab = (await pool.query(`INSERT INTO maintenance.cabinets (exchange_id, number) VALUES ($1, '9-9') RETURNING id`, [ex])).rows[0].id;
  await pool.query(`INSERT INTO maintenance.boxes (cabinet_id, number) VALUES ($1, '41'), ($1, '42')`, [cab]);
  await pool.query(`INSERT INTO maintenance.users (username, full_name, role) VALUES ('rr_insp', 'فاحص تجربة', 'inspector'), ('rr_maint', 'فنى صيانة تجربة', 'technician')`);
  // أول شكوى فى سبتمبر: 10 سبتمبر 23:30 (توقيت الشيت = UTC) — وشكوى فى أغسطس مالهاش دعوة
  await pool.query(`INSERT INTO complaint_details (complain_no, phone_number, complain_time) VALUES
    ('RR-1', $1, '2026-09-10 23:30+00'), ('RR-0', $1, '2026-07-20 10:00+00')`, [PH]);
  await pool.query(`INSERT INTO remaining_complaints (complain_no, phone_number, complain_time) VALUES ('RR-2', $1, '2026-09-18 09:00+00')`, [PH]);
  await pool.query(`INSERT INTO cfm_users (username, password, name, role) VALUES ('rr_splice', 'x', 'لحام تجربة', 'splice_tech')`);
}
async function cleanup() {
  await pool.query(`DELETE FROM repeat_reviews WHERE phone_short = $1`, [PH]);
  await pool.query(`DELETE FROM complaint_details WHERE complain_no LIKE 'RR-%'`);
  await pool.query(`DELETE FROM remaining_complaints WHERE complain_no LIKE 'RR-%'`);
  await pool.query(`DELETE FROM line_data_corrections WHERE phone_local = $1`, [PH]);
  await pool.query(`DELETE FROM cfm_users WHERE username = 'rr_splice'`);
  await pool.query(`DELETE FROM maintenance.inspection_items WHERE inspection_id IN (SELECT i.id FROM maintenance.inspections i JOIN maintenance.boxes b ON b.id = i.box_id JOIN maintenance.cabinets c ON c.id = b.cabinet_id WHERE c.number = '9-9')`);
  await pool.query(`DELETE FROM maintenance.inspections WHERE box_id IN (SELECT b.id FROM maintenance.boxes b JOIN maintenance.cabinets c ON c.id = b.cabinet_id WHERE c.number = '9-9')`);
  await pool.query(`DELETE FROM maintenance.boxes WHERE cabinet_id IN (SELECT id FROM maintenance.cabinets WHERE number = '9-9')`);
  await pool.query(`DELETE FROM maintenance.cabinets WHERE number = '9-9'`);
  await pool.query(`DELETE FROM maintenance.exchanges WHERE name = 'سنترال تجربة'`);
  await pool.query(`DELETE FROM maintenance.users WHERE username LIKE 'rr_%'`);
}
const inspect = async (box: string, date: string, opts: { auto?: boolean; bad?: number } = {}) => {
  const b = (await pool.query(`SELECT b.id FROM maintenance.boxes b JOIN maintenance.cabinets c ON c.id = b.cabinet_id WHERE c.number = '9-9' AND b.number = $1`, [box])).rows[0].id;
  const u = (await pool.query(`SELECT id FROM maintenance.users WHERE username = 'rr_insp'`)).rows[0].id;
  const i = (await pool.query(`INSERT INTO maintenance.inspections (box_id, inspector_id, date, auto_created) VALUES ($1, $2, $3, $4) RETURNING id`, [b, u, date, opts.auto ? 1 : 0])).rows[0].id;
  for (let k = 0; k < (opts.bad ?? 0); k++) await pool.query(`INSERT INTO maintenance.inspection_items (inspection_id, item_key, value) VALUES ($1, $2, 'bad')`, [i, "k" + k]);
  return i;
};

// بيان الخط الوهمى (بيتغيّر فى نص الاختبار زى ما «تصحيح البيان» بيعمل)
const lineState = { central: "سنترال تجربة", cabinNumber: "9-9", boxNumber: "41", dpTerminal: "5", ownedByMe: false };
let currentUser: any = { id: 1, username: "ext", fullName: "شئون تجربة", role: "external" };
const app = express();
app.use(express.json());
const requireAuth = (req: any, _res: any, next: any) => { req.user = currentUser; next(); };
const requireSuperAdmin = (req: any, res: any, next: any) => req.user?.role === "super_admin" ? next() : res.status(403).json({});
registerRepeatReviews(app as any, {
  pool: pool as any, requireAuth, requireSuperAdmin,
  lookupPhoneLine: async () => ({ line: { ...lineState, techName: "حسن", mobile: "010", subName: "عميل" }, codes: {} }),
  techMsanCodes: async () => [],
  msanInCodesSql: (col: string, p: string) => `${col} = ANY(${p}::text[])`,
});
const srv = app.listen(0);
const base = `http://127.0.0.1:${(srv.address() as any).port}`;
const get = async (p: string) => { const r = await fetch(base + p); return { s: r.status, j: await r.json() }; };
const post = async (p: string, b: any) => {
  const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  return { s: r.status, j: await r.json() };
};
const step = (s: string, extra: any = {}) => post("/api/repeat-reviews/step", { phone: "88" + PH, month: MONTH, step: s, ...extra });

try {
  await setup();
  let r = await get(`/api/repeat-reviews/one?phone=${PH}&month=${MONTH}`);
  ok("الرد لسه مااتعملش، وأول شكوى فى سلسلة التكرار = 2026-09-10 (يوليو برّه الشهر)", r.s === 200 && r.j.review === null && r.j.firstComplaintDate === "2026-09-10", JSON.stringify(r.j.firstComplaintDate));
  ok("البكس مش مفحوص", r.j.inspection === null);
  await pool.query(`INSERT INTO complaint_details (complain_no, phone_number, complain_time) VALUES ('RR-9', $1, '2026-10-02 19:58+00'), ('RR-8', $1, '2026-09-04 17:51+00')`, ["2999002"]);
  r = await get(`/api/repeat-reviews/one?phone=2999002&month=2026-10`);
  ok("شكوى سابقة فى الشهر اللى فات (09-04 ← 10-02) هى أول السلسلة", r.j.firstComplaintDate === "2026-09-04", JSON.stringify(r.j.firstComplaintDate));

  ok("الترتيب: مينفعش فحص قبل البيان", (await step("inspection")).s === 400);
  ok("مينفعش إفادات قبل الفحص", (await step("statements", { customer: "a", tech: "b" })).s === 400);
  ok("«اتصحّح» من غير تصحيح متبعت مرفوض", (await step("line", { status: "corrected" })).s === 400);
  r = await step("line", { status: "confirmed" });
  ok("تأكيد البيان", r.s === 200 && r.j.step === 1 && r.j.review.line_box === "41");

  ok("رابط الفحص من موقع الصيانة", (await post("/api/repeat-reviews/box-link", { phone: PH, month: MONTH })).j.createUrl === "/maintenance/inspector/create/777");

  await inspect("41", "2026-09-05", { bad: 2 });
  r = await step("inspection");
  ok("فحص قبل أول شكوى مرفوض (إعادة فحص)", r.s === 400 && /إعادة فحص/.test(r.j.message), r.j.message);
  await inspect("41", "2026-09-11", { auto: true });
  ok("فحص اتفتح أوتوماتيك (مراجعة بيانات) مش بيتحسب", (await step("inspection")).s === 400);
  const good = await inspect("41", "2026-09-10", { bad: 3 });
  r = await step("inspection");
  ok("فحص يوم أول شكوى مقبول ومربوط", r.s === 200 && r.j.review.inspection_id === good && r.j.review.inspection_bad_items === 3 && r.j.step === 2);
  r = await get(`/api/repeat-reviews/one?phone=${PH}&month=${MONTH}`);
  ok("الشاشة بتقول الفحص صالح ومعاه رابطه", r.j.inspection?.valid === true && r.j.inspection?.viewUrl === `/maintenance/inspector/${good}`);

  ok("الإفادتين إجباريين", (await step("statements", { customer: "قال إن النت بيفصل", tech: "" })).s === 400);
  r = await step("statements", { customer: "قال إن النت بيفصل بالليل", tech: "اتغيّر الجمبر" });
  ok("حفظ الإفادات", r.s === 200 && r.j.step === 3);

  const opts = (await get("/api/repeat-reviews/at-fault-options")).j;
  ok("أسماء المقصّر: الخمس فنيين + فنى الصيانة + اللحام", opts.techs?.length === 5 && opts.maintenance.includes("فنى صيانة تجربة") && opts.splice.includes("لحام تجربة"));
  ok("اسم مش فى القايمة مرفوض", (await step("assessment", { cause: "جمبر", hasFault: true, atFaultName: "حد غريب" })).s === 400);
  ok("لازم تحدّد يوجد مقصّر ولا لأ", (await step("assessment", { cause: "جمبر" })).s === 400);
  r = await step("assessment", { cause: "جمبر مفكوك فى البكس", hasFault: true, atFaultName: "لحام تجربة" });
  ok("التقييم: المقصّر لحام", r.s === 200 && r.j.review.at_fault_kind === "splice" && r.j.step === 4);
  r = await step("complete");
  ok("حفظ نهائى", r.s === 200 && r.j.review.status === "done");

  // تصحيح البيان بعد الإكمال وغيّر البكس → الفحص يتشال والرد يرجع «جارى»
  await pool.query(`INSERT INTO line_data_corrections (phone_local, phone_full, central, cabin_number, box_number) VALUES ($1, $2, 'سنترال تجربة', '9-9', '42')`, [PH, "88" + PH]);
  lineState.boxNumber = "42";
  r = await step("line", { status: "corrected" });
  ok("تصحيح البيان لبكس تانى بيلغى الفحص ويرجّع الرد جارى", r.s === 200 && r.j.review.inspection_id === null && r.j.review.status === "draft" && r.j.review.line_correction_id != null && r.j.step === 1);
  ok("وبعد الإكمال مينفعش من غير فحص للبكس الجديد", (await step("complete")).s === 400);

  // الفنى: قراية بس — على خطوطه
  currentUser = { id: 2, username: "t", role: "tech" };
  ok("الفنى مايقدرش يكتب", (await step("statements", { customer: "x", tech: "y" })).s === 403);
  ok("الفنى على خط مش بتاعه مايشوفش", (await get(`/api/repeat-reviews/one?phone=${PH}&month=${MONTH}`)).s === 403);
  lineState.ownedByMe = true;
  r = await get(`/api/repeat-reviews/one?phone=${PH}&month=${MONTH}`);
  ok("الفنى على خطه بيشوف الرد قراية بس", r.s === 200 && r.j.canEdit === false && r.j.review?.cause === "جمبر مفكوك فى البكس");

  // القايمة والتقرير
  currentUser = { id: 3, username: "adm", role: "admin" };
  r = await get(`/api/repeat-reviews?keys=${PH}|${MONTH},${PH}|2026-08`);
  ok("حالة الردود للجدول (شهر = رد)", r.j.data.length === 1 && r.j.data[0].month === MONTH && r.j.data[0].status === "draft");
  ok("التقرير للسوبر أدمن بس", (await get("/api/repeat-reviews/report?from=2026-09&to=2026-09")).s === 403);
  currentUser = { id: 4, username: "sa", role: "super_admin" };
  r = await get("/api/repeat-reviews/report?from=2026-09&to=2026-09");
  ok("التقرير بيرجع الرد", r.s === 200 && r.j.data.some((x: any) => x.phone_short === PH && x.at_fault_name === "لحام تجربة"));
} finally {
  await cleanup().catch(() => {});
  srv.close(); maintStub.close(); await pool.end();
}
console.log(fails ? `❌ ${fails} فشل` : "✅ كله نجح");
process.exit(fails ? 1 : 0);
