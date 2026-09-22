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