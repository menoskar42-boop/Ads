// ===== «كمّل الكلمة بإيدك» — اكتب الحرف الناقص فى مكانه (المالك ٢٠٢٦-١٠-٣١) =====
// المالك (صورة امتحان بنته): «خلوها تكتب الحرف فى مواضع الكلمه المختلفه — ده معندناش، كتابه عندنا نحط دايره بس.
// عاوز تضيف التدريبات دى لكل الحروف العربيه و الانجليزيه كما بالصوره: تنطق الكلمه و تسيب مكان الحرف فاضى».
// الطفل بيشوف الصورة ويسمع الكلمة، والكلمة مكتوبة ومكان الحرف فاضى، وهو يكتب الحرف **بإيده** بشكله الصح جوّه
// الكلمة (بـ ـبـ ـب) — مش يختاره. ٣ مستويات مساعدة: الشكل فاتح يمشى عليه · محيط منقّط · مربع فاضى زى الامتحان.
//
// العربى: الـ١٤ حرف اللى فى «كراسة الحروف» من كلماتها (أشكال الحرف)، والـ١٤ التانيين كلماتهم هنا — كل حرف
// كلمة الحرف فيها فى الأول والوسط والآخر (ظ مالهاش كلمة صورتها واضحة بتنتهى بيها، فليها اتنين).
// الإنجليزى: زى الامتحان «Supply the missing letter» — أول حرف (و X فى الآخر: box/fox/six زى الكتاب).
//
// ملف صافى (من غير DOM) — الشاشة فى games/blankWrite.js، والاختبار tests/blank-write.test.mjs.
import { ARABIC_LETTERS } from "./arabicLetters.js";
import { LB_LETTERS, nameOf, bare, joinsNext } from "./letterbook.js";
import { formWords, shapesOf, handsHow, LF_POS } from "./letterForms.js";

const TATWEEL = "ـ";
const ALEF = /[أإآا]/;
const same = (a, b) => a === b || (ALEF.test(a) && ALEF.test(b));

/** الحروف العربى بترتيب الأبجدية (من غير الهمزة لوحدها). */
export const BW_AR_LETTERS = ARABIC_LETTERS.map((x) => x.char);
export const BW_EN_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// at: start | mid | end — مكان الحرف فى الكلمة (لو الحرف متكرّر: «مثلث» الآخر يعنى التانية)
const A = (w, e, at) => ({ w, e, at });
/** كلمات الحروف اللى مش فى «كراسة الحروف» — صورة واضحة لطفل، والحرف فى المكان المكتوب. */
export const BW_AR_EXTRA = {
  "ث": [A("ثعلب", "🦊", "start"), A("كمثرى", "🍐", "mid"), A("مثلث", "🔺", "end")],
  "خ": [A("خروف", "🐑", "start"), A("نخلة", "🌴", "mid"), A("بطيخ", "🍉", "end")],
  "ذ": [A("ذرة", "🌽", "start"), A("حذاء", "👞", "mid"), A("تلميذ", "🧑‍🎓", "end")],
  "ش": [A("شمس", "☀️", "start"), A("عشب", "🌿", "mid"), A("ريش", "🪶", "end")],
  "ص": [A("صقر", "🦅", "start"), A("عصفور", "🐦", "mid"), A("مقص", "✂️", "end")],
  "ض": [A("ضفدع", "🐸", "start"), A("بيضة", "🥚", "mid"), A("أرض", "🌍", "end")],
  "ط": [A("طائرة", "✈️", "start"), A("بطة", "🦆", "mid"), A("قط", "🐈", "end")],
  "ظ": [A("ظرف", "✉️", "start"), A("نظارة", "👓", "mid")],
  "ع": [A("عين", "👁️", "start"), A("شمعة", "🕯️", "mid"), A("ضفدع", "🐸", "end")],
  "غ": [A("غزال", "🦌", "start"), A("بغبغان", "🦜", "mid"), A("دماغ", "🧠", "end")],
  "ك": [A("كلب", "🐕", "start"), A("سكين", "🔪", "mid"), A("سمك", "🐟", "end")],
  "ه": [A("هدية", "🎁", "start"), A("فهد", "🐆", "mid"), A("وجه", "🙂", "end")],
  "و": [A("وردة", "🌹", "start"), A("حوت", "🐋", "mid"), A("دلو", "🪣", "end")],
  "ي": [A("يد", "✋", "start"), A("فيل", "🐘", "mid"), A("كرسي", "🪑", "end")],
};

/** مكان الحرف فى الكلمة حسب `at` (أول/وسط/آخر ظهور مناسب) — -1 لو مش هناك. */
export function indexAt(w, ch, at) {
  const b = [...bare(w)];
  const last = b.length - 1;
  if (at === "start") return same(b[0], ch) ? 0 : -1;
  if (at === "end") return same(b[last], ch) ? last : -1;
  for (let i = 1; i < last; i++) if (same(b[i], ch)) return i;
  return -1;
}

/** الكلمة متقسّمة حوالين الحرف رقم i + شكله جوّه الكلمة (من جيرانه: «قرد» الدال شكلها «د»). */
export function shapeAtIndex(w, i) {
  const b = [...bare(w)];
  const letter = b[i];
  const before = b.slice(0, i).join(""), after = b.slice(i + 1).join("");
  const joinsPrev = !!before && joinsNext(before[before.length - 1]);
  const joinsAfter = !!after && joinsNext(letter);
  const pos = i === 0 ? 0 : i === b.length - 1 ? 2 : 1;
  const x = { w: b.join(""), before, letter, after, pos, joinsPrev, joinsAfter };
  return { ...x, shape: (joinsPrev ? TATWEEL : "") + letter + (joinsAfter ? TATWEEL : ""), how: handsHow(x) };
}

/** جولات حرف عربى: كلمة لكل مكان، مرتّبة أول ← وسط ← آخر. */
export function arItems(ch) {
  const extra = BW_AR_EXTRA[ch];
  const out = extra
    ? extra.map((x) => { const i = indexAt(x.w, ch, x.at); return i < 0 ? null : { e: x.e, ...shapeAtIndex(x.w, i) }; }).filter(Boolean)
    : formWords(ch).map((x) => ({ e: x.e, ...shapeAtIndex(x.w, [...x.w].findIndex((c) => same(c, ch))), how: handsHow(x) }));
  return out.sort((a, b) => a.pos - b.pos);
}

/** أشكال الحرف اللى ممكن الطفل يكتبها بدل الصح (عشان ميزو يقوله «ده شكله فى مكان تانى»). */
export function arShapes(letter) {
  return [...new Set([letter, ...shapesOf(letter)])];
}

const E = (w, e) => ({ w, e });
/** الإنجليزى: ٣ كلمات قصيرة صورتها واضحة لكل حرف — الحرف الناقص أوله (X آخره). */
export const BW_EN_WORDS = {
  A: [E("ant", "🐜"), E("apple", "🍎"), E("arm", "💪")],
  B: [E("bag", "👜"), E("ball", "⚽"), E("bus", "🚌")],
  C: [E("cat", "🐈"), E("cup", "🥤"), E("car", "🚗")],
  D: [E("dog", "🐕"), E("duck", "🦆"), E("doll", "🪆")],
  E: [E("egg", "🥚"), E("elephant", "🐘"), E("ear", "👂")],
  F: [E("fish", "🐟"), E("frog", "🐸"), E("fox", "🦊")],
  G: [E("goat", "🐐"), E("gift", "🎁"), E("girl", "👧")],
  H: [E("hat", "🎩"), E("hen", "🐔"), E("house", "🏠")],
  I: [E("ink", "🖋️"), E("insect", "🐛"), E("igloo", "🧊")],
  J: [E("jam", "🍯"), E("juice", "🧃"), E("jacket", "🧥")],
  K: [E("kite", "🪁"), E("key", "🔑"), E("king", "🤴")],
  L: [E("lion", "🦁"), E("leg", "🦵"), E("lemon", "🍋")],
  M: [E("map", "🗺️"), E("moon", "🌙"), E("milk", "🥛")],
  N: [E("nest", "🪺"), E("nose", "👃"), E("net", "🥅")],
  O: [E("octopus", "🐙"), E("orange", "🍊"), E("owl", "🦉")],
  P: [E("pen", "🖊️"), E("pig", "🐖"), E("pizza", "🍕")],
  Q: [E("queen", "👸"), E("quack", "🦆"), E("question", "❓")],
  R: [E("rat", "🐀"), E("ring", "💍"), E("robot", "🤖")],
  S: [E("sun", "☀️"), E("star", "⭐"), E("sock", "🧦")],
  T: [E("train", "🚆"), E("tree", "🌳"), E("tent", "⛺")],
  U: [E("umbrella", "☂️"), E("unicorn", "🦄"), E("up", "⬆️")],
  V: [E("van", "🚐"), E("vase", "🏺"), E("violin", "🎻")],
  W: [E("whale", "🐋"), E("web", "🕸️"), E("watch", "⌚")],
  X: [E("box", "📦"), E("fox", "🦊"), E("six", "6️⃣")],
  Y: [E("yarn", "🧶"), E("yam", "🍠"), E("yellow", "💛")],
  Z: [E("zebra", "🦓"), E("zoo", "🦒"), E("zero", "0️⃣")],
};
/** جولات حرف إنجليزى: الحرف الصغير مكانه فاضى (_un). */
export function enItems(ch) {
  const lo = ch.toLowerCase();
  return (BW_EN_WORDS[ch] || []).map((x) => {
    const i = ch === "X" ? x.w.lastIndexOf(lo) : x.w.indexOf(lo);
    return { w: x.w, e: x.e, before: x.w.slice(0, i), letter: lo, after: x.w.slice(i + 1), pos: i === 0 ? 0 : i === x.w.length - 1 ? 2 : 1 };
  });
}

/** المستويات بالترتيب: كل جولة مستوى أصعب من اللى قبلها، والأخيرة دايماً مربع فاضى زى الامتحان
 *  (٣ كلمات ⇒ ١ ٢ ٣ · كلمتين ⇒ ٢ ٣). */
export const levelFor = (round, total) => Math.max(1, 3 - (total - 1 - round));

// ===== جمل ميزو — كلها بتتسجّل صوت مرة واحدة (server/tts-games.js) بصيغة الولد والبنت =====
export const BW_SAY = {
  title: "✍️ كمّل الكلمة بإيدك",
  titleEn: "✍️ Supply the missing letter",
  choose: "اختار الحرف اللى هنكمّل بيه الكلمات",
  ask: (name, pos) => `اسمع الكلمة، واكتب حرف ${name} مكانه ${LF_POS[pos]}`,
  askEn: "اسمع الكلمة، واكتب الحرف الناقص",
  level: {
    1: "امشى على الحرف الفاتح",
    2: "اكتب الحرف على النقط",
    3: "اكتب الحرف لوحدك زى الامتحان",
  },
  more: "كمّل الحرف كله",
  out: "شكلك خرج بره الحرف. امسح وجرّب تانى",
  wrongShape: (pos) => `ده شكل تانى للحرف. هنا الحرف ${LF_POS[pos]}`,
  peek: "بص على الحرف كويس، وبعدين اكتبه",
  done: "برافو! الكلمة كملت",
};

/** كل الجمل اللى ممكن تتقال (لتسجيل الصوت مرة واحدة). */
export function bwPhrases() {
  const out = new Set([BW_SAY.choose, BW_SAY.askEn, BW_SAY.more, BW_SAY.out, BW_SAY.peek, BW_SAY.done, ...Object.values(BW_SAY.level)]);
  for (const ch of BW_AR_LETTERS) {
    const name = nameOf(ch);
    for (const x of arItems(ch)) { out.add(BW_SAY.ask(name, x.pos)); out.add(x.w); }
  }
  for (const p of [0, 1, 2]) out.add(BW_SAY.wrongShape(p));
  for (const ch of BW_EN_LETTERS) for (const x of enItems(ch)) out.add(x.w);
  return [...out];
}
export { nameOf, LB_LETTERS };
