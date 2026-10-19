// خطة «كراسة الحروف» (data/letterbook.js) — دالة صافية، من غير متصفح.
//   node --test mykid/tests/letterbook-plan.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LB_UNITS, LB_PAGES, LB_ORDER, LB_LETTERS, LB_HARAKAT, LB_BUILD, letterbookSteps, letterPage, reviewPage,
  startsWith, posOf, bare, splitAt, nameOf,
} from "../js/data/letterbook.js";
import { strokesFor, harakaStrokes, harakaGlyph } from "../js/data/strokes.js";
import { harakaQuizRounds } from "../js/data/harakaQuiz.js";
import { LB_SAY } from "../js/data/writingPhrases.js";
import { femAdapt } from "../js/data/mizo.js";
import { seeded } from "../js/data/workbook.js";

test("book order: prep, أ م, ب ف ن ل + review, ح ر ت س + review, ج ز د ق + review", () => {
  assert.deepEqual(LB_ORDER, ["أ", "م", "ب", "ف", "ن", "ل", "ح", "ر", "ت", "س", "ج", "ز", "د", "ق"]);
  assert.deepEqual(LB_UNITS.map((u) => u.title), ["التهيئة", "أ م", "ب ف ن ل", "ح ر ت س", "ج ز د ق"]);
  assert.equal(LB_PAGES[0].type, "prep");
  assert.deepEqual(LB_PAGES.filter((p) => p.type === "review").map((p) => p.letters.join("")), ["بفنل", "حرتس", "جزدق"]);
  assert.equal(new Set(LB_PAGES.map((p) => p.id)).size, LB_PAGES.length);
});

test("every letter: a name, strokes to write, a riddle whose answer starts with it", () => {
  for (const ch of LB_ORDER) {
    const L = LB_LETTERS[ch];
    assert.notEqual(nameOf(ch), ch, ch);
    assert.ok(strokesFor(ch).length, ch);
    assert.ok(startsWith(L.answer.w, ch), `${ch}: ${L.answer.w}`);
    assert.match(L.riddle, new RegExp(`بحرف ${ch}`), ch);
  }
});

test("harakat words: fatha, damma, kasra, sukun — and the mark sits on the letter itself", () => {
  for (const ch of LB_ORDER) {
    const H = LB_LETTERS[ch].harakat;
    assert.deepEqual(H.map((x) => x.h), ["a", "u", "i", "o"], ch);
    for (const x of H) {
      const chars = [...x.w];
      const i = chars.findIndex((c) => c === ch || (ch === "أ" && ["أ", "إ"].includes(c)));
      assert.ok(i >= 0, `${ch} فى ${x.w}`);
      assert.equal(chars[i + 1], LB_HARAKAT[x.h].mark, `${x.w}: الحركة على ${ch}`);
      // ومفيش حركة على أى حرف تانى (عشان النطق يركّز على الحرف) — الشدّة بس مسموحة (سُلّم)
      assert.equal(chars.filter((c) => /[\u064B-\u0650\u0652]/.test(c)).length, 1, x.w);
    }
    // الأربع صور مختلفة
    assert.equal(new Set(H.map((x) => x.e)).size, 4, ch);
  }
});

test("letter forms: first, middle, last (أ: first and middle, like the book)", () => {
  for (const ch of LB_ORDER) {
    const pos = LB_LETTERS[ch].forms.map((x) => posOf(x.w, ch));
    assert.deepEqual(pos, ch === "أ" ? [0, 1, 1] : [0, 1, 2], ch);
  }
});

const SEEDS = 30;
// المالك ٢٠٢٦-١٠-١٦: ألعاب القلعة جوّه صفحة الحرف + «٣ بالنقط و٥ لوحده» + شهادة فى الآخر
test("letter page: book activities + castle games in order, write 3 on dots then 5 alone", () => {
  for (const ch of LB_ORDER) {
    const steps = letterPage(ch, seeded(1));
    assert.deepEqual(steps.map((s) => (s.kind === "game" ? s.game : s.kind)), [
      "meet", "write", "puzzle", "riddle", "pop", "flash", "harakat", "write", "eggs",
      "starts", "phonics", "forms", "circle", "catch", "missing", "sequence", "write",
      "harakaWrite", "harakaWrite", "harakaWrite", "harakaWrite", "harakaQuiz", "review"]);
    // المالك ٢٠٢٦-١٠-١٩: بعد الحرف من غير تشكيل — بالفتحة والضمة والكسرة والسكون، وكل واحدة ليها خطوط
    assert.deepEqual(steps.filter((s) => s.kind === "harakaWrite").map((s) => s.h), ["a", "u", "i", "o"]);
    for (const s of steps.filter((x) => x.kind === "harakaWrite")) assert.ok(harakaStrokes(harakaGlyph(ch, s.h), s.h)?.length, `${ch} ${s.h}`);
    const w = steps.filter((s) => s.kind === "write");
    assert.deepEqual(w.map((s) => [s.level, s.reps]), [[2, 3], [3, 2], [3, 3]]);
    // بأى حرف تبدأ + البيض: كلمات مختلفة بتبدأ بالحرف فعلاً (البيضة كل مرة حاجة جديدة)
    for (const g of ["phonics", "eggs"]) {
      const st = steps.find((s) => s.game === g);
      assert.ok(st.words.length >= 2 && st.words.every((x) => startsWith(x.w, ch)), `${g} ${ch}`);
      assert.equal(new Set(st.words.map((x) => x.e)).size, st.words.length, `${g} ${ch}: صور مختلفة`);
    }
  }
});

test("letter page answers are right for every seed", () => {
  for (const ch of LB_ORDER) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const by = Object.fromEntries(letterPage(ch, seeded(seed * 13 + 1)).map((s) => [s.kind, s]));
      // الفزّورة: ٣ صور، الحل مرة واحدة، والباقيين مابيبدأوش بالحرف
      const r = by.riddle;
      assert.equal(r.options.length, 3);
      assert.equal(r.options.filter((o) => o.w === r.answer.w).length, 1);
      assert.ok(r.options.filter((o) => o.w !== r.answer.w).every((o) => !startsWith(o.w, ch)), ch);
      assert.equal(new Set(r.options.map((o) => o.e)).size, 3);
      // البالونات: ٣–٤ صح، والباقى حروف تانية
      const good = by.pop.cells.filter((c) => c.good);
      assert.ok(good.length >= 3 && good.length <= 4);
      assert.ok(by.pop.cells.every((c) => c.good === (c.ch === ch)));
      // اسمع واعرف الحركة: كل حركة مرتين (الحرف بالحركة + كلمة من الكتاب)، ومفيش حركتين ورا بعض
      const hq = harakaQuizRounds(ch, seeded(seed * 7 + 3));
      assert.deepEqual(hq.map((r) => r.h).sort(), ["a", "a", "i", "i", "o", "o", "u", "u"]);
      assert.ok(hq.every((r, i) => !i || r.h !== hq[i - 1].h), ch);
      for (const r of hq.filter((x) => x.w)) assert.ok(r.w.includes(r.s), `${ch}: ${r.w} فيها ${r.s}`);
      // ضع دائرة: ٣ بتبدأ بالحرف و٣ لأ — ومفيش صورة متكررة
      const st = by.starts.items;
      assert.equal(st.filter((x) => x.good).length, 3);
      assert.ok(st.every((x) => x.good === startsWith(x.w, ch)), ch);
      assert.equal(new Set(st.map((x) => x.e)).size, st.length, ch);
      // الحرف الناقص: الحرف نفسه هو الناقص، والاختيارات فيها الحرف مرة
      const m = by.missing;
      assert.equal(m.letter, ch);
      assert.equal(m.before + m.letter + m.after, bare(m.w));
      assert.equal(m.options.filter((o) => o === ch).length, 1);
      assert.equal(new Set(m.options).size, 3);
    }
  }
});

test("review page answers are right for every seed", () => {
  for (const pg of LB_PAGES.filter((p) => p.type === "review")) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const by = Object.fromEntries(reviewPage(pg.letters, seeded(seed * 7 + 3)).map((s) => [s.kind, s]));
      assert.deepEqual(by.colorLearned.cells.filter((c) => c.good).map((c) => c.ch).sort(), [...pg.letters].sort());
      assert.ok(by.colorLearned.cells.filter((c) => !c.good).every((c) => !pg.letters.includes(c.ch)));
      for (const p of by.matchFirst.pics) assert.ok(startsWith(p.w, p.ch), p.w);
      assert.deepEqual([...by.matchFirst.letters].sort(), [...pg.letters].sort());
      for (const row of by.sameSound.rows) {
        assert.equal(row.items.length, 3);
        assert.ok(row.items.every((x) => x.good === startsWith(x.w, row.ch)), row.ch);
        assert.equal(new Set(row.items.map((x) => x.e)).size, 3);
      }
      for (const r of by.position.rounds) assert.equal(r.pos, posOf(r.w, r.ch));
      for (const r of by.harakaPic.rounds) {
        const good = r.options.filter((o) => o.good);
        assert.equal(good.length, 1);
        assert.equal(good[0].h, r.h);
        assert.notEqual(r.options.find((o) => !o.good).h, r.h);
      }
      const b = by.build;
      assert.equal(b.options.filter((o) => o.w === b.w).length, 1);
      assert.equal(b.a + b.b, b.w);
    }
  }
  for (const b of LB_BUILD) assert.equal(b.a + b.b, b.w);
});

test("every page builds for every seed (prep, letters, reviews)", () => {
  for (const pg of LB_PAGES) for (let seed = 1; seed <= 10; seed++) assert.ok(letterbookSteps(pg, seeded(seed)).length >= 6, pg.id);
});

test("splitAt keeps the word whole around the letter", () => {
  assert.deepEqual(splitAt("فأر", "أ"), { before: "ف", letter: "أ", after: "ر" });
  assert.deepEqual(splitAt("عين", "ن"), { before: "عي", letter: "ن", after: "" });
});

test("Mizo's instructions turn feminine for a girl, and never say «غلط»", () => {
  const all = Object.values(LB_SAY).flatMap((v) => (typeof v === "function" ? [v("باء", "بَ")] : Array.isArray(v) ? v : [v]));
  for (const t of all) assert.doesNotMatch(t, /غلط|خطأ|وحش|فاشل/, t);
  for (const t of [LB_SAY.pop("باء"), LB_SAY.starts("باء"), LB_SAY.missing, LB_SAY.shadow, LB_SAY.matchFirst, LB_SAY.harakaPic("بَ")]) {
    assert.notEqual(femAdapt(t), t, t);
  }
  assert.equal(femAdapt(LB_SAY.pop("باء")), "دوّري على حرف باء، والمسي كل واحد تلاقيه");
});

// المالك ٢٠٢٦-١٠-١٤: «حط دايرة حوالين الحرف» — كلمة بتبدأ بيه ← بتنتهى بيه ← هو فى وسطها
test("circle: every letter has start → end → middle words with pictures, tiles that rebuild the word, and the right target", async () => {
  const { circleWords, letterTiles, LB_LETTERS, CIRCLE_ORDER, bare, posOf } = await import("../js/data/letterbook.js");
  assert.deepEqual(CIRCLE_ORDER, [0, 2, 1]);
  for (const ch of Object.keys(LB_LETTERS)) {
    const ws = circleWords(ch);
    assert.deepEqual(ws.map((x) => x.pos), [0, 2, 1], `${ch}: أول ← آخر ← وسط`);
    for (const x of ws) {
      assert.ok(x.e && x.w, `${ch}: ${x.w} ليها صورة`);
      assert.equal(x.tiles.join("").replace(/‍/g, ""), bare(x.w), `${ch}: الحروف بتكوّن الكلمة`);
      assert.ok(x.good.length >= 1 && x.good.includes(x.idx));
      assert.equal(posOf(x.w, ch), x.pos);
    }
  }
  // الحرف الموصول بياخد ZWJ من الناحيتين عشان يفضل شكله جوّه الكلمة
  const t = letterTiles("تفاح", "ف");
  assert.deepEqual(t.good, [1]);
  assert.equal(t.tiles[1], "‍ف‍");
  assert.equal(t.tiles[2], "‍ا", "ا مابتتوصلش باللى بعدها");
  assert.equal(t.tiles[3], "ح");
});
