import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «الأعطال المنتظمة لفترة» للفنى (قرار المالك ٢٠٢٦-٠٩-٣٠):
//   • زر «اسكور أعلى من 15» — مضغوط افتراضياً للفنى بس، وباقى المستخدمين لأ.
//   • الفنى يشوف خطوط كباينه هو بس — من غير خطوط الزميل اللى غطّاه فى الوردية.
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const report = readFileSync(
  new URL("../client/src/components/RegularizedFaultsRangeReport.tsx", import.meta.url), "utf8");

const start = routes.indexOf('app.get("/api/reports/regularized-faults-range"');
const end = routes.indexOf('app.get("/api/reports/repeated-within-month"', start);
const endpoint = routes.slice(start, end);

test("areaTechSql has a no-shift-cover mode that returns the cabinet owner only", () => {
  const fnStart = routes.indexOf("const areaTechSql = (");
  const fn = routes.slice(fnStart, routes.indexOf("const effTechSql", fnStart));
  assert.match(fn, /opts: \{ noShiftCover\?: boolean \} = \{\}/);
  const b = fn.indexOf("if (opts.noShiftCover)");
  assert.ok(b >= 0 && b < fn.indexOf("shift_schedules"), "the owner-only branch must come before the shift join");
  const branch = fn.slice(b, fn.indexOf("`;", b));
  assert.match(branch, /SELECT \$\{owner\} AS name \$\{ownerFrom\}/);
  assert.doesNotMatch(branch, /covers|shift_schedules/);
});

test("the tech filter in the range report excludes shift coverage", () => {
  const techBlock = endpoint.slice(endpoint.indexOf("if (isTech) {"), endpoint.indexOf('const cdWhere = "WHERE "'));
  assert.equal((techBlock.match(/\{ noShiftCover: true \}/g) || []).length, 2, "both sources (cd + rc)");
});

test("high score toggle: > 15, on by default for technicians only", () => {
  assert.match(report, /const HIGH_SCORE_MIN = 15;/);
  assert.match(report, /const highScoreOnly = highScorePref \?\? isTechnician;/);
  assert.match(report, /Number\(f\.lastMeasScore\) > HIGH_SCORE_MIN/);
  assert.match(report, /data-testid="button-high-score-only"/);
});
