import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «الأعطال الحالية» — فلتر دروب ليست بأسماء الفنيين (قرار المالك ٢٠٢٦-١٠-٠١).
const ui = readFileSync(new URL("../client/src/components/CurrentFaultsReport.tsx", import.meta.url), "utf8");

test("the tech dropdown lists the names shown in the report and filters what is displayed", () => {
  assert.match(ui, /data-testid="select-tech-filter"/);
  assert.match(ui, /<option value="">كل الفنيين<\/option>/);
  assert.match(ui, /const techOf = \(f: CurrentFault\) => \(f\.techName \|\| ""\)\.trim\(\);/);
  // الفلتر جوّه displayed — فالإكسيل والـPDF وأزرار القياس بتمشى عليه
  const displayed = ui.slice(ui.indexOf("const displayed = faults"), ui.indexOf("const mobileLookup"));
  assert.match(displayed, /\.filter\(\(f\) => !techFilter \|\| \(techOf\(f\) \|\| NO_TECH\) === techFilter\)/);
  assert.match(ui, /bدون فنى|بدون فنى/);
});
