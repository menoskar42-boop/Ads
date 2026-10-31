// «ورقة الامتحان» (الفكرة التانية، المالك ٢٠٢٦-١٠-٣١): البيانات — من غير متصفح.
//   node --test mykid/tests/exam-sheet.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { sheetItems, sheetLetters, exPool, teacherSay, printPages, EX_SAY, exPhrases } from "../js/data/examSheet.js";
import { BW_AR_LETTERS, BW_EN_LETTERS } from "../js/data/blankWrite.js";

const seeded = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

test("ورقة «الحرف الأول»: ٣ كلمات من ٣ حروف مختلفة، والحرف أول الكلمة (زى الامتحان)", () => {
  for (let k = 1; k <= 30; k++) {
    const it = sheetItems("ar", BW_AR_LETTERS, "first", seeded(k));
    assert.equal(it.length, 3);
    assert.equal(new Set(it.map((x) => x.ch)).size, 3);
    for (const x of it) { assert.equal(x.pos, 0, x.w); assert.equal(x.before, ""); }
  }
});

test("ورقة «فى أى مكان» فيها كلمات الحرف فى الوسط والآخر كمان", () => {
  const pos = new Set();
  for (let k = 1; k <= 40; k++) for (const x of sheetItems("ar", BW_AR_LETTERS, "any", seeded(k))) pos.add(x.pos);
  assert.deepEqual([...pos].sort(), [0, 1, 2]);
});

test("حرف واحد بس عليه نجمة ⇒ الورقة من كلماته (مختلفة)، ومفيش نجمة ⇒ كل الحروف", () => {
  assert.deepEqual(sheetLetters("ar", []), BW_AR_LETTERS);
  assert.deepEqual(sheetLetters("ar", ["ب"]), ["ب"]);
  const it = sheetItems("ar", ["ب"], "any", seeded(3));
  assert.equal(new Set(it.map((x) => x.w)).size, it.length);
  assert.ok(it.length >= 2);
  // «الحرف الأول» لحرف واحد: كلمة واحدة بتبدأ بيه — الورقة مابتكرّرش نفس الكلمة
  assert.equal(sheetItems("ar", ["ب"], "first", seeded(3)).length, 1);
});

test("الإنجليزى: الحرف الصغير أول الكلمة (وX آخرها)", () => {
  for (let k = 1; k <= 20; k++) for (const x of sheetItems("en", BW_EN_LETTERS, "first", seeded(k))) {
    assert.equal(x.letter, x.letter.toLowerCase());
    assert.equal(x.pos, x.ch === "X" ? 2 : 0);
  }
  assert.ok(exPool("en", ["X"], "first").every((x) => x.after === ""));
});

test("جملة الميس من الدرجة", () => {
  assert.equal(teacherSay(3, 3), EX_SAY.great);
  assert.equal(teacherSay(2, 3), EX_SAY.good);
  assert.equal(teacherSay(1, 3), EX_SAY.again);
  assert.ok(exPhrases().includes(EX_SAY.great));
});

test("الطباعة: سطر لكل حرف و٦ سطور فى الصفحة (الـ٢٨ حرف ⇒ ٥ صفحات)", () => {
  const pages = printPages("ar", BW_AR_LETTERS, "any");
  assert.equal(pages.length, 5);
  assert.equal(pages.flat().length, 28);
  assert.ok(pages.every((p) => p.length <= 6));
  assert.equal(printPages("en", BW_EN_LETTERS, "first").flat().length, 26);
});
