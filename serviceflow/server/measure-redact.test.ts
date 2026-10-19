import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isLineMeasureKey, redactMeasures, measureRedactor, MEASURE_OPEN_PATHS } from "./measure-redact";

// المالك ٢٠٢٦-١٠-١٩: سرعة واسكور كل خط للسوبر أدمن بس — غير «بحث برقم التليفون» —
// والمتوسطات لكل كابينة/بكس مسموحة للكل.

test("حقول السرعة والاسكور الخاصة بخط بتتشال — بكل أسمائها", () => {
  for (const k of ["score", "current_speed", "max_speed", "currentSpeed", "maxSpeed", "lineMaxSpeed", "lineCurrentSpeed",
    "lastMeasScore", "curMeasScore", "curMeasMaxSpeed", "curMeasCurrentSpeed", "speed", "numSpeed", "speedKbps",
    "lastSpeed", "firstSpeed", "lastScore", "firstScore", "iScore", "Attainable Rate", "Actual Rate", "السرعة الحالية", "الاسكور", "أقصى سرعة"]) {
    assert.ok(isLineMeasureKey(k), k);
  }
});

test("المتوسطات والأعداد والفلاتر بتفضل", () => {
  for (const k of ["avgScore", "avgMaxSpeed", "avgCurrentSpeed", "boxAvgScore", "sum_score", "cabinetAvgScore", "measuredCount",
    "highScoreCount", "needsSpeed", "isNeedsSpeed", "excludeZeroScore", "minScore", "scoreFrom", "lastMeasTime", "fullPhone", "boxNumber"]) {
    assert.ok(!isLineMeasureKey(k), k);
  }
});

test("بيمشى جوّه الصفوف و raw_data، ومابيلمسش التواريخ", () => {
  const at = new Date("2026-10-19T10:00:00Z");
  const out = redactMeasures({ data: [{ fullPhone: "0882123456", score: 120, max_speed: "8000", at, raw_data: { "Current Speed": "4000", Name: "x" } }], avgScore: 88.5 });
  assert.deepEqual(out, { data: [{ fullPhone: "0882123456", at, raw_data: { Name: "x" } }], avgScore: 88.5 });
  assert.ok(out.data[0].at instanceof Date);
});

function run(user: any, url: string) {
  const req: any = { originalUrl: url, isAuthenticated: () => !!user, user };
  let sent: any;
  const res: any = { json: (b: any) => { sent = b; return res; } };
  measureRedactor("super_admin")(req, res, () => {});
  res.json({ data: [{ score: 90, current_speed: "3000", avgScore: 80 }] });
  return sent.data[0];
}

test("السوبر أدمن بيشوف كله؛ الباقى من غير السرعات — إلا فى بحث برقم التليفون", () => {
  assert.equal(run({ role: "super_admin" }, "/api/reports/current-faults").score, 90);
  for (const role of ["admin", "tech", "external", "data_manager", "sales", "sales_admin"]) {
    const row = run({ role }, "/api/reports/current-faults");
    assert.equal(row.score, undefined, role);
    assert.equal(row.current_speed, undefined, role);
    assert.equal(row.avgScore, 80, `${role}: المتوسط مسموح`);
    assert.equal(run({ role }, "/api/phone-lines/lookup?phone=0882123456").score, 90, `${role}: بحث برقم التليفون`);
  }
  // من غير تسجيل دخول (سكربتات التمبر منكى بالتوكن) — زى ما هو
  assert.equal(run(null, "/api/phone-lines/with-account").score, 90);
  // الجداول المجمّعة/التفصيلية مش مستثناة
  assert.ok(!MEASURE_OPEN_PATHS.some((re) => re.test("/api/phone-lines/with-account")));
  assert.ok(!MEASURE_OPEN_PATHS.some((re) => re.test("/api/phone-lines")));
});

test("الـmiddleware متركّب بعد الجلسة وقبل كل راوتس /api", () => {
  const src = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const at = src.indexOf("app.use(measureRedactor(ROLES.SUPER_ADMIN))");
  assert.ok(at > src.indexOf("app.use(passport.session())"), "بعد passport.session");
  assert.ok(at < src.indexOf("registerCfmRoutes(app)"), "قبل أول راوت");
});

test("الشاشة/الإكسيل/الطباعة: أعمدة السرعة والاسكور بتختفى — والمتوسطات وأعمدة PO العادية لأ", async () => {
  const { isMeasureHeader } = await import("../client/src/lib/measure-hide");
  for (const h of ["السرعة الحالية", "أقصى سرعة", "الاسكور", "سرعة حالية", "Score", "Current Speed", "القياس الحالى (نفس الشكوى)", "آخر قياس للرقم", "آخر رفع سرعة"]) {
    assert.ok(isMeasureHeader(h), h);
  }
  for (const h of ["متوسط الاسكور", "متوسط السرعة الحالية", "Avg Score", "التليفون", "حالة PO", "تاريخ آخر قياس", "الكابينه", ""]) {
    assert.ok(!isMeasureHeader(h), h);
  }
});

test("«بحث برقم التليفون» مستثنى فى الشاشة والتصدير، والإخفاء متركّب فى الداشبورد لغير السوبر أدمن", () => {
  const lookup = readFileSync(new URL("../client/src/components/PhoneLookupReport.tsx", import.meta.url), "utf8");
  assert.match(lookup, /data-measure-open="1"/);
  assert.match(lookup, /withMeasureOpen\(handleExportExcel\)/);
  assert.match(lookup, /withMeasureOpen\(handleExportPDF\)/);
  const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");
  assert.match(dash, /if \(!authUser \|\| isSuperAdmin\) return;\s*return installMeasureHider\(\);/);
  // تاب القياسات: للسوبر أدمن بس — إلا «متوسط القياسات»
  assert.match(dash, /MEASURE_SHARED: ReportTab\[\] = \["box-score-avg"\]/);
});
