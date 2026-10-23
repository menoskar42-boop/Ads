// الحكم على الخط: البداية + الاتجاه + لآخره — `node --test mykid/tests/stroke-judge.test.mjs`
import assert from "node:assert/strict";
import { test } from "node:test";
import { StrokeTracker, densify, hintForResult } from "../js/games/strokeJudge.js";

/** صباع بيمشى على نقط الخط (كل وحدة) — مع إزاحة اختيارية (رعشة إيد). */
function drive(t, path, { jitter = 0, step = 2 } = {}) {
  const pts = densify(path, step);
  let r = t.begin([pts[0][0] + jitter, pts[0][1]]);
  if (r) return r;
  for (let i = 1; i < pts.length; i++) {
    r = t.move([pts[i][0] + (i % 2 ? jitter : -jitter), pts[i][1]]);
    if (r) return r;
  }
  return t.end();
}

const VERT = [[50, 10], [50, 90]];
const circle = (cx, cy, r, n = 48) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = -Math.PI / 2 - (i / n) * 2 * Math.PI; // من فوق، عكس عقارب الساعة
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

test("a vertical line written top→bottom is ok", () => {
  assert.equal(drive(new StrokeTracker(VERT), VERT), "ok");
});

test("hand tremor within tolerance is still ok", () => {
  assert.equal(drive(new StrokeTracker(VERT), VERT, { jitter: 5 }), "ok");
});

test("starting far from the green dot is wrong-start", () => {
  const t = new StrokeTracker(VERT);
  assert.equal(t.begin([50, 90]), "wrong-start");
});

test("writing bottom→top is caught (starts at the wrong end)", () => {
  assert.equal(drive(new StrokeTracker(VERT), [[50, 90], [50, 10]]), "wrong-start");
});

test("going down then back up is backwards", () => {
  const t = new StrokeTracker(VERT);
  assert.equal(drive(t, [[50, 10], [50, 60], [50, 30]]), "backwards");
});

test("leaving the line is off-path — but one stray reading is not", () => {
  const t = new StrokeTracker(VERT);
  t.begin([50, 10]);
  for (let y = 11; y <= 40; y++) assert.equal(t.move([50, y]), null);
  assert.equal(t.move([80, 41]), null, "قراية واحدة بعيدة = رعشة");
  assert.equal(t.move([50, 42]), null);
  let r = null;
  for (let k = 0; k < 6 && !r; k++) r = t.move([85, 45 + k]);
  assert.equal(r, "off-path");
});

test("lifting the finger halfway is too-short", () => {
  assert.equal(drive(new StrokeTracker(VERT), [[50, 10], [50, 50]]), "too-short");
});

test("a circle does not count as finished on touching its own end", () => {
  const C = circle(50, 50, 30);
  const t = new StrokeTracker(C);
  t.begin(C[0]);
  // نزل شوية وبعدين قفز لآخر الدايرة (اللى هو جنب أولها)
  for (let i = 1; i <= 4; i++) t.move(C[i]);
  t.move(C[C.length - 2]);
  assert.ok(t.fraction < 0.3, `fraction ${t.fraction}`);
  assert.notEqual(t.end(), "ok");
});

test("a full circle in the right direction is ok", () => {
  const C = circle(50, 50, 30);
  assert.equal(drive(new StrokeTracker(C), C), "ok");
});

test("a circle in the opposite direction fails", () => {
  const C = circle(50, 50, 30);
  const rev = [C[0], ...C.slice(1).reverse()];
  assert.notEqual(drive(new StrokeTracker(C), rev), "ok");
});

test("a dot is a tap near its place", () => {
  assert.equal(new StrokeTracker([[40, 80]]).begin([45, 84]), "ok");
  assert.equal(new StrokeTracker([[40, 80]]).begin([70, 80]), "wrong-start");
});

test("level 3 (blank box) is more forgiving than level 1", () => {
  const p = [56, 22];
  assert.equal(new StrokeTracker(VERT, 1).begin([50 + 14, 10]), "wrong-start");
  assert.equal(new StrokeTracker(VERT, 3).begin([50 + 14, 10]), null);
  assert.equal(new StrokeTracker(VERT, 3).begin(p), null);
});

test("every failure has a hint for Mizo", () => {
  for (const r of ["wrong-start", "off-path", "backwards", "too-short"]) assert.ok(hintForResult(r, false));
  assert.match(hintForResult("wrong-start", true), /النقطة/);
  assert.equal(hintForResult("ok", false), "");
});

// ---------- كل حرف/رقم حقيقى فى التطبيق ----------
import { strokesFor, PREWRITING } from "../js/data/strokes.js";
import { getDataset } from "../js/data/datasets.js";

const glyphOf = (it) => it.char || it.arDigit || it.name;

test("every traceable letter and number has strokes", () => {
  const missing = [];
  for (const key of ["arabic", "english", "numbers", "englishNumbers"]) {
    for (const it of getDataset(key).items) if (!strokesFor(glyphOf(it))) missing.push(`${key}:${glyphOf(it)}`);
  }
  for (const z of ["0", "٠"]) if (!strokesFor(z)) missing.push(z);
  assert.deepEqual(missing, []);
});

test("following each stroke's own path is judged ok — on every level", () => {
  const all = [
    ...["arabic", "english", "numbers", "englishNumbers"].flatMap((k) => getDataset(k).items.map((it) => glyphOf(it))),
    "0", "٠",
  ].map((g) => [g, strokesFor(g)]);
  for (const p of PREWRITING) all.push([p.id, p.strokes]);
  const bad = [];
  for (const [g, strokes] of all) {
    strokes.forEach((st, i) => {
      for (const lvl of [1, 2, 3]) {
        const r = st.length === 1 ? new StrokeTracker(st, lvl).begin(st[0]) : drive(new StrokeTracker(st, lvl), st, { step: 3 });
        if (r !== "ok") bad.push(`${g}#${i + 1}@${lvl}=${r}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test("strokes stay inside the writing box", () => {
  for (const g of ["ي", "ن", "ج", "أ", "Q", "١٥", "20"]) {
    for (const st of strokesFor(g)) for (const [x, y] of st) {
      assert.ok(x >= 2 && x <= 98 && y >= 2 && y <= 98, `${g}: ${x},${y}`);
    }
  }
});

test("writing any stroke in reverse is never accepted", () => {
  const glyphs = ["arabic", "english", "numbers"].flatMap((k) => getDataset(k).items.map((it) => glyphOf(it)));
  const ok = [];
  for (const g of glyphs) strokesFor(g).forEach((st, i) => {
    if (st.length === 1) return;
    const rev = [...st].reverse();
    if (drive(new StrokeTracker(st, 3), rev, { step: 3 }) === "ok") ok.push(`${g}#${i + 1}`);
  });
  assert.deepEqual(ok, []);
});

// ---------- الاسم، المتابعة، ورقة الطباعة ----------
import { nameLetters } from "../js/data/strokes.js";
import { writeStatus, practiceOrder } from "../js/games/writeProgress.js";
import { sheetPlan, cellSvg } from "../js/games/worksheet.js";

test("names become writable letters (diacritics dropped, Latin keeps its case)", () => {
  assert.deepEqual(nameLetters("مَرْيَم"), ["م", "ر", "ي", "م"]);
  assert.deepEqual(nameLetters("آية"), ["آ", "ي", "ة"]);
  assert.deepEqual(nameLetters("هدى"), ["ه", "د", "ى"]);
  assert.deepEqual(nameLetters("Betty"), ["B", "e", "t", "t", "y"]);
  assert.deepEqual(nameLetters("إسراء"), ["إ", "س", "ر", "ا", "ء"]);
  assert.deepEqual(nameLetters("😀 1"), []);
});

test("name-only letters (ا إ آ ة ى ئ ؤ ء) are writable forward and never backwards", () => {
  for (const g of ["ا", "إ", "آ", "ة", "ى", "ئ", "ؤ", "ء"]) {
    strokesFor(g).forEach((st, i) => {
      if (st.length === 1) return;
      assert.equal(drive(new StrokeTracker(st, 1), st, { step: 3 }), "ok", `${g}#${i + 1}`);
      assert.notEqual(drive(new StrokeTracker(st, 3), [...st].reverse(), { step: 3 }), "ok", `${g}#${i + 1} reversed`);
    });
  }
});

test("write status: new → learning → mastered, and a rough attempt is weak", () => {
  assert.equal(writeStatus(undefined, 1), "new");
  assert.equal(writeStatus({ n: 1, r: [[1, 1]] }, 2), "learning");
  assert.equal(writeStatus({ n: 3, r: [[1, 1], [0, 2], [1, 3]] }, 3), "mastered");
  assert.equal(writeStatus({ n: 2, r: [[0, 3], [0, 2]] }, 3), "learning", "the last clean one was with help");
  assert.equal(writeStatus({ n: 2, r: [[1, 1], [7, 2]] }, 1), "weak");
  assert.equal(writeStatus({ n: 3, r: [[5, 1], [4, 1], [4, 1]] }, 1), "weak");
});

test("practice order puts weak letters first and mastered ones last", () => {
  const st = { a: "mastered", b: "weak", c: "new", d: "learning" };
  for (let k = 0; k < 20; k++) {
    const order = practiceOrder(["a", "b", "c", "d"], (x) => st[x]);
    assert.equal(order[0], "b");
    assert.equal(order[3], "a");
  }
});

test("worksheet plan: one letter = a full fading page; several = two rows each, 4 per page", () => {
  const g = { label: "ب", strokes: strokesFor("ب") };
  const one = sheetPlan([g]);
  assert.equal(one.length, 1);
  assert.deepEqual(one[0].map((r) => r.cells[0]), ["model", "dots", "dots", "start", "start", "blank"]);
  const six = sheetPlan(Array(6).fill(g));
  assert.deepEqual(six.map((p) => p.length), [8, 4]);
  assert.match(cellSvg(g.strokes, "model"), /<path[^>]+stroke="#3f3f46"/);
  assert.match(cellSvg(g.strokes, "start"), /fill="#16a34a"/);
  assert.doesNotMatch(cellSvg(g.strokes, "blank"), /<path|#16a34a/);
});

test("small English letters a–z: every stroke works forward and never backwards", () => {
  const bad = [];
  for (const g of "abcdefghijklmnopqrstuvwxyz") {
    const strokes = strokesFor(g);
    if (!strokes) { bad.push(g + ":missing"); continue; }
    strokes.forEach((st, i) => {
      if (st.length === 1) return;
      for (const lvl of [1, 2, 3]) if (drive(new StrokeTracker(st, lvl), st, { step: 3 }) !== "ok") bad.push(`${g}#${i + 1}@${lvl}`);
      if (drive(new StrokeTracker(st, 3), [...st].reverse(), { step: 3 }) === "ok") bad.push(`${g}#${i + 1} reversed`);
      for (const [x, y] of st) if (x < 2 || x > 98 || y < 2 || y > 98) bad.push(`${g} out of box`);
    });
  }
  assert.deepEqual(bad, []);
});

import { startMarks } from "../js/data/strokes.js";

test("start badges never sit on top of each other (B, E, M, ت …) — capital, small, Arabic, numbers", () => {
  const glyphs = [
    ...["arabic", "english", "numbers", "englishNumbers"].flatMap((k) => getDataset(k).items.map((it) => glyphOf(it))),
    ..."abcdefghijklmnopqrstuvwxyz",
  ];
  const bad = [];
  for (const g of glyphs) {
    const m = startMarks(strokesFor(g));
    for (let i = 0; i < m.length; i++) for (let j = 0; j < i; j++) {
      if (Math.hypot(m[i][0] - m[j][0], m[i][1] - m[j][1]) < 8.9) bad.push(`${g}:${j + 1}/${i + 1}`);
    }
  }
  assert.deepEqual(bad, []);
  assert.deepEqual(startMarks(strokesFor("ب")), [[86, 42], [50, 78]], "no overlap ⇒ untouched");
});

// ===== «لوحده»: الحرف كله بنسبة (المالك ٢٠٢٦-١٠-١٣: «ميشدّش على الميل والزوايا») =====
test("scoreDrawing: same letter smaller/shifted/slanted/shaky passes; another letter or reversed fails", async () => {
  const { scoreDrawing, SCORE_PASS } = await import("../js/games/strokeJudge.js");
  const tf = (st, f) => st.map((s) => (s.length === 1 ? s : densify(s, 2)).map(f));
  for (const g of ["M", "ب", "ج", "٥", "3"]) {
    const m = strokesFor(g);
    assert.equal(scoreDrawing(m, m).score, 100, g);
    const small = tf(m, ([x, y]) => [x * 0.6 + 12, y * 0.6 + 20]);
    assert.ok(scoreDrawing(m, small).score >= 95, `${g} small and in a corner`);
    const slant = tf(m, ([x, y]) => [x + (y - 50) * 0.2, y]);
    assert.ok(scoreDrawing(m, slant).score >= SCORE_PASS, `${g} slanted ${scoreDrawing(m, slant).score}`);
    let k = 0;
    const shaky = tf(m, ([x, y]) => { k += 0.3; return [x + Math.sin(k) * 3, y + Math.cos(k * 0.7) * 3]; });
    assert.ok(scoreDrawing(m, shaky).score >= SCORE_PASS, `${g} shaky`);
    const rev = scoreDrawing(m, m.map((s) => [...s].reverse()));
    if (g !== "٥") assert.ok(rev.score < SCORE_PASS && rev.reversed > 0, `${g} reversed`);
  }
  for (const [a, b] of [["M", "N"], ["3", "8"], ["ب", "ن"], ["ج", "د"], ["A", "H"], ["٥", "٠"]]) {
    assert.ok(scoreDrawing(strokesFor(a), strokesFor(b)).score < 50, `${a} written as ${b}`);
  }
  assert.equal(scoreDrawing(strokesFor("ب"), []).score, 0);
  // M من تحت خط واحد: لو رفع إيده فى النص وكمّل يعدّى، وN مايعدّيش
  const M = strokesFor("M");
  assert.equal(M.length, 1);
  assert.deepEqual(M[0][0], [24, 85], "M starts at the bottom");
  assert.ok(scoreDrawing(M, [[[24, 85], [24, 15], [50, 62]], [[50, 62], [76, 15], [76, 85]]]).score >= SCORE_PASS, "M lifted at the valley");
  assert.ok(scoreDrawing(M, [[[24, 15], [24, 85]], [[24, 15], [50, 62], [76, 15], [76, 85]]]).score < SCORE_PASS, "M from the top no longer counts");
  // N من تحت زى M (المالك ٢٠٢٦-١٠-٢٢)
  const N = strokesFor("N");
  assert.equal(N.length, 1);
  assert.deepEqual(N[0][0], [28, 85], "N starts at the bottom");
  assert.ok(scoreDrawing(N, [[[28, 85], [28, 15], [72, 85], [72, 15]]]).score >= SCORE_PASS, "N in one stroke");
  assert.ok(scoreDrawing(N, [[[28, 85], [28, 15]], [[28, 15], [72, 85], [72, 15]]]).score >= SCORE_PASS, "N lifted at the top");
  assert.ok(scoreDrawing(N, [[[28, 15], [28, 85]], [[28, 15], [72, 85], [72, 15]]]).score < SCORE_PASS, "N from the top no longer counts");
});

// المالك ٢٠٢٦-١٠-١٤: «ميزو يوضّح للطفل سبب المشكلة بطريقة لطيفة» — سبب واحد بس، والجملة بتشجّع
test("scoreDrawing.issue: the one main reason, and Mizo's kind sentence for it", async () => {
  const { scoreDrawing } = await import("../js/games/strokeJudge.js");
  const { fixMsg, ROUND_MSG } = await import("../js/data/writingPhrases.js");
  const { femAdapt } = await import("../js/data/mizo.js");
  const tf = (st, f) => st.map((s) => (s.length === 1 ? s : densify(s, 2)).map(f));
  const B = strokesFor("ب"), T = strokesFor("ت"), M = strokesFor("M");
  const issue = (m, d) => scoreDrawing(m, d).issue;
  assert.equal(issue(B, [B[0]]), "missing-dots", "نسى النقطة");
  assert.equal(issue(B, [B[0], [[50, 30]]]), "dot-below", "النقطة فوق بدل تحت");
  assert.equal(issue(T, [T[0], [[58, 80]], [[42, 80]]]), "dot-aboves", "نقط ت تحت بدل فوق");
  assert.equal(issue(B, [[...B[0]].reverse(), B[1]]), "reversed");
  const H = strokesFor("H");
  assert.equal(issue(H, [H[0]]), "missing");
  assert.equal(issue(M, [...M, [[10, 10], [20, 20]]]), "extra");
  assert.equal(issue(M, tf(M, ([x, y]) => [50 + (x - 50) * 0.35, y])), "too-tall", "مضغوط ⇒ أعرض شوية");
  assert.equal(issue(M, tf(M, ([x, y]) => [x, 50 + (y - 50) * 0.3])), "too-wide", "ممطوط ⇒ أطول شوية");
  assert.equal(issue(B, tf(B, ([x, y]) => [x * 0.15 + 40, y * 0.15 + 40])), "tiny");
  assert.equal(issue(strokesFor("ج"), strokesFor("د")), "shape", "شكل تانى خالص مش «النقطة بس»");
  assert.equal(issue(strokesFor("د"), [[[10, 80], [50, 82], [90, 80]]]), "shape");
  // كل سبب ليه جملة، والجمل بتبدأ بتشجيع ومافيهاش «غلط»
  for (const k of ["tiny", "missing-dots", "missing", "extra", "reversed", "dot-below", "dot-above", "dot-belows", "dot-aboves", "start", "too-wide", "too-tall", "shape", undefined]) {
    const msg = fixMsg(k);
    assert.ok(msg && msg.length > 10, String(k));
    assert.doesNotMatch(msg, /غلط|خطأ|وحش/, String(k));
    assert.match(msg, /^(حلو|شاطر|الشكل جميل|قربت|قربنا)/, `${k}: بتبدأ بتشجيع`);
  }
  assert.equal(fixMsg("nope"), ROUND_MSG.fixShape);
  assert.equal(femAdapt(ROUND_MSG.fixMissingDots), "شاطرة! فاضل النقط بس، متنسيش تحطيها");
});

// المالك ٢٠٢٦-١٠-١٤: «يكتب الحرف بالضمة والفتحة والكسرة والسكون زى كتاب العربى»
test("harakaStrokes: the letter fits in the middle, the mark is the last stroke — above (fatha/damma/sukun) or below (kasra)", async () => {
  const { harakaStrokes, harakaGlyph, HARAKAT_ORDER } = await import("../js/data/strokes.js");
  const { getDataset } = await import("../js/data/datasets.js");
  assert.deepEqual(HARAKAT_ORDER, ["a", "u", "i", "o"]);
  assert.equal(harakaGlyph("أ", "i"), "إ", "الألف بالكسرة إِ زى الكتاب");
  for (const it of getDataset("arabic").items) {
    for (const h of HARAKAT_ORDER) {
      const g = harakaGlyph(it.char, h);
      const st = harakaStrokes(g, h);
      assert.ok(st, `${g}${h}`);
      assert.equal(st.length, strokesFor(g).length + 1, `${g}${h}: الحركة خط زيادة فى الآخر`);
      const body = st.slice(0, -1).flat(), mark = st[st.length - 1];
      for (const [x, y] of [...body, ...mark]) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `${g}${h} جوّه المربع`);
      const top = Math.min(...body.map((p) => p[1])), bottom = Math.max(...body.map((p) => p[1]));
      const my = mark.map((p) => p[1]);
      if (h === "i") assert.ok(Math.min(...my) > bottom, `${g}: الكسرة تحت الحرف`);
      else assert.ok(Math.max(...my) < top, `${g}${h}: الحركة فوق الحرف`);
    }
  }
});

// المالك ٢٠٢٦-١٠-٢٣: «n الصغير مكتوب كويس وميزو بيقول قربنا» — القوس من فوق العصاية (مدوّر/مدبّب)
// أو خط واحد بيعدّى، والحروف التانية لأ
test("small n: the usual ways children write it pass; other letters still don't", async () => {
  const { strokeModels } = await import("../js/data/strokes.js");
  const { scoreDrawing, SCORE_PASS } = await import("../js/games/strokeJudge.js");
  const n = strokesFor("n");
  const best = (d) => Math.max(...strokeModels(n).map((m) => scoreDrawing(m, d).score));
  assert.equal(strokeModels(n)[0], n, "النقط والصباع على الشكل الأساسى");
  assert.equal(strokeModels(strokesFor("h")).length, 1, "حروف من غير طرق تانية زى ما هى");
  const LB_DOTS_PASS = 75;
  // من صور المالك (على النقط): قوس مدبّب ورجل يمين مايلة · قوس مسطّح من فوق العصاية
  const pointy = [[[34, 43], [37, 83]], [[34, 42], [49, 39], [57, 43], [61, 51], [66, 66], [70, 81]]];
  const flat = [[[37, 37], [37, 80]], [[41, 38], [66, 40], [70, 46], [70, 77]]];
  const oneStroke = [[[34, 45], [34, 80], [34, 55], [38, 49], [50, 46], [62, 49], [66, 58], [66, 80]]];
  assert.ok(scoreDrawing(n, pointy).score < LB_DOTS_PASS, "قبل: المدبّب كان «قربنا»");
  for (const [name, d] of [["pointy", pointy], ["flat", flat], ["one stroke", oneStroke]]) assert.ok(best(d) >= LB_DOTS_PASS, name);
  for (const c of ["h", "r", "m", "u", "a", "b", "p", "v", "w", "z", "N", "M"]) assert.ok(best(strokesFor(c)) < SCORE_PASS, `${c} as n`);
});
