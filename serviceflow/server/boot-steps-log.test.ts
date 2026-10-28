// خطوات الإقلاع فى اللوج (المالك ٢٠٢٦-١٠-٢٨): نشر وقف على «شغّال بس مش رادّ» والسبب ضاع.
// كل خطوة لازم تتلفّ فى bootStep عشان اللوج يقول وقف فين.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("every boot step is logged with its time and a still-waiting line", () => {
  assert.match(src, /const BOOT_SLOW_MS = 30_000;/);
  assert.match(src, /console\.warn\(`\[boot\] ⏳ لسه فى «\$\{name\}»/);
  for (const step of [
    /bootStep\("الاتصال بالقاعدة", \(\) => waitForDatabase/,
    /bootStep\("التأكد إنها قاعدة Service Flow", \(\) => checkDbIdentity\(pool\)\)/,
    /bootStep\("تجهيز الجداول \(ensureSchema\)", \(\) => ensureSchema\(\), \(\) => lastSql\)/,
    /bootStep\("تسجيل المسارات", \(\) => registerRoutes\(httpServer, app\)\)/,
  ]) assert.match(src, step);
  // مفيش نداء مباشر لـensureSchema برّه bootStep
  assert.doesNotMatch(src, /^\s*await ensureSchema\(\);/m);
  // الـpool يرجع زى ما هو بعد تجهيز الجداول
  assert.match(src, /finally \{\s*delete poolAny\.query;\s*\}/);
  assert.match(src, /\[boot\] ✅ Service Flow جاهز على بورت/);
});
