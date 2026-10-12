import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { adslSpan, buildAdslReport, SEED_CHANGES, workerAt, type CtRow, type HistRow } from "./cabinet-reassign";

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

test("a month entirely before the move: cabinet and tech on the old split, same numbers as before", () => {
  const ct: CtRow[] = [{ central: "الغنايم", cabin: "2-1", code: "M1", worker: "200" }];
  const h: HistRow[] = [{ central: "الغنايم", cabin: "2-1", oldWorker: "300", date: "2026-10-11" }];
  const r = buildAdslReport({ ct, history: h, names, working: new Map([["M1", 600]]),
    daily: new Map([["M1", days([["2026-09-03", 2], ["2026-09-20", 1]])]]), from: "2026-09-01", to: "2026-09-30" });
  // الكابينة بالفنى الحالى (محمد) — معدّلها مالوش دعوة بمين ماسكها
  assert.deepEqual(r.rows, [{ centralName: "الغنايم", cabinNumber: "2-1", msanCode: "M1", techName: "محمد", workingAdsl: 600, faultCount: 3 }]);
  // الفنى: سبتمبر كله كان مع اسلام
  assert.deepEqual(r.techs.map((t) => [t.techName, t.workingAdsl, t.faultCount, t.per1000]), [["اسلام", 600, 3, 5]]);
});

// المالك ٢٠٢٦-١٠-١٢: «من ١-١٠ لـ ١٠-١٠ على الشغال القديم والأعطال القديمة، ومن ١١-١٠ على الشغال
// الجديد والأعطال الجديدة، وتاخد متوسط» — والكابينة صف واحد بشغالها كامل (مش ٦٨).
test("a period spanning the move: cabinet = one row, full working, current tech; tech = each part on its own", () => {
  const ct: CtRow[] = [
    { central: "الغنايم-دير الجنادله", cabin: "1-2", code: "DR2", worker: "300" },   // سامى ← اسلام
    { central: "الغنايم", cabin: "7-1", code: "M71", worker: "200" },                 // اسلام ← محمد
    { central: "الغنايم", cabin: "7-2", code: "M72", worker: "100" },                 // حسن طول الوقت
  ];
  const h: HistRow[] = [
    { central: "الغنايم-دير الجنادله", cabin: "1-2", oldWorker: "400", date: "2026-10-11" },
    { central: "الغنايم", cabin: "7-1", oldWorker: "300", date: "2026-10-11" },
  ];
  const r = buildAdslReport({
    ct, history: h, names,
    working: new Map([["DR2", 400], ["M71", 250], ["M72", 200]]),
    daily: new Map([
      ["DR2", days([["2026-10-03", 2], ["2026-10-11", 1]])],
      ["M71", days([["2026-10-05", 1], ["2026-10-12", 2]])],
    ]),
    from: "2026-10-01", to: "2026-10-12" });
  const cab = Object.fromEntries(r.rows.map((x) => [x.msanCode, [x.techName, x.workingAdsl, x.faultCount]]));
  assert.deepEqual(cab, { DR2: ["اسلام", 400, 3], M71: ["محمد", 250, 3], M72: ["حسن", 200, 0] });
  const t = Object.fromEntries(r.techs.map((x) => [x.techName, x]));
  // اسلام: قبل النقل 7-1 (٢٥٠ شغال، عطل واحد) ← بعده دير 1-2 (٤٠٠ شغال، عطل واحد)
  assert.equal(t["اسلام"].workingAdsl, 400, "الشغال = شغاله دلوقتى (دير 1-2) مش متقسّم على الأيام");
  assert.equal(t["اسلام"].faultCount, 2);
  assert.equal(t["اسلام"].per1000, Math.round((1 * 1000 / 250 + 1 * 1000 / 400) * 100) / 100);
  assert.deepEqual(t["اسلام"].segments.map((g) => [g.from, g.to, g.days, g.working, g.faults]),
    [["2026-10-01", "2026-10-10", 10, 250, 1], ["2026-10-11", "2026-10-12", 2, 400, 1]]);
  // سامى: دير 1-2 لحد ١٠-١٠ بس — شغاله دلوقتى صفر، وأعطاله القديمة محسوبة عليه
  assert.equal(t["سامى"].workingAdsl, 0);
  assert.equal(t["سامى"].faultCount, 2);
  assert.equal(t["سامى"].per1000, 5);
  // محمد: 7-1 من ١١-١٠ بس
  assert.deepEqual([t["محمد"].workingAdsl, t["محمد"].faultCount, t["محمد"].per1000], [250, 2, 8]);
  // حسن ماتأثرش
  assert.deepEqual([t["حسن"].workingAdsl, t["حسن"].faultCount, t["حسن"].per1000], [200, 0, 0]);
});

test("a shared MSAN code with two techs is split between them — no joint «حسن , محمد» row", () => {
  const ct: CtRow[] = [
    { central: "الغنايم", cabin: "6-5", code: "M6", worker: "100" },
    { central: "الغنايم", cabin: "6-6", code: "M6", worker: "200" },
  ];
  const r = buildAdslReport({ ct, history: [], names, working: new Map([["M6", 20]]),
    daily: new Map([["M6", days([["2026-10-05", 2]])]]), from: "2026-10-01", to: "2026-10-12" });
  assert.deepEqual(r.rows.map((x) => [x.cabinNumber, x.techName, x.workingAdsl]), [["6-5 , 6-6", "حسن , محمد", 20]]);
  assert.deepEqual(r.techs.map((x) => [x.techName, x.workingAdsl, x.faultCount]), [["حسن", 10, 1], ["محمد", 10, 1]]);
  assert.ok(!r.techs.some((x) => x.techName.includes(",")));
});

test("no move inside the period ⇒ one row per MSAN exactly like the old report", () => {
  const ct: CtRow[] = [
    { central: "الغنايم", cabin: "6-2", code: "M6", worker: "100" },
    { central: "الغنايم", cabin: "6-3", code: "M6", worker: "100" },
  ];
  const r = buildAdslReport({ ct, history: [], names, working: new Map([["M6", 250]]),
    daily: new Map([["M6", days([["2026-10-05", 2]])]]), from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(r.rows, [{ centralName: "الغنايم", cabinNumber: "6-2 , 6-3", msanCode: "M6", techName: "حسن", workingAdsl: 250, faultCount: 2 }]);
  assert.deepEqual(r.techs.map((x) => [x.techName, x.workingAdsl, x.faultCount, x.per1000]), [["حسن", 250, 2, 8]]);
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
