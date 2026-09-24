import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loopMeters, speedKbps } from "./loop-length";

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
