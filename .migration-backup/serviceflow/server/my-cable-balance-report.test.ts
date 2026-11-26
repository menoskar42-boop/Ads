import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const localStorePath = new URL("../client/src/components/LocalStoreSection.tsx", import.meta.url);
const dashboardPath = new URL("../client/src/pages/dashboard.tsx", import.meta.url);
const localStore = readFileSync(localStorePath, "utf8");
const dashboard = readFileSync(dashboardPath, "utf8");

test("technicians get only the personal cable-balance report in the warehouse group", () => {
  const techAllowed = dashboard.slice(
    dashboard.indexOf("const TECH_ALLOWED:"),
    dashboard.indexOf("const TECH_ALLOWED_GROUPS"),
  );
  const techGroups = dashboard.slice(
    dashboard.indexOf("const TECH_ALLOWED_GROUPS"),
    dashboard.indexOf("const isCentralView"),
  );
  const personalReport = localStore.slice(
    localStore.indexOf("export function MyCableBalanceReport"),
    localStore.indexOf("/* ───────────── تسجيل حركة"),
  );

  assert.match(techAllowed, /"my-cable-balance"/);
  assert.match(techGroups, /"المخزن"/);
  assert.doesNotMatch(techAllowed, /"local-store"/);
  assert.match(personalReport, /queryKey: \["\/api\/local-store", "my-balance"\]/);
  assert.match(personalReport, /getJson\("\/api\/local-store\/my-balance"\)/);
  assert.doesNotMatch(personalReport, /\/api\/local-store\/summary/);
  assert.match(personalReport, /ExportButtons onExcel=\{excel\} onPdf=\{pdf\}/);
  assert.match(personalReport, /exportExcel\("رصيد السلك", "my-cable-balance"/);
  assert.match(personalReport, /printTablePDF/);
  assert.match(dashboard, /id !== "my-cable-balance"/);
});

test("one technician's cable types are grouped into one row with the correct net", () => {
  const typeLabel = localStore.match(/const TYPE_LABEL: Record<CableType, string> = \{[^;]+\};/)?.[0];
  const types = localStore.match(/const TYPES: CableType\[\] = \["install", "maint"\];/)?.[0];
  const start = localStore.indexOf("type Cell =");
  const end = localStore.indexOf("\n\nfunction TechBalancesTable", start);
  assert.ok(typeLabel && types && start >= 0 && end > start);

  const source = [
    'type CableType = "install" | "maint";',
    typeLabel,
    types,
    localStore.slice(start, end),
    "exports.groupTechBalances = groupTechBalances;",
  ].join("\n");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {} as Record<string, unknown> };
  runInNewContext(compiled, context);
  const groupTechBalances = context.exports.groupTechBalances as (balances: unknown[]) => Array<{
    tech: string;
    byType: Record<string, { issued: number; used: number; balance: number }>;
    net: number;
  }>;
  const rows = groupTechBalances([
    { tech: "فنى واحد", type: "install", issued: 10, used: 3, balance: 7 },
    { tech: "فنى واحد", type: "maint", issued: 4, used: 1, balance: 3 },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].net, 10);
  assert.equal(rows[0].byType.install.balance + rows[0].byType.maint.balance, rows[0].net);
});
