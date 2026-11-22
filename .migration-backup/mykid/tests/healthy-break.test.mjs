// فاصل حركة + الإنجليزى لوحده للألوان المعروفة (اقتراح كوديكس ٢٠٢٦-١١-٠٤)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { breakMission, confirmLangs, ENGLISH_ONLY_LEVEL, BREAK_OPTIONS } from "../js/data/healthyBreak.js";

test("break mission ties to what the child learned (English color first), rotates otherwise", () => {
  const [t0, s0] = breakMission({ n: 0, color: { name: "أحمر", en: "Red" } });
  assert.match(t0, /^Bring something Red!/);
  assert.equal(s0, "Bring something Red!");
  const plain = breakMission({ n: 1 })[0];
  assert.ok(plain && !/Bring/.test(plain));
  assert.match(breakMission({ n: 4, letter: "ب" })[0], /حرف ب/);
  assert.deepEqual(BREAK_OPTIONS, [0, 10, 15, 20]);
});

test("English only once the color is well known; English first before that; Arabic games unchanged", () => {
  assert.deepEqual(confirmLangs({ en: true, mastery: 0 }), ["en", "ar"]);
  assert.deepEqual(confirmLangs({ en: true, mastery: ENGLISH_ONLY_LEVEL }), ["en"]);
  assert.deepEqual(confirmLangs({ en: false, mastery: 5 }), ["ar", "en"]);
});

test("wiring: timer in the app (default 15, parent can turn off), findIt uses confirmLangs", () => {
  const r = (f) => readFileSync(new URL("../js/" + f, import.meta.url), "utf8");
  assert.match(r("core/storage.js"), /return state\.breakEvery == null \? 15 : state\.breakEvery;/);
  assert.match(r("app.js"), /if \(every > 0 && \+\+playedMin >= every && !document\.querySelector\("\.cheer"\)\) \{ playedMin = 0; showMoveBreak\(breaks\+\+\); \}/);
  assert.match(r("screens/parent.js"), /Store\.setBreakEvery\(m\);/);
  assert.match(r("games/match.js"), /const order = confirmLangs\(\{ en, mastery: Store\.getMastery\(datasetKey, mk\(target\)\) \}\);/);
});
