// ٢٠٢٦-١١-٠٣ (تقرير Google Analytics + الإكستنشن): /plans و/bible و/kids كانت بتقع على شبكة الشركة — فلترها بيحجب
// أى رابط فيه «YouTube»، وVite بيسمّى ملف الـJS باسم الملف (YouTubeCard-xxxx.js). اسم أى ملف فى الواجهة مايبقاش فيه youtube.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test("no client source file name contains «youtube» (becomes a chunk URL the work filter blocks)", () => {
  const root = new URL("../client/src", import.meta.url).pathname;
  const bad = walk(root).filter((p) => /youtube/i.test(p.slice(root.length)));
  assert.deepEqual(bad, []);
});

test("a chunk that keeps failing reloads the page once, not forever (each reload was a new page_view)", async () => {
  const { readFileSync } = await import("node:fs");
  const main = readFileSync(new URL("../client/src/main.tsx", import.meta.url), "utf8");
  const h = main.slice(main.indexOf('window.addEventListener("vite:preloadError"'), main.indexOf("// Register service worker"));
  assert.match(h, /if \(Date\.now\(\) - last < 2 \* 60 \* 1000\) return;/);
  assert.ok(h.indexOf("return;") < h.indexOf("event.preventDefault()"), "اللفّة بتقف قبل ما يمنع الخطأ يوصل لـErrorBoundary");
});
