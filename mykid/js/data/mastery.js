// ===== «أنا بقيت شاطر فى…» — إنجازات مربوطة بالإتقان (اقتراح كوديكس، المالك ٢٠٢٦-١١-٠٤) =====
// كل إنجاز بيتفتح بمهارة اتعلّمت فعلاً (حروف خلّصها · ألوان عرفها بالإنجليزى · حروف بامتياز…)، مش بعدد
// دقايق اللعب ولا بالحظ. والكنز بقى بيتكسب مع الإنجاز بدل ما يطلع عشوائى بعد ٧٠٪ من الأنشطة.
// ملف صافى (من غير DOM) — الشاشة js/screens/masteryRoom.js والحالة فى Store.achievements.

/** مستوى إتقان العنصر اللى بيعتبر «عرفه» (Store.recordReview: ٠…٥) */
export const KNOWN_LEVEL = 2;
/** درجة «امتياز» فى شهادة الحرف (letterGrade.js) */
export const EXCELLENT = 90;

/**
 * ctx = { arStarred, enStarred, numbersDone, colorsKnown, excellent, lettersWritten, journeys }
 * كل إنجاز: have(ctx) = كام عنده · need = المطلوب. الترتيب = ترتيب أماكنه فى الأوضة (١١ مكان).
 */
export const ACHIEVEMENTS = [
  { id: "ar3", emoji: "📕", title: "أعرف ٣ حروف عربى", need: 3, have: (c) => c.arStarred },
  { id: "ar8", emoji: "📕", title: "أعرف ٨ حروف عربى", need: 8, have: (c) => c.arStarred },
  { id: "colors6", emoji: "🎨", title: "أعرف ٦ ألوان بالإنجليزى", need: 6, have: (c) => c.colorsKnown },
  { id: "en5", emoji: "📘", title: "أعرف ٥ حروف إنجليزى", need: 5, have: (c) => c.enStarred },
  { id: "num5", emoji: "🔢", title: "أعرف الأرقام لحد ٥", need: 5, have: (c) => c.numbersDone },
  { id: "write10", emoji: "✏️", title: "كتبت ١٠ حروف بإيدى", need: 10, have: (c) => c.lettersWritten },
  { id: "ar15", emoji: "📕", title: "أعرف ١٥ حرف عربى", need: 15, have: (c) => c.arStarred },
  { id: "excellent5", emoji: "🏅", title: "٥ حروف بامتياز", need: 5, have: (c) => c.excellent },
  { id: "en13", emoji: "📘", title: "أعرف ١٣ حرف إنجليزى", need: 13, have: (c) => c.enStarred },
  { id: "num10", emoji: "🔢", title: "أعرف الأرقام لحد ١٠", need: 10, have: (c) => c.numbersDone },
  { id: "ar28", emoji: "👑", title: "أعرف كل الحروف العربى", need: 28, have: (c) => c.arStarred },
];

/** كل إنجاز وحالته: { ...a, got, have } */
export function achievementStatus(ctx) {
  return ACHIEVEMENTS.map((a) => {
    const have = Math.max(0, a.have(ctx) | 0);
    return { ...a, have: Math.min(have, a.need), got: have >= a.need };
  });
}

/** الإنجازات الجديدة اللى اتكسبت ومش فى earned لسه */
export function newAchievements(ctx, earned = []) {
  return achievementStatus(ctx).filter((a) => a.got && !earned.includes(a.id));
}

/** ctx من حالة الطفل (Store + دوال الحروف المتنجّمة) — بيتبعت للدالة عشان الملف يفضل صافى */
export function masteryContext({ arStarred = [], enStarred = [], workbookDone = {}, numberPageIds = [], mastery = {},
  colorKeys = [], grades = {}, writeStats = {}, journeys = 0 }) {
  return {
    arStarred: arStarred.length,
    enStarred: enStarred.length,
    numbersDone: numberPageIds.filter((id) => workbookDone[id]).length,
    colorsKnown: colorKeys.filter((k) => (mastery[`colors:${k}`] || 0) >= KNOWN_LEVEL).length,
    excellent: Object.entries(grades).filter(([k, g]) => k.startsWith("ar:") && g && g.best && g.best.total >= EXCELLENT).length,
    lettersWritten: Object.values(writeStats).filter((s) => s && (s.n || 0) > 0).length,
    journeys,
  };
}
