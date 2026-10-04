import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «أوامر شغل بدون كمية سلك»: التاريخ دايماً من ١-٩-٢٠٢٦ لحد النهارده (قرار المالك ٢٠٢٦-١٠-٠٤).
const ui = readFileSync(new URL("../client/src/components/WorkOrdersNoCableEntry.tsx", import.meta.url), "utf8");

test("defaults: from 2026-09-01, to today (Cairo)", () => {
  assert.match(ui, /const NO_CABLE_FROM = "2026-09-01";/);
  assert.match(ui, /useState\(NO_CABLE_FROM\)/);
  assert.match(ui, /const \[dateTo, setDateTo\] = useState\(cairoToday\);/);
});
