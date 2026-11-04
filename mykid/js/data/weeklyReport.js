// ===== تقرير الأسبوع لولى الأمر (اقتراح كوديكس — المالك ٢٠٢٦-١١-٠٤) =====
// مش درجة: «الأسبوع ده أتقن كذا · محتاج كذا · بيلخبط بين كذا · نشاط فى البيت». قابل للطباعة من صفحة ولى الأمر.
// ملف صافى (من غير DOM) — بياخد الحالة كلها كبيانات.

const DAY = 86400000;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** اسم العنصر زى ما ولى الأمر يقراه */
function itemLabel(ds, k) {
  if (ds === "english") return `${String(k).toUpperCase()}${String(k).toLowerCase()}`;
  return String(k);
}
const DS_NAME = { arabic: "الحروف العربى", english: "الحروف الإنجليزى", colors: "الألوان", numbers: "الأرقام" };

/**
 * أهم اللخبطات: الزوج (المطلوب، اللى اختاره) — اللخبطة فى الاتجاهين بتتجمع (ب←ت وت←ب = «ب و ت»).
 * بس اللى اتكررت مرتين على الأقل فى آخر ١٤ يوم.
 */
export function topConfusions(confusions = {}, now = new Date(), { days = 14, min = 2, max = 3 } = {}) {
  const from = iso(new Date(now - days * DAY));
  const pairs = new Map();
  for (const [k, v] of Object.entries(confusions)) {
    if (!v || (v.d || "") < from) continue;
    const [ds, a, b] = k.split("|");
    if (!ds || a == null || b == null) continue;
    const key = [ds, ...[a, b].sort()].join("|");
    const p = pairs.get(key) || { ds, a: [a, b].sort()[0], b: [a, b].sort()[1], n: 0 };
    p.n += v.n || 0;
    pairs.set(key, p);
  }
  return [...pairs.values()].filter((p) => p.n >= min).sort((x, y) => y.n - x.n).slice(0, max)
    .map((p) => ({ ...p, text: `بيلخبط بين ${itemLabel(p.ds, p.a)} و${itemLabel(p.ds, p.b)}${DS_NAME[p.ds] ? ` (${DS_NAME[p.ds]})` : ""}` }));
}

/** نشاط مقترح فى البيت — من أهم حاجة محتاجة شغل */
export function homeActivity({ confusion, weak, colorsKnown }) {
  if (confusion && (confusion.ds === "arabic" || confusion.ds === "english")) {
    const a = itemLabel(confusion.ds, confusion.a), b = itemLabel(confusion.ds, confusion.b);
    return `اكتبوا ${a} و${b} كبار على ورقتين، وخلّوه يدوّر عليهم فى كتاب أو علبة فى البيت ويقولكم الفرق بينهم (النقط أو الشكل).`;
  }
  if (confusion && confusion.ds === "colors") return `العبوا «I spy» فى البيت: «I spy something ${confusion.a}…» — ودوّروا مع بعض على حاجات بالألوان اللى بيلخبط فيها.`;
  if (weak) return `اكتبوا حرف ${weak} بصباعه على صينية فيها دقيق أو رمل ٣ مرات، وبعدين على ورقة.`;
  if (colorsKnown < 6) return "اسألوه عن ألوان الحاجات فى البيت بالإنجليزى: «What color is the cup?».";
  return "اقروا معاه قصة قصيرة وخلّوه يدوّر على الحروف اللى عرفها فى الكلام.";
}

/**
 * التقرير. grades = Store.letterGrades · achievementsAt = { id: "YYYY-MM-DD" } · achievements = ACHIEVEMENTS
 * last7 = Store.last7Days() · ctx = currentMasteryContext()
 */
export function weeklyReport({ now = new Date(), grades = {}, confusions = {}, achievementsAt = {}, achievements = [],
  last7 = [], ctx = {}, weakBelow = 75, excellentFrom = 90 }) {
  const from = iso(new Date(now - 6 * DAY));
  const weekAgo = now - 7 * DAY;
  const activeDays = last7.filter((d) => d.acts > 0 || d.min > 0).length;
  const minutes = last7.reduce((n, d) => n + (d.min || 0), 0);
  const thisWeek = Object.entries(grades)
    .filter(([, g]) => g && g.last && (g.last.at || 0) >= weekAgo)
    .map(([k, g]) => ({ book: k.split(":")[0], ch: k.slice(k.indexOf(":") + 1), total: g.last.total }));
  const mastered = [
    ...achievements.filter((a) => (achievementsAt[a.id] || "") >= from).map((a) => a.title),
    ...thisWeek.filter((x) => x.total >= excellentFrom).map((x) => `حرف ${x.book === "en" ? x.ch.toUpperCase() : x.ch} بامتياز (${x.total})`),
  ];
  const weakLetters = Object.entries(grades)
    .filter(([k, g]) => k.startsWith("ar:") && g && g.last && g.last.total < weakBelow)
    .sort((a, b) => a[1].last.total - b[1].last.total)
    .map(([k]) => k.slice(3));
  const conf = topConfusions(confusions, now);
  const needs = [
    ...weakLetters.slice(0, 3).map((ch) => `حرف ${ch} — محتاج تدريب كتابة`),
    ...conf.map((c) => c.text),
  ];
  return {
    from, to: iso(now), activeDays, minutes,
    strengths: [
      ctx.arStarred ? `بيعرف ${ctx.arStarred} حرف عربى` : null,
      ctx.enStarred ? `بيعرف ${ctx.enStarred} حرف إنجليزى` : null,
      ctx.colorsKnown ? `بيعرف ${ctx.colorsKnown} ألوان بالإنجليزى` : null,
    ].filter(Boolean),
    mastered, needs, confusions: conf,
    activity: homeActivity({ confusion: conf[0], weak: weakLetters[0], colorsKnown: ctx.colorsKnown || 0 }),
  };
}
