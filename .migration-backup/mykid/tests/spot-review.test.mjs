// «غلطة ميزو» (الفكرة الخامسة) و«مراجعة اليوم» (السادسة) — البيانات، من غير متصفح.
//   node --test mykid/tests/spot-review.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { spotRounds, arRound, SPOT_LETTERS, SP_SAY, spPhrases } from "../js/data/spotMistake.js";
import { arItems } from "../js/data/blankWrite.js";
import { nextReview, dueKeys, resolveKey, reviewKey, addDays, REVIEW_MASTER, reviewSummary } from "../js/data/writeReview.js";

const seeded = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

test("كل حرف (عربى وإنجليزى) ليه جولات «غلطة ميزو»: حرف واحد بس غلط، والصح من الاختيارات", () => {
  for (const lang of ["ar", "en"]) for (const ch of SPOT_LETTERS[lang]) {
    const rounds = spotRounds(lang, [ch], seeded(7));
    assert.ok(rounds.length >= 1, `${lang} ${ch}`);
    for (const r of rounds) {
      const diff = r.tiles.map((t, i) => (t !== r.fixed[i] ? i : -1)).filter((i) => i >= 0);
      assert.deepEqual(diff, [r.at], `${r.w}: الغلط فى حرف واحد بس`);
      assert.ok(r.options.includes(r.answer), `${r.w}: الصح فى الاختيارات`);
      assert.equal(new Set(r.options).size, r.options.length, r.w);
    }
  }
});

test("غلط الشكل: الحرف مكتوب لوحده من غير ZWJ وهو المفروض يمسك إيد أصحابه", () => {
  const x = arItems("ب").find((it) => it.w === "حبر");
  let r = null;
  for (let s = 1; s < 50 && (!r || r.type !== "form"); s++) r = arRound(x, "ب", seeded(s * 104729 + 7));
  assert.equal(r.type, "form");
  assert.equal(r.tiles[r.at], "ب");
  assert.match(r.fixed[r.at], /‍/);
  assert.equal(r.answer, "ـبـ");
});

test("غلط الحرف: حرف شبهه بالنقط (ظ ⇒ ط)", () => {
  const x = arItems("ظ")[0];
  let r = null;
  for (let s = 1; s < 50 && (!r || r.type !== "letter"); s++) r = arRound(x, "ظ", seeded(s * 104729 + 7));
  assert.equal(r.type, "letter");
  assert.match(r.tiles[r.at], /ط/);
  assert.equal(r.answer, "ظ");
});

test("ميزو بيقول صراحة إن فيه غلطة، وللطفل مابيقولش «غلط» على حرف صح", () => {
  assert.match(SP_SAY.intro2, /غلطت فى حرف/);
  assert.doesNotMatch(SP_SAY.notThis + SP_SAY.pickWrong, /غلط/);
  assert.ok(spPhrases().includes(SP_SAY.intro1));
});

test("مراجعة اليوم: الغلط يرجع بكره، والصح بعد ١ ثم ٢ يوم، والتالت = اتعلّمها", () => {
  const d0 = "2026-10-31";
  assert.equal(nextReview(undefined, true, d0), null, "صح من أول مرة ومش فى المراجعة ⇒ مايتسجّلش");
  let s = nextReview(undefined, false, d0);
  assert.deepEqual([s.due, s.streak, s.wrongs], ["2026-11-01", 0, 1]);
  s = nextReview(s, true, "2026-11-01");
  assert.deepEqual([s.due, s.streak], ["2026-11-02", 1]);
  s = nextReview(s, true, "2026-11-02");
  assert.deepEqual([s.due, s.streak], ["2026-11-04", 2]);
  s = nextReview(s, true, "2026-11-04");
  assert.equal(s.streak, REVIEW_MASTER);
  assert.equal(s.mastered, true);
  assert.equal(s.due, null);
  // غلط بعد ما كان ماشى كويس ⇒ يرجع من الأول
  const back = nextReview({ streak: 2, rights: 2, wrongs: 1, due: "2026-11-04" }, false, "2026-11-04");
  assert.deepEqual([back.streak, back.due, back.wrongs], [0, "2026-11-05", 2]);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("اللى عليه الدور النهارده بس، الأقدم الأول، ولغة واحدة — والمفتاح بيرجع الكلمة بشكل حرفها", () => {
  const stats = {
    [reviewKey("ar", "ث", "مثلث")]: { due: "2026-10-30", wrongs: 1, streak: 0 },
    [reviewKey("ar", "ب", "حبر")]: { due: "2026-10-31", wrongs: 3, streak: 0 },
    [reviewKey("ar", "ك", "سمك")]: { due: "2026-11-02", wrongs: 1, streak: 1 },
    [reviewKey("ar", "م", "قلم")]: { due: null, mastered: true, wrongs: 1, streak: 3 },
    [reviewKey("en", "S", "sun")]: { due: "2026-10-31", wrongs: 1, streak: 0 },
  };
  assert.deepEqual(dueKeys(stats, "ar", "2026-10-31"), ["ar:ث:مثلث", "ar:ب:حبر"]);
  assert.deepEqual(dueKeys(stats, "en", "2026-10-31"), ["en:S:sun"]);
  const x = resolveKey("ar:ث:مثلث");
  assert.deepEqual([x.ch, x.shape, x.pos], ["ث", "ـث", 2]);
  assert.equal(resolveKey("ar:ث:كلمة-اتشالت"), null);
  assert.deepEqual(reviewSummary(stats, "ar"), { pending: 3, mastered: 1 });
});
