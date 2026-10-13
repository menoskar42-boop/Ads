// العطل محسوب على مين (المالك ٢٠٢٦-١٠-١٣): «الأولوية لفنى الإغلاق تتحسب عليه، لكن لو مفيش
// فنى إغلاق (غير معروف) تتحسب على فنى المنطقة» — فى نوافذ التفاصيل زى أرقام الجدول بالظبط.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chargedTechOf, chargedTechOptions } from "../client/src/lib/charged-tech";

const src = (f: string) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("فنى الإغلاق معروف ⇒ محسوب عليه حتى لو فنى المنطقة غيره", () => {
  const row = { closeByName: "اسلام عبد العال هريدى", areaTechName: "محمد عبد المجيد محمد رشدى" };
  assert.equal(chargedTechOf(row), "اسلام عبد العال هريدى");
});
test("فنى الإغلاق غير معروف ⇒ محسوب على فنى المنطقة", () => {
  assert.equal(chargedTechOf({ closeByName: "غير معروف", areaTechName: "محمد عبد المجيد محمد رشدى" }), "محمد عبد المجيد محمد رشدى");
  assert.equal(chargedTechOf({ closeByName: "", areaTechName: "محمد" }), "محمد");
});
test("السيرفر بيبعت chargedTech جاهز ⇒ هو اللى بيتاخد", () => {
  assert.equal(chargedTechOf({ chargedTech: "سامى", closeByName: "اسلام", areaTechName: "محمد" }), "سامى");
});
test("قايمة الفلتر فيها اللى عليهم أعطال بس — مش فنى المنطقة لعطل قفله غيره", () => {
  const rows = [
    { closeByName: "اسلام", areaTechName: "محمد" },
    { closeByName: "غير معروف", areaTechName: "محمد" },
    { closeByName: "سامى", areaTechName: "حسن" },
  ];
  assert.deepEqual(chargedTechOptions(rows), ["اسلام", "سامى", "محمد"].sort((a, b) => a.localeCompare(b, "ar")));
  assert.equal(rows.filter((r) => chargedTechOf(r) === "محمد").length, 1, "محمد عليه العطل اللى إغلاقه غير معروف بس");
});
test("النوافذ والسيرفر مابيطابقوش «فنى الإغلاق أو فنى المنطقة» تانى", () => {
  for (const f of ["client/src/components/TechPerformanceReport.tsx", "client/src/components/RemovalStatsReport.tsx"]) {
    const s = src(f);
    assert.doesNotMatch(s, /closeByName === \w+ \|\| r\.areaTechName ===/, f);
    assert.match(s, /chargedTechOf\(r\) ===/, f);
  }
  const r = src("server/routes.ts");
  assert.doesNotMatch(r, /b\."closeByName" = \$\$\{params\.length\} OR b\."areaTechName"/);
  assert.match(r, /CASE WHEN base\."closeByName" <> 'غير معروف' THEN base\."closeByName" ELSE base\."areaTechName" END AS "chargedTech"/);
});
