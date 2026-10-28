// خطة «كراسة الأرقام» (data/workbook.js) — دالة صافية، من غير متصفح.
//   node --test mykid/tests/workbook-plan.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { workbookPage, seeded, isWriteStep, WB_NUMBERS, WB_COLORS, colorPairOf, WB_AR, WB_PAGES, WB_REAL, WB_COLOR_PAIRS, WB_PICTURE_REGIONS, WB_PLAYS, WB_LAST, WB_SHAPES, WB_SHAPE_PAIRS, WB_ROBOT_PARTS, WB_UNITS, WB_LINES, WB_LOCKED_IDS, WB_NUMBER_PAGE_IDS, afterNumbersOpen, colorsPage, shapesPage, pageSteps } from "../js/data/workbook.js";
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

// المالك ٢٠٢٦-١٠-١٧: ألعاب القلعة جوّه صفحة الرقم + «٣ بالنقط و٥ لوحده» (آخر ٣ من غير النقطة)
test("يكتب شوية ويلعب شوية: ٣ بالنقط و٥ لوحده، وألعاب القلعة بين التمارين، ومفيش كتابتين ورا بعض", () => {
  for (const [n, steps] of pages) {
    const w = steps.map((s, i) => (s.kind === "write" ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(w.map((i) => [steps[i].level, steps[i].reps, !!steps[i].noStart]), [[2, 3, false], [3, 2, false], [3, 3, true]], `صفحة ${n}`);
    for (let k = 1; k < w.length; k++) assert.ok(w[k] - w[k - 1] >= 2, `صفحة ${n}: كتابتين ورا بعض`);
    assert.deepEqual(steps.slice(0, 4).map((s) => s.kind), ["meet", "write", "game", "colorN"]);
    assert.deepEqual(steps.filter((s) => s.kind === "game").map((s) => s.game), ["puzzle", "flash", "eggs", "sequence", "review"]);
    assert.equal(steps.at(-1).game, "review");
    assert.ok(WB_LAST.includes(steps.at(-2).kind));
    assert.ok(steps.some((s) => s.kind === "missing"));
    const plays = steps.filter((s) => WB_PLAYS.includes(s.kind)).map((s) => s.kind);
    assert.equal(plays.length, 3, `صفحة ${n}: ٣ ألعاب`);
    assert.equal(new Set(plays).size, 3, "مفيش لعبة متكرّرة فى نفس الصفحة");
    if (n === 1) assert.ok(!plays.includes("parts"), "١ مالوش مكوّنات");
  }
});

test("كل التمارين بتظهر (التشكيلة بتتغيّر من صفحة لصفحة)", () => {
  const seen = new Set(pages.flatMap(([, steps]) => steps.flatMap((s) => [s.kind, s.kind + (s.mode ? ":" + s.mode : "") + (s.rep ? ":" + s.rep : "")])));
  assert.ok(pages.some(([, st]) => st.some((x) => x.kind === "match" && x.right === "groups")), "match: الصور المتساوية");
  for (const k of [...WB_PLAYS, ...WB_LAST, "missing:prev", "missing:mid", "missing:next", "missing:next"]) assert.ok(seen.has(k), k);
});

test("الإجابة الصح موجودة دايماً، والمشتّتات مختلفة عنها", () => {
  const all = [...pages, ...WB_NUMBERS.map((n) => [n, workbookPage(n, seeded(n), [...WB_PLAYS, "paint"])]),
    ...WB_NUMBERS.map((n) => [n, workbookPage(n, seeded(n + 50), ["repeated", "colorBar"])]),
    ...WB_NUMBERS.map((n) => [n, workbookPage(n, seeded(n + 90), ["match", "hexKey"])])];
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
      if (m.right === "groups") assert.ok(m.groups.every((g) => g.rep === "things"), "الصور المتساوية: حاجات بس");
      else assert.deepEqual(m.groups.map((g) => g.rep).sort(), ["dots", "fingers", "things"], "حاجات وصوابع وزهر");
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
      if (p.rep === "digits") assert.ok(n >= 3, "بالأرقام بس من ٣ وطالع");
      assert.ok(p.options.includes(n) && new Set(p.options).size === 3);
    }
    const ff = by("frameFill");
    if (ff) {
      assert.ok(ff.count >= 1 && ff.count <= ff.frame && ff.count <= 10);
      assert.ok(ff.count <= n, `صفحة ${n}: العدد ${ff.count} أكتر من رقم الصفحة`);
      assert.equal(ff.frame, ff.count > 5 ? 10 : 5);
    }
    const rp = by("repeated");
    if (rp) {
      assert.ok(rp.rows.some((r) => r.repeated === n));
      for (const r of rp.rows) {
        assert.equal(r.cells.length, 3);
        assert.equal(r.cells.filter((v) => v === r.repeated).length, 2);
        assert.equal(new Set(r.cells).size, 2);
      }
    }
    const hx = by("hexKey");
    if (hx) {
      assert.equal(new Set(hx.key.map((k) => k.value)).size, 3);
      assert.equal(new Set(hx.key.map((k) => k.color)).size, 3);
      assert.equal(hx.cells.length, 12);
      assert.ok(hx.cells.every((v) => hx.key.some((k) => k.value === v)));
    }
    if (m && m.right === "groups") assert.ok(m.groups.every((g) => g.rep === "things"), "الصور المتساوية: حاجات مش صوابع");
    const st = by("stamp");
    if (st) assert.ok(st.n === n && WB_SHAPES[st.shape]);
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
  const all = [WB_SAY.stamp, WB_SAY.robot, WB_SAY.stampTooMany(WB_AR[3]), WB_SAY.frameFill, WB_SAY.colorBar(WB_AR[3]), WB_SAY.missPrev(WB_AR[3]), WB_SAY.missMid(WB_AR[2], WB_AR[4]), WB_SAY.missNext(WB_AR[3]), WB_SAY.chooseColor, WB_SAY.meet(WB_AR[3]), WB_SAY.colorN(WB_AR[3], "الأحمر"), WB_SAY.find(WB_AR[3]), WB_SAY.tooFew(WB_AR[3]),
    WB_SAY.tooMany(WB_AR[3]), WB_SAY.countChoose, WB_SAY.match, WB_SAY.missing, WB_SAY.paintWrong, WB_SAY.againDots];
  for (const t of all) {
    const f = femAdapt(t);
    assert.notEqual(f, t, `مااتأنّثتش: ${t}`);
    for (const verb of ["عُدّ ", "لوّن ", "المس ", "اكتبه", "اختار ", "دوّر ", "بص "]) assert.ok(!f.includes(verb), `${verb} فى: ${f}`);
  }
});

test("ترتيب الصفحات: خطوط ← ١ ← ألوان … ← ١٠ ← صفر، وبعد الأرقام كلها: الجمع ← الساعة ← مراجعة", () => {
  assert.deepEqual(WB_PAGES.map((p) => p.id), ["lines", "1", "c0", "2", "c1", "g1", "3", "c2", "4", "c3", "g2",
    "5", "seq", "6", "s0", "g3", "7", "s1", "8", "s2", "g4", "9", "s3", "10", "0", "g5", "add", "clock", "review"]);
  assert.equal(WB_UNITS.length, 6, "٦ وحدات زى الكتاب");
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

test("صفحة الأشكال: ارسم على النقط ← العب ← ارسم لوحده، والإجابات سليمة", () => {
  for (let pair = 0; pair < WB_SHAPE_PAIRS.length; pair++) {
    const [a, b] = WB_SHAPE_PAIRS[pair];
    for (let seed = 1; seed <= 40; seed++) {
      const steps = shapesPage(pair, seeded(seed * 17 + pair));
      assert.deepEqual(steps.map((s) => s.kind), ["meetShapes", "traceShape", "checkShape", "matchShape", "picture", "traceShape"]);
      const robot = steps[4];
      assert.equal(robot.art, "robot");
      assert.equal(robot.regions.length, WB_ROBOT_PARTS.length);
      robot.regions.forEach((v, i) => assert.equal(robot.key[v - 1].shape, WB_ROBOT_PARTS[i], "رقم الجزء = رقم شكله"));
      assert.equal(new Set(robot.key.map((k) => k.color)).size, robot.key.length, "كل شكل بلون");
      assert.deepEqual(steps.filter(isWriteStep).map((s) => [s.shape, s.level]), [[a, 2], [b, 3]]);
      const ck = steps[2];
      const hits = ck.items.filter((k) => ck.target.includes(k));
      assert.ok(hits.length >= 3 && ck.items.length - hits.length >= 2, `${a}: ${ck.items}`);
      if (pair === 2) assert.deepEqual(ck.target, [a, b], "كل أنواع المثلثات");
      for (const r of steps[3].rows) {
        assert.equal(r.options.length, 3);
        assert.equal(r.options.filter((t) => WB_SHAPES[r.shape].things.includes(t)).length, 1, `${r.shape}: صورة واحدة بس صح`);
        assert.ok(r.options.includes(r.right) && WB_SHAPES[r.shape].things.includes(r.right));
      }
    }
  }
  for (const [k, sh] of Object.entries(WB_SHAPES)) {
    assert.equal(sh.strokes.length, 1, k);
    const st = sh.strokes[0];
    assert.ok(st.length >= 4 && st.every(([x, y]) => x >= 5 && x <= 95 && y >= 5 && y <= 95), k);
    assert.ok(Math.hypot(st[0][0] - st.at(-1)[0], st[0][1] - st.at(-1)[1]) < 1, `${k}: الشكل مقفول`);
  }
  const all = Object.values(WB_SHAPES).flatMap((s) => s.things);
  assert.equal(new Set(all).size, all.length, "مفيش صورة لشكلين");
});

test("كل صفحات الكتاب: كتابة ولعب بالتناوب (مفيش كتابتين ورا بعض)، والإجابات سليمة", () => {
  for (const pg of WB_PAGES) {
    for (let seed = 1; seed <= 25; seed++) {
      const steps = pageSteps(pg, seeded(seed * 31 + pg.id.length));
      assert.ok(steps.length >= 5 && steps.every(Boolean), pg.id);
      const w = steps.map((s, i) => (isWriteStep(s) ? i : -1)).filter((i) => i >= 0);
      assert.ok(w.length >= 1 && w.length <= steps.length - 2, `${pg.id}: كتابة ${w.length}`);
      for (let k = 1; k < w.length; k++) assert.ok(w[k] - w[k - 1] >= 2, `${pg.id}: كتابتين ورا بعض (${steps.map((x) => x.kind)})`);
      for (const st of steps) {
        if (st.kind === "lineHop") {
          assert.ok(st.answer >= 0 && st.answer <= 10, pg.id);
          if (st.mode === "next") assert.equal(st.answer, st.from + 1);
          if (st.mode === "prev") assert.equal(st.answer, st.from - 1);
          if (st.mode === "mid") assert.equal(st.answer, (st.from + st.to) / 2);
          if (st.mode === "add") assert.equal(st.answer, st.from + st.by);
          assert.ok(st.from >= 0 && st.from <= 10);
        }
        if (st.kind === "missing") {
          assert.equal(st.seq[st.blank], st.n);
          assert.ok(st.seq.every((v) => v >= 0 && v <= 10), `${pg.id}: ${st.seq}`);
          assert.ok(st.options.includes(st.n) && new Set(st.options).size === 3);
        }
        if (st.kind === "parts") {
          assert.equal(st.a + st.b, st.n);
          assert.ok(st.a >= 1 && st.b >= 1 && st.options.includes(st.n));
          if (st.rep === "fingers" || st.rep === "dots") assert.ok(st.a <= 5 && st.b <= 5, "إيد/زهر لحد ٥");
        }
        if (st.kind === "oddColor") for (const r of st.rows) assert.ok(r.base !== r.odd && r.at >= 0 && r.at < r.size);
        if (st.kind === "countKinds") {
          assert.equal(new Set(st.rows.map((r) => r.thing)).size, 3);
          for (const r of st.rows) {
            assert.equal(st.scene.filter((t) => t === r.thing).length, r.count, "العدد فى الصورة = المطلوب");
            assert.ok(r.count <= st.cells);
          }
        }
        if (st.kind === "codeKey") {
          for (const q of st.ask) {
            assert.ok(st.key.some((k) => k.value === q.value && k.thing === q.thing));
            assert.ok(q.options.includes(q.value) && new Set(q.options).size === q.options.length);
          }
        }
        if (st.kind === "clockChoose") for (const r of st.rows) assert.ok(r.options.includes(r.h) && r.options.length === 2 && r.options[0] !== r.options[1]);
        if (st.kind === "clockSet" || st.kind === "clockWrite") assert.ok((st.h || 0) >= 1 && st.h <= 12);
        if (st.kind === "lineSpot") assert.ok(st.options.includes(st.want) && new Set(st.options).size === 3 && st.options.every((k) => WB_LINES.includes(k)));
        if (st.kind === "match") assert.deepEqual([...st.numbers].sort(), st.groups.map((g) => g.count).sort());
        if (st.kind === "find") assert.ok(st.cells.filter((v) => v === st.n).length >= 3);
      }
    }
  }
});

test("المالك: الجمع والساعة بعد ما الأرقام كلها تخلص (مقفولين قبلها)", () => {
  assert.deepEqual(WB_LOCKED_IDS, ["add", "clock", "review"]);
  assert.deepEqual(WB_NUMBER_PAGE_IDS.sort(), ["0", "1", "10", "2", "3", "4", "5", "6", "7", "8", "9"]);
  const last = WB_PAGES.slice(-3).map((p) => p.id);
  assert.deepEqual(last, ["add", "clock", "review"], "فى آخر الكراسة");
  assert.equal(afterNumbersOpen({}), false);
  const all = Object.fromEntries(WB_NUMBER_PAGE_IDS.map((id) => [id, 1]));
  assert.equal(afterNumbersOpen({ ...all, 7: 0 }), false);
  assert.equal(afterNumbersOpen(all), true);
  // ومفيش جمع ولا ساعة فى أى صفحة قبلهم
  const early = WB_PAGES.filter((p) => !WB_LOCKED_IDS.includes(p.id));
  for (const pg of early) for (let seed = 1; seed <= 30; seed++) {
    for (const st of pageSteps(pg, seeded(seed + 7))) {
      assert.notEqual(st.kind, "parts", `${pg.id}: جمع قبل الأرقام`);
      assert.ok(!(st.kind === "lineHop" && st.mode === "add"), `${pg.id}: جمع على خط الأعداد`);
      assert.ok(!/clock/i.test(st.kind) && !(st.groups || []).some((g) => g.rep === "clock"), `${pg.id}: ساعة قبل الأرقام`);
    }
  }
  const add = WB_PAGES.find((p) => p.id === "add");
  const reps = new Set();
  for (let seed = 1; seed <= 30; seed++) pageSteps(add, seeded(seed)).forEach((st) => st.kind === "parts" && reps.add(st.rep));
  for (const r of ["things", "fingers", "dots", "vertical"]) assert.ok(reps.has(r), "صفحة الجمع: " + r);
});

test("pre-writing exercises are the first Arabic activity (owner 2026-10-13)", async () => {
  const { ACTIVITIES } = await import("../js/data/activities.js");
  assert.equal(ACTIVITIES.arabic[0].params.datasetKey, "prewriting");
});
