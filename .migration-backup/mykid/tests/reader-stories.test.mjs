// «قصص الحروف» (البند ٢٦ — موافقة المالك ٢٠٢٦-١١-١٧): كل كلمة من حروف الكراسة اللى اتعلّمت لحد الوحدة
import test from "node:test";
import assert from "node:assert/strict";
import { READER_STORIES, storyWords, lettersNeeded, bareWord } from "../js/data/readerStories.js";
import { LB_UNITS } from "../js/data/letterbook.js";
import { ACTIVITIES } from "../js/data/activities.js";
import { groupCastleActivities } from "../js/data/castleActivityTabs.js";

const norm = (c) => (/[أإآا]/.test(c) ? "أ" : c);

test("every word (and title) uses only letters learned up to the story's unit", () => {
  for (const s of READER_STORIES) {
    const known = new Set(LB_UNITS.slice(0, s.unit + 1).flatMap((u) => (u.pages || []).filter((p) => p.type === "letter").map((p) => norm(p.ch))));
    for (const t of [s.title, ...s.pages.map((p) => p.text)]) {
      for (const w of storyWords(t)) for (const c of lettersNeeded(w)) assert.ok(known.has(c), `${s.id}: «${w}» فيها ${c}`);
    }
  }
});

test("each story: 4–6 pages, coloring words that really appear, describe prompts, 2 quiz questions with a right answer", () => {
  assert.ok(READER_STORIES.length >= 3);
  for (const s of READER_STORIES) {
    assert.ok(s.pages.length >= 4 && s.pages.length <= 6, s.id);
    const words = s.pages.flatMap((p) => storyWords(p.text)).map(bareWord);
    for (const r of [s.color, s.color.second].filter(Boolean)) assert.ok(r.words.some((w) => words.includes(bareWord(w))), `${s.id}: ${r.label}`);
    assert.ok(s.describe.length >= 1);
    assert.equal(s.quiz.length, 2);
    for (const q of s.quiz) assert.ok(q.options[q.answer]);
  }
  // نشاط الكتاب: «قال» بالأحمر و«قالت» بالأخضر
  const m = READER_STORIES.find((s) => s.color.second);
  assert.ok(m && m.color.words.includes("قَالَ") && m.color.second.words.includes("قَالَتْ"));
});

test("listed in the Arabic castle (new tab) without moving anything", () => {
  const g = groupCastleActivities("arabic", ACTIVITIES.arabic);
  assert.ok(g.groups.find((x) => x.id === "seven").activities.some((a) => a.screen === "readerStory"));
  assert.ok(!g.remaining.some((a) => a.screen === "readerStory"));
});
