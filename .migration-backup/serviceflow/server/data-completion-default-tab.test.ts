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

test("data manager sees only «متابعة التصحيحات» then «أوامر شغل بدون كمية سلك» (owner, 2026-10-07)", () => {
  assert.match(src, /const DM_TABS: DcTab\[\] = \["fixlist", "orders"\];/);
  assert.match(src, /const TABS = isDataManager\s+\? DM_TABS\.map/);
  // تاب قديم محفوظ (إدخال/تصحيح) مايظهرش لمسئول البيانات
  assert.match(src, /const shownTab: DcTab = isDataManager && !DM_TABS\.includes\(tab\) \? "fixlist" : tab;/);
  assert.match(src, /\{shownTab === "orders" \? <WorkOrdersNoCableEntry \/>/);
});

test("manual tab = «إدخال كمية سلك الصيانة»: type fixed to صيانة, no dropdown (owner, 2026-10-07)", () => {
  assert.match(src, /\{ id: "manual",  label: "إدخال كمية سلك الصيانة" \}/);
  assert.match(src, /const workOrderType = "صيانة";/);
  assert.doesNotMatch(src, /setWorkOrderType/);
  assert.doesNotMatch(src, /<SelectItem value="تركيب"/);
  // صيانة ⇒ بيتخصم من رصيد سلك الصيانة (server/local-store.ts: cableTypeOf)
  const store = readFileSync(new URL("./local-store.ts", import.meta.url), "utf8");
  assert.match(store, /export const cableTypeOf = \(workOrderType: string\): CableType => \(String\(workOrderType\)\.trim\(\) === "صيانة" \? "maint" : "install"\);/);
});
