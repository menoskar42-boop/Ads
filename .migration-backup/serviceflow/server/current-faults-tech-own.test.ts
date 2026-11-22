import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «الأعطال الحالية» (قرار المالك ٢٠٢٦-١٠-٠١): كل فنى يشوف أعطاله هو بس — بنفس
// قاعدة «بحث برقم التليفون» عشان اللى يشوفه يقدر يقيسه.
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = routes.indexOf('app.get("/api/reports/current-faults", requireAuth');
const endpoint = routes.slice(start, routes.indexOf("const where = \"WHERE \"", start) + 60);

test("technicians are filtered by the line's cabinet code", () => {
  assert.match(endpoint, /if \(req\.user\?\.role === ROLES\.TECH\) \{/);
  assert.match(endpoint, /await techMsanCodes\(req\.user\)/);
  assert.match(endpoint, /await coverageCodes\(req\.user\)/);
  assert.match(endpoint,
    /conds\.push\(msanInCodesSql\(`COALESCE\(NULLIF\(btrim\(pp\.msan_code\), ''\), ct\.cabin_code\)`, `\$\$\{params\.length\}`\)\)/);
  // الفلتر قبل ما الـWHERE يتبنى
  assert.ok(endpoint.indexOf("msanInCodesSql(") < endpoint.indexOf('const where = "WHERE "'));
});

test("the old 'report is for everyone' note is gone", () => {
  assert.doesNotMatch(endpoint, /شامل لكل الفنيين/);
});
