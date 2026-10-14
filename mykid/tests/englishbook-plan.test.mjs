// «كتاب الإنجليزى»: البيانات زى الكتاب (٩ وحدات) وكل نشاط ليه صورة ونطق صح.
//   node --test mykid/tests/englishbook-plan.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import "../server/_node-shim.mjs";
import { EB_UNITS, EB_PAGES, EB_WORDS, EB_LETTERS, ebSteps, hasSound, ALL_WORDS } from "../js/data/englishbook.js";
import { strokesFor } from "../js/data/strokes.js";
import { EB_SAY } from "../js/data/writingPhrases.js";
import { femAdapt } from "../js/data/mizo.js";

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const PLURAL = ["hands", "legs", "feet", "eyes", "ears", "apples"];

test("the book: 9 units in order, all 26 letters taught (Qu as Q), unique page ids", () => {
  assert.deepEqual(EB_UNITS.map((u) => u.id), ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9"]);
  assert.deepEqual([...EB_LETTERS].sort().join(""), "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  assert.equal(new Set(EB_PAGES.map((p) => p.id)).size, EB_PAGES.length);
  // كل حرف ليه ٣ كلمات من الكتاب فيها صوته (X فى الآخر: six, box, fox)
  for (const p of EB_PAGES.filter((p) => p.type === "letter")) {
    assert.equal(p.words.length, 3, p.id);
    for (const w of p.words) assert.ok(hasSound(p, w), `${p.id}: ${w}`);
  }
  assert.deepEqual(EB_PAGES.find((p) => p.id === "u6-X").words, ["six", "box", "fox"]);
});

test("every step builds, every word has a picture, every write glyph has strokes", () => {
  for (let k = 0; k < 20; k++) {
    for (const pg of EB_PAGES) {
      const steps = ebSteps(pg, rnd);
      assert.ok(steps.length >= 2, pg.id);
      for (const s of steps) {
        const words = [...(s.words || []), ...(s.rounds || []).flatMap((r) => (Array.isArray(r) ? [r[0]] : s.kind === "find" ? r.options : [r.w].filter(Boolean))),
          ...(s.items || []).map((it) => (Array.isArray(it) ? it[0] : it.w)), ...(s.pairs || []).flatMap((p) => (Array.isArray(p) ? p : [p.w]))];
        for (const w of words) assert.ok(EB_WORDS[w] || PLURAL.includes(w), `${pg.id}/${s.kind}: ${w}`);
        if (s.kind === "write") assert.ok(strokesFor(s.glyph)?.length, s.glyph);
        if (s.kind === "spell") for (const c of s.word) assert.ok(strokesFor(c)?.length, c);
        if (s.kind === "find") for (const r of s.rounds) {
          assert.ok(r.options.includes(r.target));
          // مافيش صورتين شبه بعض فى نفس السؤال
          assert.equal(new Set(r.options.map((w) => EB_WORDS[w])).size, r.options.length, `${pg.id}: ${r.options}`);
        }
        if (s.kind === "firstSound") {
          const good = s.items.filter((x) => x.good);
          assert.ok(good.length >= 2, pg.id);
          for (const x of s.items) assert.equal(hasSound({ ch: s.ch, pos: s.pos }, x.w), x.good, `${pg.id}: ${x.w}`);
        }
        if (s.kind === "matchLetter") for (const p of s.pairs) assert.ok(p.w.includes(p.ch), `${pg.id}: ${p.ch}→${p.w}`);
        if (s.kind === "missing") for (const r of s.rounds) {
          assert.ok(r.options.includes(r.answer));
          assert.equal(r.pattern.replace("_", r.answer), r.w);
        }
        if (s.kind === "build") for (const r of s.rounds) assert.equal([...r.tiles].sort().join(""), [...r.w].sort().join(""));
        if (s.kind === "rhyme") for (const [a, b] of s.pairs) assert.equal(a.slice(-2), b.slice(-2), `${a}/${b}`);
      }
    }
  }
});

test("distractors never use words without a clear picture", () => {
  for (const w of ["in", "up", "under", "quiet", "kick", "food", "drink"]) assert.ok(!ALL_WORDS.includes(w), w);
});

test("Mizo's words for a girl: feminine verbs, and no «غلط» anywhere", () => {
  for (const [k, v] of Object.entries(EB_SAY)) {
    if (k === "cheerEn") continue;
    const t = typeof v === "function" ? v("B") : v;
    assert.doesNotMatch(t, /غلط|خطأ|وحش/, k);
  }
  const girl = (t) => femAdapt(t);
  assert.match(girl(EB_SAY.count12), /^اعدّي/);
  assert.match(girl(EB_SAY.choose), /واختاري اللى انتي عايزاه/);
  assert.match(girl(EB_SAY.build), /^ركّبي/);
  assert.match(girl(EB_SAY.findColor("we")), /ولوّني/);
  assert.match(girl(EB_SAY.sentences), /واسمعيها، وقوليها/);
});
