import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «رد التكرار» (قرار المالك ٢٠٢٦-١٠-٠٤). الاختبار الحى على Postgres:
//   DATABASE_URL=… npx tsx serviceflow/scripts/test-repeat-reviews.mts
const src = readFileSync(new URL("./repeat-reviews.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");
const rep = readFileSync(new URL("../client/src/components/RepetitionStatsReport.tsx", import.meta.url), "utf8");
const dlg = readFileSync(new URL("../client/src/components/RepeatReviewDialog.tsx", import.meta.url), "utf8");
const maint = readFileSync(new URL("./maintenance/app/routes/integration.js", import.meta.url), "utf8");
const boxSrc = readFileSync(new URL("./box-full-inspection.ts", import.meta.url), "utf8");
// الدوال من الملف نفسه (الاستيراد المباشر بيشدّ db.ts اللى محتاج DATABASE_URL)
const reviewStep = new Function(
  src.match(/export const reviewStep = \(r: any\): number =>([\s\S]*?);\n/)![0]
    .replace("export const reviewStep = (r: any): number =>", "return (r) =>"))() as (r: any) => number;
const writers = src.match(/REPEAT_REVIEW_WRITERS: string\[\] = \[([^\]]+)\]/)![1];

test("one review per line per month — table in ensureSchema and schema.ts together", () => {
  assert.match(db, /CREATE TABLE IF NOT EXISTS repeat_reviews \([\s\S]*UNIQUE \(phone_short, month\)/);
  assert.match(schema, /export const repeatReviews = pgTable\("repeat_reviews"/);
  assert.match(schema, /unique\("repeat_reviews_phone_short_month_key"\)\.on\(t\.phoneShort, t\.month\)/);
});

test("writers: super admin, admin (central manager), external (incl. cable engineer)", () => {
  assert.equal(writers, "ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.EXTERNAL");
});

test("steps in order: line → inspection → statements → assessment", () => {
  assert.equal(reviewStep(null), 0);
  assert.equal(reviewStep({ line_status: "confirmed" }), 1);
  assert.equal(reviewStep({ line_status: "confirmed", inspection_id: 5 }), 2);
  assert.equal(reviewStep({ line_status: "confirmed", inspection_id: 5, customer_statement: "a", tech_statement: "b" }), 3);
  assert.equal(reviewStep({ line_status: "x", inspection_id: 5, customer_statement: "a", tech_statement: "b", cause: "c" }), 4);
  assert.match(src, /if \(!r\.line_status\) return res\.status\(400\)\.json\(\{ message: "أكّد بيان الخط الأول" \}\);/);
  assert.match(src, /if \(!first \|\| insp\.date < first\)/);   // الفحص من أول شكوى فى الشهر أو بعدها
  // الفحص اللى اتفتح أوتوماتيك (مراجعة بيانات) مش فحص حقيقى
  assert.match(boxSrc, /COALESCE\(i\.auto_created, 0\) = 0/);
});

test("the reply column lives in «إحصائيات التكرار», the PDF report is super-admin only", () => {
  assert.match(rep, /<RepeatReviewDialog phone=\{reviewOpen\.phone\} month=\{reviewOpen\.month\}/);
  assert.match(rep, /String\(r\.complainTime \|\| ""\)\.slice\(0, 7\)/);
  assert.match(dash, /const SUPER_ONLY_REPORTS: ReportTab\[\] = \[[^\]]*"repeat-reviews"\]/);
  assert.match(dash, /reportTab === "repeat-reviews" && isSuperAdmin && <RepeatReviewsReport \/>/);
});

test("line correction reuses «تصحيح بيانات» (reaches the data manager) and is step one", () => {
  assert.match(dlg, /<LineDataCorrection compact initialPhone=\{phone\}/);
  assert.match(dlg, /onSent=\{async \(\) => \{ setCorrecting\(false\); await send\("line", \{ status: "corrected" \}\); \}\}/);
  assert.ok(dlg.indexOf('title="تأكيد بيان الخط"') < dlg.indexOf('title="فحص البكس"'));
  // Section برّه الكومبوننت (وإلا الكتابة بتفقد التركيز)
  assert.ok(dlg.indexOf("const Section = ") < dlg.indexOf("export function RepeatReviewDialog("));
});

test("maintenance site: one shared find-or-create box, used by both endpoints", () => {
  assert.equal((maint.match(/await findOrCreateBox\(central, cabinet, box\)/g) || []).length, 2);
  assert.match(maint, /router\.post\('\/ensure-box'/);
});

test("«افحص البكس» opens the inspection form directly — SSO from the Service-Flow session, no second login", () => {
  const app = readFileSync(new URL("./maintenance/app/app.js", import.meta.url), "utf8");
  // الـSSO middleware متركّب قبل راوتر الفحص، فأى رابط مباشر (/maintenance/inspector/…) بيدخل بجلسة السيرفس فلو
  const sso = app.indexOf("if (!req.session.user && req.user && req.user.username)");
  assert.ok(sso > 0 && sso < app.indexOf('app.use("/inspector", require("./routes/inspector"))'));
  assert.match(app, /external: "inspector"/);   // الشئون الخارجية ومهندس الكوابل = فاحص
  assert.match(app, /admin: "admin"/);
  // الرابط على فورم فحص البكس نفسه، فى تاب جديد بنفس الدومين (الكوكى بتتبعت)
  assert.match(src, /createUrl: `\/maintenance\/inspector\/create\/\$\{r\.boxId\}`/);
  assert.match(dlg, /window\.open\(j\.createUrl, "_blank", "noopener"\)/);
});
