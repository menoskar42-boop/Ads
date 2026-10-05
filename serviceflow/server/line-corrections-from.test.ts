import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «متابعة التصحيحات»: الفلتر الافتراضى من ١-٧-٢٠٢٦ لحد النهارده (قرار المالك ٢٠٢٦-١٠-٠٥)
const src = readFileSync(new URL("../client/src/components/LineDataCorrectionsReport.tsx", import.meta.url), "utf8");

test("corrections follow-up defaults to 2026-07-01 → today (Cairo)", () => {
  assert.match(src, /export const CORRECTIONS_FROM = "2026-07-01";/);
  assert.match(src, /const \[dateFrom, setDateFrom\] = useState\(CORRECTIONS_FROM\);/);
  assert.match(src, /const \[dateTo, setDateTo\] = useState\(cairoToday\);/);
});
