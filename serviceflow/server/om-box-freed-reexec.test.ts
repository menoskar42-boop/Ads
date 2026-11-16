// «متعذرات تم توفير خطوط بها» — Service Order ID + زرار Re-Execute زى متعذرات OM (المالك ٢٠٢٦-١١-١٢).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/OmBoxFreedReport.tsx", import.meta.url), "utf8");
const om = readFileSync(new URL("../client/src/components/OmRejectionsReport.tsx", import.meta.url), "utf8");

test("om-box-freed returns the Service Order ID from the current OM file", () => {
  const block = routes.slice(routes.indexOf('app.get("/api/reports/om-box-freed"'), routes.indexOf("/api/reports/installations-by-tech"));
  assert.match(block, /fo\.service_order_id AS "serviceOrderId"/);
  assert.match(block, /SELECT f\.service_number, f\.customer_name, f\.msan_code, f\.service_order_id/);
});

test("freed report: column in table/Excel/PDF and the same Re-Execute as the OM report", () => {
  assert.match(ui, /"رقم الخدمة", "Service Order ID"/);
  assert.match(ui, /r\.serviceOrderId \?\? "", r\.customerName/);
  // نفس الـReason/Sub Reason ونفس أداة الطابور
  const reason = "Reason: ReExecuteParentReason02 — Sub Reason: ReExecuteSubReason03";
  assert.ok(om.includes(reason) && ui.includes(reason));
  assert.match(ui, /dispatchSpeedTool\("ossreexec", \[so\], canReexec, \{ params \}\)/);
  assert.match(ui, /canReexec = user\?\.role === ROLES\.SUPER_ADMIN/);
  assert.match(ui, /\/api\/oss-reexec\/last/);
});
