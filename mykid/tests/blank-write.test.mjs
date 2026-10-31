// «كمّل الكلمة بإيدك» (المالك ٢٠٢٦-١٠-٣١): البيانات والحكم — من غير متصفح.
//   node --test mykid/tests/blank-write.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { BW_AR_LETTERS, BW_EN_LETTERS, BW_AR_EXTRA, arItems, enItems, arShapes, levelFor, bwPhrases, BW_SAY, indexAt } from "../js/data/blankWrite.js";
import { LB_LETTERS, bare } from "../js/data/letterbook.js";
import { fitJudge, judgeShapes, bboxOf, gridSize } from "../js/games/blankJudge.js";

test("كل الحروف العربى الـ٢٨ ليها كلمات، والحرف فى المكان المكتوب بشكله الصح", () => {
  assert.equal(BW_AR_LETTERS.length, 28);
  for (const ch of BW_AR_LETTERS) {
    const it = arItems(ch);
    assert.ok(it.length >= 2, `${ch}: ${it.length}`);
    // أول ← وسط ← آخر، ومفيش مكانين زى بعض غير لما الحرف من الكراسة (كلماتها زى ما هى)
    assert.deepEqual(it.map((x) => x.pos), [...it.map((x) => x.pos)].sort((a, b) => a - b), ch);
    for (const x of it) {
      assert.ok(x.e && x.w && x.letter, `${ch} ${x.w}`);
      assert.equal(x.before + x.letter + x.after, bare(x.w), `${ch} ${x.w}`);
      assert.ok(/[ـ]/.test(x.shape) || !x.joinsPrev && !x.joinsAfter, `${x.w}: ${x.shape}`);
      assert.ok(arShapes(x.letter).includes(x.shape) || x.shape === x.letter, `${x.w}: الشكل ${x.shape} من أشكال الحرف`);
    }
  }
  // الـ١٤ اللى مش فى الكراسة: كل كلمة الحرف فيها فى المكان المكتوب بالظبط
  for (const [ch, list] of Object.entries(BW_AR_EXTRA)) {
    assert.ok(!LB_LETTERS[ch], `${ch} فى الكراسة — كلماته من هناك`);
    for (const x of list) assert.ok(indexAt(x.w, ch, x.at) >= 0, `${ch} ${x.w} ${x.at}`);
  }
  assert.equal(Object.keys(BW_AR_EXTRA).length + Object.keys(LB_LETTERS).length, 28);
});

test("شكل الحرف جوّه الكلمة من جيرانه (قرد: الدال كاملة · مثلث: التانية فى الآخر · حذاء: الذال بعد الحاء)", () => {
  const by = (ch, w) => arItems(ch).find((x) => x.w === w);
  assert.equal(by("د", "قرد").shape, "د");
  assert.equal(by("ث", "مثلث").shape, "ـث");
  assert.equal(by("ث", "مثلث").pos, 2);
  assert.equal(by("ث", "كمثرى").shape, "ـثـ");
  assert.equal(by("ذ", "حذاء").shape, "ـذ");
  assert.equal(by("ب", "بيت").shape, "بـ");
  assert.equal(by("ع", "ضفدع").shape, "ع");   // الدال مابتمسكش اللى بعدها
});

test("الإنجليزى: الـ٢٦ حرف، الحرف الصغير مكانه فاضى (وX فى الآخر زى الكتاب)", () => {
  assert.equal(BW_EN_LETTERS.length, 26);
  for (const ch of BW_EN_LETTERS) {
    const it = enItems(ch);
    assert.equal(it.length, 3, ch);
    for (const x of it) {
      assert.equal(x.letter, ch.toLowerCase());
      assert.equal(x.before + x.letter + x.after, x.w);
      assert.equal(x.pos, ch === "X" ? 2 : 0, x.w);
    }
  }
});

test("المستوى بيصعب كل كلمة، والأخيرة دايماً مربع فاضى زى الامتحان", () => {
  assert.deepEqual([0, 1, 2].map((r) => levelFor(r, 3)), [1, 2, 3]);
  assert.deepEqual([0, 1].map((r) => levelFor(r, 2)), [2, 3]);
  assert.deepEqual([levelFor(0, 1)], [3]);
});

test("كل جمل ميزو متسجّلة (اسم الحرف ومكانه + كل الكلمات)", () => {
  const p = new Set(bwPhrases());
  assert.ok(p.has(BW_SAY.ask("باء", 1)));
  assert.ok(p.has(BW_SAY.wrongShape(2)));
  for (const w of ["مثلث", "تلميذ", "sun", "box"]) assert.ok(p.has(w), w);
});

// ===== الحكم بالشكل على شبكات صناعية =====
const W = 120, H = 80;
function img(paint) {
  const a = new Uint8Array(W * H);
  paint((x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) a[y * W + x] = 255; });
  return a;
}
const rect = (x0, y0, x1, y1) => (set) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y); };
// شكل «L»: عمود + قاعدة
const L = (ox, oy, s, t) => (set) => { rect(ox, oy, ox + t, oy + s)(set); rect(ox, oy + s - t, ox + s, oy + s)(set); };

test("الشكل نفسه فى مكان وحجم تانى بيعدّى، وشكل مختلف أو رسم صغير لأ", () => {
  const mask = img(L(20, 10, 50, 10));
  assert.ok(fitJudge(img(L(60, 30, 30, 6)), mask, W, H).ok, "نفس الشكل أصغر وفى حتة تانية");
  const bar = img(rect(10, 35, 110, 45));
  assert.equal(fitJudge(bar, mask, W, H).ok, false, "خط عرضى مش L");
  const dot = img(rect(50, 40, 52, 42));
  assert.equal(fitJudge(dot, mask, W, H).empty, true, "نقطة صغيرة مش رسم");
  assert.equal(fitJudge(img(L(60, 30, 30, 6)), new Uint8Array(W * H), W, H).ok, false, "قناع فاضى = مفيش حكم");
});

test("لو كتب شكل تانى للحرف والصح ماعدّاش: wrongShape بيقول أنهى شكل", () => {
  const target = img(L(20, 10, 50, 10));
  const other = img(rect(20, 10, 30, 60));            // عمود بس
  const drew = img(rect(70, 5, 76, 70));              // الطفل رسم عمود
  const r = judgeShapes(drew, [target, other], 0, W, H);
  assert.equal(r.ok, false);
  assert.equal(r.wrongShape, 1);
  assert.equal(judgeShapes(img(L(50, 20, 40, 8)), [target, other], 0, W, H).ok, true);
});

test("الشبكة على قد شكل الحرف", () => {
  const b = bboxOf(img(rect(0, 0, 99, 19)), W, H);
  const g = gridSize(b);
  assert.ok(g.cols > g.rows && g.rows >= 5);
});
