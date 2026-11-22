// الإيقاف بالليل (المالك ٢٠٢٦-١٠-١٣): «التحديث التلقائى يقف بالليل … من الساعة ١٢ بالليل حتى
// الساعة ٧ صباحاً حتى لو الزر مفتوح … وزر يوقف جهاز التنفيذ فى نفس الفترة».
//
// ليه: قاعدة Service Flow بتنام بعد ٥ دقايق من غير استعلامات، والفاتورة على كل ساعة هى صاحية
// فيها. الجهاز اللى بيفضل مفتوح بالليل (جهاز التنفيذ + لوحة السوبر أدمن) كان بيصحّيها طول الليل.
//
// الساعة بتوقيت القاهرة من المتصفح نفسه، والاختيار (مفتوح/مقفول + المدة) من الإعدادات بيتحفظ هنا
// فى localStorage — عشان بالليل الجهاز يعرف يقف من غير ما يسأل السيرفر (السؤال نفسه بيصحّيها).
// والمدة من الإعدادات كمان (المالك ٢٠٢٦-١٠-١٣: «خلى التوقيت ده برده ممكن التحكم فيه»).
import { useEffect, useState } from "react";

export const NIGHT_START_DEFAULT = "00:00";  // ١٢ بالليل
export const NIGHT_END_DEFAULT = "07:00";    // ٧ الصبح
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** أى لمسة/كتابة فى آخر المدة دى = حد بيستعمل البرنامج دلوقتى ⇒ التحديث الدورى يرجع عادى. */
export const NIGHT_USER_ACTIVE_MS = 10 * 60 * 1000;

export type NightPause = { refresh: boolean; executor: boolean; start: string; end: string };
export const NIGHT_PAUSE_DEFAULT: NightPause = { refresh: true, executor: true, start: NIGHT_START_DEFAULT, end: NIGHT_END_DEFAULT };
const KEY = "sf_night_pause";

const CAIRO_HM = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** الساعة دلوقتى بتوقيت القاهرة (٠–٢٣). */
export function cairoHour(d: Date = new Date()): number {
  return Math.floor(cairoMinutes(d) / 60);
}
/** الدقيقة من أول اليوم بتوقيت القاهرة (٠–١٤٣٩). */
export function cairoMinutes(d: Date = new Date()): number {
  const [h, m] = CAIRO_HM.format(d).split(":").map(Number);
  return ((h % 24) * 60 + m) % 1440;
}
const toMin = (t: string, def: string) => {
  const v = TIME_RE.test(t) ? t : def;
  return Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
};
/** جوّه فترة الإيقاف (بتوقيت القاهرة)؟ — المدة ممكن تعدّى نص الليل (٢٢:٠٠ ← ٠٦:٠٠). */
export function isNightCairo(d: Date = new Date(), p: Pick<NightPause, "start" | "end"> = readNightPause()): boolean {
  const s = toMin(p.start, NIGHT_START_DEFAULT), e = toMin(p.end, NIGHT_END_DEFAULT), now = cairoMinutes(d);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}
/** إمتى بدأت فترة الإيقاف الحالية — جهاز التنفيذ بيخلّص اللى اتضاف للطابور قبلها بس. */
export function nightWindowStart(d: Date = new Date(), p: Pick<NightPause, "start" | "end"> = readNightPause()): Date {
  const s = toMin(p.start, NIGHT_START_DEFAULT);
  const sinceMin = (cairoMinutes(d) - s + 1440) % 1440;
  const t = new Date(d.getTime() - sinceMin * 60_000);
  t.setSeconds(0, 0);
  return t;
}

export function readNightPause(): NightPause {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && typeof v === "object") {
      return {
        refresh: v.refresh !== false, executor: v.executor !== false,
        start: TIME_RE.test(v.start) ? v.start : NIGHT_START_DEFAULT,
        end: TIME_RE.test(v.end) ? v.end : NIGHT_END_DEFAULT,
      };
    }
  } catch {}
  return { ...NIGHT_PAUSE_DEFAULT };
}
/** بيتنادى كل ما الإعدادات تيجى من السيرفر (/api/exec-queue/lanes) أو تتحفظ. */
export function saveNightPause(p: Partial<NightPause> | null | undefined): void {
  if (!p) return;
  const cur = readNightPause();
  const next: NightPause = {
    refresh: p.refresh ?? cur.refresh, executor: p.executor ?? cur.executor,
    start: p.start && TIME_RE.test(p.start) ? p.start : cur.start,
    end: p.end && TIME_RE.test(p.end) ? p.end : cur.end,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("sf-night-pause"));
  } catch {}
}

// آخر مرة حد لمس الصفحة/كتب فيها (على مستوى التاب)
let lastUserActivity = Date.now();
if (typeof window !== "undefined") {
  const mark = () => { lastUserActivity = Date.now(); };
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(ev, mark, { passive: true, capture: true });
}
export const userActiveRecently = (now = Date.now()) => now - lastUserActivity < NIGHT_USER_ACTIVE_MS;

/** «التحديث التلقائى» (التقارير اليومية) واقف دلوقتى؟ — بالليل دايماً لو الإيقاف مفتوح، حتى لو الزرار مفتوح. */
export function dailyRefreshPausedNow(d: Date = new Date()): boolean {
  return readNightPause().refresh && isNightCairo(d);
}
/** التحديث الدورى للشاشات المفتوحة واقف دلوقتى؟ — زى اللى فوق، إلا لو حد بيستعمل البرنامج دلوقتى. */
export function refreshPausedNow(d: Date = new Date()): boolean {
  return dailyRefreshPausedNow(d) && !userActiveRecently(d.getTime());
}
/** جهاز التنفيذ جوّه فترة الإيقاف؟ (مابيستقبلش طلبات جديدة — بيخلّص اللى كان فى الطابور ويقف) */
export function executorPausedNow(d: Date = new Date()): boolean {
  return readNightPause().executor && isNightCairo(d);
}

/** بيتحدّث كل دقيقة (من غير أى طلب للسيرفر) — الشاشات بتستعمله توقّف التحديث الدورى بالليل. */
export function useNightPause(): { dailyPaused: boolean; refreshPaused: boolean; executorPaused: boolean } {
  const calc = () => ({ dailyPaused: dailyRefreshPausedNow(), refreshPaused: refreshPausedNow(), executorPaused: executorPausedNow() });
  const [st, setSt] = useState(calc);
  useEffect(() => {
    const tick = () => setSt((old) => {
      const n = calc();
      return n.dailyPaused === old.dailyPaused && n.refreshPaused === old.refreshPaused && n.executorPaused === old.executorPaused ? old : n;
    });
    const id = setInterval(tick, 60 * 1000);
    window.addEventListener("sf-night-pause", tick);
    window.addEventListener("pointerdown", tick, { passive: true });
    window.addEventListener("keydown", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("sf-night-pause", tick);
      window.removeEventListener("pointerdown", tick);
      window.removeEventListener("keydown", tick);
    };
  }, []);
  return st;
}

/** refetchInterval للشاشات: نفس الفترة بالنهار، ومفيش تحديث دورى بالليل (لو الإيقاف مفتوح). */
export const nightAwareInterval = (ms: number, paused: boolean): number | false => (paused ? false : ms);
