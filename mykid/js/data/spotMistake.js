// ===== «غلطة ميزو» — الفكرة الخامسة (المالك ٢٠٢٦-١٠-٣١) =====
// المالك: «الفكرة خمسة لازم ميزو يفهمها ان فيه غلط فى الكلمة والطفل يطلعه». ميزو بيقول صراحة إنه كتب الكلمة وغلط
// فى حرف، والكلمة حروف منفصلة للمس — الطفل يدوّر على الحرف الغلط ويلمسه فـ«يطلع» من الكلمة، وبعدين يختار الصح.
// نوعين غلط:
//   form   الحرف مكتوب لوحده وهو المفروض يمسك إيد أصحابه (حـ ب ر بدل حبر) — نفس فكرة «أشكال الحرف».
//   letter حرف شبهه بالنقط (ب ت ث ن · ج ح خ · د ذ · ر ز · س ش · ص ض · ط ظ · ع غ · ف ق) — والإنجليزى b/d p/q m/n…
//
// ملف صافى (من غير DOM) — الشاشة فى games/spotMistake.js، والاختبار tests/spot-mistake.test.mjs.
import { BW_AR_LETTERS, BW_EN_LETTERS, arItems, enItems, arShapes } from "./blankWrite.js";
import { joinsNext } from "./letterbook.js";

const ZWJ = "‍";
/** حروف شبه بعض فى الشكل (نفس الهيكل والنقط مختلفة). */
export const AR_TWINS = [["ب", "ت", "ث", "ن"], ["ج", "ح", "خ"], ["د", "ذ"], ["ر", "ز"], ["س", "ش"], ["ص", "ض"], ["ط", "ظ"], ["ع", "غ"], ["ف", "ق"]];
export const EN_TWINS = [["b", "d"], ["p", "q"], ["m", "n"], ["u", "n"], ["i", "l"], ["a", "o"], ["e", "c"], ["s", "z"], ["h", "n"], ["v", "w"], ["f", "t"], ["g", "q"], ["k", "h"], ["r", "n"], ["j", "i"], ["x", "k"], ["y", "v"]];
const twinsOf = (list, c) => (list.find((g) => g.includes(c)) || []).filter((x) => x !== c);

const shuffled = (rnd, arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** الكلمة العربى حروف للمس — كل حرف بشكله الموصول (ZWJ ناحية جاره اللى بيمسك إيده). */
export function arTiles(letters) {
  return letters.map((c, i) => (i > 0 && joinsNext(letters[i - 1]) ? ZWJ : "") + c + (i < letters.length - 1 && joinsNext(c) ? ZWJ : ""));
}

/**
 * جولة لكلمة (عربى): الحرف المطلوب مكتوب غلط. null لو مفيش غلط يبان (حرف لوحده ومالوش شبيه).
 * @returns { w, e, ch, at, type, tiles, fixed, options, answer }
 */
export function arRound(x, ch, rnd = Math.random) {
  const letters = [...x.w];
  const at = [...x.before].length;
  const right = arTiles(letters);
  const twins = twinsOf(AR_TWINS, x.letter);
  const canForm = x.joinsPrev || x.joinsAfter;
  const type = canForm && (!twins.length || rnd() < 0.5) ? "form" : twins.length ? "letter" : null;
  if (!type) return null;
  const tiles = right.slice();
  let options;
  if (type === "form") {
    tiles[at] = x.letter;                              // لوحده من غير ما يمسك إيد حد
    options = shuffled(rnd, arShapes(x.letter)).slice(0, 3);
    if (!options.includes(x.shape)) options[0] = x.shape;
  } else {
    const wrong = twins[Math.floor(rnd() * twins.length)];
    tiles[at] = right[at].replace(x.letter, wrong);
    options = shuffled(rnd, [x.letter, wrong, ...twins.filter((t) => t !== wrong)].slice(0, 3));
  }
  return { w: x.w, e: x.e, ch, at, type, tiles, fixed: right, options: shuffled(rnd, options), answer: type === "form" ? x.shape : x.letter };
}

/** جولة لكلمة (إنجليزى): الحرف المطلوب اتبدّل بحرف شبهه. */
export function enRound(x, ch, rnd = Math.random) {
  const letters = [...x.w];
  const at = x.before.length;
  let twins = twinsOf(EN_TWINS, x.letter);
  if (!twins.length) twins = shuffled(rnd, "bdpqmnuae".split("").filter((c) => c !== x.letter)).slice(0, 2);
  const wrong = twins[Math.floor(rnd() * twins.length)];
  const tiles = letters.slice();
  tiles[at] = wrong;
  const options = shuffled(rnd, [x.letter, wrong, ...twins.filter((t) => t !== wrong)].slice(0, 3));
  return { w: x.w, e: x.e, ch, at, type: "letter", tiles, fixed: letters, options, answer: x.letter };
}

/** جولات اللعبة: حرف واحد (كلماته) أو خليط من حروف (٤ جولات). */
export function spotRounds(lang, letters, rnd = Math.random, n = 4) {
  const ar = lang === "ar";
  const pool = [];
  for (const ch of letters) for (const x of ar ? arItems(ch) : enItems(ch)) pool.push({ ch, x });
  const out = [];
  for (const { ch, x } of letters.length === 1 ? pool : shuffled(rnd, pool)) {
    if (out.length >= n) break;
    if (out.some((r) => r.w === x.w)) continue;
    const r = ar ? arRound(x, ch, rnd) : enRound(x, ch, rnd);
    if (r) out.push(r);
  }
  return out;
}
export const SPOT_LETTERS = { ar: BW_AR_LETTERS, en: BW_EN_LETTERS };

export const SP_SAY = {
  title: "🕵️ غلطة ميزو",
  choose: "اختار حرف، أو العب بكل الحروف",
  mix: "🎲 كل الحروف",
  // ميزو بيقول صراحة إن فيه غلطة فى الكلمة (والكلمة نفسها بتتقال فى النص)
  intro1: "يا خبر! أنا كتبت كلمة",
  intro2: "وغلطت فى حرف. ساعدنى: دوّر على الحرف الغلط وطلّعه من الكلمة",
  notThis: "الحرف ده مكتوب صح. دوّر تانى",
  foundForm: "لقيته! الحرف ده كان مكتوب لوحده، وهو المفروض يمسك إيد أصحابه. اختار شكله الصح",
  foundLetter: "لقيته! ده حرف تانى شبهه. اختار الحرف الصح",
  pickWrong: "ده كمان مش هو. بص على الكلمة الصح",
  fixed: "شكراً! صلّحت الكلمة، وبقت صح",
};
export const spPhrases = () => [SP_SAY.choose, SP_SAY.intro1, SP_SAY.intro2, SP_SAY.notThis, SP_SAY.foundForm, SP_SAY.foundLetter, SP_SAY.pickWrong, SP_SAY.fixed];
