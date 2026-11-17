// ===== «أعرف الكلمة» (خطة ١٣/١٤/١٨ — موافقة المالك ٢٠٢٦-١١-١٧) =====
// المشكلة (بنت المالك): حافظة الصورة بتبدأ بحرف إيه، بس مش عارفة اسمها. فالقسم ده عن الكلمة نفسها:
//   hear  👂 ميزو يقول الكلمة ← ٤ صور من غير كلام مكتوب (لازم تعرف معناها)
//   see   🖼️ صورة ← ٣ أصوات (كل زرار بيقول كلمة) ← تختار اسمها — من غير قراءة
//   build 🧩 الحروف مبعترة ← تركّب الكلمة وهى سامعاها
// الكلمات = صور الحروف اللى عليها نجمة (نفس صور «صور الحروف»). الكلمة «اتعرفت» لما تتجاوب صح فى «اسمع» و«شوف»
// فى يومين مختلفين، واللى بتغلط فيه بيرجع الأول لحد ما تجاوبه صح مرتين ورا بعض.
// ملف صافى (من غير DOM) — الشاشة فى games/knowWord.js.
import { picturesFor, starredLetters, pickableLetters } from "./letterRecall.js";

export const KW_ROUNDS = 8;
const KINDS = ["hear", "see", "hear", "build", "see", "hear", "see", "build"];

/** كلمات الحروف اللى عليها نجمة (من غير تكرار) — {w, e, img?, ch} */
export function wordPool(lang, starred) {
  const out = [];
  const seen = new Set();
  for (const ch of starred) {
    for (const p of picturesFor(lang, ch)) {
      const k = lang === "en" ? p.w.toLowerCase() : p.w;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...p, ch });
    }
  }
  return out;
}

/** كل الصور (للاختيارات الغلط لما حروف النجمة قليلة) */
export function allPictures(lang) {
  return wordPool(lang, pickableLetters(lang, []));
}

export const kwKey = (lang, w) => `${lang}:${lang === "en" ? String(w).toLowerCase() : w}`;

/** سجل كلمة بعد إجابة (أول محاولة فى الجولة بس). day = "YYYY-MM-DD" */
export function recordAnswer(rec, kind, ok, day) {
  const r = { hear: [], see: [], build: [], miss: 0, streak: 0, lastWrong: null, ...(rec || {}) };
  if (ok) {
    r[kind] = [...new Set([...(r[kind] || []), day])].slice(-5);
    r.streak = (r.streak || 0) + 1;
  } else {
    r.miss = (r.miss || 0) + 1;
    r.streak = 0;
    r.lastWrong = day;
  }
  r.last = day;
  return r;
}

/** new · learning · known · weak */
export function wordStatus(rec) {
  if (!rec) return "new";
  if (rec.lastWrong && (rec.streak || 0) < 2) return "weak";
  const days = new Set([...(rec.hear || []), ...(rec.see || [])]);
  if ((rec.hear || []).length && (rec.see || []).length && days.size >= 2) return "known";
  return "learning";
}

const ORDER = { weak: 0, new: 1, learning: 2, known: 3 };
const shuffle = (rnd, a) => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
};
const keyOf = (lang, p) => kwKey(lang, p.w);

/** الكلمة تنفع تتركّب: حرفين لـ٧ ومن غير مسافات */
export const buildable = (w) => /^[^\s]{2,7}$/.test(String(w));
export const lettersOf = (w) => [...String(w)];

/**
 * جولات الجلسة: الضعيف الأول، بعده الجديد، بعده اللى بيتعلّمه، والمعروف فى الآخر.
 * stats = Store.knowWords · extra = صور للاختيارات الغلط (allPictures)
 */
export function planRounds(lang, pool, stats = {}, rnd = Math.random, n = KW_ROUNDS, extra = []) {
  if (!pool.length) return [];
  const ranked = shuffle(rnd, pool).sort((a, b) => ORDER[wordStatus(stats[keyOf(lang, a)])] - ORDER[wordStatus(stats[keyOf(lang, b)])]);
  const others = [...pool, ...extra.filter((x) => !pool.some((p) => keyOf(lang, p) === keyOf(lang, x)))];
  const rounds = [];
  for (let i = 0; i < n; i++) {
    const target = ranked[i % ranked.length];
    let kind = KINDS[i % KINDS.length];
    if (kind === "build" && !buildable(target.w)) kind = "hear";
    const wrong = shuffle(rnd, others.filter((x) => keyOf(lang, x) !== keyOf(lang, target) && x.e !== target.e));
    const k = kind === "hear" ? 3 : kind === "see" ? 2 : 0;
    if (wrong.length < k) { kind = "build"; if (!buildable(target.w)) continue; }
    const options = kind === "build" ? [] : shuffle(rnd, [target, ...wrong.slice(0, k)]);
    rounds.push({ kind, target, options, tiles: kind === "build" ? shuffle(rnd, lettersOf(target.w)) : [] });
  }
  return rounds;
}

/** لتقرير ولى الأمر: كلمات اتعرفت · كلمات لسه بيلخبط فيها */
export function knowSummary(stats = {}) {
  const known = [], weak = [];
  for (const [k, rec] of Object.entries(stats)) {
    const s = wordStatus(rec);
    const w = k.slice(k.indexOf(":") + 1);
    if (s === "known") known.push(w);
    else if (s === "weak") weak.push(w);
  }
  return { known, weak };
}

export { starredLetters };
