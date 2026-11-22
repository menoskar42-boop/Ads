import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { speedDropOf, SPEED_ZERO_SCORE } from "./speed-drop";

// المالك ٢٠٢٦-١٠-٢٥: «أى خط الاسكور بتاعه ١٠١ ده معناه إن السرعة أصبحت ٠ فيدخل برده فى التقريرين»
test("score 101 = speed 0 → 100% drop, in both speed-drop reports", () => {
  assert.equal(SPEED_ZERO_SCORE, 101);
  assert.deepEqual(speedDropOf({ firstSpeed: "20000", lastSpeed: "N/A", lastScore: 101 }), { firstKbps: 20000, lastKbps: 0, dropPct: 100 });
  // الاسكور جاى نص من القاعدة أحياناً
  assert.equal(speedDropOf({ firstSpeed: "20000", lastSpeed: "", lastScore: "101" }).dropPct, 100);
  // من غير ١٠١: زى الأول — السرعة المقروءة، والمجهولة مالهاش نسبة
  assert.equal(speedDropOf({ firstSpeed: "20000", lastSpeed: "14000", lastScore: 40 }).dropPct, 30);
  assert.equal(speedDropOf({ firstSpeed: "20000", lastSpeed: "N/A", lastScore: 100 }).dropPct, null);
  assert.equal(speedDropOf({ firstSpeed: "20000", lastSpeed: "N/A", lastScore: 102 }).dropPct, null, "١٠١ بالظبط");
  // قياس المقارنة نفسه صفر (كان ١٠١ من أسبوع) ⇒ مفيش انخفاض يتحسب
  assert.equal(speedDropOf({ firstSpeed: "N/A", lastSpeed: "N/A", lastScore: 101 }).dropPct, null);

  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  for (const ep of ["/api/reports/regularized-speed-drop", "/api/reports/weekly-speed-drop"]) {
    const start = routes.indexOf(`app.get("${ep}"`);
    assert.ok(start > 0, ep);
    const body = routes.slice(start, routes.indexOf("app.get(", start + 10));
    assert.match(body, /\.\.\.speedDropOf\(r\)/, ep);
    assert.doesNotMatch(body, /speedKbps\(r\.lastSpeed\)/, `${ep}: الحساب من مكان واحد`);
  }
});

// المالك ٢٠٢٦-١٠-٢٥: «دروب ليست: الكل · السرعة الحالية 0 · السرعة الحالية أكبر من 0» — للتقريرين
test("speed-drop page: current-speed filter (all / zero / above zero)", () => {
  const ui = readFileSync(new URL("../client/src/components/SpeedDropReport.tsx", import.meta.url), "utf8");
  assert.match(ui, /data-testid="select-speed-drop-now"/);
  assert.match(ui, /speedNow === "zero" \? baseRows\.filter\(\(r\) => r\.lastKbps === 0\)/);
  assert.match(ui, /baseRows\.filter\(\(r\) => \(r\.lastKbps \?\? 0\) > 0\)/);
  // فلتر الفنى بعد فلتر السرعة، والإكسيل/PDF/الأزرار على النتيجة
  assert.match(ui, /const byTech = tech === "all" \? bySpeed/);
});

// المالك ٢٠٢٦-١٠-٢٥: فى الأعطال الحالية وخارج الشاشة — هل الخط كان فى «انخفاض السرعة خلال أسبوع» قبل الشكوى؟
test("week drop before the complaint: yes / no / none, in both current-fault reports", async () => {
  const { weekDropOf, weekDropJoinSql, WEEK_DROP_MIN } = await import("./speed-drop");
  const { weekDropLabel, WEEK_DROP_TITLE } = await import("../shared/week-drop");
  assert.equal(WEEK_DROP_MIN, 10);
  const at = { wdFirstAt: "2026-10-15", wdLastAt: "2026-10-22" };
  assert.deepEqual(weekDropOf({ ...at, wdFirstSpeed: "20000", wdLastSpeed: "N/A", wdLastScore: 101 }).weekDrop, "yes");
  assert.equal(weekDropOf({ ...at, wdFirstSpeed: "20000", wdLastSpeed: "17000", wdLastScore: 30 }).weekDrop, "yes");
  assert.equal(weekDropOf({ ...at, wdFirstSpeed: "20000", wdLastSpeed: "19000", wdLastScore: 30 }).weekDrop, "no");
  assert.equal(weekDropOf({ wdLastAt: "2026-10-22", wdLastSpeed: "19000" }).weekDrop, "none", "قياس واحد بس");
  assert.equal(weekDropOf({}).weekDrop, "none");
  assert.equal(weekDropLabel({ weekDrop: "yes", weekDropPct: 35 }), "نعم ↓35%");
  assert.equal(weekDropLabel({ weekDrop: "no", weekDropPct: 5 }), "لا");
  assert.equal(weekDropLabel({ weekDrop: "none" }), "لا — مفيش قياس");
  const sql = weekDropJoinSql("mf.full_phone", "mf.flagged_at");
  assert.match(sql, /<= mf\.flagged_at AND .* > mf\.flagged_at - interval '7 days'/);
  assert.match(sql, /measure_mode = 'noreal'/);

  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const cur = routes.slice(routes.indexOf('app.get("/api/reports/current-faults"'), routes.indexOf('app.put("/api/reports/current-faults/major-selection"'));
  assert.match(cur, /weekDropJoinSql\(`'88' \|\| x\."phoneShort"`, `\(\(x\."complainTime" AT TIME ZONE 'UTC'\) AT TIME ZONE 'Africa\/Cairo'\)`\)/);
  assert.match(cur, /rows\.map\(\(r: any\) => \(\{ \.\.\.r, \.\.\.weekDropOf\(r\) \}\)\)/);
  const st = routes.indexOf('app.get("/api/manual-faults/current"');
  const man = routes.slice(st, routes.indexOf("app.get(", st + 10));
  assert.match(man, /weekDropJoinSql\("mf\.full_phone", "mf\.flagged_at"\)/);
  for (const f of ["CurrentFaultsReport.tsx", "ManualCurrentFaultsReport.tsx"]) {
    const ui = readFileSync(new URL(`../client/src/components/${f}`, import.meta.url), "utf8");
    assert.match(ui, /WEEK_DROP_TITLE/, f);
    assert.match(ui, /weekDropLabel\(/, f);
  }
  assert.equal(WEEK_DROP_TITLE, "انخفاض السرعة خلال أسبوع قبل الشكوى");
});

// المالك ٢٠٢٦-١٠-٢٥: زرار «لها شكوى» فى «انخفاض السرعة خلال أسبوع» — رقم شكوى حالياً أو قبل كده
test("weekly speed-drop: «has complaint» filter (current ticket, details or remaining)", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const st = routes.indexOf('app.get("/api/reports/weekly-speed-drop"');
  const ep = routes.slice(st, routes.indexOf("app.get(", st + 10));
  for (const t of ["ticket_dsl_current t", "complaint_details cd", "remaining_complaints rc"]) assert.ok(ep.includes(`FROM ${t} WHERE`), t);
  assert.match(ep, /AS "hasComplaint"/);
  assert.match(ep, /r\.hasComplaint = !!t\?\.hasComplaint/);
  const ui = readFileSync(new URL("../client/src/components/SpeedDropReport.tsx", import.meta.url), "utf8");
  assert.match(ui, /data-testid="button-speed-drop-has-complaint"/);
  assert.match(ui, /weekly && complaintOnly \? allRows\.filter\(\(r\) => r\.hasComplaint\)/);
});
