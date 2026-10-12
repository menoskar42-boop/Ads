// «رفع السرعة ثم الإيقاف» على مراحل (المالك ٢٠٢٦-١٠-١٢): رفع ← بعد ٧ دقايق إيقاف PO ← بعده بدقيقتين قياس Real.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { followupFor, STOP_AFTER_RAISE_MIN, MEASURE_AFTER_STOP_MIN } from "./exec-followups";

const SRC = "بحث برقم التليفون";

test("raise +إيقاف → stop after 7 min, marked for the measure", () => {
  const f = followupFor({ type: "raise", note: `${SRC} +إيقاف`, result: "done" });
  assert.deepEqual(f, { type: "stop", note: `${SRC} +قياس`, afterMin: 7 });
  assert.equal(STOP_AFTER_RAISE_MIN, 7);
});

test("stop +قياس → Real measure after 2 min with the original source (no marks)", () => {
  const f = followupFor({ type: "stop", note: `${SRC} +قياس`, result: "tab_closed" });
  assert.deepEqual(f, { type: "measure", note: SRC, afterMin: 2 });
  assert.equal(MEASURE_AFTER_STOP_MIN, 2);
  // القياس مش «بدون Real»
  assert.doesNotMatch(f!.note, /بدون Real/);
});

test("no chain for plain jobs, failed/stopped runs, or the measure itself", () => {
  assert.equal(followupFor({ type: "raise", note: SRC, result: "done" }), null);
  assert.equal(followupFor({ type: "stop", note: "تحتاج إيقاف PO", result: "done" }), null);
  assert.equal(followupFor({ type: "raise", note: `${SRC} +إيقاف`, result: "timeout" }), null);
  assert.equal(followupFor({ type: "raise", note: `${SRC} +إيقاف`, result: "stopped" }), null);
  assert.equal(followupFor({ type: "measure", note: SRC, result: "done" }), null);
});

test("wiring: executor runs +إيقاف as a plain raise; done schedules; heartbeat enqueues; schema in both places", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const ex = readFileSync(new URL("../client/src/components/ExecutorButton.tsx", import.meta.url), "utf8");
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
  assert.match(ex, /const raiseWithStop = false;/);
  assert.match(routes, /WHERE id = \$1 AND status <> 'done'\s*\n\s*RETURNING id, type, accounts, note, requested_by/);
  assert.match(routes, /INSERT INTO exec_followups \(type, account, note, requested_by, source_job_id, run_at\)/);
  assert.match(routes, /WHERE enqueued_at IS NULL AND run_at <= now\(\)[\s\S]{0,80}FOR UPDATE SKIP LOCKED/);
  assert.match(routes, /void runPortsMissingSubinfo\("heartbeat"\);\s*\n\s*void runExecFollowups\(\);/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS exec_followups/);
  assert.match(schema, /export const execFollowups = pgTable\("exec_followups"/);
});

// «انخفاض السرعة بعد الانتظام» (المالك ٢٠٢٦-١٠-١٢) — تاب القياسات
test("speed-drop report: regularized this month, no-Real first-after-complaint vs latest, >10%", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const ep = routes.slice(routes.indexOf('app.get("/api/reports/regularized-speed-drop"'), routes.indexOf('app.get("/api/reports/regularized-faults-range"'));
  const ui = readFileSync(new URL("../client/src/components/SpeedDropReport.tsx", import.meta.url), "utf8");
  const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");
  assert.match(ep, /FROM complaint_details cd[\s\S]*FROM remaining_complaints rc/);
  assert.match(ep, /rc\.status_code IN \('138', '135'\)/);
  assert.match(ep, /c\.measure_mode = 'noreal'\s*\n\s*AND COALESCE\(c\.measured_at, c\.uploaded_at\) >= reg\.complain_time/);
  assert.match(ep, /WHERE l\.id <> f\.id/);
  assert.match(ep, /Number\(req\.query\.minDrop \?\? 10\)/);
  assert.match(ep, /r\.dropPct > minDrop/);
  assert.match(ui, /handleExport|const excel = \(\) =>/);
  assert.match(ui, /printTablePDF/);
  assert.match(dash, /\{ id: "speed-drop", +label: "انخفاض السرعة بعد الانتظام" \}/);
});
