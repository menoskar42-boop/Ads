// ===== شهادة الحرف: درجة الطفل فى كل حرف من «كراسة الحروف» (المالك ٢٠٢٦-١٠-١٦) =====
//
// «فى آخر كل حرف يخلصه الطفل يظهر تقييم بالدرجات، ولولى الأمر فى الإعدادات كل حرف له تقييم مفصّل».
// صافى (من غير صفحة) عشان يتقاس فى node:
//   الكتابة ٤٠٪ — متوسط نسبة كل كتابة (٣ بالنقط + ٥ لوحده)، واللى اتعدّى بيتحسب صفر،
//                 وكل محاولة واطية (اتعادت) بتنقّص ٣ (لحد ٢٠)
//   الألعاب ٣٥٪ — كل لعبة ١٠٠ وكل غلطة −٢٠ (أقل حاجة ٤٠)، واللعبة اللى اتعدّت صفر
//   أنشطة الكتاب ٢٥٪ — كل نشاط ١٠٠ وكل غلطة −١٥ (أقل حاجة ٥٠)
// والطفل بيشوف النجوم والكلمة الحلوة بس — ميزو مابيقولش «ضعيف» أبداً.

export const LB_GAME_INFO = {
  puzzle: { icon: "🧩", title: "بازل الحرف" },
  flash: { icon: "🔦", title: "الكشّاف" },
  eggs: { icon: "🥚", title: "بيض المفاجآت" },
  phonics: { icon: "🔤", title: "بأى حرف تبدأ؟" },
  catch: { icon: "🎯", title: "اصطياد الحروف" },
  sequence: { icon: "🔠", title: "الحرف الناقص" },
  review: { icon: "🧠", title: "المراجعة الذكية" },
};
export const LB_ACT_INFO = {
  meet: "تعرّف على الحرف",
  riddle: "فزّورة ميزو",
  pop: "لوّن الحرف",
  harakat: "الحركات",
  harakaChoose: "اختار الصوت",
  starts: "بيبدأ بالحرف",
  forms: "أشكال الحرف",
  circle: "حط دايرة",
  missing: "الحرف الناقص فى الكلمة",
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** المستوى من الدرجة: النجوم والكلمة (للطفل) واللون (لولى الأمر). */
export function gradeLevel(total) {
  if (total >= 90) return { stars: 3, label: "ممتاز", tone: "great" };
  if (total >= 75) return { stars: 2, label: "جيد جداً", tone: "good" };
  if (total >= 60) return { stars: 1, label: "جيد", tone: "ok" };
  return { stars: 1, label: "محتاج تدريب", tone: "practice" };
}

/**
 * res = { writes: [{level, score}], writeFails, games: {g: mistakes}, acts: {kind: mistakes},
 *         skipped: [...], expectedWrites, expectedGames: [...] }
 */
export function letterGrade(res, at = Date.now()) {
  const scores = res.writes.map((w) => w.score);
  const expectedW = Math.max(res.expectedWrites || 0, scores.length);
  const writing = expectedW ? clamp(Math.round(scores.reduce((a, b) => a + b, 0) / expectedW - Math.min(20, (res.writeFails || 0) * 3)), 0, 100) : null;

  const gameNames = [...new Set([...(res.expectedGames || []), ...Object.keys(res.games)])];
  const games = {};
  for (const g of gameNames) {
    const m = res.games[g];
    games[g] = m == null ? { skipped: true, score: 0 } : { mistakes: m, score: clamp(100 - 20 * m, 40, 100) };
  }
  const acts = {};
  for (const [k, m] of Object.entries(res.acts)) acts[k] = { mistakes: m, score: clamp(100 - 15 * m, 50, 100) };
  for (const k of res.skipped || []) if (LB_ACT_INFO[k] && !acts[k]) acts[k] = { skipped: true, score: 0 };

  const gamesScore = gameNames.length ? Math.round(avg(Object.values(games).map((x) => x.score))) : null;
  const actsScore = Object.keys(acts).length ? Math.round(avg(Object.values(acts).map((x) => x.score))) : null;

  // الوزن على اللى موجود بس (لو صفحة من غير ألعاب مثلاً)
  const parts = [[writing, 40], [gamesScore, 35], [actsScore, 25]].filter(([v]) => v != null);
  const wsum = parts.reduce((n, [, w]) => n + w, 0);
  const total = wsum ? Math.round(parts.reduce((n, [v, w]) => n + v * w, 0) / wsum) : 0;
  return {
    total, ...gradeLevel(total),
    writing, games: gamesScore, acts: actsScore,
    detail: { writes: res.writes.map((w) => ({ level: w.level, score: w.score })), writeFails: res.writeFails || 0, games, acts },
    at,
  };
}
