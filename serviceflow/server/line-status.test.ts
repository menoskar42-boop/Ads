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
  assert.match(dzs, /@version {6}10\.(39|40)\.0/);
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
