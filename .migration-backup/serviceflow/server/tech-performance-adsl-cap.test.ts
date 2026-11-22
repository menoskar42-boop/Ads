import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// تقرير أداء الفنيين (قرار المالك ٢٠٢٦-١٠-٠٢): الأعطال فى الألف أكتر من 1.2 × المستهدف
// (25 → 30) → درجة الأعطال صفر، للفنى وللإدارة. بيشغّل adslScore من الملف نفسه.
const src = readFileSync(new URL("../client/src/components/TechPerformanceReport.tsx", import.meta.url), "utf8");
const pick = (re: RegExp) => { const m = src.match(re); assert.ok(m, String(re)); return m![0]; };
const code = [
  pick(/const ADSL_TARGET = \d+;/), pick(/const ADSL_ZERO_FACTOR = [\d.]+;/),
  pick(/const ADSL_ZERO_ABOVE = ADSL_TARGET \* ADSL_ZERO_FACTOR;/), pick(/const MAX_ADSL\s+= \d+;/),
  pick(/function adslScore\(per1000: number \| null\): number \{[\s\S]*?\n\}/).replace(/: number \| null\): number/, ")"),
  "return [adslScore, ADSL_ZERO_ABOVE];",
].join("\n");
const [adslScore, zeroAbove] = new Function(code)() as [(r: number | null) => number, number];

test("الحد = 1.2 × 25 = 30", () => assert.equal(zeroAbove, 30));

test("أكتر من 30 فى الألف → صفر", () => {
  assert.equal(adslScore(30.01), 0);
  assert.equal(adslScore(31.5), 0);
  assert.equal(adslScore(45), 0);
});

test("لحد 30 (زى ما بتتعرض) الحساب القديم زى ما هو", () => {
  assert.equal(adslScore(30), 29.2);      // 35 × 25 / 30
  assert.equal(adslScore(30.004), 29.2);  // بتتعرض 30.00 → مش صفر
  assert.equal(adslScore(27.5), 31.8);
  assert.equal(adslScore(25), 35);
  assert.equal(adslScore(10), 35);
  assert.equal(adslScore(0), 35);
  assert.equal(adslScore(null), 0);
});

test("الإدارة بنفس الدالة، والملاحظة فى الكارت بتقول الشرط", () => {
  assert.match(src, /per1000: overallP1000, adslScore: adslScore\(overallP1000\),/);
  assert.match(src, /أكتر من \$\{ADSL_ZERO_ABOVE\}\/ألف = صفر/);
});
