// قاعدة احتساب استخدام السلك من رصيد الفنى (المالك ٢٠٢٦-١٠-١٣):
//   «أى سلك صيانة مسجّل من الفنى من تاريخ 29-9-2026 (وليس من بعده)»
//   «وسلك التركيبات: أى تركيب تم إغلاقه من يوم 6-10-2026 (وليس بعده)»
// — تاريخ ثابت للكل، اليوم نفسه محسوب، والفنى اللى مااستلمش بيطلع رصيده بالسالب.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNT_FROM } from "./local-store";

const ls = readFileSync(new URL("./local-store.ts", import.meta.url), "utf8");

test("التاريخين: صيانة من 29-9-2026 وتركيبات من 6-10-2026 — واليوم نفسه محسوب (>=)", () => {
  assert.deepEqual(COUNT_FROM, { maint: "2026-09-29", install: "2026-10-06" });
  assert.match(ls, /AND ce\.stock_date >= \$\{countFrom\(cableTypeSql\("ce\.work_order_type"\)\)\}/);
  assert.doesNotMatch(ls, /ce\.stock_date > \$\{countFrom/, "مش «بعد» — «من»");
});

test("مش مربوط بأول صرف ولا بداية المخزن: اللى مااستلمش واستخدم بيطلع بالسالب", () => {
  assert.doesNotMatch(ls, /first_issue/);
  assert.equal(ls.match(/const USAGE_FROM = `cable_entries ce`;/)?.length, 1);
  assert.match(ls, /FROM \$\{USAGE_FROM\} WHERE \$\{USAGE_COND\} GROUP BY 1, 2/);
});

test("الشغل اللى مش معروف يتخصم من مين بيتعدّ من نفس التاريخ", () => {
  assert.equal((ls.match(/\$\{UNASSIGNED_FROM\(/g) || []).length, 2);
});
