// قصص رحلة اليوم (اقتراح كوديكس ٢٠٢٦-١١-٠٤): قوس قزح · قطار الحروف · بيض العصفورة
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { storyState, chapterDone, STORIES, RAINBOW } from "../js/data/journeyStories.js";

test("each pedestal has a story with a goal; progress wraps into chapters", () => {
  assert.deepEqual(Object.keys(STORIES).sort(), ["color", "number", "write"]);
  const c = storyState("color", 3);
  assert.deepEqual([c.have, c.left, c.chapter], [3, 4, 1]);
  assert.equal(c.strip, RAINBOW.slice(0, 3).join("") + "⬜".repeat(4));
  assert.match(c.nudge, /ناقصه 4 ألوان/);
  assert.equal(storyState("number", 5).chapter, 2);
  assert.equal(storyState("write", 0).strip, "🚂");
  assert.match(storyState("number", 4).nudge, /بيضة تفقس/);
});

test("chapter done only on the goal", () => {
  assert.equal(chapterDone("color", 6), null);
  assert.match(chapterDone("color", 7), /قوس قزح/);
  assert.match(chapterDone("write", 20), /القطار/);
  assert.equal(chapterDone("other", 5), null);
});

test("wiring: a journey step advances its story once a day; the screen shows strips and the nudge", () => {
  const common = readFileSync(new URL("../js/games/common.js", import.meta.url), "utf8");
  assert.match(common, /if \(Store\.markDailyStep\(key\) && STORIES\[key\]\) storyMsg = chapterDone\(key, Store\.bumpStory\(key\)\);/);
  const scr = readFileSync(new URL("../js/screens/dailyPlan.js", import.meta.url), "utf8");
  assert.match(scr, /<span class="jr-story"/);
  assert.match(scr, /story \? story\.nudge :/);
});

test("spin wheel: opens after today's journey; every prize says what the child did", async () => {
  const { wheelSlices, becauseOf } = await import("../js/data/journeyStories.js");
  const steps = [{ key: "write", emoji: "✏️", ch: "ب" }, { key: "number", emoji: "🔢", title: "جمع" }, { key: "color", emoji: "🎨" }];
  const s = wheelSlices(steps);
  assert.equal(s.length, 6);
  assert.ok(s.every((x) => x.because && x.color));
  assert.equal(s.filter((x) => x.treasure).length, 3);
  assert.equal(becauseOf(steps[0]), "عشان كتبت حرف ب النهارده");
  assert.equal(becauseOf(steps[1]), "عشان لعبت «جمع» النهارده");
  const w = readFileSync(new URL("../js/screens/spinwheel.js", import.meta.url), "utf8");
  assert.match(w, /const earned = steps\.every\(\(st\) => doneKeys\.includes\(st\.key\)\);/);
  assert.match(w, /if \(!earned \|\| spinning \|\| !Store\.canSpinToday\(\)\) return;/);
  assert.match(w, /msg\.textContent = `🌟 \$\{prize\.because\}: كسبت \$\{prize\.stars\} نجوم!`;/);
});
