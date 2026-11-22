// صورة الخريطة على الموبايل: كانت بتتفتح فى تاب جديد مالوش زرار رجوع (المالك ٢٠٢٦-١١-١٧) ⇒ عارض جوّه الصفحة
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../client/src/cfm/pages/maps.tsx", import.meta.url), "utf8");

test("صور الخريطة مابتتفتحش فى تاب جديد", () => {
  assert.doesNotMatch(src, /target="_blank"/);
  assert.match(src, /onClick=\{\(\) => setViewer\(\{ src, caption/);
});

test("العارض: زرار رجوع + زرار الرجوع بتاع الموبايل وEsc بيقفلوه + تكبير", () => {
  const v = src.slice(src.indexOf("function ImageViewer"), src.indexOf("function MapView"));
  assert.match(v, /history\.pushState/);
  assert.match(v, /addEventListener\("popstate"/);
  assert.match(v, /removeEventListener\("popstate"/);
  assert.match(v, /e\.key === "Escape"/);
  assert.match(v, />رجوع</);
  assert.match(v, /setZoom/);
});
