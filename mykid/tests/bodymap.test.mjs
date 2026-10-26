// «جسمي بالإنجليزي» (٢٠٢٦-١٠-٢٦): الصورة فيها كل جزء، والإجابة صح لو الطفل لمس الجزء أو حاجة جوّاه
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BODY_MAP_PARTS, isInside, findPlan, SONG_STEPS, SONG_LINES, bodyMapPhrases } from "../js/data/bodyMap.js";

const src = fs.readFileSync(new URL("../js/games/bodyMap.js", import.meta.url), "utf8");

test("every part has a touch area on the figure, and every touch area is a real part", () => {
  const ids = new Set(BODY_MAP_PARTS.map((p) => p.id));
  const used = new Set([...src.matchAll(/(?:area|line)\("(\w+)"/g)].map((m) => m[1]));
  for (const id of ids) assert.ok(used.has(id), `مفيش مكان للمس: ${id}`);
  for (const id of used) assert.ok(ids.has(id), `منطقة لمس لجزء مش فى البيانات: ${id}`);
});

test("touching a part inside the asked one counts (eye is in the head), not the other way", () => {
  assert.equal(isInside("eye", "head"), true);
  assert.equal(isInside("toes", "leg"), true);
  assert.equal(isInside("finger", "arm"), true);
  assert.equal(isInside("head", "eye"), false);
  assert.equal(isInside("knee", "foot"), false);
  for (const p of BODY_MAP_PARTS) if (p.parent) assert.ok(BODY_MAP_PARTS.some((q) => q.id === p.parent), p.id);
});

test("questions use is/are correctly and every round asks a different part", () => {
  for (const p of BODY_MAP_PARTS) {
    assert.match(p.ask, new RegExp(`^Where (is|are) your ${p.en.toLowerCase()}\\?$`));
    assert.equal(p.ask.startsWith("Where are"), p.en === "Toes");
  }
  const plan = findPlan(() => 0.42);
  assert.equal(new Set(plan).size, plan.length);
});

test("the song highlights one word per touch, in order", () => {
  const words = SONG_LINES.join(" ").match(/\b(Head|shoulders|knees|toes|eyes|ears|mouth|nose)\b/gi);
  assert.deepEqual(words.map((w) => w.toLowerCase()), SONG_STEPS.map((s) => s.word.toLowerCase()));
  for (const s of SONG_STEPS) assert.ok(BODY_MAP_PARTS.some((p) => p.id === s.part), s.part);
});

test("every spoken phrase is registered for the prebuilt voices", () => {
  const { en, ar } = bodyMapPhrases();
  for (const p of BODY_MAP_PARTS) { assert.ok(en.includes(p.en) && en.includes(p.ask)); assert.ok(ar.includes(p.ar)); }
  const tts = fs.readFileSync(new URL("../server/tts-games.js", import.meta.url), "utf8");
  assert.match(tts, /bodyMapPhrases\(\)/);
});
