// ============================================================================
// client/src/lib/daily-update.ts
// «حدّث التقارير اليومية»: يرسل FCC + WFM + OSS، وبورتال البورتات (بشرط تعدّى 7:45
// وإن البورتات ماتحدّثتش بعد 7:45 النهارده) إلى طابور التنفيذ لمنع تعارض نفس الدومين.
// التشغيل اليدوى يحجز التاب داخل ضغطة الزر، ثم يوجّهه جهاز التنفيذ عند سحب المهمة.
// ============================================================================
import { dispatchSpeedTool, openOpSite, reserveOpWindow, SITE_WIDE_KEY, type ExecJobType } from "./exec-queue";

const cairoDay = (d: string | number | Date) =>
  new Date(d).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const cairoMinOfDay = (d: string | number | Date) => {
  const s = new Date(d).toLocaleString("en-GB", { timeZone: "Africa/Cairo", hour12: false, hour: "2-digit", minute: "2-digit" });
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// كل موقع بيدخل الطابور بمساره (الدومين بتاعه) عشان مايتعارضش مع أى زر تانى على نفس الموقع.
// لو مفيش جهاز تنفيذ، نستخدم التاب المحجوز ونفتح محلياً كحل احتياطى.
function localExecutorEnabled(): boolean {
  try { return localStorage.getItem("sf_exec_active") === "1"; } catch { return false; }
}
// نتيجة محاولة واحدة. «اتضافت» و«كانت موجودة أصلاً» كانوا بيرجعوا نفس القراءة،
// والتشغيل التلقائى صامت (silent) — فالتحديث اللى مابيحصلش مكانش ليه أى أثر على
// الشاشة ولا فى الكونسول. المستخدم بيشوف «مُفعَّل ✓» وخلاص.
export type DailyRunOutcome =
  | "queued"        // اتضافت للطابور
  | "duplicate"     // فيه واحدة بنفس النوع لسه فى الطابور — الطلب ده اترمى
  | "local"         // مفيش جهاز تنفيذ → اتفتحت محلياً
  | "no-executor"   // مفيش جهاز تنفيذ ومينفعش محلياً
  | "failed";

export const DAILY_OUTCOME_AR: Record<DailyRunOutcome, string> = {
  queued: "اتضافت",
  duplicate: "كانت لسه فى الطابور",
  local: "اتفتحت محلياً",
  "no-executor": "مفيش جهاز تنفيذ",
  failed: "فشلت",
};

export const DAILY_RUN_LOG_KEY = "sf_hourly_log";

async function queueOrOpen(type: ExecJobType, manual = false): Promise<DailyRunOutcome> {
  const reserved = manual ? reserveOpWindow(type) : null;
  const localExecutor = manual && localExecutorEnabled();
  let enqueued: DailyRunOutcome | null = null;
  const handled = await dispatchSpeedTool(type, [SITE_WIDE_KEY], true, {
    silent: true,
    onEnqueued: (r) => {
      enqueued = r?.duplicate ? "duplicate" : r?.ok ? "queued" : "failed";
    },
  });
  if (handled) {
    // لو جهاز التنفيذ على جهاز آخر، التاب المحجوز هنا لا يجب أن يظل فارغاً.
    if (!localExecutor) { try { if (reserved && !reserved.closed) reserved.close(); } catch {} }
    // handled=true من غير onEnqueued معناها إن dispatchSpeedTool وقف قبل الإضافة
    // (مفيش جهاز تنفيذ ومينفعش تشغيل محلى) — مش نجاح.
    return enqueued ?? "no-executor";
  }
  openOpSite(type, "", undefined, reserved);
  return "local";
}

/** يسجّل نتيجة التشغيل (آخر ٢٠) فى localStorage + الكونسول، ويبلّغ الواجهة. */
function recordRun(results: Record<string, DailyRunOutcome>): void {
  const entry = { at: Date.now(), results };
  try {
    const prev = JSON.parse(localStorage.getItem(DAILY_RUN_LOG_KEY) || "[]");
    const log = (Array.isArray(prev) ? prev : []).concat([entry]).slice(-20);
    localStorage.setItem(DAILY_RUN_LOG_KEY, JSON.stringify(log));
    localStorage.setItem("sf_hourly_last", String(entry.at));
  } catch {}
  const summary = Object.entries(results)
    .map(([t, o]) => `${t}=${o}`).join(" · ");
  // بيفضل فى الكونسول حتى لو الواجهة اتقفلت — ده اللى بيخلّى «واقف ليه» سؤال له إجابة.
  console.info(`[daily-update] ${new Date(entry.at).toLocaleTimeString("en-GB")} — ${summary}`);
  try { window.dispatchEvent(new Event("sf-hourly-ran")); } catch {}
}

export function runManualSiteUpdate(type: ExecJobType): void {
  void queueOrOpen(type, true).then((o) => recordRun({ [type]: o }));
}

export function runDailyUpdate(
  uploadTimes: Record<string, string | null> | undefined,
  opts?: { manual?: boolean },
) {
  // ⚠️ بتتنادى كلها **من غير await بينها**: reserveOpWindow لازم يشتغل جوّه ضغطة
  // المستخدم، وأى await قبله بيخلّى المتصفح يحجب التاب. الجمع بيحصل بعدين.
  const manual = !!opts?.manual;
  const pending: Array<[string, Promise<DailyRunOutcome>]> = [
    ["fccdaily", queueOrOpen("fccdaily", manual)],
    ["wfmdaily", queueOrOpen("wfmdaily", manual)],
    ["ossdaily", queueOrOpen("ossdaily", manual)],
    ["weoas", queueOrOpen("weoas", manual)],
  ];
  // ابدأ تجهيز التصدير بعد حجز التابات داخل gesture الخاص بالزر.
  fetch("/api/fcc-export/arm", { method: "POST", credentials: "include" }).catch(() => {});

  // بورتال منافذ MSAN: مرة واحدة يومياً بعد 7:45 (المصدر بيتحدّث حوالى 8 إلا ربع)
  const today = cairoDay(new Date());
  const pt = uploadTimes || {};
  const queryLoaded = Object.keys(pt).length > 0;
  const PORTS_THRESHOLD_MIN = 7 * 60 + 45; // 7:45
  const updatedAfterThresholdToday = (iso?: string | null) =>
    !!iso && cairoDay(iso) === today && cairoMinOfDay(iso) >= PORTS_THRESHOLD_MIN;
  const portsDoneToday =
    updatedAfterThresholdToday(pt["ports_run_complete"]) ||
    updatedAfterThresholdToday(pt["/api/phone-ports/import"]);
  const nowAfterThreshold = cairoMinOfDay(new Date()) >= PORTS_THRESHOLD_MIN;
  if (queryLoaded && nowAfterThreshold && !portsDoneToday) {
    fetch("/api/ports-auto/arm", { method: "POST", credentials: "include" }).catch(() => {});
    pending.push(["ports", queueOrOpen("ports", manual)]);
  }

  void Promise.all(pending.map(([, p]) => p)).then((outcomes) => {
    const results: Record<string, DailyRunOutcome> = {};
    pending.forEach(([t], i) => { results[t] = outcomes[i]; });
    recordRun(results);
  });
}
