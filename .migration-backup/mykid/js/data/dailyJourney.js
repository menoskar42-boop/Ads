// ===== رحلة اليوم (اقتراح كوديكس — المالك ٢٠٢٦-١١-٠٤) =====
// ٣ مهام بس كل يوم على ٣ قواعد: ✏️ كتابة · 🔢 أرقام · 🎨 ألوان — مبنية على اللى الطفل محتاجه مش تناوب ثابت:
//   الكتابة: كلمات عليها الدور فى «مراجعة اليوم» ← حرف متنجّم درجته ضعيفة ← حرف متنجّم بالدور ← أول حرف لسه ماخلصش.
//   الألوان: إنجليزى الأول (المالك: «الإنجليزى أهم بكتير»).
// وكل رحلة تخلص بتنوّر حجر على خريطة ميزو، وكل ٧ رحلات بتفتح مكان (المكتبة ← قوس قزح ← …).
// ملف صافى (من غير DOM) — الشاشة js/screens/dailyPlan.js والحالة فى Store.journeys.

/** درجة أقل من كده ⇒ الحرف «محتاج تدريب» (نفس حد «جيد جداً» فى letterGrade.js) */
export const WEAK_GRADE = 75;
/** أحجار الخريطة قبل ما يتفتح مكان جديد */
export const JOURNEY_STONES = 6;

/** رقم اليوم فى السنة — بيغيّر التناوب يوم بيوم */
export function dayIndex(d = new Date()) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

/**
 * الكتابة النهارده.
 * dueWords: عدد كلمات «مراجعة اليوم» اللى عليها الدور · starred: الحروف المتنجّمة · grades: Store.letterGrades
 * order: ترتيب الكراسة (LB_ORDER).
 * ⇒ { kind: "words" } أو { kind: "letter", ch, why: "weak" | "keep" | "new" }
 */
export function writeTarget({ dueWords = 0, starred = [], grades = {}, order = [], day = 0 }) {
  if (dueWords > 0) return { kind: "words", count: dueWords };
  const total = (ch) => {
    const g = grades[`ar:${ch}`];
    return g && g.last && typeof g.last.total === "number" ? g.last.total : null;
  };
  const weak = starred
    .map((ch) => ({ ch, t: total(ch) }))
    .filter((x) => x.t != null && x.t < WEAK_GRADE)
    .sort((a, b) => a.t - b.t);
  if (weak.length) return { kind: "letter", ch: weak[0].ch, why: "weak" };
  const next = order.find((ch) => !starred.includes(ch));
  // كل الحروف متنجّمة وكويسة ⇒ حرف منهم بالدور (تثبيت)، وإلا أول حرف لسه ماخلصش
  if (!next && starred.length) return { kind: "letter", ch: starred[day % starred.length], why: "keep" };
  return { kind: "letter", ch: next || order[0] || "أ", why: "new" };
}

const NUMBER_GAMES = [
  { screen: "countPick", title: "عدّ واختار" },
  { screen: "addition", title: "جمع" },
  { screen: "compare", title: "أكبر وأصغر" },
];
const COLOR_GAMES = [
  { screen: "findIt", title: "Find the color · جِد اللون" },
  { screen: "memory", title: "Color memory · ذاكرة الألوان" },
  { screen: "pattern", title: "What comes next? · إيه اللى بعده؟" },
  { screen: "spotDiff", title: "Find the different one · اكتشف المختلف" },
];
const COLOR_BG = "linear-gradient(180deg,#ffe29a,#ff9a6c)";

/** الـ٣ مهام: [كتابة، أرقام، ألوان] — كل واحدة { key, emoji, title, desc, regionId, screen, params } */
export function journeySteps(day, ctx) {
  const w = writeTarget({ ...ctx, day });
  const write = w.kind === "words"
    ? { key: "write", emoji: "✏️", title: "اكتب كلمات المراجعة", desc: `${w.count} كلمة عليها الدور النهارده`,
        regionId: "arabic", screen: "blankWrite", params: { lang: "ar", mode: "review" } }
    : { key: "write", emoji: "✏️", title: `اكتب حرف ${w.ch}`,
        desc: w.why === "weak" ? "محتاج شوية تدريب" : w.why === "new" ? "حرف جديد" : "نثبّته",
        regionId: "arabic", screen: "trace",
        params: { datasetKey: "arabic", lang: "ar-EG", focus: w.ch, title: `✏️ اكتب ${w.ch}` }, ch: w.ch, why: w.why };
  const n = NUMBER_GAMES[day % NUMBER_GAMES.length];
  const number = { key: "number", emoji: "🔢", title: n.title, desc: "لعبة أرقام", regionId: "numbers", screen: n.screen, params: {} };
  const c = COLOR_GAMES[day % COLOR_GAMES.length];
  const [en, ar] = c.title.split(" · ");
  const color = { key: "color", emoji: "🎨", title: en, desc: `${ar} — بالإنجليزى`, regionId: "colors", screen: c.screen,
    params: { lang: "en", datasetKey: "colors", title: `🎨 ${c.title.split(" · ")[0]}`, bg: COLOR_BG } };
  return [write, number, color];
}

/** الأماكن اللى بتتفتح على الخريطة — كل ٧ رحلات مكان (٦ أحجار + المكان نفسه) */
export const JOURNEY_PLACES = [
  { id: "library", emoji: "🏰", name: "مكتبة الحروف" },
  { id: "rainbow", emoji: "🌈", name: "بوابة قوس قزح" },
  { id: "garden", emoji: "🌻", name: "حديقة الورد" },
];

/** حالة الخريطة من عدد الرحلات اللى خلصت */
export function mapState(journeys) {
  const n = Math.max(0, journeys | 0);
  const per = JOURNEY_STONES + 1;
  const opened = Math.min(JOURNEY_PLACES.length, Math.floor(n / per));
  return {
    total: n,
    lit: opened >= JOURNEY_PLACES.length ? JOURNEY_STONES : n % per,   // الأحجار المنوّرة فى الدورة دى
    opened,                                                              // كام مكان اتفتح
    next: JOURNEY_PLACES[opened] || null,                                // المكان الجاى
    left: opened >= JOURNEY_PLACES.length ? 0 : per - (n % per),         // فاضل كام رحلة عليه
  };
}
