import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

// الأعطال الحالية (قرار المالك ٢٠٢٦-٠٩-٢٨): 99-DSL + نوع شكوى «1 بدون حرارة» مستخبّية
// افتراضياً، و99-DSL بأى نوع تانى ظاهر عادى، والزرار بيرجّعهم مع باقى الأعطال.
// بناخد الدوال من الكومبوننت زى ما هى (shortStatusCode → dispStatus → isDsl99NoTone).
const src = readFileSync(new URL("../client/src/components/CurrentFaultsReport.tsx", import.meta.url), "utf8");
const from = src.indexOf("const shortStatusCode");
const to = src.indexOf("// رابط بوابة DZS expresse");
const dir = mkdtempSync(join(tmpdir(), "dsl99-"));
const file = join(dir, "fns.ts");
writeFileSync(file, src.slice(from, to) + "\nexport { dispStatus, isDsl99NoTone };\n");
const { dispStatus, isDsl99NoTone } = await import(pathToFileURL(file).href);

const row = (statusCode: string, complainTypeName: string) => ({ statusCode, complainTypeName });

test("99-DSL (9999 تنتظر الحل) + «1-بدون حرارة» → مستخبّى افتراضياً", () => {
  assert.equal(dispStatus("9999 تنتظر الحل"), "99-DSL");
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "1-بدون حرارة")), true);
  assert.equal(isDsl99NoTone(row("99999999", " 1 - بدون حرارة ")), true);  // مسافات حوالين الشرطة
  assert.equal(isDsl99NoTone(row("تنتظر الحل", "1-بدون حرارة")), true);
});

test("نفس النوع مهما كانت كتابته فى الملف (بعد النشر العدد كان 0)", () => {
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "1 بدون حرارة")), true);          // زى ما بيتعرض
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "1 بدون حرارة")), true); // NBSP
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "‏1-بدون حرارة‎")), true); // علامات اتجاه
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "١-بدون حرارة")), true);          // رقم عربى
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "1-بدون حراره")), true);          // هاء
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "1-بدون حرارـة")), true);         // تطويل
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "1-ﺑﺪﻭﻥ ﺣﺮﺍﺭﺓ")), true);          // أشكال عرض
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "'1-بدون حرارة")), true);         // علامة تنصيص
  assert.equal(isDsl99NoTone(row("DSL-99", "1-بدون حرارة")), true);                   // الكود خام
  assert.equal(isDsl99NoTone(row("‏9999 تنتظر الحل", "1-بدون حرارة")), true);
});

test("«1-بدون حرارة» بس (المالك: «دى بس») — أى نوع تانى ظاهر", () => {
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "1-بدون حرارة متقطعة")), false);
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "2-بدون حرارة")), false);
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "بدون حرارة")), false);
});

test("99-DSL بنوع شكوى تانى → ظاهر عادى", () => {
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "70 DSL-بيانات")), false);
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "73 DSL- غير متصل")), false);
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "11 بدون حرارة")), false); // كود ١١ مش ١
  assert.equal(isDsl99NoTone(row("9999 تنتظر الحل", "")), false);
});

test("«1 بدون حرارة» بـ Status Code تانى → ظاهر عادى", () => {
  assert.equal(isDsl99NoTone(row("DSL-160160", "1 بدون حرارة")), false);
  assert.equal(isDsl99NoTone(row("Re-open TTS 173", "1 بدون حرارة")), false);
});

test("الفلتر أول واحد فى displayed، والزرار بيقلبه، والعدد من كل الأعطال", () => {
  assert.match(src, /const \[showDsl99NoTone, setShowDsl99NoTone\] = useState\(false\);/);
  assert.match(src, /const displayed = faults\s*\n\s*\.filter\(\(f\) => showDsl99NoTone \|\| !isDsl99NoTone\(f\)\)/);
  assert.match(src, /const dsl99NoToneCount = faults\.filter\(isDsl99NoTone\)\.length;/);
  assert.match(src, /onClick=\{\(\) => setShowDsl99NoTone\(\(v\) => !v\)\}/);
});
