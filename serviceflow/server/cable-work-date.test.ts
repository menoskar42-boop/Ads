// إدخال كمية سلك الصيانة (المالك ٢٠٢٦-١٠-١٣): «ضيف خانة للتاريخ وخلّى الافتراضى تاريخ النهارده مع
// إمكانية التعديل، بحيث يتسجّل السلك بتاريخ» — التاريخ ده هو stock_date (خصم الرصيد والتقارير).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("الشاشة: خانة تاريخ، النهارده افتراضياً، مابتقبلش بعد النهارده، وبتتبعت مع الحفظ", () => {
  const s = src("client/src/components/DataCompletionSection.tsx");
  assert.match(s, /const \[workDay, setWorkDay\] = useState\(cairoToday\);/);
  assert.match(s, /id="cable-work-day"\s+type="date"/);
  assert.match(s, /max=\{cairoToday\(\)\}/);
  assert.match(s, /cableQuantity, workDate: workDay,/);
  assert.match(s, /&& validDay;/);
});

test("السيرفر: سلك الصيانة بيتسجّل بالتاريخ المختار، ومن غيره زى الأول", () => {
  const r = src("server/routes.ts");
  assert.match(r, /const chosenWorkDay = String\(req\.body\?\.workDate \?\? ""\)\.trim\(\) \|\| null;/);
  assert.match(r, /التاريخ مايبقاش بعد النهارده/);
  assert.match(r, /const chosenDay = type === "صيانة" \? chosenWorkDay : null;/);
  assert.match(r, /: chosenDay \?\? await workDate\(pool, local, type\)/);
  assert.match(r, /stock_date::text AS "workDate"/);
});

test("الإفادة والقايمة بتاريخ الشغل مش يوم التسجيل", () => {
  const s = src("client/src/components/MaintCableSection.tsx");
  assert.match(s, /const entryDay = \(e: CableEntry\) => e\.workDate \|\| cairoDay\(e\.createdAt\);/);
  assert.match(s, /const d = entryDay\(e\);/);
  assert.match(s, /entryDay\(e\)\.replace\(\/-\/g, "\/"\)/);
});
