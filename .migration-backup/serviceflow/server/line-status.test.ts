// «تحديث حالة الخط (ASSIA)» (المالك ٢٠٢٦-١١-١١): السكربت بيقرا شاشات DSL من غير Real ولا Perform XELT، والسيرفر بيحفظها.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lineStatusFacts, rowValue, rowValues } from "./line-status";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const pages = {
  summary: { ok: true, panels: [{ title: "Latest Line Status", rows: [["Collection Date", "2026-11-10 16:50:22"], ["Stability", "VERY UNSTABLE"], ["Estimated Loop Length", "655 meters"]] }] },
  operational: { ok: true, panels: [{ title: "Operational Data", rows: [["Upstream Fields", "Operation Values"], ["Margin (dB)", "8.1", "Margin (dB)", "0.0 / 8.0 / 31.0"], ["Margin (dB)", "6.2"]] }] },
  diagnostics: { ok: true, panels: [{ title: "Diagnostics Analysis Flags", rows: [["High Power Noise", "✓1 ✗1", "✓1 ✗0", "2/30"]] }] },
  xelt: { ok: true, panels: [{ title: "XELT Analysis", rows: [], text: "Historical SELT data not available for the given line id" }], history: false },
};

test("line status facts: stability from Line Summary, XELT without history", () => {
  assert.deepEqual(lineStatusFacts(pages), { stability: "VERY UNSTABLE", xeltHistory: false });
  assert.deepEqual(lineStatusFacts({ diagnostics: { panels: [{ rows: [["Stability:", "Stable"]] }] } }), { stability: "STABLE", xeltHistory: null });
  assert.equal(rowValue(pages.summary, "estimated loop length"), "655 meters");
  assert.deepEqual(rowValues(pages.operational, "Margin (dB)"), ["8.1", "6.2"]);
  assert.equal(rowValue(pages.diagnostics, "High Power Noise"), "✓1 ✗1");
});

test("DZS 10.39.0: line status reads recorded data only, never presses Real or Perform XELT; stability with every measurement", () => {
  const dzs = read("../dzs-expresse-v10.user.js");
  assert.match(dzs, /@version {6}10\.(39|40|41|42|43)\.0/);
  const block = dzs.slice(dzs.indexOf("const LS_STATE_KEY"), dzs.indexOf("window.DZS_lineStatus"));
  assert.ok(block.length > 1000);
  assert.doesNotMatch(block, /\.click\(\)[^\n]*(Perform|Real ?-?Time)/i);
  assert.doesNotMatch(block, /findRealTimeButton|Perform XELT"\)/);
  assert.match(block, /\/api\/line-status\/ingest/);
  assert.match(block, /sendLoopLength\(CURRENT_LINE_ID/);   // المسافة لسه بتتبعت (جهاز التنفيذ بيعرف منها إن الخط خلص)
  for (const k of ["summary", "operational", "counters", "diagnostics", "recommendation", "xelt", "attributes"]) assert.match(block, new RegExp(`key: "${k}"`));
  assert.match(dzs, /stability: rec\.stability \|\| ""/);
  // النسخة اللى قبلها محفوظة للرجوع (المالك: «متمسحش اخر كود قياس»)
  assert.match(read("../userscripts-rollback/dzs-expresse-v10-10.38.0.user.js"), /@version {6}10\.38\.0/);
});

test("server: stability column, line_status_reports table, ingest route", () => {
  const db = read("./db.ts"), routes = read("./routes.ts"), schema = read("../shared/schema.ts");
  assert.match(db, /ALTER TABLE case_138 ADD COLUMN IF NOT EXISTS stability text/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS line_status_reports/);
  assert.match(schema, /stability: text\("stability"\)/);
  assert.match(schema, /pgTable\("line_status_reports"/);
  assert.match(routes, /app\.post\("\/api\/line-status\/ingest"/);
  assert.match(routes, /page_msg, stability\)/);
});

test("ASSIA waits for line-status ingest before the loop completion signal and reports skipped items", () => {
  const dzs = read("../dzs-expresse-v10.user.js");
  const finish = dzs.slice(dzs.indexOf("async function lsFinish"), dzs.indexOf("let lsBusy"));
  const ingestAt = finish.indexOf("await sfFetch");
  const loopAt = finish.indexOf("sendLoopLength");
  assert.ok(ingestAt >= 0 && loopAt > ingestAt);
  assert.match(finish, /undefined, 60000/);
  assert.match(finish, /saved:/);
  assert.match(finish, /Number\(j\.saved \|\| 0\) === 0[\s\S]{0,120}console\.warn/);
  assert.match(dzs, /@version {6}10\.43\.0/);
  assert.match(dzs, /@description\s+v10\.43\.0: Perform XELT بيضغط OK على الرسالة ويقفل التاب، وXELT بيتقرا بعد ربع ساعة بـ«تحديث حالة الخط»/);

  const routes = read("./routes.ts");
  const ingest = routes.slice(routes.indexOf('app.post("/api/line-status/ingest"'), routes.indexOf('app.get("/api/line-status/latest"'));
  assert.match(ingest, /const skipped:/);
  assert.match(ingest, /missing_phone_and_account/);
  assert.match(ingest, /json\.length > 1_500_000/);
  assert.match(ingest, /payload_too_large/);
  assert.match(ingest, /res\.json\(\{ ok: true, saved, skipped \}\)/);
});

// ASSIA المرحلة ٣: حالة الخط تلقائياً للأعطال الجديدة (مرة للشكوى) + Perform XELT عاجل
test("ASSIA step 3: auto line status for new faults + urgent Perform XELT", () => {
  const routes = read("../server/routes.ts");
  const db = read("../server/db.ts");
  const schema = read("../shared/schema.ts");
  assert.match(db, /CREATE TABLE IF NOT EXISTS line_status_auto \(\s*ticket_id text PRIMARY KEY/);
  assert.match(schema, /pgTable\("line_status_auto"/);
  // بعد رفع الأعطال الحالية، والشكوى بتتسجّل مرة واحدة
  assert.match(routes, /void autoFetchCurrentFaultMobiles\("fcc-import"\);[\s\S]{0,200}void autoLineStatusNewFaults\("fcc-import"\)/);
  assert.match(routes, /INSERT INTO line_status_auto \(ticket_id, account_no, full_phone\)[\s\S]*?ON CONFLICT \(ticket_id\) DO NOTHING/);
  assert.match(routes, /حالة الخط للأعطال الجديدة[^`]*\$\{AUTO_MEASURE_NOREAL_MARK\} — \$\{LOOP_MARK\}/);
  // XELT مالوش بيانات قديمة ⇒ مهمة عاجلة (priority 2) مرة واحدة، والـxeltOnly بيتدمج فى آخر تقرير
  assert.match(routes, /st\.xeltHistory === false[\s\S]{0,400}xelt_queued_at IS NULL/);
  assert.match(routes, /VALUES \('measure', \$1::jsonb, 'auto', \$2, 2,/);
  const xeltOnlyAt = routes.indexOf("if (it?.xeltOnly) {");
  const xeltMerge = routes.slice(xeltOnlyAt, routes.indexOf("const json = JSON.stringify(pages)", xeltOnlyAt));
  assert.match(xeltMerge, /pages = \{ \.\.\.prev, xelt: xp \}/);
  // تقدّم مهمة XELT من line_status_reports
  assert.match(routes, /isXeltNote\(note\)\) \{\s*q = `SELECT COUNT\(DISTINCT account_no\)::int AS n FROM line_status_reports/);
  const dzs = read("../dzs-expresse-v10.user.js");
  assert.match(dzs, /const XELT = localStorage.getItem\(MEASURE_MODE_KEY\) === "xelt"/);
  assert.match(dzs, /xeltOnly: true, xeltOutcome: outcome/);
  const q = read("../client/src/lib/exec-queue.ts");
  assert.match(q, /if \(opts\?\.xelt\) return "&sf_mode=xelt"/);
});

test("DZS 10.43.0 confirms once, closes after a minute, and queues a 15-minute recheck", () => {
  const dzs = read("../dzs-expresse-v10.user.js");
  const xelt = dzs.slice(dzs.indexOf("function xeltConfirm()"), dzs.indexOf("/* ================== AUTO LOGIN"));
  const confirm = dzs.slice(dzs.indexOf("function xeltConfirm()"), dzs.indexOf("function xeltSend"));
  assert.doesNotMatch(confirm, /offsetParent !== null/);
  assert.match(confirm, /getClientRects\(\)/);
  assert.match(confirm, /\[role=dialog\], \[role=alertdialog\]/);
  assert.match(confirm, /span\.ui-button-text/);
  assert.match(xelt, /window\.confirm = \(\) => true; window\.alert = \(\) => \{\};\s*b\.click\(\)/);
  assert.doesNotMatch(xelt, /8 \* 60000/);
  assert.match(xelt, /const deadline = st\.clicked \+ 60000/);
  assert.match(xelt, /xeltSend\(\{ ok: true, started: true \}, "started"\)/);
  assert.match(dzs, /@version {6}10\.43\.0/);
  assert.match(dzs, /version: "10\.43\.0", xeltOnly: true/);

  const routes = read("./routes.ts");
  const ingest = routes.slice(
    routes.indexOf('app.post("/api/line-status/ingest"'),
    routes.indexOf('app.get("/api/line-status/latest"'),
  );
  const startedAt = ingest.indexOf('String(it?.xeltOutcome) === "started"');
  const followupAt = ingest.indexOf("INSERT INTO exec_followups", startedAt);
  const reportAt = ingest.indexOf("INSERT INTO line_status_reports");
  assert.ok(startedAt >= 0 && followupAt > startedAt && reportAt > followupAt);
  const startedBranch = ingest.slice(startedAt, reportAt);
  assert.match(startedBranch, /interval '15 minutes'/);
  assert.match(startedBranch, /created_at > now\(\) - interval '30 minutes'/);
  assert.match(startedBranch, /قراية XELT بعد ربع ساعة — \$\{AUTO_MEASURE_NOREAL_MARK\} — \$\{LOOP_MARK\}/);
  assert.doesNotMatch(startedBranch, /\$\{XELT_MARK\}/);
});
