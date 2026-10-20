// «رفع السرعة ثم الإيقاف» على مراحل (المالك ٢٠٢٦-١٠-١٢): رفع ← بعد ٧ دقايق إيقاف PO ← بعده بدقيقتين قياس Real.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { followupFor, recheckFor, STOP_AFTER_RAISE_MIN, MEASURE_AFTER_STOP_MIN, RECHECK_MARK } from "./exec-followups";

const SRC = "بحث برقم التليفون";

test("raise +إيقاف → stop after 7 min, marked for the measure", () => {
  const f = followupFor({ type: "raise", note: `${SRC} +إيقاف`, result: "done" });
  assert.deepEqual(f, { type: "stop", note: `${SRC} +قياس`, afterMin: 7 });
  assert.equal(STOP_AFTER_RAISE_MIN, 7);
});

test("stop +قياس → Real measure after 2 min with the original source (marked for a score re-check)", () => {
  const f = followupFor({ type: "stop", note: `${SRC} +قياس`, result: "tab_closed" });
  assert.deepEqual(f, { type: "measure", note: `${SRC} ${RECHECK_MARK}`, afterMin: 2 });
  assert.ok(f!.note.includes(SRC), "same source ⇒ «A recent fix» like any measure from phone lookup");
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

test("speed-drop report has the measure / no-Real / raise / stop buttons", () => {
  const ui = readFileSync(new URL("../client/src/components/SpeedDropReport.tsx", import.meta.url), "utf8");
  assert.match(ui, /useSpeedToolSource\("انخفاض السرعة بعد الانتظام"\)/);
  assert.match(ui, /dispatchSpeedTool\("measure", accounts, isSuper, \{ noReal \}\)/);
  assert.match(ui, /dispatchSpeedTool\(kind === "stop" \? "stop" : "raise", accounts, isSuper\)/);
  assert.match(ui, /handleMeasure\(true\)[\s\S]{0,300}قياس بدون Real/);
  assert.match(ui, /handleRaisePO\("stop"\)[\s\S]{0,200}إيقاف PO/);
});

test("speed-drop report: mobile column like current faults + details button next to the phone", () => {
  const ui = readFileSync(new URL("../client/src/components/SpeedDropReport.tsx", import.meta.url), "utf8");
  assert.match(ui, /const COLS = \["#", "رقم التليفون", "رقم الموبايل",/);
  // byTech (قبل البحث): الموبايل نفسه بيتبحث فيه، فلازم يتجاب قبل فلترة البحث
  assert.match(ui, /useMobileLookup\(byTech\.map\(\(r\) => r\.phone\)\)/);
  assert.match(ui, /<MobileValue mobile=\{mobileOf\(r\) \|\| null\} phone=\{r\.phone\} \/>/);
  assert.match(ui, /onClick=\{\(\) => setDetailPhone\(r\.phone\)\} title="تفاصيل الخط والاتصال"/);
  assert.match(ui, /<LineDetailsDialog phone=\{detailPhone\}/);
});

// المالك ٢٠٢٦-١٠-١٤: «لو القياس طلع اسكور أعلى من ١٠٠ تجدول قياس تانى بعد دقيقتين»
test("chain measure with score > 100 → one more measure after 2 min (once)", () => {
  const m = { type: "measure", note: `${SRC} ${RECHECK_MARK}`, result: "done" };
  assert.deepEqual(recheckFor(m, 135), { type: "measure", note: SRC, afterMin: 2 });
  assert.equal(recheckFor(m, 100), null, "100 بالظبط مش أعلى من ١٠٠");
  assert.equal(recheckFor(m, 40), null);
  assert.equal(recheckFor(m, null), null, "مفيش قياس جديد اتسجّل");
  assert.equal(recheckFor({ ...m, result: "timeout" }, 150), null);
  // القياس التانى مالوش علامة ⇒ مابيكرّرش، وأى قياس عادى برّه السلسلة مالوش إعادة
  assert.equal(recheckFor({ type: "measure", note: SRC, result: "done" }, 150), null);
  assert.equal(followupFor({ type: "measure", note: `${SRC} ${RECHECK_MARK}`, result: "done" }), null);
});

test("wiring: done reads the fresh score (after claim) and schedules the re-check", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /RETURNING id, type, accounts, note, requested_by, claimed_at/);
  assert.match(routes, /SELECT score FROM case_138 WHERE account_no = \$1 AND uploaded_at >= COALESCE\(\$2::timestamptz/);
  assert.match(routes, /const rc = recheckFor\(\{ type: j\.type, note: j\.note, result \}, sc\[0\]\?\.score\);/);
});
