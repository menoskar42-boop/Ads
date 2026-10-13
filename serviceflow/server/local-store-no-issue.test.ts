// المالك ٢٠٢٦-١٠-١٣: «سلك الصيانة إسلام مسجّل لكن فى الرصيد بتاعه ظاهر صفر — المفروض يطلع بالسالب
// لأنه مستلمش، ونفس الكلام محمد». الفنى اللى مااستلمش من النوع ده: استخدامه بيتحسب من بداية المخزن.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ls = readFileSync(new URL("./local-store.ts", import.meta.url), "utf8");

test("الاستخدام: من أول صرف للفنى لو استلم، ولو مااستلمش من بداية المخزن للنوع ده", () => {
  assert.match(ls, /LEFT JOIN \$\{FIRST_ISSUE\} fi ON fi\.tech_name = ce\.stock_tech_name/, "مش JOIN عادى (كان بيشيل اللى مااستلمش)");
  assert.match(ls, /ce\.stock_date >= COALESCE\(fi\.first_issue, ts\.type_start\)/);
  assert.match(ls, /SELECT cable_type, min\(move_date\) AS type_start FROM local_store_moves/);
});

test("الرصيد = المستلم − المستخدم، فاللى مااستلمش واستخدم بيطلع بالسالب", () => {
  assert.match(ls, /FROM \$\{USAGE_FROM\} WHERE \$\{USAGE_COND\} GROUP BY 1, 2/);
  assert.doesNotMatch(ls, /fi\.cable_type = \$1/, "تفاصيل الفنى بتفلتر بنوع المخزن مش بنوع أول صرف");
});

test("اللى مش معروف يتخصم من مين: من أول صرف لأى فنى، ولو مفيش صرف من بداية المخزن", () => {
  assert.equal((ls.match(/\$\{UNASSIGNED_FROM\(/g) || []).length, 2);
});
