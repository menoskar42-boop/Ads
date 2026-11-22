// رحلة اليوم (اقتراح كوديكس ٢٠٢٦-١١-٠٤): ٣ مهام مبنية على احتياج الطفل + خريطة بتنوّر حجر كل رحلة
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeTarget, journeySteps, mapState, JOURNEY_STONES, WEAK_GRADE } from "../js/data/dailyJourney.js";

const order = ["أ", "ب", "ت", "ث"];
const g = (t) => ({ last: { total: t } });

test("write target: due review words first, then the weakest starred letter, then the next new letter", () => {
  assert.deepEqual(writeTarget({ dueWords: 3, starred: ["ب"], grades: { "ar:ب": g(40) }, order }), { kind: "words", count: 3 });
  assert.deepEqual(writeTarget({ starred: ["أ", "ب"], grades: { "ar:أ": g(70), "ar:ب": g(50) }, order }), { kind: "letter", ch: "ب", why: "weak" });
  assert.deepEqual(writeTarget({ starred: ["أ"], grades: { "ar:أ": g(WEAK_GRADE) }, order }), { kind: "letter", ch: "ب", why: "new" });
  assert.equal(writeTarget({ starred: order, grades: {}, order, day: 2 }).why, "keep");
  assert.equal(writeTarget({ starred: [], grades: {}, order }).ch, "أ");
});

test("three steps on three pedestals: write, number, color (English first)", () => {
  const s = journeySteps(5, { starred: ["أ"], grades: { "ar:أ": g(30) }, order });
  assert.deepEqual(s.map((x) => x.key), ["write", "number", "color"]);
  assert.equal(s[0].screen, "trace");
  assert.equal(s[0].params.focus, "أ");
  assert.equal(s[2].params.lang, "en");
  assert.equal(s[2].regionId, "colors");
  assert.equal(journeySteps(1, { dueWords: 2, order }).at(0).screen, "blankWrite");
});

test("map: a stone per journey, a new place every 7", () => {
  assert.deepEqual([mapState(0).lit, mapState(0).opened, mapState(0).left], [0, 0, 7]);
  assert.deepEqual([mapState(6).lit, mapState(6).opened], [JOURNEY_STONES, 0]);
  assert.deepEqual([mapState(7).lit, mapState(7).opened, mapState(7).next.id], [0, 1, "rainbow"]);
  const end = mapState(100);
  assert.equal(end.opened, 3);
  assert.equal(end.next, null);
});

test("screen: Mizo (not the lion) points at the pedestals; steps are marked by key", () => {
  const scr = readFileSync(new URL("../js/screens/dailyPlan.js", import.meta.url), "utf8");
  assert.match(scr, /\/assets\/mizo\/\$\{allDone \? "mizo-star" : "mizo-present"\}\.webp/);
  assert.match(scr, /Store\.activeStep = step\.key;/);
  assert.match(scr, /newStone = Store\.addJourney\(\);/);
  for (const f of ["assets/journey/map.webp", "assets/mizo/mizo-present.webp", "assets/mizo/mizo-star.webp"]) {
    assert.ok(readFileSync(new URL("../" + f, import.meta.url)).length < 120000, f);
  }
});
