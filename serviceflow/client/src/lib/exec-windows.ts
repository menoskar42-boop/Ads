// تابات/نوافذ جهاز التنفيذ اليتيمة (المالك ٢٠٢٦-١١-١٩: «اعمل جهاز التنفيذ يقفل الصفحات المعلقة»).
//
// جهاز التنفيذ بيقفل نوافذه بنفسه لما المهمة تخلص أو مهلتها تخلص — بالمرجع اللى window.open رجّعه. بس لو تاب
// جهاز التنفيذ نفسه اتعمله ريفريش (التحديث الدورى/الإنقاذ) أو اتقفل واتفتح جديد («افتح الجسر»)، المراجع بتضيع:
// نوافذ المهام القديمة (منها اللى واقفة على «can't reach this page» أو صفحة دخول AXON البيضا) بتفضل مفتوحة على طول،
// ومهامها أصلاً اترجّعت للطابور (reset-orphaned / release-mine). فبنفتكر **أسماء** النوافذ اللى فتحناها
// (localStorage — بيعيش مع الريفريش)، ولما جهاز التنفيذ يبدأ تانى بنوصل لكل اسم بـ window.open("", اسم) ونقفله.
// window.open("", اسم) بيرجّع النافذة الموجودة بنفس الاسم من غير ما يغيّر صفحتها؛ ولو مش موجودة بيفتح about:blank
// فاضية — بنعرفها (صفحتها من نفس الموقع) ونقفلها على طول.

const KEY = "sf_exec_open_windows";
const MAX_AGE_MS = 12 * 3600 * 1000;           // اسم أقدم من كده بنسيبه (ماننيش متأكدين إنه بتاعنا لسه)
const OURS = /^(dzs_|sf_prov$|sf_wfm$|sf_c360$|sf_oss$|sf_exec_reserved_|sf_subinfo_one:)/;

type Rec = Record<string, number>;
const read = (): Rec => {
  try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; }
};
const write = (r: Rec) => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch {} };

/** window.open الأصلية (قبل اللفّ) — التنضيف بيستخدمها عشان مايتسجّلش هو كمان كنافذة جديدة. */
const nativeOpen: typeof window.open = typeof window !== "undefined" ? window.open.bind(window) : (() => null) as any;

/** النوافذ اللى جهاز التنفيذ فتحها فى الجلسة دى (المرجع الحى) — عشان نشيل من القايمة اللى اتقفلت. */
const live = new Map<string, Window>();

export function noteOpened(name: string, win: Window | null) {
  if (!name || !OURS.test(name) || !win) return;
  live.set(name, win);
  const r = read(); r[name] = Date.now(); write(r);
}

/** يشيل من القايمة النوافذ اللى اتقفلت (بتتنادى كل دقيقة) — فاللى يفضل بعد ريفريش يبقى فعلاً مفتوح. */
export function pruneClosed() {
  const r = read(); let changed = false;
  for (const [name, w] of live) {
    let closed = true;
    try { closed = w.closed; } catch {}
    if (closed) { live.delete(name); if (name in r) { delete r[name]; changed = true; } }
  }
  const now = Date.now();
  for (const [name, at] of Object.entries(r)) if (now - at > MAX_AGE_MS) { delete r[name]; changed = true; }
  if (changed) write(r);
}

/**
 * أول ما جهاز التنفيذ يبدأ (بعد ريفريش أو فى تاب جديد): يقفل نوافذ الجلسة اللى قبلها. بيرجّع عدد اللى اتقفلت.
 * النوافذ اللى الجلسة دى فتحتها (live) مابتتقفلش، ولو فيه تاب جهاز تنفيذ تانى شغّال (القفل sf-executor-keepalive
 * محجوز — زى أول ٨ ثوانى بعد «افتح الجسر») التنضيف مابيحصلش خالص عشان مانقفلش نوافذ مهامه الشغّالة.
 */
export async function sweepOrphanWindows(): Promise<number> {
  try {
    const locks: any = (navigator as any).locks;
    if (locks?.query) {
      const q = await locks.query();
      // التاب ده بيطلب نفس القفل أول ما يشتغل: لو هو اللى ماسكه ⇒ مفيش غيره. لو ماسكه حد تانى وطلبنا مستنى ⇒ فيه جهاز
      // تنفيذ تانى شغّال ⇒ مانقفلش حاجة.
      const named = (l: any) => l?.name === "sf-executor-keepalive";
      if ((q?.held || []).some(named) && (q?.pending || []).some(named)) return 0;
    }
  } catch {}
  const r = read();
  let closed = 0;
  for (const name of Object.keys(r)) {
    if (!OURS.test(name) || live.has(name)) continue;
    try {
      const w = nativeOpen("", name);
      if (!w) continue;   // الـpopups ممنوعة — مانقدرش نوصل لها
      let blank = false;
      try { blank = w.location.href === "about:blank"; } catch { blank = false; }   // صفحة موقع تانى ⇒ دى النافذة القديمة
      w.close();
      if (!blank) closed++;
    } catch {}
  }
  write({});
  return closed;
}

/** بيلفّ window.open طول ما جهاز التنفيذ شغّال عشان يفتكر أسماء نوافذه. بيرجّع دالة الرجوع للأصل. */
export function trackExecWindows(): () => void {
  const orig = window.open;
  const wrapped = function (this: any, url?: string | URL, target?: string, features?: string) {
    const w = orig.call(window, url as any, target as any, features as any);
    if (target) noteOpened(String(target), w);
    return w;
  } as typeof window.open;
  window.open = wrapped;
  const t = window.setInterval(pruneClosed, 60_000);
  return () => { window.clearInterval(t); if (window.open === wrapped) window.open = orig; };
}
