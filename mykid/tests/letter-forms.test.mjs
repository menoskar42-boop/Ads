// ستّ ألعاب «شكل الحرف فى أول ووسط وآخر الكلمة» (المالك ٢٠٢٦-١٠-٢٧): «تعملهم منفصلين وتدمجهم
// فى كراسة الحروف مع كل حرف».
//   node --test mykid/tests/letter-forms.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  LF_KINDS, LF_LETTERS, LF_SAY, shapeIn, shapesOf, formWords, completeRounds, listenRounds, stampBoard,
  handsRounds, nameRound, nameRounds, nameLetters, lfPhrases,
} from "../js/data/letterForms.js";
import { LB_ORDER, letterPage, LB_LETTER_KINDS } from "../js/data/letterbook.js";
import { LB_ACT_INFO } from "../js/data/letterGrade.js";
import { femAdapt } from "../js/data/mizo.js";

const seeded = (s) => () => ((s = (s * 9301 + 49297) % 233280) / 233280);
const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

test("every letterbook letter has its words in place with the real shape (from the neighbours)", () => {
  assert.deepEqual(LF_LETTERS, LB_ORDER);
  const shapes = Object.fromEntries(LF_LETTERS.map((ch) => [ch, formWords(ch).map((x) => x.shape)]));
  assert.deepEqual(shapes["ب"], ["بـ", "ـبـ", "ـب"]);
  assert.deepEqual(shapes["د"], ["د", "ـد", "د"], "قرد: الراء مابتمسكش اللى بعدها فالدال بشكلها الكامل");
  assert.deepEqual(shapes["ز"], ["ز", "ـز", "ز"], "موز: الواو مابتمسكش اللى بعدها");
  assert.deepEqual(shapes["ح"], ["حـ", "ـحـ", "ح"], "تفاح: الألف قبل الحاء");
  assert.equal(shapeIn("كتاب", "أ").shape, "ـا");
  for (const ch of LF_LETTERS) {
    const ws = formWords(ch);
    assert.ok(ws.length >= 2, ch);
    for (const x of ws) {
      assert.equal(x.before + x.letter + x.after, x.w, `${ch} ${x.w}`);
      assert.ok(x.e && x.e !== "❓", `${ch} ${x.w}: صورة`);
    }
  }
  assert.deepEqual(shapesOf("م"), ["مـ", "ـمـ", "ـم"]);
  assert.deepEqual(shapesOf("ر"), ["ر", "ـر"], "الراء بإيد واحدة: شكلين بس");
});

test("hands: the touched letter is the target, and the reason matches its hands", () => {
  const how = (ch) => handsRounds(ch).map((r) => r.how);
  assert.deepEqual(how("ب"), ["after", "both", "lastBefore"]);
  assert.deepEqual(how("د"), ["firstAlone", "oneHand", "prevNoHand"]);
  for (const ch of LF_LETTERS) for (const r of handsRounds(ch)) {
    assert.equal(r.letters.join(""), r.w);
    assert.equal(r.letters[r.at], r.letter, `${ch} ${r.w}`);
    assert.ok(LF_SAY.how[r.how], r.how);
  }
});

test("complete / listen / stamp: right answer always offered, choices are shapes of the same letter", () => {
  for (const ch of LF_LETTERS) for (let s = 1; s < 20; s++) {
    for (const r of completeRounds(ch, seeded(s))) {
      assert.ok(r.options.includes(r.shape), `${ch} ${r.w}`);
      assert.equal(new Set(r.options).size, r.options.length);
      assert.ok(r.options.every((o) => o.replace(/ـ/g, "") === r.letter), "أشكال نفس الحرف بس");
    }
    for (const r of listenRounds(ch, seeded(s))) assert.ok([0, 1, 2].includes(r.pos));
    const b = stampBoard(ch, seeded(s));
    for (const w of b.words) assert.ok(b.stamps.includes(w.shape), `${ch} ${w.w}: الختم موجود`);
    assert.equal(new Set(b.stamps).size, b.stamps.length);
  }
});

test("name hunt: letters of the child's name with their places; letterbook step only if the letter is in the name", () => {
  assert.deepEqual(nameLetters("مريم"), ["م", "ر", "ي"]);
  assert.deepEqual(nameLetters("آية"), ["أ", "ي"], "التاء المربوطة مالهاش اسم حرف");
  const r = nameRound("مريم", "م");
  assert.deepEqual(r.good, [0, 3]);
  assert.deepEqual(r.positions, [0, 2]);
  assert.equal(r.tiles.join("").replace(/‍/g, ""), "مريم");
  assert.equal(nameRound("مريم", "ب"), null);
  assert.equal(nameRound("", "ب"), null);
  assert.equal(nameRounds("أحمد").length, 4);
  // الكراسة: الخطوة بتتشال لو الحرف مش فى الاسم
  const lb = read("../js/games/letterbook.js");
  assert.match(lb, /if \(x\.kind === "nameHunt"\) return nameRound\(Store\.childName, x\.ch\) \? \[x\] : \[\];/);
});

test("integration: standalone in the castle + a step on every letter page + grade labels + voices", () => {
  for (const k of LF_KINDS) {
    assert.ok(LB_LETTER_KINDS.includes(k), k);
    assert.ok(LB_ACT_INFO[k], k);
  }
  for (const ch of LB_ORDER) {
    const kinds = letterPage(ch, seeded(3)).map((s) => s.kind);
    for (const k of LF_KINDS) assert.equal(kinds.filter((x) => x === k).length, 1, `${ch} ${k}`);
  }
  const acts = read("../js/data/activities.js");
  for (const k of LF_KINDS) assert.match(acts, new RegExp(`screen: "formsPlay", params: \\{ mode: "${k}" \\}`));
  assert.match(read("../js/app.js"), /Router\.register\("formsPlay", renderFormsPlay\);/);
  assert.match(read("../server/tts-games.js"), /for \(const t of lfPhrases\(\)\) \{ say\(t\); say\(femAdapt\(t\)\); \}/);
  const ph = lfPhrases();
  assert.ok(ph.includes(LF_SAY.hands("باء")) && ph.includes(LF_SAY.name("ياء")) && ph.includes("حبر"));
  // الجمل بصيغة البنت مافيهاش فعل أمر للولد فاضل
  for (const t of [LF_SAY.stamp("باء"), LF_SAY.listenWrong, LF_SAY.choose, LF_SAY.traceOut]) assert.doesNotMatch(femAdapt(t), /(^|\s)(اختار|المس|اسمع|امسح|ارسم)(\s|،|$)/, t);
});
