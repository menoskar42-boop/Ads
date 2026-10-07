import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// قرار المالك ٢٠٢٦-١٠-٠٤: الشئون الخارجية ومهندس الكوابل (external) ومدير السنترال (admin)
// بيشوفوا تقارير الفنى نفسها بس لكامل السنترال — والسوبر أدمن بيشوف كل حاجة.
const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");

test("admin/external (not super admin) get the tech report list + ticket reopen report", () => {
  assert.match(dash,
    /const isCentralView = !isSuperAdmin && \(authUser\?\.role === ROLES\.ADMIN \|\| authUser\?\.role === ROLES\.EXTERNAL\);/);
  assert.match(dash, /const CENTRAL_VIEW_ALLOWED: ReportTab\[\] = \[\.\.\.TECH_ALLOWED, "box-tickets-repaired", \.\.\.TABLES_GROUP, "local-store"\];/);
  // «إنشاء جداول» كاملة للشئون الخارجية ومهندس الكوابل ومدير السنترال (٢٠٢٦-١٠-٠٥) — نفس عناصر المجموعة بالظبط
  const group = dash.slice(dash.indexOf('label: "إنشاء جداول"'), dash.indexOf('label: "جدول الورديات"'));
  const ids = [...group.matchAll(/\{ id: "([^"]+)"/g)].map((m) => m[1]);
  const tables = dash.match(/const TABLES_GROUP: ReportTab\[\] = \[([^\]]+)\]/)![1].match(/"([^"]+)"/g)!.map((x) => x.slice(1, -1));
  assert.deepEqual(tables, ids);
  assert.match(dash, /\(!isCentralView \|\| CENTRAL_VIEW_ALLOWED_GROUPS\.includes\(g\.label\)\) &&/);
  assert.match(dash, /if \(isCentralView\) return \{ \.\.\.g, items: g\.items\.filter\(\(it\) => CENTRAL_VIEW_ALLOWED\.includes\(it\.id\)\) \};/);
});

test("the tech-only label (current month) stays for technicians only", () => {
  assert.match(dash, /item\.id === "regularized-faults-range" && user\?\.role === ROLES\.TECH/);
});
