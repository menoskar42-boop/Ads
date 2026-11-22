import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIVITIES } from "../js/data/activities.js";
import { groupCastleActivities } from "../js/data/castleActivityTabs.js";

test("Arabic castle tab grouping matches every requested existing card and leaves the rest below", () => {
  const grouped = groupCastleActivities("arabic", ACTIVITIES.arabic);
  assert.deepEqual(grouped.missing, []);
  assert.deepEqual(grouped.groups.slice(0, 2).map((group) => group.activities.length), [16, 14]);
  assert.equal(grouped.books.length, 1);
  assert.deepEqual(grouped.books.map((activity) => activity.title), ["كراسة الحروف"]);
  assert.ok(grouped.remaining.length > 0);
  assert.ok(grouped.remaining.some((activity) => activity.title === "تمارين قبل الكتابة"));
});

test("English castle tab grouping matches every requested existing card and leaves the rest below", () => {
  const grouped = groupCastleActivities("english", ACTIVITIES.english);
  assert.deepEqual(grouped.missing, []);
  assert.deepEqual(grouped.groups.slice(0, 2).map((group) => group.activities.length), [12, 11]);
  assert.equal(grouped.books.length, 1);
  assert.deepEqual(grouped.books.map((activity) => activity.title), ["كتاب الإنجليزى"]);
  assert.ok(grouped.remaining.length > 0);
  assert.ok(grouped.remaining.some((activity) => activity.title === "صاروخ الترتيب"));
});

// «الأقسام السبعة» (موافقة المالك ٢٠٢٦-١١-١٧): «سيب الـ٢٦ فى أماكنهم وضيف الـ٧ أقسام» ⇒ تاب زيادة، ومفيش حاجة بتتشال
test("new seven-sections tab is added next to the existing ones without moving anything", async () => {
  const before = { arabic: [16, 14], english: [12, 11] };
  for (const id of ["arabic", "english"]) {
    const g = groupCastleActivities(id, ACTIVITIES[id]);
    assert.deepEqual(g.missing, []);
    assert.equal(g.groups.length, 3);
    assert.deepEqual(g.groups.slice(0, 2).map((x) => x.activities.length), before[id]);
    const seven = g.groups[2];
    assert.equal(seven.id, "seven");
    for (const t of ["اختبر حروفى", "أعرف الكلمة", "اكتب من الذاكرة", "السبورة الذكية", "بيانو ميزو", "تحدّث مع ميزو"]) {
      assert.ok(seven.activities.some((a) => a.title === t), `${id}: ${t}`);
    }
    // الكتاب ظاهر فوق زى ما هو، و«اكتب من الذاكرة» لسه فى تابه القديم
    assert.equal(g.books.length, 1);
    assert.ok(seven.activities.includes(g.books[0]));
    assert.ok(g.groups[1].activities.some((a) => a.title === "اكتب من الذاكرة"));
    // كل نشاط قديم لسه فى مكانه (تاب قديم أو تحت التابات)
    const old = ACTIVITIES[id].filter((a) => !a.fresh);
    const placed = new Set([...g.books, ...g.groups[0].activities, ...g.groups[1].activities, ...g.remaining]);
    for (const a of old) assert.ok(placed.has(a), `${id}: ${a.title} اتشال من مكانه`);
  }
});

test("Numbers City: all 26 sections stay in order in the first tab, plus a new ten-sections tab", () => {
  const g = groupCastleActivities("numbers", ACTIVITIES.numbers);
  assert.deepEqual(g.missing, []);
  assert.deepEqual(g.groups.map((x) => x.id), ["all", "ten"]);
  assert.deepEqual(g.groups[0].activities, ACTIVITIES.numbers.filter((a) => !a.fresh));
  assert.equal(g.groups[0].activities.length, 26);
  assert.equal(g.groups[1].activities.length, 10);
  assert.deepEqual(g.remaining, []);
});

test("⭐ اختبر حروفى opens the existing star-letter reviews", async () => {
  const { readFileSync } = await import("node:fs");
  const ar = ACTIVITIES.arabic.find((a) => a.title === "اختبر حروفى");
  // العربى زى الإنجليزى (المالك ٢٠٢٦-١١-١٧): الطفل يختار الحروف، وبعدين مراجعة الكراسة على الحروف دى بس
  assert.deepEqual([ar.screen, ar.params.mode, ar.params.lang], ["letterRecall", "review", "ar"]);
  const lb = readFileSync(new URL("../js/games/letterbook.js", import.meta.url), "utf8");
  assert.match(lb, /startPage === LB_REVIEW_ALL\.id \? LB_REVIEW_ALL/);
  assert.match(lb, /id: "picked-review", type: "review", picked: true, letters: review/);
  const en = ACTIVITIES.english.find((a) => a.title === "اختبر حروفى");
  assert.deepEqual([en.screen, en.params.mode], ["letterRecall", "review"]);
});
