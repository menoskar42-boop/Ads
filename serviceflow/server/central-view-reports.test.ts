import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// قرار المالك ٢٠٢٦-١٠-٠٤: الشئون الخارجية ومهندس الكوابل (external) ومدير السنترال (admin)
// بيشوفوا تقارير الفنى نفسها بس لكامل السنترال — والسوبر أدمن بيشوف كل حاجة.
const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");

test("admin/external (not super admin) get the tech report list + ticket reopen report", () => {
  assert.match(dash,
    /const isCentralView = !isSuperAdmin && \(authUser\?\.role === ROLES\.ADMIN \|\| authUser\?\.role === ROLES\.EXTERNAL\);/);
  assert.match(dash, /const CENTRAL_VIEW_ALLOWED: ReportTab\[\] = \(\[\.\.\.TECH_ALLOWED, "box-tickets-repaired", \.\.\.TABLES_GROUP, "local-store", "maint-cable"\] as ReportTab\[\]\)\s*\n\s*\.filter\(\(id\) => !CENTRAL_VIEW_HIDDEN\.includes\(id\)\);/);
  // المالك ٢٠٢٦-١٠-١٢: «الأعطال المنتظمة (فترة من/إلى)» مش ليهم — فى الواجهة والسيرفر
  assert.match(dash, /const CENTRAL_VIEW_HIDDEN: ReportTab\[\] = \["regularized-faults-range"\];/);
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /app\.get\("\/api\/reports\/regularized-faults-range", requireAuth, async \(req, res\) => \{\s*\n\s*\/\/[^\n]*\n\s*if \(req\.user\?\.role === ROLES\.EXTERNAL \|\| req\.user\?\.role === ROLES\.ADMIN\) return res\.status\(403\)/);
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

// المالك ٢٠٢٦-١٠-١٢: رد الفنى يظهر فى «متعذرات بداية السنة» و«تم فكها» زى الحالية (عرض بس)
test("OM soy/resolved show the tech reply like the current report (read only)", () => {
  const om = readFileSync(new URL("../client/src/components/OmRejectionsReport.tsx", import.meta.url), "utf8");
  assert.match(om, /const showResp = bucket === "current" \|\| bucket === "soy" \|\| bucket === "resolved";/);
  assert.match(om, /\.\.\.\(showResp\s*\n\s*\? \(\[\s*\n\s*\["رد الفنى"/);
  // الإجراءات لسه على الحالية بس
  assert.match(om, /const canRespond = bucket === "current" &&/);
  assert.match(om, /\.\.\.\(bucket === "current" && \(canRespond \|\| canResetResp \|\| isSuperAdmin \|\| isExternal\)/);
});

// المالك ٢٠٢٦-١٠-٢٦: «الأعطال المنتظمة هذا الشهر» و«منتظمة خارج الشاشة - اسكور عالي» للسوبر أدمن بس
test("regularized this month + manual high score are super-admin only (UI and server)", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const only = dash.match(/const SUPER_ONLY_REPORTS: ReportTab\[\] = \[([\s\S]*?)\];/)![1];
  assert.match(only, /"regularized-faults-range"/);
  assert.match(only, /"manual-regularized-high-score"/);
  for (const ep of ['app.get("/api/reports/regularized-faults-range"', 'app.get("/api/manual-faults/regularized-high-score"']) {
    const body = routes.slice(routes.indexOf(ep), routes.indexOf(ep) + 600);
    assert.match(body, /if \(req\.user\?\.role !== ROLES\.SUPER_ADMIN\) return res\.status\(403\)/, ep);
  }
});
