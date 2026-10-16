// ===== «ألعاب ميزو» للحروف (عربى وإنجليزى) والأرقام — البيانات والجولات (من غير DOM) =====
//
// المالك ٢٠٢٦-١٠-١٦: «ألعاب تعلّم الحروف العربى والإنجليزى والأرقام، مبتكرة وجذابة للأطفال».
// خمس ألعاب، كل واحدة بتشتغل على الحروف العربى والإنجليزى والأرقام بنفس الكود:
//   🐸 نطّة الضفدع — اسمع والمس الورقة اللى عليها الحرف، والضفدع ينطّ لحد بيته
//   🔦 الكشّاف — الدنيا ضلمة، حرّك الكشّاف بصباعك ودوّر على الحرف
//   🎹 بيانو ميزو — ميزو بيعزف حروف ورا بعض والطفل يعزفها زيه (ذاكرة + سمع)
//   🚀 صاروخ الترتيب — المس بالترتيب (أ ب ت… / A B C… / ١ ٢ ٣…) والصاروخ يتملى وينطلق
//   🥚 بيض المفاجآت — اكسر البيضة اللى عليها الحرف، يطلع منها صاحب الحرف (وللأرقام: كتاكيت بعددها)
// الشاشة فى games/funGames.js، والاختبارات بتستورد الملف ده مباشرة.

import { ARABIC_LETTERS } from "./arabicLetters.js";
import { ENGLISH_LETTERS } from "./englishLetters.js";
import { NUMBERS } from "./numbers.js";

/**
 * عناصر اللعب الموحّدة: { id, glyph (اللى بيتعرض), say (اللى بيتنطق), lang, word, emoji, value }.
 * الإنجليزى: الحرف بيتعرض كابيتال أو صغير (alt) — والاتنين نفس العنصر.
 */
export function funItems(kind) {
  if (kind === "english") {
    return ENGLISH_LETTERS.map((x) => ({ id: x.char, glyph: x.char, alt: x.lower || x.char.toLowerCase(), say: x.name, lang: "en-US", word: x.word, emoji: x.emoji }));
  }
  if (kind === "numbers") {
    return NUMBERS.slice(0, 10).map((x) => ({ id: String(x.value), glyph: x.arDigit, say: x.arName, lang: "ar-EG", value: x.value, emoji: "🐥" }));
  }
  return ARABIC_LETTERS.map((x) => ({ id: x.char, glyph: x.char, say: x.name, lang: "ar-EG", word: x.word, emoji: x.emoji }));
}

/** اسم النوع فى كلام ميزو: «حرف» ولا «رقم». */
export const nounOf = (kind) => (kind === "numbers" ? "رقم" : "حرف");

// ===== أدوات =====
export function shuffled(rnd, a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
const pickN = (rnd, a, n, not = []) => shuffled(rnd, a.filter((x) => !not.includes(x))).slice(0, n);

/** الحروف المتشابهة فى الشكل — بنحطّها مع بعض أحياناً عشان العين تتعلّم الفرق (ب ت ث، ج ح خ…). */
const LOOKALIKE = [
  ["ب", "ت", "ث", "ن"], ["ج", "ح", "خ"], ["د", "ذ"], ["ر", "ز"], ["س", "ش"], ["ص", "ض"], ["ط", "ظ"], ["ع", "غ"], ["ف", "ق"],
  ["b", "d", "p", "q"], ["M", "W"], ["E", "F"], ["O", "Q", "C"], ["٦", "٧"], ["٢", "٣"],
];
function distractors(rnd, items, target, n) {
  const fam = LOOKALIKE.find((g) => g.includes(target.glyph) || (target.alt && g.includes(target.alt)));
  const close = fam ? items.filter((x) => x !== target && (fam.includes(x.glyph) || (x.alt && fam.includes(x.alt)))) : [];
  const near = pickN(rnd, close, Math.min(1, n));
  return near.concat(pickN(rnd, items, n - near.length, [target, ...near]));
}

/** الحروف المطلوبة فى الجولات: عشوائى — أو فى «كراسة الحروف» حرف الصفحة نفسه n مرة. */
function targetsOf(rnd, items, count, focus, n) {
  return focus ? Array.from({ length: n }, () => focus) : pickN(rnd, items, count);
}
/** عنصر حرف الصفحة (أ / A / ٣) من عناصر اللعبة. */
export const focusItem = (items, focus) => (focus == null ? null : items.find((x) => x.id === String(focus) || x.glyph === focus) || null);

// ===== 🐸 نطّة الضفدع: ٦ نطّات، فى كل نطّة ورقتين أو ٣ =====
export const FROG_HOPS = 6;
export function frogRounds(items, rnd = Math.random, pads = 3) {
  return pickN(rnd, items, FROG_HOPS).map((target) => ({ target, pads: shuffled(rnd, [target, ...distractors(rnd, items, target, pads - 1)]) }));
}

// ===== 🔦 الكشّاف: ٥ جولات، فى كل جولة ٦ حاجات مستخبية فى أماكن مش فوق بعض =====
export const FLASH_ROUNDS = 5;
export function flashRounds(items, rnd = Math.random, count = 6, focus = null, n = FLASH_ROUNDS) {
  return targetsOf(rnd, items, FLASH_ROUNDS, focus, n).map((target) => {
    const all = shuffled(rnd, [target, ...distractors(rnd, items, target, count - 1)]);
    return { target, spots: placeSpots(rnd, all) };
  });
}
/** أماكن على شبكة ٣×٣ (بنسب مئوية) مع شوية لخبطة — عمرهم ما يركبوا فوق بعض. */
export function placeSpots(rnd, list) {
  const cells = shuffled(rnd, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  return list.map((item, i) => {
    const c = cells[i % 9];
    return { item, x: 17 + (c % 3) * 33 + (rnd() - 0.5) * 12, y: 18 + Math.floor(c / 3) * 32 + (rnd() - 0.5) * 10 };
  });
}

// ===== 🎹 بيانو ميزو: ٤ مفاتيح، والنغمة بتطول جولة ورا جولة =====
export const PIANO_KEYS = 4;
export function pianoKeys(items, rnd = Math.random) {
  return pickN(rnd, items, PIANO_KEYS);
}
/** طول اللحن فى كل جولة: ١ ← ٢ ← ٣ (والكبار لحد ٤). */
export const pianoLengths = (big) => (big ? [1, 2, 3, 3, 4] : [1, 2, 2, 3, 3]);
export function pianoTune(rnd, keyCount, len) {
  const t = [];
  for (let i = 0; i < len; i++) {
    let k = Math.floor(rnd() * keyCount);
    if (t.length && k === t[t.length - 1]) k = (k + 1) % keyCount; // من غير نفس المفتاح مرتين ورا بعض
    t.push(k);
  }
  return t;
}

// ===== 🚀 صاروخ الترتيب: ٣ صواريخ، كل واحد ٤ أو ٥ حاجات ورا بعض =====
export const ROCKETS = 3;
export function rocketRounds(items, rnd = Math.random, len = 5) {
  const starts = shuffled(rnd, Array.from({ length: items.length - len + 1 }, (_, i) => i));
  // أول صاروخ من أول الحروف/الأرقام (أسهل)، والباقى من أماكن تانية
  const chosen = [0, ...starts.filter((s) => s !== 0)].slice(0, ROCKETS);
  return chosen.map((s) => {
    const order = items.slice(s, s + len);
    return { order, bubbles: shuffled(rnd, order) };
  });
}

// ===== 🥚 بيض المفاجآت: ٥ جولات، ٣ بيضات، والبيضة بتتكسر بـ٣ خبطات =====
export const EGG_ROUNDS = 5;
export const EGG_TAPS = 3;
export function eggRounds(items, rnd = Math.random, eggs = 3, focus = null, n = EGG_ROUNDS) {
  return targetsOf(rnd, items, EGG_ROUNDS, focus, n).map((target) => ({ target, eggs: shuffled(rnd, [target, ...distractors(rnd, items, target, eggs - 1)]) }));
}
/** اللى بيطلع من البيضة: صاحب الحرف (🦆 بطة) — وللأرقام كتاكيت بعدد الرقم. */
export const hatchOf = (item) => (item.value ? "🐥".repeat(item.value) : item.emoji || "🐣");

// ===== 🧩 بازل الحرف/الرقم (المالك ٢٠٢٦-١٠-١٦): الحرف كبير متقطّع، والطفل يرجّع كل حتة مكانها =====
export const PUZZLE_ROUNDS = 4;
/** القطع: ٢×٢ للصغار، ٣×٢ للكبار. كل قطعة { id, col, row }. */
export const puzzleGrid = (big) => (big ? { cols: 2, rows: 3 } : { cols: 2, rows: 2 });
export function puzzlePieces({ cols, rows }) {
  const out = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) out.push({ id: `${col}-${row}`, col, row });
  return out;
}
/** الجولات: حروف/أرقام مختلفة، والقطع متلخبطة (عمرها ما تبدأ مترتّبة). */
export function puzzleRounds(items, rnd = Math.random, grid = puzzleGrid(false), focus = null, n = PUZZLE_ROUNDS) {
  const pieces = puzzlePieces(grid);
  return targetsOf(rnd, items, PUZZLE_ROUNDS, focus, n).map((target) => {
    let tray = shuffled(rnd, pieces);
    if (tray.every((p, i) => p === pieces[i])) tray = tray.slice(1).concat(tray[0]);
    return { target, tray };
  });
}
/** يقع فين: القطعة اتسابت قريب من مكانها الصح (نص مقاسها) ⇒ تتشدّ لوحدها. */
export const snapsTo = (dx, dy, w, h) => Math.abs(dx) <= w * 0.5 && Math.abs(dy) <= h * 0.5;
