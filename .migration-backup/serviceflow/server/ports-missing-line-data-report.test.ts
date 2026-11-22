import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const start = routes.indexOf('app.get("/api/reports/ports-missing-line-data"');
const end = routes.indexOf('app.get("/api/reports/lines-without-port"', start);
assert.ok(start >= 0, "the MSAN ports missing-data endpoint must exist");
assert.ok(end > start, "the missing-data endpoint must have a bounded handler");
const route = routes.slice(start, end);

const client = readFileSync(
  new URL("../client/src/components/PortsMissingLineDataReport.tsx", import.meta.url),
  "utf8",
);

// الشروط اتنقلت لثوابت مشتركة (PORTS_MISSING_*) مع مراجعة البيان الفنى اليومية ١٢ الضهر
// (٢٠٢٦-٠٩-٢٩) — عشان الأرقام اللى بتتراجع تلقائياً هى نفسها اللى فى التقرير.
const shared = routes.slice(routes.indexOf("const PORTS_MISSING_TECH_SQL"), routes.indexOf("const hasFrameSql"));

test("reports current MSAN ports with incomplete technical or subscriber data", () => {
  assert.match(route, /const joinClause = PORTS_MISSING_FROM_SQL;/);
  assert.match(route, /const conds: string\[\] = \[\.\.\.PORTS_MISSING_BASE_CONDS\];/);
  assert.match(shared, /FROM phone_ports pp/);
  assert.match(shared, /LEFT JOIN phone_lines pl ON pl\.full_phone = pp\.phone_number/);
  assert.match(shared, /LEFT JOIN line_subscriber_info si ON si\.phone_number = pp\.phone_number/);
  assert.match(shared, /pl\.full_phone IS NULL/);
  assert.match(shared, /pl\.cabin_number::text/);
  assert.match(shared, /pl\.box_number::text/);
  assert.match(shared, /si\.sub_name::text/);
  assert.match(shared, /si\.sub_add::text/);
  assert.match(route, /MAX\(uploaded_at\)/);
});

test("keeps search, pagination, and both export paths in the new report", () => {
  assert.match(route, /const \{ search = "", page = "1", limit = "50" \}/);
  assert.match(route, /LIMIT \$\$\{dataParams\.length - 1\} OFFSET \$\$\{dataParams\.length\}/);
  assert.match(client, /\/api\/reports\/ports-missing-line-data/);
  assert.match(client, /handleExportExcel/);
  assert.match(client, /handleExportPDF/);
});