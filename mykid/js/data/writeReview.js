// ===== «مراجعة اليوم» — الفكرة السادسة (المالك ٢٠٢٦-١٠-٣١) =====
// الكلمة اللى الطفل غلط فيها فى المربع الفاضى (المستوى ٣ فى «كمّل الكلمة بإيدك» والهربان والقطر، وورقة الامتحان)
// بترجعله تانى يوم، ولو كتبها صح بترجع بعد يومين وبعدين ٤ — ولما يكتبها صح ٣ مرات ورا بعض خلاص اتعلّمها.
// الكلمة اللى كتبها صح من أول مرة ومن غير ما يغلط فيها قبل كده مابتدخلش المراجعة أصلاً.
//
// ملف صافى (من غير DOM) — الحالة فى Store.writeReview، والشاشة renderBlankWrite({mode:"review"}).
import { arItems, enItems } from "./blankWrite.js";

export const REVIEW_GAPS = [1, 2, 4];   // بعد كام يوم ترجع: بعد أول صح · تانى صح · (التالت = اتعلّمها)
export const REVIEW_MASTER = 3;
export const REVIEW_MAX = 6;            // أقصى عدد كلمات فى مراجعة واحدة

export const reviewKey = (lang, ch, w) => `${lang}:${ch}:${w}`;
const pad = (n) => String(n).padStart(2, "0");
/** تاريخ النهارده بتوقيت الجهاز (YYYY-MM-DD). */
export const todayISO = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * الحالة الجديدة لكلمة بعد محاولة: ok = كتبها صح من أول مرة فى المربع الفاضى.
 * null = مالهاش لازمة تتسجّل (صح ومكانتش فى المراجعة).
 */
export function nextReview(prev, ok, today) {
  if (!prev && ok) return null;
  const p = prev || { streak: 0, rights: 0, wrongs: 0 };
  if (!ok) return { ...p, streak: 0, wrongs: p.wrongs + 1, last: today, due: addDays(today, 1), mastered: false };
  const streak = p.streak + 1;
  const mastered = streak >= REVIEW_MASTER;
  return { ...p, streak, rights: p.rights + 1, last: today, mastered, due: mastered ? null : addDays(today, REVIEW_GAPS[Math.min(streak - 1, REVIEW_GAPS.length - 1)]) };
}

/** الكلمات اللى عليها الدور النهارده (لغة واحدة): الأقدم الأول، والأكتر غلط. */
export function dueKeys(stats, lang, today, max = REVIEW_MAX) {
  return Object.entries(stats || {})
    .filter(([k, v]) => k.startsWith(lang + ":") && v && !v.mastered && v.due && v.due <= today)
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : b[1].wrongs - a[1].wrongs))
    .slice(0, max)
    .map(([k]) => k);
}

/** المفتاح ⇒ الكلمة بكل بياناتها (شكل الحرف والمكان) — null لو الكلمة اتشالت من البيانات. */
export function resolveKey(key) {
  const [lang, ch, w] = key.split(":");
  const x = (lang === "ar" ? arItems(ch) : enItems(ch)).find((it) => it.w === w);
  return x ? { ch, ...x } : null;
}

/** ملخّص لولى الأمر: كام كلمة فى المراجعة، وكام اتعلّمها. */
export function reviewSummary(stats, lang) {
  const all = Object.entries(stats || {}).filter(([k]) => k.startsWith(lang + ":"));
  return { pending: all.filter(([, v]) => !v.mastered).length, mastered: all.filter(([, v]) => v.mastered).length };
}

export const RV_SAY = {
  title: "🔁 مراجعة اليوم",
  intro: "دى كلمات غلطت فيها قبل كده. يلا نكتب حروفها تانى لوحدك",
  none: "مفيش كلمات للمراجعة النهارده. برافو! العب «كمّل الكلمة بإيدك» أو «ورقة الامتحان»",
};
export const rvPhrases = () => [RV_SAY.intro, RV_SAY.none];
