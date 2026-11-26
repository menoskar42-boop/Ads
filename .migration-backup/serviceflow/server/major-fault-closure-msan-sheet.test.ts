import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("MSAN ports endpoint is authenticated, read-only, and looks up the requested line's MSAN", () => {
  const routes = read("./routes.ts");
  assert.match(routes, /app\.get\("\/api\/reports\/major-fault-closure\/msan-ports", requireAuth/);
  const endpoint = routes.slice(
    routes.indexOf('app.get("/api/reports/major-fault-closure/msan-ports"'),
    routes.indexOf("// POST /api/line-mobiles", routes.indexOf('app.get("/api/reports/major-fault-closure/msan-ports"')),
  );
  assert.match(endpoint, /phone_ports/);
  assert.match(endpoint, /phone_number = ANY\(\$1::text\[\]\)/);
  assert.match(endpoint, /btrim\(msan_code\)/);
  assert.match(endpoint, /btrim\(COALESCE\(msan_code, ''\)\) = btrim\(\$1\)/);
  assert.match(endpoint, /MAX\(uploaded_at\) OVER\(\)/);
  assert.match(endpoint, /الرقم ده مش موجود فى منافذ البورتات/);
  assert.doesNotMatch(endpoint, /\b(?:INSERT|UPDATE|DELETE)\b/i);
});

test("MSAN sheet uses the exact 13 English headers and a data worksheet", () => {
  const component = read("../client/src/components/MajorFaultClosureReport.tsx");
  const block = component.match(/const MSAN_EXPORT_COLUMNS = \[([\s\S]*?)\];/)?.[1];
  assert.ok(block, "expected the MSAN export column list");
  const headers = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(headers, [
    "Area Code", "Phone Number", "MSAN Code", "Frame", "Row", "Column", "Shelf",
    "Slot", "Port number", "Port type", "Voice Status", "Data Status", "Operator",
  ]);
  assert.match(component, /book_append_sheet\(workbook, worksheet, "data"\)/);
  assert.match(component, /MSANData_export_/);
  assert.match(component, /تحميل شيت منافذ الامسان/);
});
