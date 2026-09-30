import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// تقرير أداء الفنيين (قرار المالك ٢٠٢٦-٠٩-٣٠): التكرار أكتر من 4.8% → درجة التكرار صفر،
// للفنى وللإدارة. بيشغّل repScore من الملف نفسه.
const src = readFileSync(new URL("../client/src/components/TechPerformanceReport.tsx", import.meta.url), "utf8");
const pick = (re: RegExp) => { const m = src.match(re); assert.ok(m, String(re)); return m![0]; };
const code = [
  pick(/const REP_TARGET\s+= \d+;/), pick(/const REP_ZERO_ABOVE = [\d.]+;/), pick(/const MAX_REP\s+= \d+;/),
  pick(/function repScore\(ratio: number \| null\): number \{[\s\S]*?\n\}/).replace(/: number \| null\): number/, ")"),
  "return repScore;",
].join("\n");
const repScore = new Function(code)() as (r: number | null) => number;

test("أكتر من 4.8% → صفر", () => {
  assert.equal(repScore(4.9), 0);
  assert.equal(repScore(5.7), 0);   // سامى فى الصورة
  assert.equal(repScore(5.1), 0);   // حسن
  assert.equal(repScore(4.85), 0);  // بتتعرض 4.9
});

test("لحد 4.8% (زى ما بتتعرض) الحساب القديم زى ما هو", () => {
  assert.equal(repScore(4.8), 29.2);   // 35 × 4 / 4.8
  assert.equal(repScore(4.84), 28.9);  // بتتعرض 4.8 → مش صفر
  assert.equal(repScore(4.6), 30.4);   // إجمالى الإدارة فى الصورة
  assert.equal(repScore(4), 35);
  assert.equal(repScore(1.6), 35);
  assert.equal(repScore(null), 35);
});

test("الإدارة بنفس الدالة، والملاحظة فى الكارت بتقول الشرط", () => {
  assert.match(src, /repRatio, repScore: repScore\(repRatio\),/);
  assert.match(src, /أكتر من \$\{REP_ZERO_ABOVE\}% = صفر/);
});
