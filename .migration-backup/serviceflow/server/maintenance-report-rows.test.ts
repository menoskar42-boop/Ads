// تقرير الصيانة (المالك ٢٠٢٦-١٠-٢٠): «كل البكسات اللى فنى الصيانة خلّص فيها كل حاجة ماعدا التعارضات
// التلاتة، سواء الشئون الخارجية أكدت ولا لأ» — واتجرّب على Postgres محلى بحالات حقيقية.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./maintenance/app/routes/reports.js", import.meta.url), "utf8");
const fn = src.slice(src.indexOf("async function maintenanceReportRows"), src.indexOf("router.get('/maintenance-report',"));
const view = readFileSync(new URL("./maintenance/app/views/reports/maintenance_report.ejs", import.meta.url), "utf8");

test("الفحص المؤرشف (البكس اتفحص تانى) مابيخفيش الصيانة اللى اتعملت", () => {
  assert.doesNotMatch(fn, /is_archived/);
});

test("«مراجعة بيانات البكس» مابتمنعش «خلّص كل حاجة» ومابتسحبش تاريخ الأعمال", () => {
  assert.match(fn, /AND ii2\.item_key <> 'data_review'/);
  assert.match(fn, /AND ii_sub\.item_key <> 'data_review'\s*\n\s*\), \(/);
  assert.match(fn, /COALESCE\(\(/);
});

test("التعارضات التلاتة بس هى اللى مستثناة، والشئون الخارجية مش شرط", () => {
  assert.match(src, /const EXCLUDED_ITEMS = `\('electricity_conflict','air_conflict','overlap'\)`;/);
  assert.doesNotMatch(fn, /prelim_confirmed_at|status\s*=\s*'completed'/);
});

test("نطاق التواريخ وتنبيه التمرير جنب الإجمالى (الجدول بشريط تمرير خاص بيه)", () => {
  assert.match(view, /يوم شغل/);
  assert.match(view, /باقى السطور جوّه الجدول/);
});
