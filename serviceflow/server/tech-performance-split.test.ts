// تقرير أداء الفنيين: كابينة عليها فنيين مابتطلعش سطر لوحدها باسم مجمّع.
// المالك ٢٠٢٦-١٠-١١: «ليه حسن ومحمد عبد المجيد فى سطر لوحده؟ كل واحد فى سطره».
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("../client/src/components/TechPerformanceReport.tsx", import.meta.url), "utf8");

// نفس الدالة بالظبط (مستخرجة من الملف) — عشان نجرّبها بأرقام
const fnSrc = src.match(/export function splitTechNames\(raw: unknown\): string\[\] \{[\s\S]*?\n\}/)![0]
  .replace("export function", "function").replace("(raw: unknown): string[]", "(raw)").replace(/\.map\(\(n\) =>/, ".map((n) =>");
// eslint-disable-next-line no-new-func
const splitTechNames = new Function(`${fnSrc}; return splitTechNames;`)() as (raw: unknown) => string[];

test("a joint name splits into each technician", () => {
  assert.deepEqual(splitTechNames("حسن عبد الفتاح يعقوب , محمد عبد المجيد محمد رشدى"),
    ["حسن عبد الفتاح يعقوب", "محمد عبد المجيد محمد رشدى"]);
  assert.deepEqual(splitTechNames("سامى"), ["سامى"]);
  assert.deepEqual(splitTechNames("أ،ب"), ["أ", "ب"]);
  assert.deepEqual(splitTechNames(null), ["غير معروف"]);
});

test("all four sources split joint names and sum the counts (not the percentages)", () => {
  assert.match(src, /sumBy\(removalData\?\.byTechOnly, \["total", "within24h"\]\)/);
  assert.match(src, /sumBy\(repData\?\.byTechOnly, \["repCharges", "distinctPhones"\]\)/);
  assert.match(src, /sumBy\(omData\?\.byTech, \["soyTotal", "resolved"\]\)/);
  // الأعطال فى الألف: لكل فنى جاهزة من السيرفر (buildAdslReport) وبتتفصل بالاسم برضه
  assert.match(src, /for \(const t of adslReport\?\.techs \?\? \[\]\) \{\s*\n\s*for \(const name of splitTechNames\(t\.techName\)\)/, "faults per 1000");
  // مفيش مصدر بيحط الاسم المجمّع زى ما هو
  assert.doesNotMatch(src, /remMap\.set\(r\.techName|repMap\.set\(r\.techName|omMap\.set\(r\.techName/);
});

test("merged percentages come from the summed counts", () => {
  // حسن لوحده: ٧٧ من ١٠٠ — والكابينة المشتركة: ١٠ من ١٠ ⇒ ٨٧ من ١١٠ = ٧٩٫١٪
  const rows = [
    { techName: "حسن عبد الفتاح يعقوب", soyTotal: 100, resolved: 77 },
    { techName: "حسن عبد الفتاح يعقوب , محمد عبد المجيد محمد رشدى", soyTotal: 10, resolved: 10 },
    { techName: "محمد عبد المجيد محمد رشدى", soyTotal: 50, resolved: 49 },
  ];
  const m = new Map<string, { soyTotal: number; resolved: number }>();
  for (const r of rows) for (const n of splitTechNames(r.techName)) {
    const c = m.get(n) ?? { soyTotal: 0, resolved: 0 };
    c.soyTotal += r.soyTotal; c.resolved += r.resolved; m.set(n, c);
  }
  const pct = (s: { soyTotal: number; resolved: number }) => Math.round((1000 * s.resolved) / s.soyTotal) / 10;
  assert.equal(m.size, 2, "no joint row left");
  assert.equal(pct(m.get("حسن عبد الفتاح يعقوب")!), 79.1);
  assert.equal(pct(m.get("محمد عبد المجيد محمد رشدى")!), 98.3);
});

// «ردود التكرار» (المالك ٢٠٢٦-١٠-١١): فنى اغلاق أول مرة + فنى المنطقة فى الجدول والتصدير
test("repeat reviews report: first-close tech and area tech columns", () => {
  const rr = readFileSync(new URL("./repeat-reviews.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../client/src/components/RepeatReviewsReport.tsx", import.meta.url), "utf8");
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(rr, /AS first_close_tech/);
  assert.match(rr, /ORDER BY c\.d ASC LIMIT 1/);
  assert.match(rr, /areaTechSql\("r\.line_central", "r\.line_cabin", "now\(\)", "r\.phone_short", \{ noShiftCover: true \}\)/);
  assert.match(routes, /registerRepeatReviews\(app, \{[^}]*areaTechSql \}\)/);
  assert.match(ui, /"فنى اغلاق أول مرة", "فنى المنطقة"/);
  assert.match(ui, /r\.first_close_tech \?\? "", r\.area_tech \?\? ""/);
});
