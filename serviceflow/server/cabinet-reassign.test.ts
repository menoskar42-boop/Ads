import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { adslSpan, buildAdslRows, SEED_CHANGES, workerAt, type CtRow, type HistRow } from "./cabinet-reassign";

// المالك ٢٠٢٦-١٠-٠٧: اسلام ياخد دير الجنادله 1-2 من الأحد ١١ أكتوبر، وكباينه تتوزّع على حسن
// ومحمد — و«الأعطال فى الألف» لحد السبت بالليل (والشهور اللى فاتت) على التوزيع القديم.

const names = new Map([["100", "حسن"], ["200", "محمد"], ["300", "اسلام"], ["400", "سامى"]]);
const days = (pairs: [string, number][]) => new Map(pairs);

test("the move: Islam takes Deir 1-2; Hassan Azayza + 1-8; Mohamed 7-1 + 2-1..2-8", () => {
  const key = (c: { central: string; cabin: string; tech: string }) => `${c.central}|${c.cabin}|${c.tech}`;
  assert.deepEqual(SEED_CHANGES.map(key), [
    "الغنايم-دير الجنادله|1-2|اسلام", "الغنايم-العزايزة|*|حسن", "الغنايم|1-8|حسن", "الغنايم|7-1|محمد",
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((c) => `الغنايم|2-${c}|محمد`),
  ]);
});

test("who held the cabinet on a given day: before Sunday = old tech, from Sunday = new", () => {
  const row: CtRow = { central: "الغنايم", cabin: "2-1", code: "M1", worker: "200" };
  const h: HistRow[] = [{ central: "الغنايم", cabin: "2-1", oldWorker: "300", date: "2026-10-11" }];
  assert.equal(workerAt(row, h, "2026-10-10"), "300");
  assert.equal(workerAt(row, h, "2026-10-11"), "200");
  assert.equal(workerAt(row, h, "2026-09-15"), "300", "الشهور اللى فاتت على القديم");
  assert.equal(workerAt(row, [], "2026-09-15"), "200", "مفيش سجل ⇒ الحالى زى الأول");
});

test("a month entirely before the move stays on the old split, same numbers as before", () => {
  const ct: CtRow[] = [{ central: "الغنايم", cabin: "2-1", code: "M1", worker: "200" }];
  const h: HistRow[] = [{ central: "الغنايم", cabin: "2-1", oldWorker: "300", date: "2026-10-11" }];
  const rows = buildAdslRows({ ct, history: h, names, working: new Map([["M1", 600]]),
    daily: new Map([["M1", days([["2026-09-03", 2], ["2026-09-20", 1]])]]), from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(rows, [{ centralName: "الغنايم", cabinNumber: "2-1", msanCode: "M1", techName: "اسلام", workingAdsl: 600, faultCount: 3 }]);
});

test("a period spanning Sunday splits: faults till Saturday night on the old tech, from Sunday on the new", () => {
  const ct: CtRow[] = [{ central: "الغنايم", cabin: "2-1", code: "M1", worker: "200" }];
  const h: HistRow[] = [{ central: "الغنايم", cabin: "2-1", oldWorker: "300", date: "2026-10-11" }];
  const rows = buildAdslRows({ ct, history: h, names, working: new Map([["M1", 600]]),
    daily: new Map([["M1", days([["2026-10-02", 1], ["2026-10-10", 2], ["2026-10-11", 4], ["2026-10-19", 1]])]]),
    from: "2026-10-01", to: "2026-10-20" });
  assert.deepEqual(rows.map((r) => [r.techName, r.faultCount, r.workingAdsl]), [["اسلام", 3, 300], ["محمد", 5, 300]]);
  assert.equal(rows.reduce((s, r) => s + r.workingAdsl, 0), 600, "إجمالى الشغال زى ما هو");
});

test("no move inside the period ⇒ one row per MSAN exactly like the old report", () => {
  const ct: CtRow[] = [
    { central: "الغنايم", cabin: "6-2", code: "M6", worker: "100" },
    { central: "الغنايم", cabin: "6-3", code: "M6", worker: "100" },
  ];
  const rows = buildAdslRows({ ct, history: [], names, working: new Map([["M6", 250]]),
    daily: new Map([["M6", days([["2026-10-05", 2]])]]), from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(rows, [{ centralName: "الغنايم", cabinNumber: "6-2 , 6-3", msanCode: "M6", techName: "حسن", workingAdsl: 250, faultCount: 2 }]);
});

test("Azayza (whole central) moves to Hassan; Deir 1-2 moves from Sami to Islam", () => {
  const ct: CtRow[] = [
    { central: "الغنايم-العزايزة", cabin: "1-1", code: "AZ1", worker: "100" },
    { central: "الغنايم-دير الجنادله", cabin: "1-2", code: "DR2", worker: "300" },
  ];
  const h: HistRow[] = [
    { central: "الغنايم-العزايزة", cabin: "1-1", oldWorker: "300", date: "2026-10-11" },
    { central: "الغنايم-دير الجنادله", cabin: "1-2", oldWorker: "400", date: "2026-10-11" },
  ];
  const rows = buildAdslRows({ ct, history: h, names, working: new Map([["AZ1", 100], ["DR2", 100]]),
    daily: new Map(), from: "2026-10-01", to: "2026-10-20" });
  assert.deepEqual(rows.map((r) => [r.msanCode, r.techName]), [["AZ1", "اسلام"], ["AZ1", "حسن"], ["DR2", "سامى"], ["DR2", "اسلام"]]);
});

test("mid-month: days that haven't come yet don't dilute the new tech's share", () => {
  assert.deepEqual(adslSpan("2026-10-01", "2026-10-31", [], "2026-10-20"), { from: "2026-10-01", to: "2026-10-20" });
  assert.deepEqual(adslSpan("2026-09-01", "2026-09-30", [], "2026-10-20"), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(adslSpan("1900-01-01", "2999-12-31", ["2026-08-04", "2026-07-30"], "2026-10-20"), { from: "2026-07-30", to: "2026-10-20" });
  assert.deepEqual(adslSpan("2026-11-01", "2026-11-30", [], "2026-10-20"), { from: "2026-11-01", to: "2026-11-30" }, "فترة كلها جاية: زى ما هى");
});

test("wiring: tables in ensureSchema + schema.ts, seed at Cairo midnight, report uses the history", () => {
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  assert.match(db, /CREATE TABLE IF NOT EXISTS cabinet_tech_changes/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS cabinet_tech_history/);
  assert.match(db, /\(\$5::timestamp AT TIME ZONE 'Africa\/Cairo'\)/);
  assert.match(db, /ON CONFLICT \(batch, central_name, cabin_number\) DO NOTHING/);
  const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /pgTable\("cabinet_tech_changes"/);
  assert.match(schema, /pgTable\("cabinet_tech_history"/);
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /registerCabinetReassign\(app, \{ pool, requireAuth, requireAdmin \}\)/);
  const h = routes.slice(routes.indexOf('app.get("/api/reports/cabinet-adsl-faults"'), routes.indexOf('app.get("/api/reports/cabinet-adsl-faults/unassigned"'));
  assert.match(h, /cabinetAdslFaultsByHistory\(pool/);
  assert.match(routes, /const reassignWarnings = await reassignConflicts\(pool\)/);
});
