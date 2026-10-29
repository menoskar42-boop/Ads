// «رفع السرعة ثم الإيقاف» على مراحل (المالك ٢٠٢٦-١٠-١٢): رفع ← بعد ٧ دقايق إيقاف PO ← بعده بدقيقتين قياس Real.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { followupFor, recheckFor, stopRetryFor, stopRetryCount, STOP_AFTER_RAISE_MIN, MEASURE_AFTER_STOP_MIN, RECHECK_MARK, STOP_RETRY_MARK, STOP_RETRY_AFTER_MIN, STOP_RETRY_MAX } from "./exec-followups";

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
  assert.match(routes, /WHERE f\.enqueued_at IS NULL AND f\.run_at <= now\(\)[\s\S]{0,80}FOR UPDATE OF f SKIP LOCKED/);
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

// المالك ٢٠٢٦-١٠-٢٥: «انخفاض السرعة خلال أسبوع» — كل الخطوط، السرعة الحالية قصاد سرعة الخط من أسبوع
test("weekly speed-drop: all lines, current vs a week ago, same report page", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../client/src/components/SpeedDropReport.tsx", import.meta.url), "utf8");
  const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");
  const start = routes.indexOf('app.get("/api/reports/weekly-speed-drop"');
  assert.ok(start > 0);
  const ep = routes.slice(start, routes.indexOf("app.get(", start + 10));
  // الخطوط نفسها مش من الأعطال (الشكاوى بتدخل بعدها بس لخانة «لها شكوى»)
  assert.doesNotMatch(ep.slice(0, ep.indexOf("const data =")), /complaint_details|remaining_complaints/, "مش الأعطال بس");
  assert.match(ep, /measure_mode = 'noreal'/);
  assert.match(ep, /WHERE l\.at > now\(\) - \$1::int \* interval '1 day'/, "الحالى جوّه الأسبوع");
  assert.match(ep, /\(m\.at <= now\(\) - \$1::int \* interval '1 day'\) DESC/, "المقارنة بآخر قياس قبل الأسبوع الأول");
  assert.match(ep, /hasFrameSql/);
  assert.match(ep, /r\.dropPct > minDrop/);
  assert.match(ui, /weekly \? "\/api\/reports\/weekly-speed-drop"/);
  assert.match(dash, /\{ id: "speed-drop-week", +label: "انخفاض السرعة خلال أسبوع" \}/);
  assert.match(dash, /<SpeedDropReport key="week" weekly \/>/);
});

test("speed-drop report has the measure / no-Real / raise / stop buttons", () => {
  const ui = readFileSync(new URL("../client/src/components/SpeedDropReport.tsx", import.meta.url), "utf8");
  assert.match(ui, /const NAME = weekly \? "انخفاض السرعة خلال أسبوع" : "انخفاض السرعة بعد الانتظام"/);
  assert.match(ui, /useSpeedToolSource\(NAME\)/);
  assert.match(ui, /dispatchSpeedTool\("measure", accounts, isSuper, \{ noReal \}\)/);
  assert.match(ui, /dispatchSpeedTool\(kind === "stop" \? "stop" : "raise", accounts, isSuper\)/);
  assert.match(ui, /handleMeasure\(true\)[\s\S]{0,300}قياس بدون Real/);
  assert.match(ui, /handleRaisePO\("stop"\)[\s\S]{0,200}إيقاف PO/);
});

test("speed-drop report: mobile column like current faults + details button next to the phone", () => {
  const ui = readFileSync(new URL("../client/src/components/SpeedDropReport.tsx", import.meta.url), "utf8");
  assert.match(ui, /const COLS_REG = \["#", "رقم التليفون", "رقم الموبايل",/);
  assert.match(ui, /const WEEK_COLS = \["#", "رقم التليفون", "رقم الموبايل",/);
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

// المالك ٢٠٢٦-١٠-٢٧: «تاريخ الإيقاف مش بيتحدث لما يبقى الإيقاف مهمة مجدولة فى رفع السرعة» — سكربت PO
// فى وضع الإيقاف كان بيتخطّى أى حالة غير Nightly/Not Started (الرفع لسه بيخلص) فالتاب يتقفل والقياس
// يتجدول والإيقاف ماحصلش. دلوقتى بيستنى.
test("PO script in stop mode waits on an unknown status instead of skipping the line", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../dzs-profile-optimization.user.js", import.meta.url), "utf8");
  const init = src.slice(src.indexOf('if (phase === "init")'), src.indexOf('if (phase === "wait-rt-then-stop")'));
  const other = init.slice(init.indexOf("} else if (status) {"));
  assert.match(other, /if \(MODE === "stop"\) \{\s*phase = "wait-rt-then-stop";/);
  assert.ok(other.indexOf('MODE === "stop"') < other.indexOf("advance"), "الإيقاف مايتخطّاش");
  assert.match(src, /@version\s+0\.9\.([1-9]\d)/);
});

// المالك ٢٠٢٦-١٠-٢٧: «Not Started يسجّل التاريخ وإنه لم يقم بعملية الإيقاف · In Nightly PO يسجّل التاريخ
// وإنه تم الإيقاف · حالة تانية يستنى لحد Nightly ويوقّف ويسجّل تم الإيقاف»
test("the stop is recorded with its outcome: stopped (was Nightly) or already (was Not Started)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../dzs-profile-optimization.user.js", import.meta.url), "utf8");
  const calls = [...src.matchAll(/postPoEvent\(CURRENT, "stop"(?:, "(\w+)")?\)/g)].map((m) => m[1]);
  assert.deepEqual(calls.sort(), ["already", "already", "stopped", "stopped"], "كل إيقاف بيبعت نتيجته");
  // «stopped» بس بعد ما الحالة ترجع Not Started عقب Yes على Stop Nightly PO
  const after = src.slice(src.indexOf('if (phase === "await-not-started")'));
  assert.match(after.slice(0, 400), /postPoEvent\(CURRENT, "stop", "stopped"\)/);
  const { poStopResultOf, withPoStopResult } = await import("../shared/po-stop");
  assert.equal(poStopResultOf("Stopped"), "stopped");
  assert.equal(poStopResultOf("x"), null);
  assert.equal(withPoStopResult("2026/10/27 09:40", "stopped"), "2026/10/27 09:40 — تم الإيقاف");
  assert.equal(withPoStopResult("2026/10/27 09:40", "already"), "2026/10/27 09:40 — لم يتم الإيقاف (كان Not Started)");
  assert.equal(withPoStopResult("—", "stopped"), "—", "من غير تاريخ مفيش نتيجة");
  assert.equal(withPoStopResult("2026/10/27 09:40", null), "2026/10/27 09:40", "سكربت قديم");
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /last_stop_result = \$3/);
  const n = (routes.match(/AS "lastPoStopAt"/g) || []).length;
  assert.equal((routes.match(/AS "lastPoStopAt", pe\.last_stop_result AS "lastPoStopResult"/g) || []).length, n, "كل تقرير بيرجّع النتيجة");
});

// المالك ٢٠٢٦-١٠-٢٧: الإيقاف اتقفل بعد ١٠ دقايق من غير ما يتسجّل ⇒ إيقاف تانى لنفس الرقم بعد ١٠ دقايق
test("stop closed without being recorded → another stop after 10 min (keeps +قياس, capped at 3)", () => {
  const r1 = stopRetryFor({ type: "stop", note: `${SRC} +قياس`, result: "tab_closed" }, false);
  assert.deepEqual(r1, { type: "stop", note: `${SRC} +قياس ${STOP_RETRY_MARK}1`, afterMin: 10 });
  assert.equal(STOP_RETRY_AFTER_MIN, 10);
  const r2 = stopRetryFor({ type: "stop", note: r1!.note, result: "timeout" }, false);
  assert.equal(r2!.note, `${SRC} +قياس ${STOP_RETRY_MARK}2`);
  const r3 = stopRetryFor({ type: "stop", note: r2!.note, result: "tab_closed" }, false);
  assert.equal(stopRetryCount(r3!.note), 3);
  assert.equal(stopRetryFor({ type: "stop", note: r3!.note, result: "tab_closed" }, false), null, "cap");
  // إيقاف عادى (من غير سلسلة) بيتعاد برده
  assert.equal(stopRetryFor({ type: "stop", note: "تحتاج إيقاف PO", result: "tab_closed" }, false)!.note, `تحتاج إيقاف PO ${STOP_RETRY_MARK}1`);
  // القياس بعد إيقاف معاد مافيهوش علامة الإعادة
  assert.deepEqual(followupFor({ type: "stop", note: r1!.note, result: "done" }), { type: "measure", note: `${SRC} ${RECHECK_MARK}`, afterMin: 2 });
});

test("no stop retry when the stop was recorded, canceled, stopped, preempted, or not a stop", () => {
  assert.equal(stopRetryFor({ type: "stop", note: `${SRC} +قياس`, result: "tab_closed" }, true), null);
  for (const result of ["canceled", "stopped", "preempted", "done"]) {
    assert.equal(stopRetryFor({ type: "stop", note: `${SRC} +قياس`, result }, false), null, result);
  }
  assert.equal(stopRetryFor({ type: "raise", note: `${SRC} +إيقاف`, result: "tab_closed" }, false), null);
  assert.equal(stopRetryFor({ type: "measure", note: SRC, result: "tab_closed" }, false), null);
  assert.equal(STOP_RETRY_MAX, 3);
});

test("wiring: done handler checks line_po_events since claim and skips the measure for retried accounts", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const h = routes.slice(routes.indexOf('app.post("/api/exec-queue/:id/done"'), routes.indexOf('app.get("/api/exec-queue/measure-check"'));
  assert.match(h, /FROM line_po_events WHERE account_no = \$1 AND last_stop_at >= COALESCE\(\$2::timestamptz/);
  assert.match(h, /stopRetryFor\(\{ type: j\.type, note: j\.note, result \}, st\.length > 0\)/);
  assert.match(h, /if \(retried\.has\(acc\)\) continue;/);
});

// المالك ٢٠٢٦-١٠-٢٧: «لو جه إنه تم الإيقاف أو Not Started كده يقف» — حتى لو الحدث وصل بعد ما الإعادة اتجدولت
test("both stop outcomes count as recorded, and a due retry is dropped once a stop lands", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const ing = routes.slice(routes.indexOf('app.post("/api/po-events/ingest"'), routes.indexOf('app.post("/api/op-intent"'));
  // stopped وalready الاتنين بيحدّثوا last_stop_at ⇒ recorded ⇒ مفيش إعادة
  assert.match(ing, /ON CONFLICT \(account_no\) DO UPDATE SET last_stop_at = now\(\), last_stop_by = \$2, last_stop_result = \$3/);
  const run = routes.slice(routes.indexOf("const runExecFollowups = async"), routes.indexOf('app.post("/api/exec-queue/heartbeat"'));
  assert.match(run, /if \(f\.type === "stop" && stopRetryCount\(f\.note\) > 0\)/);
  assert.match(run, /FROM line_po_events WHERE account_no = \$1 AND last_stop_at >= \$2 LIMIT 1`, \[f\.account, f\.created_at\]/);
  assert.match(run, /followupFor\(\{ type: "stop", note: f\.note, result: "done" \}\)/);
  // الإعادة اللى اتلغت ⇒ القياس بعد دقيقتين من غير علامة الإعادة
  assert.deepEqual(followupFor({ type: "stop", note: `${SRC} +قياس ${STOP_RETRY_MARK}2`, result: "done" }),
    { type: "measure", note: `${SRC} ${RECHECK_MARK}`, afterMin: 2 });
  assert.equal(followupFor({ type: "stop", note: `تحتاج إيقاف PO ${STOP_RETRY_MARK}1`, result: "done" }), null);
});

// المالك ٢٠٢٦-١٠-٢٧: بحث عن رقم تانى كان بيلاقى زر القياس لسه «فى انتظار القياس»
test("phone lookup: op wait is per account, not for the whole page", () => {
  const ui = readFileSync(new URL("../client/src/components/PhoneLookupReport.tsx", import.meta.url), "utf8");
  assert.match(ui, /const \[awaiting, setAwaiting\] = useState<Record<string, "measure" \| "raise" \| "stop">>\(\{\}\);/);
  assert.match(ui, /const awaitingOp = shownAcc \? awaiting\[shownAcc\] \?\? null : null;/);
  assert.match(ui, /if \(!tok\.cancelled && shownAccRef\.current === account\) setSearchSeq/);
  assert.doesNotMatch(ui, /setAwaitingOp\(/);
});

// المالك ٢٠٢٦-١٠-٢٧: «إزاى إسلام عامل إيقاف على خطوط العزايزة يوم ٢٤-١٠؟» — إيقاف ٩ الصبح التلقائى
// كان بيتختم باسم آخر حد طلب إيقاف للرقم (op_intents من غير تاريخ صلاحية)
test("daily auto batch stamps its own intent so results don't inherit a stale name", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const fn = routes.slice(routes.indexOf("const enqueueAutoBatch = async"), routes.indexOf("const enqueueAutoBatch = async") + 2200);
  assert.match(routes, /const AUTO_INTENT_BY = "تلقائى";/);
  assert.match(fn, /INSERT INTO op_intents \(account, op_type, username, created_at\)\s*\n\s*SELECT a, \$2, \$3, now\(\) FROM unnest\(\$1::text\[\]\) AS a/);
  assert.match(fn, /\[\[\.\.\.new Set\(accounts\)\], type, AUTO_INTENT_BY\]/);
});

// المالك ٢٠٢٦-١٠-٢٧: باتش تلقائى اتحط فى الطابور قبل التحديث لسه بيتختم باسم قديم ⇒ «بواسطة» من المهمة نفسها
test("result stamps come from the claimed queue job (auto ⇒ تلقائى), op_intents only as fallback", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const fn = routes.slice(routes.indexOf("const execRequesterOf = async"), routes.indexOf("const execRequesterOf = async") + 900);
  assert.match(fn, /WHERE status = 'claimed' AND type = \$2 AND jsonb_exists\(accounts, \$1\)/);
  assert.match(fn, /by === "auto" \? AUTO_INTENT_BY : by/);
  assert.match(fn, /FROM op_intents WHERE account = \$1 AND op_type = \$2/);
  assert.match(routes, /measuredBy = await execRequesterOf\(accountNo, "measure"\);/);
  assert.match(routes, /const by = await execRequesterOf\(acc, ev as "raise" \| "stop"\);/);
  assert.doesNotMatch(routes, /op_type = 'measure'`, \[accountNo\]/);
});

// المالك ٢٠٢٦-١٠-٢٧: «مش بيحصل إيقاف» — الإيقاف بعد الانتظار كان بيدوس Yes على صفحة مش نضيفة
test("PO v0.9.12: reload before a stop that waited, verify after Yes, count a reloaded Not Started as stopped", () => {
  const po = readFileSync(new URL("../dzs-profile-optimization.user.js", import.meta.url), "utf8");
  assert.match(po, /@version\s+0\.9\.(1[2-9]|[2-9]\d)/);
  const wait = po.slice(po.indexOf('if (phase === "wait-rt-then-stop")'), po.indexOf('if (phase === "confirm-stop")'));
  assert.match(wait, /if \(\/nightly\/i\.test\(status\)\) \{ reloadPoPage\(/);
  assert.doesNotMatch(wait, /selectAction\(RE_STOP\)/);
  assert.match(po, /if \(MODE === "stop"\) markStopSent\(\); phase = "await-not-started"; awaitSince = Date\.now\(\);/);
  assert.match(po, /MODE === "stop" && awaitSince && Date\.now\(\) - awaitSince > AWAIT_STOP_RELOAD_MS/);
  assert.match(po, /if \(stopTries\(\) > 0\) \{ postPoEvent\(CURRENT, "stop", "stopped"\);/);
  assert.match(po, /MODE === "stop" && stopTries\(\) >= MAX_STOP_TRIES/);
  assert.match(po, /function advance\(\) \{\s*\n\s*clearStopSent\(\);/);
});

// المالك ٢٠٢٦-١٠-٢٧: «لسه ساعات يوقّف وساعات لأ — راجع الكود القديم»: Yes كان ممكن يتداس على دروب ليست
test("PO v0.9.13: Yes only inside the visible confirm dialog, never in a dropdown; dialog detected by itself", () => {
  const po = readFileSync(new URL("../dzs-profile-optimization.user.js", import.meta.url), "utf8");
  assert.match(po, /@version\s+0\.9\.(1[3-9]|[2-9]\d)/);
  const fy = po.slice(po.indexOf("function findYes()"), po.indexOf("function findYes()") + 700);
  assert.match(fy, /isVisible\(b\) && !inDropdown\(b\)/);
  assert.match(fy, /: \["button", "input\[type='button'\]", "input\[type='submit'\]"\];/);
  assert.match(po, /const inDropdown = \(el\) => !!\(el\.closest && el\.closest\("\.ui-helper-hidden-accessible, \.ui-selectonemenu, select"\)\);/);
  assert.doesNotMatch(po, /stop\\s\*nightly\\s\*po\|are/);
  assert.equal((po.match(/const dlg = !!findYes\(\);/g) || []).length, 2);
  assert.match(po, /else if \(!dialogShown && Date\.now\(\) - lastSelectAt > 6000\) selectAction\(RE_STOP\);/);
  assert.match(po, /else if \(!dialogShown && Date\.now\(\) - lastSelectAt > 6000\) selectAction\(RE_START\);/);
});

// المالك ٢٠٢٦-١٠-٢٧: «بتقف كده ولما بعمل ريفريش يدوى بينفّذ الإيقاف» — بعد آخر سكربت
test("PO v0.9.14: auto-refresh 10 s after Yes with a visible countdown", () => {
  const po = readFileSync(new URL("../dzs-profile-optimization.user.js", import.meta.url), "utf8");
  assert.match(po, /@version\s+0\.9\.(1[6-9]|[2-9]\d)/);
  assert.match(po, /const AWAIT_STOP_RELOAD_MS = 10 \* 1000;/);
  assert.match(po, /ريفريش تلقائى بعد " \+ left \+ "ث/);
});

// المالك ٢٠٢٦-١٠-٢٧: «ويعمل ريفريش بالظبط زى ما أنا بعمله يدوى»
test("PO v0.9.14: the auto refresh is a real location.reload on the same line's page", () => {
  const po = readFileSync(new URL("../dzs-profile-optimization.user.js", import.meta.url), "utf8");
  const fn = po.slice(po.indexOf("const reloadPoPage = (msg) =>"), po.indexOf("const reloadPoPage = (msg) =>") + 500);
  assert.match(fn, /new URLSearchParams\(location\.search\)\.get\("lineId"\) === String\(CURRENT\)/);
  assert.match(fn, /if \(onThisLine\) location\.reload\(\); else location\.href = PO_URL \+ encodeURIComponent\(CURRENT\);/);
});

// المالك ٢٠٢٦-١٠-٢٩: «الإيقاف بتتفتح باتشات عاجلة كتير… بالرغم إن الباتش مؤجّل» — إعادة إيقاف لخط من باتش مؤجّل
// (أولوية ٠) بتفضل مؤجّلة وبتتجمّع فى «<الباتش>-x»، والمتابعة من طلب عاجل (أو من غير أصل) بتفضل عاجلة باتش لوحدها.
test("a followup keeps the source job's deferred priority and joins one '-x' batch", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const run = routes.slice(routes.indexOf("const runExecFollowups = async"), routes.indexOf('app.post("/api/exec-queue/heartbeat"'));
  assert.match(run, /FROM exec_followups f LEFT JOIN exec_jobs j ON j\.id = f\.source_job_id/);
  assert.match(run, /FOR UPDATE OF f SKIP LOCKED/, "LEFT JOIN محتاج OF f");
  assert.match(run, /const deferred = Number\(f\.srcPriority\) === 0 && !!f\.srcBatch;/);
  assert.match(run, /const batchId = deferred \? `\$\{String\(f\.srcBatch\)\.replace\(\/-x\$\/, ""\)\}-x`/);
  assert.match(run, /VALUES \(\$1, \$2::jsonb, \$3, \$4, \$7, \$5, \$6, 'متابعة تلقائية \(رفع ← إيقاف ← قياس\)'\) RETURNING id`,\n\s+\[f\.type, JSON\.stringify\(\[f\.account\]\), f\.requested_by, f\.note, batchId, SITE_OF_TYPE\[f\.type\] \|\| "10\.42\.187\.101", deferred \? 0 : 2\]\);/);
});
