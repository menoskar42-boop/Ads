import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

// نسبة الإزالة 24 ساعة (قرار المالك ٢٠٢٦-٠٩-٢٩):
//   · كل أعطال شيت التفاصيل + كل حالات شيت المتبقى (مش 135/138 بس).
//   · التخطّى = عمود «Time untill now(except 135)» أكبر من يوم (فى التفاصيل
//     «فترة الاستمرار… -استبعاد الحالة 135» بصيغة يوم:ساعة:دقيقة).
// على شيتات ٢٠٢٦-٠٩-٢٩ اللى بعتها المالك: التفاصيل ١٣ من ٢٧٦، المتبقى ٦ من ٥٣ —
// والتقريب القديم (خانة عشرية واحدة) كان بيضيّع واحد من الستة (1.0005 يوم → 24.0).
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const dir = mkdtempSync(join(tmpdir(), "tohours-"));
const file = join(dir, "h.ts");
writeFileSync(file, routes.slice(routes.indexOf("const hrsRound"), routes.indexOf("// Excel serial date")) + "\nexport { toHours };\n");
const { toHours } = await import(pathToFileURL(file).href);

test("أكبر من يوم = تخطّى الـ24 — حتى بدقيقة (مفيش تقريب يبلعها)", () => {
  assert.ok(toHours("1:0:1") > 24);          // يوم ودقيقة (شيت التفاصيل)
  assert.ok(toHours(1.0005) > 24);           // رقم أيام (شيت المتبقى) — كان بيتقرّب 24.0
  assert.equal(toHours("1:0:0"), 24);        // يوم بالظبط → مش تخطّى
  assert.ok(toHours("0:23:59") <= 24);
  assert.ok(toHours(0.9999) <= 24);
  assert.ok(Math.abs(toHours("1:4:20") - (28 + 20 / 60)) < 0.001);
  assert.ok(Math.abs(toHours(3.9052314814814815) - 93.7256) < 0.001);
});

const block = (from: string, to: string) => {
  const i = routes.indexOf(from);
  return routes.slice(i, routes.indexOf(to, i + from.length));
};
const endpoints = {
  "removal-stats": block('app.get("/api/reports/removal-stats"', "app.get("),
  "remaining-stats": block('app.get("/api/reports/remaining-stats"', "app.get("),
  "combined-stats": block('app.get("/api/reports/combined-stats"', "app.get("),
  "removal-beyond24": block('app.get("/api/reports/removal-beyond24"', "app.get("),
};

test("الأربعة بيحسبوا الساعات من عمود الشيت (sheetHoursSql)", () => {
  for (const [name, src] of Object.entries(endpoints)) {
    assert.match(src, /sheetHoursSql\('(cd|rc|src)'\)/, name);
    assert.doesNotMatch(src, /closedHoursSql\(/, name + ": رجع يحسب بالتوقيتين");
  }
  assert.match(routes, /const sheetHoursSql = \(t: string\) => `COALESCE\(\$\{t\}\.time_till_now, CASE/);
});

test("كل حالات المتبقى وكل أعطال التفاصيل — مفيش فلتر 135/138 ولا close_time", () => {
  for (const [name, src] of Object.entries(endpoints)) {
    assert.doesNotMatch(src, /IN \(135, 138\)/, name + ": فلتر 135/138 رجع");
    // فلتر بس (WHERE/AND أو شرط فى conds) — COUNT(*) FILTER فى التشخيص مش فلتر
    assert.doesNotMatch(src, /(?<!FILTER \()(WHERE|AND|`)\s*(\w+\.)?close_time IS NOT NULL/, name + ": فلتر المغلق بس رجع");
  }
});

test("قائمة «تجاوزت 24» بتقطع على القيمة الدقيقة مش المقرّبة", () => {
  assert.match(endpoints["removal-beyond24"], /WHERE b\."hoursExact" > 24/);
});
