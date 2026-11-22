import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { wfmReportWorkerCode } from "./wfm-report-access";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

test("technicians see all current surveys but installations stay assigned-cabinet scoped", () => {
  assert.equal(wfmReportWorkerCode("tech", " W-1 ", "tech"), "W-1");
  assert.equal(wfmReportWorkerCode("tech", "W-1", "tech", true), "");
  assert.equal(wfmReportWorkerCode("admin", "W-1", "tech", true), "");
  assert.equal(wfmReportWorkerCode("tech", "", "tech"), "__none__");

  const currentSurveys = routes.match(
    /app\.get\("\/api\/reports\/current-surveys"[^;]*;/,
  )?.[0];
  const currentInstallations = routes.match(
    /app\.get\("\/api\/reports\/current-installations"[^;]*;/,
  )?.[0];
  assert.ok(currentSurveys, "current-surveys route exists");
  assert.ok(currentInstallations, "current-installations route exists");
  assert.match(currentSurveys, /techniciansSeeAll:\s*true/);
  assert.doesNotMatch(currentInstallations, /techniciansSeeAll/);
});
