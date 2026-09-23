import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const report = readFileSync(
  new URL("../client/src/components/RegularizedFaultsRangeReport.tsx", import.meta.url),
  "utf8",
);

const start = routes.indexOf('app.get("/api/reports/regularized-faults-range"');
const end = routes.indexOf('app.get("/api/reports/repeated-within-month"', start);
assert.ok(start >= 0 && end > start, "the regularized faults range endpoint must exist");
const endpoint = routes.slice(start, end);

test("the range report filters both sources by cabin and box", () => {
  assert.match(endpoint, /cabin = "", box = "", closingTech = ""/);
  assert.match(endpoint, /cd\.cabinet_no = \$\$\{params\.length\}/);
  assert.match(endpoint, /rc\.cabinet_no = \$\$\{params\.length\}/);
  assert.match(endpoint, /n\("pl\.box_number"\)\}\s*=\s*\$\$\{params\.length\}/);
  assert.match(endpoint, /n\("pl2\.box_number"\)\}\s*=\s*\$\$\{params\.length\}/);
});

test("the closing technician filter falls back to the area technician", () => {
  assert.match(endpoint, /const cdEffectiveTech = `COALESCE\(/);
  assert.match(endpoint, /const rcEffectiveTech = `COALESCE\(/);
  assert.match(endpoint, /manual_close_by/);
  assert.match(endpoint, /technician_names tnClose/);
  assert.match(endpoint, /canonicalTechSql\(areaTechSql\("cd\.exchange_name"/);
  assert.match(endpoint, /canonicalTechSql\(areaTechSql\("rc\.exchange_name"/);
  assert.match(endpoint, /\$\{cdEffectiveTech\} AS "techName"/);
  assert.match(endpoint, /\$\{rcEffectiveTech\} AS "techName"/);
  assert.match(endpoint, /\$\{cdEffectiveTech\} = \$\{techParam\}/);
  assert.match(endpoint, /\$\{rcEffectiveTech\} = \$\{techParam\}/);
});

test("the report sends the new filters and exposes the five technicians", () => {
  assert.match(report, /import \{ SearchableCombobox \} from "@\/components\/ui\/searchable-combobox";/);
  assert.match(report, /import \{ TECHNICIANS \} from "@shared\/technicians";/);
  assert.match(report, /p\.set\("cabin", cabin\)/);
  assert.match(report, /p\.set\("box", box\)/);
  assert.match(report, /p\.set\("closingTech", closingTech\)/);
  assert.match(report, /TECHNICIANS\.map\(\(tech\) =>/);
  assert.match(report, /كل الكباين/);
  assert.match(report, /كل البكسيات/);
});