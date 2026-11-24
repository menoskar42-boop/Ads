import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");

test("installations report remains imported and rendered alongside follow-up progress", () => {
  assert.match(dashboard, /import \{ InstallationsByTechReport \} from "@\/components\/InstallationsByTechReport"/);
  assert.match(dashboard, /reportTab === "installations-by-tech" && <InstallationsByTechReport \/>/);
  assert.match(dashboard, /reportTab === "inspection-followup-progress" && <InspectionFollowupProgressReport \/>/);
});

test("installations menu entry is restored to the installations group", () => {
  const groups = dashboard.slice(dashboard.indexOf("const REPORT_GROUPS"), dashboard.indexOf("export default"));
  const group = groups.match(/label: "تركيبات و نقل و اوامر شغل"[\s\S]*?items: \[([\s\S]*?)\]/);
  assert.ok(group, "installations report group exists");
  assert.match(group[1], /id: "installations-by-tech", label: "نسبة التركيبات لكل فنى"/);
  assert.match(groups, /id: "inspection-followup-progress"/);
});

test("technicians and inherited central roles can see installations without removing progress", () => {
  const allowed = dashboard.match(/const TECH_ALLOWED: ReportTab\[\] = \[([\s\S]*?)\];/);
  assert.ok(allowed);
  assert.match(allowed[1], /"installations-by-tech"/);
  assert.match(allowed[1], /"inspection-followup-progress"/);
  assert.match(dashboard, /const CENTRAL_VIEW_ALLOWED: ReportTab\[\] = \(\[\.\.\.TECH_ALLOWED/);
  for (const name of ["CENTRAL_VIEW_HIDDEN", "SUPER_ONLY_REPORTS"]) {
    const list = dashboard.match(new RegExp(`const ${name}: ReportTab\\[\\] = \\[([\\s\\S]*?)\\];`));
    assert.ok(list);
    assert.doesNotMatch(list[1], /"installations-by-tech"/);
  }
});
