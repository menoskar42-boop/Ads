import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «استكمال بيانات» (قرار المالك ٢٠٢٦-١٠-٠٥): مسئول البيانات بيفتح على «متابعة التصحيحات»،
// والباقى على «أوامر شغل بدون كمية سلك».
const src = readFileSync(new URL("../client/src/components/DataCompletionSection.tsx", import.meta.url), "utf8");

test("default sub-tab depends on role: data manager → fixlist, everyone else → orders", () => {
  assert.match(src, /const defaultTabFor = \(role\?: string \| null\): DcTab => \(role === ROLES\.DATA_MANAGER \? "fixlist" : "orders"\);/);
  assert.match(src, /useState<DcTab>\(\(\) => defaultTabFor\(user\?\.role\)\)/);
  // المستخدم بيتحمّل بعد أول رندر — الافتراضى يتظبط أول ما يوصل، إلا لو اختار تاب بإيده
  assert.match(src, /if \(!tabTouched\.current && user\?\.role\) setTabState\(defaultTabFor\(user\.role\)\);/);
  assert.match(src, /onClick=\{\(\) => setTab\(t\.id\)\}/);
});
