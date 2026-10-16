// ===== «كراسة الحروف»: كتاب اللغة العربية (المستوى الأول) جوّه mykid =====
//
// المالك ٢٠٢٦-١٠-١٣: «كتاب اللغه العربيه بتاع بنتى… ميزو يشرح كل حاجة ويشجّع الطفل…
// كل حرف يتاخد بالفتحه و الضمه و الكسره». ترتيب الحروف زى الكتاب بالظبط:
//   التهيئة ← أ م ← ب ف ن ل (مراجعة) ← ح ر ت س (مراجعة) ← ج ز د ق (مراجعة)
// ولكل حرف نفس أنشطة الكتاب: استمع وانطق ولوّن · ضع دائرة حول الصورة اللى بتبدأ بالحرف ·
// استمع واكتب الحرف بالحركات · اختر الصوت المناسب للصورة · لاحظ أشكال الحرف · اكتب الحرف الناقص.
// والمراجعة («أنا تعلمت»): لوّن الحروف · صل الصورة بالحرف الأول · نفس الصوت · موضع الحرف ·
// اقرأ ولوّن الصورة المناسبة · انطق ثم اكتب الكلمة.
//
// ملف صافى (من غير DOM) — الشاشة فى games/letterbook.js، والاختبارات بتستورده مباشرة.
import { ARABIC_LETTERS } from "./arabicLetters.js";

/** اسم الحرف زى باقى التطبيق (أَلِف، باء …) — نفس جمل «اكتب الحرف …» المتسجّلة صوتها. */
export const nameOf = (ch) => (ARABIC_LETTERS.find((x) => x.char === ch) || {}).name || ch;

/** الحركات الأربعة زى الكتاب: كل حركة ليها حركة إيد الولد اللى فى الصورة. */
export const LB_HARAKAT = {
  a: { mark: "َ", ar: "فتحة", hand: "🙋" }, // الإيد فوق الراس
  u: { mark: "ُ", ar: "ضمة", hand: "✊" }, // الإيد مقفولة
  i: { mark: "ِ", ar: "كسرة", hand: "👇" }, // الإيد تحت
  o: { mark: "ْ", ar: "سكون", hand: "✋" }, // الكف مفتوح: وقف
};
export const LB_HARAKA_ORDER = ["a", "u", "i", "o"];

/** حرف + حركة (بَ، بُ، بِ، بْ). */
export const syl = (ch, h) => ch + LB_HARAKAT[h].mark;

const W = (w, e) => ({ w, e });

// لكل حرف: اسمه · فزّورة ميزو (زى فقاعة الكتاب) · الكلمات الأربعة بالحركات (نفس كلمات الكتاب
// لما يبقى ليها صورة واضحة) · كلمات أشكال الحرف (أول/وسط/آخر) · وكلمات تانية بتبدأ بيه.
// `h` = حركة الحرف فى الكلمة، و`w` مكتوبة بالحركة دى على الحرف بس (عشان النطق يطلع صح).
export const LB_LETTERS = {
  "أ": {
    riddle: "أنا حيوان قوى وبعيش فى الغابة، واسمى بيبدأ بحرف أ. أنا مين؟",
    answer: W("أسد", "🦁"),
    harakat: [{ ...W("أَرنب", "🐰"), h: "a" }, { ...W("أُخطبوط", "🐙"), h: "u" }, { ...W("إِصبع", "☝️"), h: "i" }, { ...W("فأْس", "🪓"), h: "o" }],
    forms: [W("أسد", "🦁"), W("فأر", "🐭"), W("كتاب", "📖")],
    more: [W("أناناس", "🍍"), W("أذن", "👂")],
    // «حط دايرة»: كلمة بتنتهى بالألف (الكتاب بيحسب ا زى أ — كتاب)
    circle: [W("بيتزا", "🍕")],
  },
  "م": {
    riddle: "دى أداة بنقصّ بيها الورق، واسمها بيبدأ بحرف م. هى إيه؟",
    answer: W("مقص", "✂️"),
    harakat: [{ ...W("مَركب", "⛵"), h: "a" }, { ...W("مُهرج", "🤡"), h: "u" }, { ...W("مِفتاح", "🔑"), h: "i" }, { ...W("شمْس", "☀️"), h: "o" }],
    forms: [W("مقص", "✂️"), W("نمر", "🐯"), W("قلم", "✏️")],
    more: [W("موز", "🍌"), W("موبايل", "📱")],
  },
  "ب": {
    riddle: "أنا طائر بعوم فى الميه وبقول كاك كاك، واسمى بيبدأ بحرف ب. أنا مين؟",
    answer: W("بطة", "🦆"),
    harakat: [{ ...W("بَقرة", "🐄"), h: "a" }, { ...W("بُرتقال", "🍊"), h: "u" }, { ...W("بِنت", "👧"), h: "i" }, { ...W("حبْل", "🪢"), h: "o" }],
    forms: [W("بيت", "🏠"), W("حبر", "🖋️"), W("كلب", "🐕")],
    more: [W("بطة", "🦆"), W("بيضة", "🥚")],
  },
  "ف": {
    riddle: "أنا فاكهة حمرا ولذيذة، واسمى بيبدأ بحرف ف. أنا إيه؟",
    answer: W("فراولة", "🍓"),
    harakat: [{ ...W("فَأس", "🪓"), h: "a" }, { ...W("فُرشاة", "🖌️"), h: "u" }, { ...W("فِنجان", "☕"), h: "i" }, { ...W("ضفْدع", "🐸"), h: "o" }],
    forms: [W("فراشة", "🦋"), W("تفاح", "🍎"), W("أنف", "👃")],
    more: [W("فيل", "🐘"), W("فراولة", "🍓")],
  },
  "ن": {
    riddle: "أنا بطير وبعمل العسل، واسمى بيبدأ بحرف ن. أنا مين؟",
    answer: W("نحلة", "🐝"),
    harakat: [{ ...W("نَجمة", "⭐"), h: "a" }, { ...W("نُقود", "💵"), h: "u" }, { ...W("نِسناس", "🐒"), h: "i" }, { ...W("جنْدى", "💂"), h: "o" }],
    forms: [W("نحلة", "🐝"), W("بنت", "👧"), W("عين", "👁️")],
    more: [W("نمر", "🐯"), W("نار", "🔥")],
  },
  "ل": {
    riddle: "حاجة بنشربها لونها أبيض، واسمها بيبدأ بحرف ل. هى إيه؟",
    answer: W("لبن", "🥛"),
    harakat: [{ ...W("لَبن", "🥛"), h: "a" }, { ...W("لُؤلؤ", "🦪"), h: "u" }, { ...W("لِسان", "👅"), h: "i" }, { ...W("فلْفل", "🌶️"), h: "o" }],
    forms: [W("لحم", "🥩"), W("علم", "🚩"), W("عسل", "🍯")],
    more: [W("ليمون", "🍋"), W("لحم", "🥩")],
  },
  "ح": {
    riddle: "أنا بعيش فى الإسطبل وبجرى بسرعة، واسمى بيبدأ بحرف ح. أنا مين؟",
    answer: W("حصان", "🐎"),
    harakat: [{ ...W("حَمل", "🐑"), h: "a" }, { ...W("حُوت", "🐋"), h: "u" }, { ...W("حِذاء", "👟"), h: "i" }, { ...W("نحْلة", "🐝"), h: "o" }],
    forms: [W("حصان", "🐎"), W("نحلة", "🐝"), W("تفاح", "🍎")],
    more: [W("حلزونة", "🐌"), W("حصان", "🐎")],
  },
  "ر": {
    riddle: "أنا لعبة من حديد، بمشى لوحدى وبتكلم، واسمى بيبدأ بحرف ر. أنا مين؟",
    answer: W("روبوت", "🤖"),
    harakat: [{ ...W("رَجل", "👨"), h: "a" }, { ...W("رُز", "🍚"), h: "u" }, { ...W("رِيشة", "🪶"), h: "i" }, { ...W("برْج", "🗼"), h: "o" }],
    forms: [W("رسام", "🧑‍🎨"), W("جرس", "🔔"), W("بحر", "🌊")],
    more: [W("روبوت", "🤖"), W("رجل", "👨")],
  },
  "ت": {
    riddle: "أنا فاكهة حمرا بتطلع على الشجر، واسمى بيبدأ بحرف ت. أنا إيه؟",
    answer: W("تفاحة", "🍎"),
    harakat: [{ ...W("تَاج", "👑"), h: "a" }, { ...W("تُوت", "🫐"), h: "u" }, { ...W("تِمساح", "🐊"), h: "i" }, { ...W("كتْكوت", "🐥"), h: "o" }],
    forms: [W("تمساح", "🐊"), W("مفتاح", "🔑"), W("بنت", "👧")],
    more: [W("تاج", "👑"), W("تليفون", "☎️")],
  },
  "س": {
    riddle: "أنا بعيش فى الميه وبعوم طول اليوم، واسمى بيبدأ بحرف س. أنا مين؟",
    answer: W("سمكة", "🐟"),
    harakat: [{ ...W("سَيارة", "🚗"), h: "a" }, { ...W("سُلّم", "🪜"), h: "u" }, { ...W("سِيرك", "🎪"), h: "i" }, { ...W("جسْر", "🌉"), h: "o" }],
    forms: [W("سمكة", "🐟"), W("عسل", "🍯"), W("شمس", "☀️")],
    more: [W("ساعة", "⌚"), W("سيارة", "🚗")],
  },
  "ج": {
    riddle: "أنا بعيش فى الصحرا وعندى سنام، واسمى بيبدأ بحرف ج. أنا مين؟",
    answer: W("جمل", "🐪"),
    harakat: [{ ...W("جَرس", "🔔"), h: "a" }, { ...W("جُندى", "💂"), h: "u" }, { ...W("جِسر", "🌉"), h: "i" }, { ...W("نجْمة", "⭐"), h: "o" }],
    forms: [W("جمل", "🐪"), W("نجمة", "⭐"), W("برج", "🗼")],
    more: [W("جزر", "🥕"), W("جبنة", "🧀")],
  },
  "ز": {
    riddle: "أنا حيوان رقبتى طويلة أوى، واسمى بيبدأ بحرف ز. أنا مين؟",
    answer: W("زرافة", "🦒"),
    harakat: [{ ...W("زَرافة", "🦒"), h: "a" }, { ...W("زُجاجة", "🍾"), h: "u" }, { ...W("زِر", "🔘"), h: "i" }, { ...W("أزْرق", "🔵"), h: "o" }],
    forms: [W("زهرة", "🌺"), W("جزر", "🥕"), W("موز", "🍌")],
    more: [W("زهرة", "🌺"), W("زيتون", "🫒")],
  },
  "د": {
    riddle: "أنا بصحى بدرى وبقول كوكوكو، واسمى بيبدأ بحرف د. أنا مين؟",
    answer: W("ديك", "🐓"),
    harakat: [{ ...W("دَراجة", "🚲"), h: "a" }, { ...W("دُودة", "🪱"), h: "u" }, { ...W("دِيك", "🐓"), h: "i" }, { ...W("هدْهد", "🐦"), h: "o" }],
    forms: [W("دب", "🐻"), W("هدية", "🎁"), W("قرد", "🐒")],
    more: [W("دب", "🐻"), W("دبدوب", "🧸")],
  },
  "ق": {
    riddle: "دى حاجة بنكتب ونرسم بيها، واسمها بيبدأ بحرف ق. هى إيه؟",
    answer: W("قلم", "✏️"),
    harakat: [{ ...W("قَميص", "👕"), h: "a" }, { ...W("قُبعة", "👒"), h: "u" }, { ...W("قِرد", "🐒"), h: "i" }, { ...W("صقْر", "🦅"), h: "o" }],
    forms: [W("قصر", "🏰"), W("عقد", "📿"), W("طبق", "🍽️")],
    more: [W("قطة", "🐱"), W("قلم", "✏️")],
  },
};

/** ترتيب الكتاب: الوحدات بالصفحات (التهيئة · حرفين · ٤ حروف + مراجعة ×٣). */
const letterPg = (ch) => ({ id: "L" + ch, type: "letter", ch });
const reviewPg = (n, letters) => ({ id: "R" + n, type: "review", letters });
export const LB_UNITS = [
  { title: "التهيئة", pages: [{ id: "prep", type: "prep" }] },
  { title: "أ م", pages: ["أ", "م"].map(letterPg) },
  { title: "ب ف ن ل", pages: [...["ب", "ف", "ن", "ل"].map(letterPg), reviewPg(1, ["ب", "ف", "ن", "ل"])] },
  { title: "ح ر ت س", pages: [...["ح", "ر", "ت", "س"].map(letterPg), reviewPg(2, ["ح", "ر", "ت", "س"])] },
  { title: "ج ز د ق", pages: [...["ج", "ز", "د", "ق"].map(letterPg), reviewPg(3, ["ج", "ز", "د", "ق"])] },
];
export const LB_PAGES = LB_UNITS.flatMap((u) => u.pages);
export const LB_ORDER = LB_PAGES.filter((p) => p.type === "letter").map((p) => p.ch);

// ===== أدوات صافية =====
const pickOf = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
function shuffled(rnd, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** الكلمة من غير تشكيل. */
export const bare = (w) => w.replace(/[\u064B-\u0652]/g, "");
/** صور الألف كلها بتتحسب «أ» (أ إ ا آ) — زى الكتاب: أرنب وإصبع وفأس. */
const ALEF = ["أ", "إ", "ا", "آ"];
const same = (a, b) => a === b || (ALEF.includes(a) && ALEF.includes(b));
/** أول حرف فى الكلمة. */
export const firstOf = (w) => bare(w)[0];
export const startsWith = (w, ch) => same(firstOf(w), ch);
/** مكان الحرف فى الكلمة: 0 أول · 1 وسط · 2 آخر (أول ظهور). -1 لو مش فيها. */
export function posOf(w, ch) {
  const b = [...bare(w)];
  const i = b.findIndex((c) => same(c, ch));
  if (i < 0) return -1;
  return i === 0 ? 0 : i === b.length - 1 ? 2 : 1;
}
/** الحروف اللى مابتتوصلش باللى بعدها (ا د ذ ر ز و + الهمزات والتاء المربوطة). */
const NO_JOIN_NEXT = new Set(["ا", "أ", "إ", "آ", "د", "ذ", "ر", "ز", "و", "ؤ", "ة", "ء", "ى"]);
export const joinsNext = (c) => !NO_JOIN_NEXT.has(c);

/** الكلمة متقسّمة حوالين أول ظهور للحرف (عشان الشاشة تلوّنه أو تحط مكانه فراغ). */
export function splitAt(w, ch) {
  const b = [...bare(w)];
  const i = b.findIndex((c) => same(c, ch));
  return { before: b.slice(0, i).join(""), letter: b[i], after: b.slice(i + 1).join("") };
}

/**
 * الكلمة حروف منفصلة للمس — كل حرف بشكله الموصول (ZWJ قبله/بعده) فالكلمة تفضل شكلها.
 * good = أماكن الحرف المطلوب فيها (لو متكرّر أى واحد منهم صح)، idx = أول ظهور.
 */
const ZWJ = "\u200D";
export function letterTiles(w, ch) {
  const b = [...bare(w)];
  const tiles = b.map((c, i) => (i > 0 && joinsNext(b[i - 1]) ? ZWJ : "") + c + (i < b.length - 1 && joinsNext(c) ? ZWJ : ""));
  const good = b.map((c, i) => (same(c, ch) ? i : -1)).filter((i) => i >= 0);
  return { tiles, good, idx: good[0] ?? -1 };
}
/**
 * «حط دايرة حوالين الحرف» (المالك ٢٠٢٦-١٠-١٤): كلمة بتبدأ بالحرف ← كلمة بتنتهى بيه ← كلمة هو فى وسطها.
 * من كلمات الحرف نفسها (أشكال الحرف، وبعدين الباقى) — اللى مالوش كلمة فى مكان معيّن بيتعدّى.
 */
export const CIRCLE_ORDER = [0, 2, 1];
export function circleWords(ch) {
  const L = LB_LETTERS[ch];
  if (!L) return [];
  const pool = [...L.forms, ...L.more, L.answer, ...L.harakat, ...(L.circle || [])].map((x) => ({ w: bare(x.w), e: x.e }));
  return CIRCLE_ORDER.map((pos) => pool.find((x) => posOf(x.w, ch) === pos))
    .filter(Boolean)
    .map((x) => ({ ...x, pos: posOf(x.w, ch), ...letterTiles(x.w, ch) }));
}

/** كل كلمات الكتاب بصورها (من غير تكرار) — للمشتّتات. */
export function allWords() {
  const seen = new Map();
  for (const L of Object.values(LB_LETTERS)) {
    for (const x of [...L.harakat, ...L.forms, ...L.more, L.answer]) {
      const k = bare(x.w);
      if (!seen.has(k)) seen.set(k, { w: k, e: x.e });
    }
  }
  return [...seen.values()];
}
/** كلمات بتبدأ بالحرف (من بيانات الحرف كلها). */
export function wordsStarting(ch) {
  const L = LB_LETTERS[ch];
  const all = [...L.harakat.map((x) => ({ w: bare(x.w), e: x.e })), ...L.forms, ...L.more, L.answer];
  const out = new Map();
  all.filter((x) => startsWith(x.w, ch)).forEach((x) => out.set(bare(x.w), { w: bare(x.w), e: x.e }));
  return [...out.values()];
}
/** كلمات مابتبدأش بالحرف — ولا بصورة متكرّرة مع كلماته. */
function othersNotStarting(ch, rnd, k, avoidEmoji = []) {
  const pool = allWords().filter((x) => !startsWith(x.w, ch) && !avoidEmoji.includes(x.e));
  const out = [];
  for (const x of shuffled(rnd, pool)) {
    if (out.length >= k) break;
    if (!out.some((y) => y.e === x.e)) out.push(x);
  }
  return out;
}
/** حروف الكتاب اللى قبل الحرف ده (اللى الطفل شافها) — وأقل حاجة ٤ حروف للمشتّتات. */
function lettersAround(ch) {
  const i = LB_ORDER.indexOf(ch);
  const before = LB_ORDER.slice(0, i);
  return before.length >= 3 ? before : LB_ORDER.filter((c) => c !== ch).slice(0, 4);
}

// ===== صفحة الحرف: يكتب شوية ويلعب شوية (نفس ترتيب أنشطة الكتاب) =====
export const LB_LETTER_KINDS = ["meet", "write", "riddle", "pop", "harakat", "harakaChoose", "starts", "forms", "missing", "game"];

// ===== الكتابة الكتير (المالك ٢٠٢٦-١٠-١٦: «٣ بالنقط + ٥ لوحده»): النقط ماتتحسبش غير بـ٧٥٪،
// ولوحده غير بـ٧٠٪ — كل مرة بتتحسب لوحدها فى العدّاد (✓ ١/٣) =====
export const LB_DOTS_REPS = 3;
export const LB_ALONE_REPS = [2, 3]; // لوحده: مرتين فى النص و٣ فى الآخر = ٥
export const LB_DOTS_PASS = 75;

/**
 * ألعاب القلعة جوّه صفحة الحرف (المالك ٢٠٢٦-١٠-١٦: «تبقى جزء من المغامرة، وبرّه زى ما هى»):
 * نفس اللعبة بشكلها، بس على حرف الصفحة وجولات أقل.
 */
export const LB_GAMES = ["puzzle", "flash", "eggs", "phonics", "catch", "sequence", "review"];
/** الحروف اللى بتتراجع مع حرف الصفحة: هو + آخر ٣ حروف قبله فى الكتاب. */
export function reviewSet(ch) {
  const i = LB_ORDER.indexOf(ch);
  return [ch, ...LB_ORDER.slice(Math.max(0, i - 3), Math.max(0, i))];
}

export function letterPage(ch, rnd = Math.random, only = null) {
  const L = LB_LETTERS[ch];
  const steps = [];
  const want = (k) => !only || only.includes(k);
  const game = (g) => { if (want("game") || want(g)) steps.push({ kind: "game", game: g, ch, ...(g === "review" ? { set: reviewSet(ch) } : {}), ...(g === "phonics" ? { words: shuffled(rnd, wordsStarting(ch)).slice(0, 3) } : {}) }); };
  const write = (level, reps) => { if (want("write")) steps.push({ kind: "write", ch, level, reps }); };
  // ١) استمع وانطق: الحرف كبير، وميزو بيقول اسمه وصوته (= «تعرّف على الحرف»)
  if (want("meet")) steps.push({ kind: "meet", ch });
  // ٢) ✏️ على النقط ٣ مرات
  write(2, LB_DOTS_REPS);
  // ٣) 🧩 بازل الحرف
  game("puzzle");
  // ٤) فزّورة ميزو (فقاعة الكتاب)
  if (want("riddle")) {
    const wrong = othersNotStarting(ch, rnd, 2, [L.answer.e]);
    steps.push({ kind: "riddle", ch, text: L.riddle, answer: L.answer, options: shuffled(rnd, [L.answer, ...wrong]) });
  }
  // ٥) «لوّن اللى فيه الحرف» (الأرانب/الفراشات/النجوم فى الكتاب)
  if (want("pop")) {
    const others = lettersAround(ch);
    const k = 3 + Math.floor(rnd() * 2); // ٣ أو ٤
    const cells = [...Array(k).fill(0).map(() => ({ ch, good: true })),
      ...Array(8 - k).fill(0).map(() => ({ ch: pickOf(rnd, others), good: false }))];
    steps.push({ kind: "pop", ch, cells: shuffled(rnd, cells) });
  }
  // ٦) 🔦 الكشّاف
  game("flash");
  // ٧) استمع واكتب الحرف بالحركات: الكلمات الأربعة (فتحة · ضمة · كسرة · سكون)
  if (want("harakat")) steps.push({ kind: "harakat", ch, words: L.harakat.map((x) => ({ ...x, s: syl(ch === "أ" && x.h === "i" ? "إ" : ch, x.h) })) });
  // ٨) اختر الصوت المناسب للصورة (فتحة/ضمة/كسرة)
  if (want("harakaChoose")) {
    const opts = ["a", "u", "i"].map((h) => ({ h, s: syl(ch === "أ" && h === "i" ? "إ" : ch, h) }));
    const rounds = shuffled(rnd, L.harakat.filter((x) => x.h !== "o")).map((x) => ({ ...x, options: shuffled(rnd, opts) }));
    steps.push({ kind: "harakaChoose", ch, rounds });
  }
  // ٩) ✏️ لوحده مرتين
  write(3, LB_ALONE_REPS[0]);
  // ١٠) 🥚 بيض المفاجآت
  game("eggs");
  // ١١) ضع دائرة حول الصورة اللى بتبدأ بالحرف
  if (want("starts")) {
    const good = shuffled(rnd, wordsStarting(ch)).slice(0, 3);
    const bad = othersNotStarting(ch, rnd, 3, good.map((x) => x.e));
    steps.push({ kind: "starts", ch, items: shuffled(rnd, [...good.map((x) => ({ ...x, good: true })), ...bad.map((x) => ({ ...x, good: false }))]) });
  }
  // ١٢) 🔤 بأى حرف تبدأ؟
  game("phonics");
  // ١٣) لاحظ أشكال الحرف: أول · وسط · آخر الكلمة (الحرف ملوّن والطفل يلمسه)
  if (want("forms")) steps.push({ kind: "forms", ch, words: L.forms.map((x) => ({ ...x, pos: posOf(x.w, ch), ...splitAt(x.w, ch) })) });
  // ١٣ب) حط دايرة حوالين الحرف: فى أول الكلمة ← آخرها ← وسطها (المالك ٢٠٢٦-١٠-١٤)
  if (want("circle")) {
    const words = circleWords(ch);
    if (words.length) steps.push({ kind: "circle", ch, words });
  }
  // ١٤) 🎯 اصطياد الحروف
  game("catch");
  // ١٥) اكتب الحرف الناقص فى الكلمة
  if (want("missing")) {
    // أ: الكلمات اللى فيها «أ» نفسها (مش «ا» زى كتاب) — عشان الحرف اللى يختاره هو اللى يتكتب
    const fits = L.forms.filter((f) => splitAt(f.w, ch).letter === ch);
    const x = pickOf(rnd, fits.length ? fits : L.forms);
    const others = shuffled(rnd, lettersAround(ch)).slice(0, 2);
    steps.push({ kind: "missing", ch, ...x, ...splitAt(x.w, ch), options: shuffled(rnd, [ch, ...others]) });
  }
  // ١٦) 🔠 الحرف الناقص فى الحروف (أ ب ؟)
  game("sequence");
  // ١٧) ✏️ لوحده ٣ مرات
  write(3, LB_ALONE_REPS[1]);
  // ١٨) 🧠 المراجعة الذكية: الحرف ده + اللى قبله — وبعدها شهادة الحرف
  game("review");
  return steps;
}

// ===== التهيئة: خطوط قبل الحروف + «صل الصورة بظلها» (أول صفحات الكتاب) =====
export const LB_SHADOWS = [W("أسد", "🦁"), W("زرافة", "🦒"), W("فراولة", "🍓"), W("موز", "🍌"), W("فيل", "🐘"), W("بطة", "🦆"), W("سلحفاة", "🐢"), W("ببغاء", "🦜")];
export function prepPage(rnd = Math.random, only = null) {
  const want = (k) => !only || only.includes(k);
  const steps = [];
  const shadow = () => {
    const pick = shuffled(rnd, LB_SHADOWS).slice(0, 3);
    return { kind: "shadow", pairs: pick, shadows: shuffled(rnd, pick) };
  };
  if (want("shadow")) steps.push(shadow());
  if (want("write")) steps.push({ kind: "write", ch: "pre:hline", level: 1 });
  if (want("write")) steps.push({ kind: "write", ch: "pre:zigzag", level: 1 });
  if (want("shadow")) steps.push(shadow());
  if (want("write")) steps.push({ kind: "write", ch: "pre:wave", level: 1 });
  if (want("write")) steps.push({ kind: "write", ch: "pre:circle", level: 1 });
  return steps;
}

// ===== المراجعة «أنا تعلمت» =====
/** كلمات من حرفين (انطق ثم اكتب الكلمة — قطع البازل). */
export const LB_BUILD = [
  { a: "أ", b: "م", ...W("أم", "👩") },
  { a: "أ", b: "ب", ...W("أب", "👨") },
  { a: "ف", b: "م", ...W("فم", "👄") },
  { a: "د", b: "ب", ...W("دب", "🐻") },
  { a: "ي", b: "د", ...W("يد", "✋") },
];
export const LB_REVIEW_KINDS = ["colorLearned", "matchFirst", "sameSound", "position", "harakaPic", "build"];

export function reviewPage(letters, rnd = Math.random, only = null) {
  const want = (k) => !only || only.includes(k);
  const steps = [];
  // ١) لوّن الحروف اللى اتعلمناها (من وسط حروف تانية)
  if (want("colorLearned")) {
    const other = shuffled(rnd, LB_ORDER.filter((c) => !letters.includes(c))).slice(0, 4);
    steps.push({ kind: "colorLearned", letters, cells: shuffled(rnd, [...letters.map((ch) => ({ ch, good: true })), ...other.map((ch) => ({ ch, good: false }))]) });
  }
  // ٢) صل كل صورة بالحرف الأول
  if (want("matchFirst")) {
    const pics = letters.map((ch) => ({ ch, ...pickOf(rnd, wordsStarting(ch)) }));
    steps.push({ kind: "matchFirst", pics: shuffled(rnd, pics), letters: shuffled(rnd, letters) });
  }
  // ٣) انطق ولوّن الصورتين اللى بيبدأوا بنفس الصوت (٣ صفوف)
  if (want("sameSound")) {
    const rows = shuffled(rnd, letters).slice(0, 3).map((ch) => {
      const two = shuffled(rnd, wordsStarting(ch)).slice(0, 2);
      const odd = othersNotStarting(ch, rnd, 1, two.map((x) => x.e))[0];
      return { ch, items: shuffled(rnd, [...two.map((x) => ({ ...x, good: true })), { ...odd, good: false }]) };
    });
    steps.push({ kind: "sameSound", rows });
  }
  // ٤) استمع وارسم دائرة فى موضع الحرف فى الكلمة (أول/وسط/آخر)
  if (want("position")) {
    const rounds = shuffled(rnd, letters).slice(0, 3).map((ch) => {
      const x = pickOf(rnd, LB_LETTERS[ch].forms);
      return { ch, ...x, pos: posOf(x.w, ch) };
    });
    steps.push({ kind: "position", rounds });
  }
  // ٥) اقرأ ولوّن الصورة المناسبة: «بُ» ← بُرتقال مش بَقرة
  if (want("harakaPic")) {
    const rounds = shuffled(rnd, letters).slice(0, 3).map((ch) => {
      const [x, y] = shuffled(rnd, LB_LETTERS[ch].harakat.filter((v) => v.h !== "o"));
      return { ch, s: syl(ch, x.h), h: x.h, options: shuffled(rnd, [{ ...x, good: true }, { ...y, good: false }]) };
    });
    steps.push({ kind: "harakaPic", rounds });
  }
  // ٦) انطق ثم اكتب الكلمة: حرف + حرف = كلمة (اختار صورتها)
  if (want("build")) {
    const pool = LB_BUILD.filter((b) => letters.includes(b.a) || letters.includes(b.b));
    const it = pickOf(rnd, pool.length ? pool : LB_BUILD);
    const wrong = shuffled(rnd, LB_BUILD.filter((b) => b.w !== it.w)).slice(0, 2);
    steps.push({ kind: "build", ...it, options: shuffled(rnd, [it, ...wrong]) });
  }
  return steps;
}

/** خطوات أى صفحة من LB_PAGES. */
export function letterbookSteps(page, rnd = Math.random, only = null) {
  if (page.type === "prep") return prepPage(rnd, only);
  if (page.type === "review") return reviewPage(page.letters, rnd, only);
  return letterPage(page.ch, rnd, only);
}
export const isLbWrite = (s) => s.kind === "write";
