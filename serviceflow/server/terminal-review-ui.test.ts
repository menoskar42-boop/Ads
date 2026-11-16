// «مراجعة البكس ترمنال بترمنال» فى لوحة التقارير: مسجّل للفنى ومسئول البيانات، وفيه Excel وPDF والتفصيلى.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/TerminalReviewsReport.tsx", import.meta.url), "utf8");
const srv = readFileSync(new URL("./terminal-review.ts", import.meta.url), "utf8");

test("report is registered and visible to techs and the data manager", () => {
  assert.match(dash, /\{ id: "terminal-reviews", label: "مراجعة البكس ترمنال بترمنال" \}/);
  assert.match(dash, /reportTab === "terminal-reviews"\s+&& <TerminalReviewsReport \/>/);
  const tech = dash.slice(dash.indexOf("const TECH_ALLOWED"), dash.indexOf("const TECH_ALLOWED_GROUPS"));
  assert.ok(tech.includes('"terminal-reviews"'));
  assert.match(dash, /const DM_ALLOWED: ReportTab\[\] = \[[^\]]*"terminal-reviews"/);
});

test("Excel + PDF, and the detail is only offered where the server allows it", () => {
  assert.match(ui, /XLSX\.writeFile/);
  assert.match(ui, /printTablePDF\(/);
  assert.match(ui, /r\.canDetail && <Button/);
  // المبيعات وأدمن المبيعات ممنوعين من الإحصائيات
  assert.match(srv, /role !== ROLES\.SALES && role !== ROLES\.SALES_ADMIN/);
  // التفصيلى: السوبر أدمن أو فنى الكابينة (cabinet_technicians بكود العامل)
  assert.match(srv, /FROM cabinet_technicians ct\s+WHERE btrim\(ct\.worker_code\)/);
});
