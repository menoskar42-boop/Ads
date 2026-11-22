// ===== ستّ ألعاب «شكل الحرف فى أول ووسط وآخر الكلمة» (المالك ٢٠٢٦-١٠-٢٧) =====
// المالك: «تعليم الحروف العربى للأطفال بيشمل الحرف لما بيجى فى أول الكلمة وفى نصها وفى آخرها
// شكله بيبقى إيه… أفكار مبتكرة لطفل ٣–٤ سنين»، وبعدها: «الست ألعاب دول تعملهم منفصلين وتدمجهم
// فى كراسة الحروف مع كل حرف». الألعاب:
//   hands       🤝 الحرف بيمسك إيد صاحبه — الحروف منفصلة، يلمس الحرف فيمسك إيد جيرانه وشكله يتغيّر
//   formComplete 🧩 كمّل الكلمة بالشكل الصح — الاختيارات أشكال نفس الحرف (بـ ـبـ ـب)
//   formListen  🚂 اسمع وحط فى العربية — الكلمة بالصوت بس، والحرف فى عربية الأول ولا الوسط ولا الآخر
//   nameHunt    📛 دوّر على حروف اسمك — اسم الطفل نفسه
//   formStamp   🔖 ختم الحرف — ٣ أختام لأشكال الحرف و٣ كلمات ناقصة
//   formTrace   ✍️ اكتب الحرف وهو ماسك إيد صاحبه — تتبّع الشكل الموصول
//
// ملف صافى (من غير DOM) — الشاشة فى games/formsPlay.js، والاختبار بيستورده مباشرة.
import { ARABIC_LETTERS } from "./arabicLetters.js";
import { LB_LETTERS, LB_ORDER, nameOf, bare, splitAt, posOf, joinsNext, letterTiles } from "./letterbook.js";

export const LF_KINDS = ["hands", "formComplete", "formListen", "nameHunt", "formStamp", "formTrace"];
export const LF_TITLES = {
  hands: "🤝 الحرف بيمسك إيد صاحبه",
  formComplete: "🧩 كمّل الكلمة بالشكل الصح",
  formListen: "🚂 اسمع وحط فى العربية",
  nameHunt: "📛 دوّر على حروف اسمك",
  formStamp: "🔖 ختم الحرف",
  formTrace: "✍️ اكتب الحرف وهو ماسك إيد صاحبه",
};
/** حروف الكراسة (كل حرف ليه كلمة فى أول ووسط وآخر الكلمة). */
export const LF_LETTERS = LB_ORDER.filter((ch) => LB_LETTERS[ch] && LB_LETTERS[ch].forms);

const TATWEEL = "ـ";
const ALEF = /[أإآا]/;
const same = (a, b) => a === b || (ALEF.test(a) && ALEF.test(b));

const shuffled = (rnd, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/**
 * شكل الحرف جوّه الكلمة زى ما بيتكتب فعلاً — من جيرانه مش من مكانه بس:
 * «قرد» الدال فى الآخر بس شكلها «د» (الراء مابتمسكش اللى بعدها)، و«جزر» الزاى فى النص وشكلها «ـز».
 */
export function shapeIn(w, ch) {
  const { before, letter, after } = splitAt(w, ch);
  if (letter == null) return null;
  const joinsPrev = !!before && joinsNext(before[before.length - 1]);
  const joinsAfter = !!after && joinsNext(letter);
  return {
    before, letter, after,
    pos: posOf(w, ch),
    joinsPrev, joinsAfter,
    shape: (joinsPrev ? TATWEEL : "") + letter + (joinsAfter ? TATWEEL : ""),
  };
}

/** أشكال الحرف: اللى بيمسك إيد اللى بعده ليه ٣ (بـ ـبـ ـب)، واللى بإيد واحدة ليه شكلين (د ـد). */
export function shapesOf(letter) {
  return joinsNext(letter) ? [letter + TATWEEL, TATWEEL + letter + TATWEEL, TATWEEL + letter] : [letter, TATWEEL + letter];
}

/** كلمات الحرف فى أول ووسط وآخر الكلمة (من «لاحظ أشكال الحرف» فى الكراسة) بشكله جوّه كل كلمة. */
export function formWords(ch) {
  const L = LB_LETTERS[ch];
  if (!L || !L.forms) return [];
  return L.forms.map((x) => ({ w: bare(x.w), e: x.e, ...shapeIn(x.w, ch) })).filter((x) => x.letter);
}

/** 🧩 كمّل الكلمة: الكلمات بترتيب عشوائى، والاختيارات أشكال نفس الحرف (الصح واحد منهم). */
export function completeRounds(ch, rnd = Math.random) {
  // الشكل الصح دايماً موجود (تفاح: الحاء بعد الألف شكلها كامل «ح» مش من التلاتة)، ولحد ٣ اختيارات
  return shuffled(rnd, formWords(ch)).map((x) => ({ ...x, options: shuffled(rnd, [...new Set([x.shape, ...shapesOf(x.letter)])].slice(0, 3)) }));
}

/** 🚂 اسمع وحط فى العربية: نفس الكلمات بترتيب عشوائى — الإجابة مكان الحرف (0 أول · 1 وسط · 2 آخر). */
export function listenRounds(ch, rnd = Math.random) {
  return shuffled(rnd, formWords(ch)).map((x) => ({ w: x.w, e: x.e, pos: x.pos, before: x.before, letter: x.letter, after: x.after }));
}

/** 🔖 ختم الحرف: الكلمات التلاتة مرة واحدة، والأختام = كل الأشكال اللى محتاجينها + باقى أشكال الحرف. */
export function stampBoard(ch, rnd = Math.random) {
  const words = shuffled(rnd, formWords(ch));
  const need = [...new Set(words.map((x) => x.shape))];
  const extra = shapesOf(words[0] ? words[0].letter : ch).filter((s) => !need.includes(s));
  return { words, stamps: shuffled(rnd, [...need, ...extra].slice(0, Math.max(3, need.length))) };
}

/** ✍️ اكتب الحرف وهو ماسك إيد صاحبه: كل كلمة وشكل الحرف اللى يتتبّعه. */
export function traceItems(ch) {
  return formWords(ch);
}

/** 🤝 الحرف بيمسك إيد صاحبه: الكلمة حروف منفصلة، والحرف المطلوب مكانه، وليه مسك إيد مين. */
export function handsRounds(ch) {
  return formWords(ch).map((x) => {
    const letters = [...x.w];
    const at = letters.findIndex((c) => same(c, ch));
    return { ...x, letters, at, how: handsHow(x) };
  });
}
/** ليه شكل الحرف كده — كل حالة ليها جملة ميزو (LF_SAY.how). */
export function handsHow(x) {
  if (x.joinsPrev && x.joinsAfter) return "both";
  if (!x.joinsPrev && x.joinsAfter) return "after";
  if (x.joinsPrev && !x.joinsAfter) return x.after ? "oneHand" : "lastBefore";
  // مش ماسك حد خالص
  if (!x.before) return "firstAlone";  // دب · رسام · زهرة · أسد: أول الكلمة وبإيد واحدة
  return "prevNoHand";                 // قرد · موز: اللى قبله مابيمسكش إيد حد
}

/** حروف الاسم (أ إ آ ا = أ) — اللى ليها اسم حرف فى التطبيق بس (من غير ة ى ء). */
const nameLetterChar = (c) => (ALEF.test(c) ? "أ" : c);
export function nameLetters(name) {
  const known = new Set(ARABIC_LETTERS.map((x) => x.char));
  const out = [];
  for (const c of [...bare(String(name || "")).replace(/\s+/g, "")]) {
    const k = nameLetterChar(c);
    if (known.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}
/** 📛 جولة «دوّر على حرف … فى اسمك» (null لو الحرف مش فى الاسم). */
export function nameRound(name, ch) {
  const w = bare(String(name || "")).replace(/\s+/g, "");
  if (!w || ![...w].some((c) => same(c, ch))) return null;
  const t = letterTiles(w, ch);
  return { ch, w, ...t, positions: t.good.map((i) => (i === 0 ? 0 : i === w.length - 1 ? 2 : 1)) };
}
/** 📛 اللعبة لوحدها: حروف الاسم واحد واحد (لحد ٦). */
export function nameRounds(name, max = 6) {
  return nameLetters(name).slice(0, max).map((ch) => nameRound(name, ch)).filter(Boolean);
}

// ===== جمل ميزو — كلها بتتسجّل صوت مرة واحدة (server/tts-games.js) بصيغة الولد والبنت =====
export const LF_POS = ["فى أول الكلمة", "فى وسط الكلمة", "فى آخر الكلمة"];
export const LF_CAR = ["الأول", "الوسط", "الآخر"];
export const LF_SAY = {
  choose: "اختار الحرف اللى هنلعب بيه",
  // 🤝
  hands: (name) => `حرف ${name} لوحده. المسه عشان يمسك إيد أصحابه فى الكلمة`,
  how: {
    both: "شوف! الحرف مسك إيد اللى قبله واللى بعده، فشكله اتغيّر",
    after: "الحرف فى أول الكلمة، فمسك إيد اللى بعده بس",
    lastBefore: "الحرف فى آخر الكلمة، فمسك إيد اللى قبله بس",
    oneHand: "الحرف ده بإيد واحدة. مسك إيد اللى قبله، ومابيمسكش إيد اللى بعده",
    firstAlone: "الحرف ده بإيد واحدة، ومفيش حد قبله، فشكله زى ما هو",
    prevNoHand: "الحرف اللى قبله مابيمسكش إيد حد، فالحرف فضل بشكله الكامل",
  },
  // 🧩
  complete: (name) => `اختار شكل حرف ${name} اللى يكمّل الكلمة`,
  completeWrong: "ده شكل تانى للحرف. بص كويس: الحرف فى أول الكلمة ولا وسطها ولا آخرها؟",
  // 🚂
  listen: (name) => `اسمع الكلمة كويس. حرف ${name} فى أولها ولا وسطها ولا آخرها؟`,
  listenWrong: "اسمع تانى كويس، واختار العربية الصح",
  // 📛
  name: (name) => `دوّر على حرف ${name} فى اسمك`,
  nameWrong: (name) => `ده حرف تانى. دوّر على حرف ${name}`,
  noName: "اكتب اسمك الأول، وبعدين نلعب بحروفه",
  nameTitle: "اسمك",
  // 🔖
  stamp: (name) => `اختار ختم، وبعدين المس مكان حرف ${name} فى الكلمة`,
  stampPick: "اختار ختم الأول",
  stampWrong: "الختم ده مش مقاسه. جرّب ختم تانى",
  // ✍️
  trace: (name) => `اكتب حرف ${name} وهو ماسك إيد أصحابه`,
  traceDone: "برافو! كتبته وهو ماسك الإيد",
  traceMore: "كمّل على الحرف كله",
  traceOut: "الخط خرج بره الحرف. نمسح ونرسم تانى على الخط الفاتح",
};

/** كل جمل الألعاب الستة (للتسجيل الصوتى). */
export function lfPhrases() {
  const out = new Set([LF_SAY.choose, LF_SAY.completeWrong, LF_SAY.listenWrong, LF_SAY.noName, LF_SAY.stampPick, LF_SAY.stampWrong,
    LF_SAY.traceDone, LF_SAY.traceMore, LF_SAY.traceOut, ...Object.values(LF_SAY.how), ...LF_POS]);
  for (const ch of LF_LETTERS) {
    const name = nameOf(ch);
    [LF_SAY.hands(name), LF_SAY.complete(name), LF_SAY.listen(name), LF_SAY.stamp(name), LF_SAY.trace(name)].forEach((t) => out.add(t));
    for (const x of formWords(ch)) out.add(x.w);
  }
  for (const { char } of ARABIC_LETTERS) { const name = nameOf(char); out.add(LF_SAY.name(name)); out.add(LF_SAY.nameWrong(name)); }
  return [...out];
}
