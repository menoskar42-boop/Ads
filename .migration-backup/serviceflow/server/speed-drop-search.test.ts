// «انخفاض السرعة بعد الانتظام»: بحث فى كل خانات الجدول (المالك ٢٠٢٦-١٠-٢٠)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arIncludes } from "../shared/ar-norm";

const src = readFileSync(new URL("../client/src/components/SpeedDropReport.tsx", import.meta.url), "utf8");

test("خانة البحث موجودة والفلترة على كل خانات الصف (نفس خانات الجدول والإكسيل)", () => {
  assert.match(src, /data-testid="input-speed-drop-search"/);
  assert.match(src, /byTech\.filter\(\(r\) => arIncludes\(cells\(r, 0\)\.slice\(1\)\.map\(String\)\.join\(" \| "\), term\)\)/);
});

test("الإكسيل والـPDF والقياس على نتيجة البحث", () => {
  assert.match(src, /aoa_to_sheet\(\[COLS, \.\.\.rows\.map\(cells\)\]\)/);
  assert.match(src, /printTablePDF\(\{ title, columns: COLS, rows: rows\.map\(cells\)/);
  assert.match(src, /return rows\.map\(\(r\) => String\(r\.accountNo/);
});

test("البحث العربى بيتجاهل الهمزات والتاء المربوطة", () => {
  const row = ["2821106", "01070017411", "الغنايم - دير الجنادلة", "1-1", "محمود يعقوب", "52476497"].join(" | ");
  for (const q of ["2821106", "0107001", "الجنادله", "محمود", "52476", "1-1"]) assert.ok(arIncludes(row, q), q);
  assert.ok(!arIncludes(row, "حسن"));
});
