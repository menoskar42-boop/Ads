// تقرير الأسبوع + خريطة الأخطاء (اقتراح كوديكس ٢٠٢٦-١١-٠٤)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { topConfusions, weeklyReport, homeActivity } from "../js/data/weeklyReport.js";

const now = new Date("2026-11-04T12:00:00");

test("confusions both ways merge into one pair; old and one-off ones drop", () => {
  const c = {
    "arabic|ب|ت": { n: 2, d: "2026-11-03" }, "arabic|ت|ب": { n: 1, d: "2026-11-02" },
    "arabic|ج|ح": { n: 1, d: "2026-11-03" },            // مرة واحدة
    "colors|أحمر|برتقالي": { n: 5, d: "2026-10-01" },   // قديمة
  };
  const t = topConfusions(c, now);
  assert.equal(t.length, 1);
  assert.equal(t[0].n, 3);
  assert.match(t[0].text, /^بيلخبط بين (ب وت|ت وب) \(الحروف العربى\)$/);
});

test("report: mastered this week, needs practice, home activity from the top confusion", () => {
  const r = weeklyReport({
    now,
    grades: { "ar:ب": { last: { total: 95, at: +now - 86400000 } }, "ar:ح": { last: { total: 55, at: +now - 9 * 86400000 } } },
    confusions: { "arabic|ب|ت": { n: 3, d: "2026-11-04" } },
    achievementsAt: { ar3: "2026-11-02", ar8: "2026-10-01" },
    achievements: [{ id: "ar3", title: "أعرف ٣ حروف عربى" }, { id: "ar8", title: "أعرف ٨ حروف عربى" }],
    last7: [{ acts: 2, min: 10 }, { acts: 0, min: 0 }, { acts: 1, min: 5 }],
    ctx: { arStarred: 4, colorsKnown: 2 },
  });
  assert.deepEqual(r.mastered, ["أعرف ٣ حروف عربى", "حرف ب بامتياز (95)"]);
  assert.equal(r.activeDays, 2);
  assert.equal(r.minutes, 15);
  assert.ok(r.needs.includes("حرف ح — محتاج تدريب كتابة"));
  assert.match(r.activity, /ب وت/);
  assert.deepEqual(r.strengths, ["بيعرف 4 حرف عربى", "بيعرف 2 ألوان بالإنجليزى"]);
});

test("home activity falls back: weak letter, then English colors", () => {
  assert.match(homeActivity({ weak: "ح", colorsKnown: 9 }), /حرف ح/);
  assert.match(homeActivity({ colorsKnown: 1 }), /What color/);
});

test("wiring: three games record the wrong pick; parent page has the printable weekly report", () => {
  const r = (f) => readFileSync(new URL("../js/" + f, import.meta.url), "utf8");
  assert.match(r("games/review.js"), /Store\.recordConfusion\(datasetKey, itemKey\(target\), itemKey\(c\)\);/);
  assert.match(r("games/match.js"), /Store\.recordConfusion\(datasetKey, mk\(target\), mk\(c\)\);/);
  assert.match(r("games/letterRecall.js"), /Store\.recordConfusion\(isAr \? "arabic" : "english", r\.ch, o\);/);
  assert.match(r("screens/parent.js"), /wrap\.appendChild\(weeklyBox\(\)\);/);
  assert.match(r("screens/parent.js"), /data-testid="weekly-print"/);
});
