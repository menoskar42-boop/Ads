import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loopMeters, preserveLoopLength, speedKbps } from "./loop-length";

test("Loop Length text → meters", () => {
  assert.equal(loopMeters("1402 meters"), 1402);
  assert.equal(loopMeters("1,402 m"), 1402);
  assert.equal(loopMeters("1.4 km"), 1400);
  assert.equal(loopMeters("4.6 kft"), 1402);
  assert.equal(loopMeters("2000 ft"), 610);
  assert.equal(loopMeters("٨٥٠ متر"), 850);
  assert.equal(loopMeters("850"), 850);
});

test("unreadable or absurd Loop Length is null, not a guess", () => {
  for (const v of ["", "N/A", "n/a", "-", null, undefined, "unknown", "0 m", "99999 m"]) {
    assert.equal(loopMeters(v), null, String(v));
  }
});

test("an empty new Loop Length keeps the prior non-empty value, while a new value replaces it", () => {
  assert.equal(preserveLoopLength("", "1402 meters"), "1402 meters");
  assert.equal(preserveLoopLength("  ", "1.4 km"), "1.4 km");
  assert.equal(preserveLoopLength("1550 m", "1402 meters"), "1550 m");
  assert.equal(preserveLoopLength("", ""), null);
});

test("speed text → kbps (dotted = Mbps × 1024, same as autoPoStopAccounts)", () => {
  assert.equal(speedKbps("13312"), 13312);
  assert.equal(speedKbps("13.5"), 13824);
  assert.equal(speedKbps("N/A"), null);
  assert.equal(speedKbps(""), null);
});

test("the report endpoint reads the loop and the speeds from the SAME measurement row", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const ep = routes.slice(routes.indexOf('"/api/reports/loop-length-scatter"'));
  const q = ep.slice(0, ep.indexOf("let withLoop"));
  // واحد LATERAL بس، ومقيّد بإن الـloop مش فاضى — لو السرعات جت من صف تانى
  // (آخر قياس Real) النقطة هترسم طول خط من يوم وسرعة من يوم تانى.
  assert.equal((q.match(/LEFT JOIN LATERAL|JOIN LATERAL/g) || []).length, 1);
  assert.match(q, /COALESCE\(c\.loop_length, ''\) <> ''/);
  assert.match(q, /ORDER BY c\.id DESC LIMIT 1/);
  assert.match(q, /hasFrameSql\("pl\.full_phone"\)/);
});

test("DZS ingestion carries the newest non-empty loop forward when a measurement is blank", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const start = routes.indexOf('app.post("/api/case-138/measurements"');
  const end = routes.indexOf("// ===== استقبال أحداث رفع السرعة", start);
  const ingest = routes.slice(start, end);

  assert.ok(start >= 0 && end > start, "measurement ingest route exists");
  assert.match(ingest, /preserveLoopLength\(it\.loopLength, null\)/);
  assert.match(ingest, /COALESCE\(\s*NULLIF\(\$12::text, ''\)/);
  assert.match(ingest, /SELECT NULLIF\(btrim\(c\.loop_length\), ''\)/);
  assert.match(ingest, /c\.full_phone = \$6/);
  assert.match(ingest, /c\.phone_short = \$1/);
  assert.match(ingest, /c\.account_no = \$7/);
  assert.match(ingest, /NULLIF\(btrim\(c\.loop_length\), ''\) IS NOT NULL/);
  assert.match(ingest, /ORDER BY c\.id DESC\s+LIMIT 1/);
});

test("phone lookup falls back to the latest non-empty loop for an already-blank latest measurement", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const lookupStart = routes.indexOf("SELECT c2.full_phone, c2.current_speed");
  const lookupEnd = routes.indexOf(") c ON true", lookupStart);
  const lookup = routes.slice(lookupStart, lookupEnd);

  assert.ok(lookupStart >= 0 && lookupEnd > lookupStart, "phone lookup measurement join exists");
  assert.match(lookup, /COALESCE\(\s*NULLIF\(btrim\(c2\.loop_length\), ''\)/);
  assert.match(lookup, /SELECT NULLIF\(btrim\(c3\.loop_length\), ''\)/);
  assert.match(lookup, /ORDER BY c3\.id DESC\s+LIMIT 1/);
});
