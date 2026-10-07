import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const report = readFileSync(
  new URL("../client/src/components/UrgentNoAccountReport.tsx", import.meta.url),
  "utf8",
);
const tabs = readFileSync(
  new URL("../client/src/components/NoAccountTab.tsx", import.meta.url),
  "utf8",
);

test("urgent no-account report merges the three sources by full phone", () => {
  assert.match(report, /Promise\.all/);
  assert.match(report, /mergeUrgentNoAccountRows/);
  assert.match(report, /const byPhone = new Map<string, UrgentRow>\(\)/);
  assert.match(report, /byPhone\.get\(fullPhone\)/);
  assert.match(report, /source: "lines"/);
  assert.match(report, /source: "regularized"/);
  assert.match(report, /source: "ground"/);
});

test("the urgent tab is the default and data managers only see it", () => {
  assert.match(tabs, /useState<SubTab>\("urgent"\)/);
  assert.match(tabs, /user\?\.role === ROLES\.DATA_MANAGER/);
  assert.match(tabs, /item\.id === "urgent"/);
  assert.match(tabs, /أرقام بدون اكونت عاجل/);
});

// قرار المالك ٢٠٢٦-١٠-٠٦: ٣ مصادر زيادة — عطل حالى 160/173 · اسكور 103 · تركيب جديد عدّى يومين.
const extra = readFileSync(new URL("./urgent-no-account.ts", import.meta.url), "utf8");

test("current faults with status 160/173 and no account join the urgent report", () => {
  assert.match(extra, /FROM ticket_dsl_current t/);
  assert.match(extra, /t\.close_date IS NULL/);
  assert.match(extra, /t\.status_code ~ '\^\(160\|173\)' OR t\.complain_type_name ~ '\^\(160\|173\)'/);
  assert.match(report, /source: "current160", rows: extra\.current/);
});

test("score-103 lines show their old account with an edit — and the delete button deletes the account (owner, 2026-10-07)", () => {
  assert.match(extra, /WHERE c138p\.score = 103/);
  assert.match(extra, /la\.account_no AS "oldAccount"/);
  // المالك (٢٠٢٦-١٠-٠٧): نفس خطوط «اسكور 103» بالظبط — مفيش استبعاد للخط اللى أكونته اتعدّل
  assert.doesNotMatch(extra, /line_account_edits/);
  assert.match(report, /source: "score103", rows: extra\.score103/);
  // المالك (٢٠٢٦-١٠-٠٧): «زر حذف الأكونت مش موجود» — نفس زرار تقرير «اسكور 103»: حذف الأكونت ثم «بدون أكونت»
  assert.match(report, /<button type="button" onClick=\{\(\) => handleMarkNoAccount\(row\.fullPhone, row\.oldAccount\)\}/);
  assert.match(report, /if \(oldAccount\) \{[\s\S]*?fetch\(`\/api\/line-accounts\/\$\{encodeURIComponent\(fullPhone\)\}`, \{ method: "DELETE"/);
  assert.match(report, /if \(!del\.ok\) throw new Error/);
  assert.doesNotMatch(extra, /DELETE FROM line_accounts/);
});

test("new installs from the work-orders report join only after two days without an account", () => {
  assert.match(extra, /FROM work_orders w/);
  assert.match(extra, /btrim\(w\.service_type\) = 'تركيب جديد'/);
  assert.match(extra, /COALESCE\(w\.creation_date, w\.close_date\) <= now\(\) - interval '2 days'/);
  assert.match(report, /source: "newInstall", rows: extra\.newInstalls/);
});

test("every no-account source skips lines already marked no-account", () => {
  assert.equal(extra.match(/\$\{notMarked\("k\.full_phone"\)\}/g)?.length, 2);
  assert.equal(extra.match(/\$\{noAccount\("k\.full_phone"\)\}/g)?.length, 2);
});
