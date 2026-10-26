// ===== «صور الحروف» و«اكتب من الذاكرة» (المالك ٢٠٢٦-١٠-٢٦) =====
// المالك: «نظام يحفظ الطفل الاشكال اللى بتبدأ بحرف… تقوله لؤلؤ بيبدأ بحرف ايه فالطفل يختار ل»،
// و«بنتى بتنسى شكل الحرف… لما ورتها الحرف افتكرته… عاوز ميزو يقول الحرف و بعدين هى تكتبه
// — للحروف اللى خدنا فيها نجمة». نفس اللعبتين للعربى والإنجليزى، فى القلعتين وجوّه الكتابين.
//
// ملف صافى (من غير DOM) — الشاشة فى games/letterRecall.js، والاختبار بيستورده مباشرة.
import { ARABIC_LETTERS } from "./arabicLetters.js";
import { LB_LETTERS, LB_PAGES, nameOf } from "./letterbook.js";
import { EB_PAGES, EB_WORDS, emojiOf, wordsStarting, starredLetterPages } from "./englishbook.js";

const TASHKEEL = /[ً-ْٰ]/g;
const bare = (w) => String(w).replace(TASHKEEL, "");
// الألف بأشكالها حرف واحد فى الكتاب (أسد · إصبع · آية)
const sameAr = (a, b) => a === b || (/[أإآا]/.test(a) && /[أإآا]/.test(b));
const P = (w, e) => ({ w, e });
export const AR_PIC_EXTRA = {
  // صور ناقصة كانت فى الكتاب اللى المالك بعته (حرف ل): لعبة
  "ل": [P("لعبة", "🧸")],
  // الحروف اللى مش فى «كراسة الحروف» لسه — كل حرف ليه كلمة واحدة بس، فبنكمّلهم ٣ صور
  "ث": [P("ثوم", "🧄"), P("ثلج", "❄️")],
  "خ": [P("خيار", "🥒"), P("خبز", "🍞")],
  "ذ": [P("ذرة", "🌽"), P("ذبابة", "🪰")],
  "ش": [P("شجرة", "🌳"), P("شاى", "🍵")],
  "ص": [P("صقر", "🦅"), P("صندوق", "📦")],
  "ض": [P("ضرس", "🦷"), P("ضابط", "👮")],
  "ط": [P("طماطم", "🍅"), P("طبلة", "🥁")],
  "ظ": [P("ظفر", "💅")],
  "ع": [P("عين", "👁️"), P("عسل", "🍯")],
  "غ": [P("غوريلا", "🦍"), P("غيمة", "☁️")],
  "ك": [P("كتاب", "📖"), P("كرة", "⚽")],
  "ه": [P("هلال", "🌙")],
  "و": [P("ولد", "👦"), P("وجه", "🙂")],
  "ي": [P("يخت", "🛥️"), P("يمامة", "🕊️")],
};

/** صور كلمات بتبدأ بالحرف — العربى من «كراسة الحروف» + كلمة الحرف، والإنجليزى من «كتاب الإنجليزى». */
export function picturesFor(lang, ch) {
  const out = [];
  const seen = new Set();
  const add = (w, e) => {
    const k = bare(w);
    if (!e || e === "❓" || seen.has(k)) return;
    seen.add(k);
    out.push({ w: lang === "ar" ? k : w, e });
  };
  if (lang === "ar") {
    const lb = LB_LETTERS[ch];
    const base = ARABIC_LETTERS.find((x) => x.char === ch);
    const pool = [
      ...(lb ? [lb.answer, ...lb.harakat, ...lb.more, ...(lb.forms || [])] : []),
      ...(AR_PIC_EXTRA[ch] || []),
      ...(base ? [{ w: base.word, e: base.emoji }] : []),
    ];
    for (const p of pool) if (p && sameAr(bare(p.w)[0], ch)) add(p.w, p.e);
  } else {
    const pg = EB_PAGES.find((p) => p.type === "letter" && p.ch === ch);
    if (pg && pg.pos === "end") return []; // X: الصوت فى الآخر — «بيبدأ بإيه؟» مالهاش معنى
    for (const w of [...(pg ? pg.words : []), ...wordsStarting(ch)]) {
      if (w[0].toUpperCase() === ch && !["eyes", "ears", "in", "up", "under", "quiet", "kick", "nap", "sit", "food", "drink", "numbers", "elbow", "tap", "zero", "six"].includes(w)) add(w, emojiOf(w));
    }
  }
  return out;
}

/** الحروف اللى عليها نجمة (خلّصها فى الكتاب مرة على الأقل). */
export function starredLetters(lang, done) {
  if (lang === "ar") return LB_PAGES.filter((p) => p.type === "letter" && done && done[p.id]).map((p) => p.ch);
  return starredLetterPages(done).map((p) => p.ch);
}

/** كل الحروف اللى ليها صورتين على الأقل — المتنجّمة الأول. */
export function pickableLetters(lang, starred = []) {
  const all = lang === "ar" ? ARABIC_LETTERS.map((x) => x.char) : [...new Set(EB_PAGES.filter((p) => p.type === "letter").map((p) => p.ch))];
  const ok = all.filter((c) => picturesFor(lang, c).length >= 2);
  return [...starred.filter((c) => ok.includes(c)), ...ok.filter((c) => !starred.includes(c))];
}

export const letterName = (lang, ch) => (lang === "ar" ? nameOf(ch) : ch);

const shuffle = (rnd, a) => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
};

export const PIC_ROUNDS = 6;

/**
 * جولات «صور الحروف» على حرف `ch` (أو على كل الحروف فى `letters` لو ch = null):
 *   letter  → صورة وكلمتها، والطفل يختار حرفها الأول من ٣ حروف
 *   picture → «اختار الصورة اللى بتبدأ بحرف …» من ٣ صور (صورة واحدة بس صح)
 * الاتنين بالتبادل. والحروف الغلط من `letters` (حروف الطفل) الأول، ولو ناقصة من باقى الحروف.
 */
export function picRounds(lang, ch, letters, rnd = Math.random, n = PIC_ROUNDS) {
  const pool = pickableLetters(lang, letters);
  const targets = ch ? Array(n).fill(ch) : shuffle(rnd, letters.filter((c) => pool.includes(c))).concat(shuffle(rnd, letters)).slice(0, n);
  if (!targets.length) return [];
  const used = new Map();
  const nextPic = (c) => {
    const pics = picturesFor(lang, c);
    const i = used.get(c) || 0;
    used.set(c, i + 1);
    if (i % pics.length === 0) pics.sort(() => rnd() - 0.5);
    return pics[i % pics.length];
  };
  const others = (c, k) => {
    const mine = shuffle(rnd, letters.filter((x) => x !== c && pool.includes(x)));
    const rest = shuffle(rnd, pool.filter((x) => x !== c && !mine.includes(x)));
    return [...mine, ...rest].slice(0, k);
  };
  // حرف واحد مختار: جولة «بتبدأ بإيه؟» واحدة من صورة حرف تانى — عشان الإجابة ماتبقاش نفس الحرف دايماً
  if (ch && n > 4) targets[4] = others(ch, 1)[0] || ch;
  return targets.map((c, i) => {
    const pic = nextPic(c);
    if (i % 2 === 0) return { kind: "letter", ch: c, pic, options: shuffle(rnd, [c, ...others(c, 2)]) };
    const wrong = others(c, 2).map((o) => ({ ch: o, pic: picturesFor(lang, o)[0] }));
    return { kind: "picture", ch: c, pic, options: shuffle(rnd, [{ ch: c, pic }, ...wrong]) };
  });
}

/**
 * «وصّل الحرف بالصورة» (المالك ٢٠٢٦-١٠-٢٦): **حروف النجمة بس** («خليهم للحروف اللى عليها نجمه
 * يعنى خلصت»). كل جولة لحد ٤ حروف مختلفة، ولكل حرف صورة بتبدأ بيه — والطفل يوصّل بخط.
 * أقل من حرفين عليهم نجمة → مفيش جولات (الشاشة بتقول يخلّص حرف كمان).
 * الصور ماتتكرّرش فى نفس المرة لحد ما صور الحرف تخلص.
 */
export const CONNECT_ROUNDS = 3;
export const CONNECT_K = 4;
function picDeck(lang, rnd) {
  const decks = new Map();
  return (c) => {
    let d = decks.get(c);
    if (!d || !d.left.length) { d = { left: shuffle(rnd, picturesFor(lang, c)) }; decks.set(c, d); }
    return d.left.shift();
  };
}
export function connectRounds(lang, starred = [], rnd = Math.random, rounds = CONNECT_ROUNDS, k = CONNECT_K) {
  const mine = starred.filter((c) => picturesFor(lang, c).length);
  if (mine.length < 2) return [];
  const picOf = picDeck(lang, rnd);
  return Array.from({ length: rounds }, () => {
    const chosen = shuffle(rnd, mine).slice(0, k);
    return { letters: chosen, pictures: shuffle(rnd, chosen.map((ch) => ({ ch, pic: picOf(ch) }))) };
  });
}

/** خطوة «وصّل» جوّه صفحة حرف فى الكتاب: حرف الصفحة + لحد ٣ حروف عليها نجمة. أقل من حرفين → null. */
export function connectStepFor(lang, ch, starred = [], rnd = Math.random) {
  const others = shuffle(rnd, starred.filter((c) => c !== ch && picturesFor(lang, c).length)).slice(0, CONNECT_K - 1);
  if (!others.length || !picturesFor(lang, ch).length) return null;
  const picOf = picDeck(lang, rnd);
  const letters = shuffle(rnd, [ch, ...others]);
  return { letters, pictures: shuffle(rnd, letters.map((c) => ({ ch: c, pic: picOf(c) }))) };
}

// ── الأرقام: «وصّل الرقم بالصورة» — الرقم ↔ صورة فيها نفس العدد (حاجات من كراسة الأرقام) ──
const NUM_THINGS = ["🦆", "👑", "🐰", "🍎", "🎈", "🐟", "🍌", "⭐", "🐤", "🍓", "🐢", "🦀"];
/** الأرقام اللى عليها نجمة فى «كراسة الأرقام» (١–١٠). */
export function starredNumbers(done) {
  return Array.from({ length: 10 }, (_, i) => i + 1).filter((n) => done && done[String(n)]);
}
export function numberConnectRounds(starred = [], rnd = Math.random, rounds = CONNECT_ROUNDS, k = CONNECT_K) {
  if (starred.length < 2) return [];
  return Array.from({ length: rounds }, () => {
    const chosen = shuffle(rnd, starred).slice(0, k);
    const things = shuffle(rnd, NUM_THINGS);
    return { letters: chosen, pictures: shuffle(rnd, chosen.map((n, i) => ({ ch: n, pic: { e: things[i].repeat(n), n } }))) };
  });
}

export const WRITE_MAX = 6;

/** «اكتب من الذاكرة»: حروف النجمة بترتيب عشوائى — والإنجليزى كابيتال وصغير بالتبادل. */
export function writePlan(lang, letters, rnd = Math.random, max = WRITE_MAX) {
  return shuffle(rnd, letters).slice(0, max).map((ch, i) => {
    if (lang === "ar") return { ch, glyph: ch, say: `اكتب حرف ${nameOf(ch)}` };
    const small = i % 2 === 1;
    return { ch, glyph: small ? ch.toLowerCase() : ch, say: small ? `Write small ${ch.toLowerCase()}` : `Write capital ${ch}` };
  });
}

// الجمل اللى ميزو بيقولها — كلها بتتسجّل صوت مرة واحدة (server/tts-games.js)
export const RECALL_SAY = {
  ar: {
    whichLetter: (w) => `كلمة ${w} بتبدأ بحرف إيه؟`,
    whichPicture: (name) => `اختار الصورة اللى بتبدأ بحرف ${name}`,
    starts: (w, name) => `كلمة ${w} بتبدأ بحرف ${name}`,
    choose: "اختار الحرف اللى عايز تتمرّن على صوره",
    noStars: "لسه مفيش حروف عليها نجمة. خلّص حرف فى الكراسة الأول وتعالى",
    peek: "بص على الحرف كويس… وبعدين اكتبه لوحدك",
    connect: "وصّل كل حرف بالصورة اللى بتبدأ بيه",
    needTwo: "لازم حرفين عليهم نجمة على الأقل عشان نوصّل. خلّص حرف كمان فى الكراسة وتعالى",
  },
  en: {
    whichLetter: (w) => `What letter does ${w} start with?`,
    whichPicture: (ch) => `Find the picture that starts with ${ch}`,
    starts: (w, ch) => `${w} starts with ${ch}`,
    choose: "اختار الحرف اللى عايز تتمرّن على صوره",
    noStars: "لسه مفيش حروف عليها نجمة. خلّص حرف فى كتاب الإنجليزى الأول وتعالى",
    peek: "بص على الحرف كويس… وبعدين اكتبه لوحدك",
    connect: "وصّل كل حرف بالصورة اللى بتبدأ بيه",
    needTwo: "لازم حرفين عليهم نجمة على الأقل عشان نوصّل. خلّص حرف كمان فى كتاب الإنجليزى وتعالى",
  },
  num: {
    connect: "وصّل كل رقم بالصورة اللى فيها نفس العدد",
    needTwo: "لازم رقمين عليهم نجمة على الأقل عشان نوصّل. خلّص رقم كمان فى كراسة الأرقام وتعالى",
  },
};

export function recallPhrases() {
  const ar = new Set(), en = new Set();
  for (const lang of ["ar", "en"]) {
    const S = RECALL_SAY[lang];
    const bag = lang === "ar" ? ar : en;
    for (const ch of pickableLetters(lang)) {
      const name = letterName(lang, ch);
      bag.add(S.whichPicture(name));
      for (const p of picturesFor(lang, ch)) { bag.add(p.w); bag.add(S.whichLetter(p.w)); bag.add(S.starts(p.w, name)); }
    }
    ar.add(S.choose); ar.add(S.noStars); ar.add(S.peek); ar.add(S.connect); ar.add(S.needTwo);
  }
  for (const p of LB_PAGES.filter((x) => x.type === "letter")) ar.add(`اكتب حرف ${nameOf(p.ch)}`);
  for (const p of EB_PAGES.filter((x) => x.type === "letter")) { en.add(`Write capital ${p.ch}`); en.add(`Write small ${p.ch.toLowerCase()}`); }
  ar.add(RECALL_SAY.num.connect); ar.add(RECALL_SAY.num.needTwo);
  return { ar: [...ar], en: [...en] };
}

export { EB_WORDS };
