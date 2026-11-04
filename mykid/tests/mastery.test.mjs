// «أنا بقيت شاطر فى…» (اقتراح كوديكس ٢٠٢٦-١١-٠٤): الإنجازات بالإتقان، والكنز بييجى مع الإنجاز مش بالحظ
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACHIEVEMENTS, achievementStatus, newAchievements, masteryContext, KNOWN_LEVEL, EXCELLENT } from "../js/data/mastery.js";

const ctx = (o = {}) => masteryContext({ arStarred: [], enStarred: [], workbookDone: {}, numberPageIds: [], mastery: {}, colorKeys: [], grades: {}, writeStats: {}, ...o });

test("11 achievements for the 11 places in the room, all mastery-based", () => {
  assert.equal(ACHIEVEMENTS.length, 11);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, 11);
  for (const a of ACHIEVEMENTS) assert.doesNotMatch(a.title, /نجمة|دقيقة|يوم/, a.title);
});

test("context: starred letters, colors known in English, excellent letters, letters written", () => {
  const c = ctx({
    arStarred: ["أ", "ب", "ت"], enStarred: ["A"],
    workbookDone: { n1: 1, n2: 2 }, numberPageIds: ["n1", "n2", "n3"],
    mastery: { "colors:أحمر": KNOWN_LEVEL, "colors:أزرق": 1 }, colorKeys: ["أحمر", "أزرق"],
    grades: { "ar:أ": { best: { total: EXCELLENT } }, "ar:ب": { best: { total: 60 } }, "en:A": { best: { total: 99 } } },
    writeStats: { "أ": { n: 2 }, "ب": { n: 0 } },
  });
  assert.deepEqual([c.arStarred, c.enStarred, c.numbersDone, c.colorsKnown, c.excellent, c.lettersWritten], [3, 1, 2, 1, 1, 1]);
});

test("new achievements once: ar3 opens at 3 letters, then not again", () => {
  const c = ctx({ arStarred: ["أ", "ب", "ت"] });
  assert.deepEqual(newAchievements(c).map((a) => a.id), ["ar3"]);
  assert.deepEqual(newAchievements(c, ["ar3"]), []);
  const s = achievementStatus(c).find((a) => a.id === "ar8");
  assert.deepEqual([s.got, s.have, s.need], [false, 3, 8]);
});

test("wiring: no random treasure after activities; findIt records first-try mastery; room has 11 slots", async () => {
  const common = readFileSync(new URL("../js/games/common.js", import.meta.url), "utf8");
  assert.doesNotMatch(common, /Math\.random\(\) < 0\.7 \? grantRandomCollectible/);
  assert.match(common, /const fresh = claimNewAchievements\(\);/);
  const match = readFileSync(new URL("../js/games/match.js", import.meta.url), "utf8");
  assert.match(match, /if \(firstTry\) Store\.recordReview\(datasetKey, mk\(target\), true\);/);
  const room = readFileSync(new URL("../js/screens/masteryRoom.js", import.meta.url), "utf8");
  const slots = room.slice(room.indexOf("export const ROOM_SLOTS"), room.indexOf("];", room.indexOf("export const ROOM_SLOTS")));
  assert.equal((slots.match(/\[\d+\.?\d*, \d+\.?\d*\]/g) || []).length, 11);
  assert.match(readFileSync(new URL("../js/app.js", import.meta.url), "utf8"), /Router\.register\("masteryRoom", renderMasteryRoom\);/);
});
