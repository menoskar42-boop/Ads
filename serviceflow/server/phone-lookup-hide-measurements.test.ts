import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «بحث برقم التليفون» (قرار المالك ٢٠٢٦-١٠-٠١): الفنى زى ما مايقدرش يقيس خط مش
// بتاعه، مايشوفش قياساته كمان — الاسكور والسرعة الحالية وأقصى سرعة وحالة PO.
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/PhoneLookupReport.tsx", import.meta.url), "utf8");

const fStart = routes.indexOf("const LINE_MEASUREMENT_FIELDS = [");
const fieldsSrc = routes.slice(fStart, routes.indexOf("] as const;", fStart));
const start = routes.indexOf('app.get("/api/phone-lines/lookup"');
const endpoint = routes.slice(start, routes.indexOf("res.json({ found: true, line });", start) + 40);

test("the hidden list covers every measurement the screen shows", () => {
  for (const k of ["currentSpeed", "maxSpeed", "score", "poStatus", "lastMeasTime", "measuredBy",
                   "measureMode", "loopLength", "histLabel", "lastPoRaiseAt", "raisedBy", "lastPoStopAt", "stoppedBy"]) {
    assert.ok(fieldsSrc.includes(`"${k}"`), k);
  }
});

test("the server strips them for a technician on a line that is not his — same rule as measuring", () => {
  assert.match(endpoint,
    /if \(req\.user\?\.role === ROLES\.TECH && !line\.ownedByMe\) \{\s*for \(const k of LINE_MEASUREMENT_FIELDS\) line\[k\] = null;\s*line\.measurementsHidden = true;/);
  // قبل الرد مش بعده
  assert.ok(endpoint.indexOf("LINE_MEASUREMENT_FIELDS") < endpoint.indexOf("res.json({ found: true, line })"));
});

test("the screen says why instead of a dash", () => {
  assert.match(ui, /const meas = \(v: ReactNode\): ReactNode => \(line\?\.measurementsHidden \? hiddenMeas : v\);/);
  for (const cell of [/\["السرعة الحالية", meas\(/, /\["أقصى سرعة", meas\(/, /\["الاسكور", meas\(/,
                      /\["حالة تحسين البروفايل", meas\(/, /\["تاريخ آخر قياس", meas\(/]) {
    assert.match(ui, cell);
  }
});

test("the account number is hidden too, and the 'only the area tech' message stays visible", () => {
  for (const k of ["accountNo", "markedNoAccount", "noAccountBy", "noAccountAt"]) assert.ok(fieldsSrc.includes(`"${k}"`), k);
  assert.match(ui, /const accountCell: ReactNode = line\?\.measurementsHidden\s*\? hiddenMeas/);
  assert.match(ui, /\{line\.accountNo \|\| line\.measurementsHidden \? \(\s*canUseTools && line\.accountNo \? \(/);
  // hiddenMeas لازم يتعرّف قبل أول استخدام (const فى نفس الدالة)
  assert.ok(ui.indexOf("const hiddenMeas") < ui.indexOf("const accountCell"));
});
