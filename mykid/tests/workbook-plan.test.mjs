// خطة «كراسة الأرقام» (data/workbook.js) — دالة صافية، من غير متصفح.
//   node --test mykid/tests/workbook-plan.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { workbookPage, seeded, isWriteStep, WB_NUMBERS, WB_COLORS, colorPairOf, WB_AR, WB_PAGES, WB_REAL, WB_COLOR_PAIRS, WB_PICTURE_REGIONS, WB_PLAYS, WB_LAST, colorsPage } from "../js/data/workbook.js";
import { strokesFor } from "../js/data/strokes.js";
import { WB_SAY } from "../js/data/writingPhrases.js";
import { femAdapt } from "../js/data/mizo.js";

const pages = [];
for (const n of WB_NUMBERS) for (let seed = 1; seed <= 40; seed++) pages.push([n, workbookPage(n, seeded(seed * 7 + n))]);

test("كل رقم من ١ لـ١٠ ليه صفحة، وليه خطوط كتابة", () => {
  for (const n of WB_NUMBERS) {
    assert.ok(workbookPage(n).length >= 9, `صفحة ${n}`);
    assert.ok(strokesFor(String(n)), `خطوط ${n}`);
  }
  assert.throws(() => workbookPage(0));
  assert.throws(() => workbookPage(11));
});

test("يكتب شوية ويلعب شوية: ٣ كتابات، ومفيش كتابتين ورا بعض، والمساعدة بتقلّ", () => {
  for (const [n, steps] of pages) {
    const w = steps.map((s, i) => (isWriteStep(s) ? i : -1)).filter((i) => i >= 0);
    assert.equal(w.length, 3, `صفحة ${n}`);
    for (let k = 1; k < w.length; k++) assert.ok(w[k] - w[k - 1] >= 2, `صفحة ${n}: كتابتين ورا بعض`);
    assert.deepEqual(w.map((i) => steps[i].level), [1, 2, 3], `صفحة ${n}: الخط ← النقط ← لوحده`);
    assert.deepEqual(steps.slice(0, 3).map((s) => s.kind), ["meet", "write", "colorN"]);
    assert.equal(steps.at(-2).kind, "missing");
    assert.ok(WB_LAST.includes(steps.at(-1).kind));
    const plays = steps.filter((s) => WB_PLAYS.includes(s.kind)).map((s) => s.kind);
    assert.equal(plays.length, 3, `صفحة ${n}: ٣ ألعاب`);
    assert.equal(new Set(plays).size, 3, "مفيش لعبة متكرّرة فى نفس الصفحة");
    if (n === 1) assert.ok(!plays.includes("parts"), "١ مالوش مكوّنات");
  }
});

test("كل التمارين بتظهر (التشكيلة بتتغيّر من صفحة لصفحة)", () => {
  const seen = new Set(pages.flatMap(([, steps]) => steps.flatMap((s) => [s.kind, s.kind + (s.mode ? ":" + s.mode : "") + (s.rep ? ":" + s.rep : "")])));
  for (const k of [...WB_PLAYS, ...WB_LAST, "missing:prev", "missing:mid", "missing:next", "parts:fingers", "parts:things"]) assert.ok(seen.has(k), k);
});

test("الإجابة الصح موجودة دايماً، والمشتّتات مختلفة عنها", () => {
  const all = [...pages, ...WB_NUMBERS.map((n) => [n, workbookPage(n, seeded(n), [...WB_PLAYS, "paint"])]),
    ...WB_NUMBERS.map((n) => [n, workbookPage(n, seeded(n + 50), ["colorBar"])])];
  for (const [n, steps] of all) {
    const by = (k) => steps.find((s) => s.kind === k);
    const c = by("colorN");
    assert.ok(c.total > n && c.total <= 12, `colorN ${n}: ${c.total}`);
    assert.ok(c.palette.includes(c.color) && new Set(c.palette).size === 3);

    const cc = by("countChoose");
    if (cc) {
      assert.ok(cc.cards.some((k) => k.count === n));
      for (const k of cc.cards) {
        assert.equal(k.options.length, 2);
        assert.ok(k.options.includes(k.count));
        assert.notEqual(k.options[0], k.options[1]);
        assert.ok(k.options.every((v) => v >= 1 && v <= 10));
      }
    }
    const m = by("match");
    if (m) {
      assert.equal(new Set(m.groups.map((g) => g.count)).size, 3, "المجموعات أعداد مختلفة");
      assert.deepEqual([...m.numbers].sort(), m.groups.map((g) => g.count).sort());
      assert.equal(m.groups.filter((g) => g.rep === "fingers").length, 1, "مجموعة واحدة صوابع");
    }
    const f = by("find");
    if (f) {
      assert.equal(f.cells.length, 9);
      assert.ok(f.cells.filter((v) => v === n).length >= 3);
    }
    const p = by("parts");
    if (n === 1) assert.equal(p, undefined);
    else if (p) {
      assert.equal(p.a + p.b, n);
      assert.ok(p.a >= 1 && p.b >= 1);
      if (p.rep === "fingers") assert.ok(p.a <= 5 && p.b <= 5, "كل إيد لحد ٥");
      assert.ok(p.options.includes(n) && new Set(p.options).size === 3);
    }
    const ff = by("frameFill");
    if (ff) {
      assert.ok(ff.count >= 1 && ff.count <= ff.frame && ff.count <= 10);
      assert.equal(ff.frame, ff.count > 5 ? 10 : 5);
    }
    const bar = by("colorBar");
    if (bar) assert.ok(bar.n === n && bar.cells >= n);

    const ms = by("missing");
    assert.equal(ms.seq[ms.blank], n);
    assert.deepEqual(ms.seq, [ms.seq[0], ms.seq[0] + 1, ms.seq[0] + 2]);
    assert.equal(ms.blank, { prev: 0, mid: 1, next: 2 }[ms.mode], ms.mode);
    assert.ok(ms.seq.every((v) => v >= 1 && v <= 10));
    assert.ok(ms.options.includes(n) && new Set(ms.options).size === ms.options.length && ms.options.length === 3);
    assert.ok(ms.options.filter((v) => v !== n).every((v) => !ms.seq.includes(v)), "الظاهر فى الصف مايبقاش اختيار");

    const pt = by("paint");
    if (pt) {
      assert.equal(pt.tiles.length, 6);
      assert.equal(pt.tiles.filter((t) => t.value === n).length, 3);
      assert.equal(pt.tiles.filter((t) => t.rep === "digit").length, 2, "الرقم نفسه دايماً موجود");
      assert.notEqual(pt.pairs[0].color, pt.pairs[1].color);
      assert.deepEqual(pt.pairs.map((x) => x.color), colorPairOf(n));
    }
  }
});

test("ألوان الكتاب بالترتيب: ١ أحمر/بمبى · ٢ أصفر/برتقانى · ٣ أزرق/لبنى · ٤ أخضر/أخضر فاتح", () => {
  assert.deepEqual(colorPairOf(1), ["red", "pink"]);
  assert.deepEqual(colorPairOf(2), ["yellow", "orange"]);
  assert.deepEqual(colorPairOf(3), ["blue", "lightBlue"]);
  assert.deepEqual(colorPairOf(4), ["green", "lime"]);
  for (const k of Object.keys(WB_COLORS)) assert.match(WB_COLORS[k].hex, /^#[0-9a-f]{6}$/);
});

test("جُمَل ميزو بتتأنّث للبنت (من غير «و» لازقة فى الفعل)", () => {
  const all = [WB_SAY.frameFill, WB_SAY.colorBar(WB_AR[3]), WB_SAY.missPrev(WB_AR[3]), WB_SAY.missMid(WB_AR[2], WB_AR[4]), WB_SAY.missNext(WB_AR[3]), WB_SAY.chooseColor, WB_SAY.meet(WB_AR[3]), WB_SAY.colorN(WB_AR[3], "الأحمر"), WB_SAY.find(WB_AR[3]), WB_SAY.tooFew(WB_AR[3]),
    WB_SAY.tooMany(WB_AR[3]), WB_SAY.countChoose, WB_SAY.match, WB_SAY.missing, WB_SAY.paintWrong, WB_SAY.againDots];
  for (const t of all) {
    const f = femAdapt(t);
    assert.notEqual(f, t, `مااتأنّثتش: ${t}`);
    for (const verb of ["عُدّ ", "لوّن ", "المس ", "اكتبه", "اختار ", "دوّر ", "بص "]) assert.ok(!f.includes(verb), `${verb} فى: ${f}`);
  }
});

test("ترتيب الصفحات زى فهرس الكتاب: ١ ← ألوان ← ٢ ← ألوان ← ٣ ← ألوان ← ٤ ← ألوان ← ٥…١٠", () => {
  assert.deepEqual(WB_PAGES.map((p) => p.id), ["1", "c0", "2", "c1", "3", "c2", "4", "c3", "5", "6", "7", "8", "9", "10"]);
  assert.equal(new Set(WB_PAGES.map((p) => p.id)).size, WB_PAGES.length);
});

test("صفحة الألوان: يكتب مرتين (نقط ← لوحده) بين اللعب، والإجابات سليمة", () => {
  for (let pair = 0; pair < WB_COLOR_PAIRS.length; pair++) {
    const [c1, c2] = WB_COLOR_PAIRS[pair];
    for (let seed = 1; seed <= 40; seed++) {
      const steps = colorsPage(pair, seeded(seed * 13 + pair));
      assert.deepEqual(steps.map((s) => s.kind), ["meetColors", "realColor", "countWrite", "picture", "chooseColor", "countWrite"]);
      for (const it of steps[4].items) {
        assert.ok(WB_REAL[it.color].includes(it.thing));
        assert.ok(it.options.includes(it.color) && new Set(it.options).size === 2);
      }
      const w = steps.filter(isWriteStep);
      assert.deepEqual(w.map((s) => s.level), [2, 3]);
      assert.notEqual(w[0].count, w[1].count, "عددين مختلفين");
      for (const s of w) {
        assert.ok(s.count >= 1 && s.count <= 3);
        assert.ok(s.palette.includes(s.color) && new Set(s.palette).size === 3);
        assert.ok(WB_REAL[s.color].includes(s.thing), "الحاجة لونها الحقيقى هو المطلوب");
      }
      const real = steps[1];
      assert.equal(real.items.length, 5);
      for (const it of real.items) assert.ok(WB_REAL[it.color].includes(it.thing) && [c1, c2].includes(it.color));
      assert.ok(real.items.some((it) => it.color === c1) && real.items.some((it) => it.color === c2));
      const pic = steps[3];
      assert.equal(pic.regions.length, WB_PICTURE_REGIONS);
      for (const v of [1, 2, 3]) assert.ok(pic.regions.filter((x) => x === v).length >= 2, `الرقم ${v} فى الصورة`);
      assert.equal(new Set(pic.key.map((k) => k.color)).size, 3);
    }
  }
  // مفيش حاجة واحدة متسجّلة بلونين
  const all = Object.values(WB_REAL).flat();
  assert.equal(new Set(all).size, all.length);
});
