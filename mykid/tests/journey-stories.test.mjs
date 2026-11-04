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
