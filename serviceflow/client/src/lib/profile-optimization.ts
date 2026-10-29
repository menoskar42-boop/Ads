// فتح بوابة AXON Expresse لتشغيل Profile Optimization (رفع السرعة) لمجموعة أرقام أكونت.
// سكربت التامبر منكى (dzs-profile-optimization.user.js) بيقرأ الأرقام من الـ hash (#sf_po=)،
// يسجّل الدخول لو لزم، ويشغّل «Start Realtime PO» لكل رقم بالتتابع.
// منفصل تماماً عن تدفّق القياس (sf_accounts) — السكربتان لا يتعارضان (حارس PO_ACTIVE).
const PO_BASE = "https://10.42.187.101:8080/expresse/profileOptimization";

interface POOptions {
  /** إيقاف الـ Nightly PO فقط (يرجّع Not Started) بدون Start Realtime PO. */
  stopOnly?: boolean;
  /** بعد رفع السرعة لكل الأرقام، نفّذ مرحلة الإيقاف لكلهم (رفع سرعة + إيقاف). */
  afterStop?: boolean;
  /** رقم تاب «إيقاف PO» (٢، ٣…) — كل تاب نافذة لوحده والسكربت بيحفظ حالته بلاحقة _L<رقم>. */
  lane?: number;
}

/**
 * يفتح تاب رفع السرعة ومعاه قائمة أرقام الأكونت فى الـ hash للسكربت يقراها.
 * - stopOnly: إيقاف الـ nightly فقط.
 * - afterStop: رفع سرعة لكل الأرقام ثم إيقاف الـ nightly الناتج لكلهم.
 * - بدون الاتنين: رفع سرعة فقط.
 */
// ⚠️ بترجّع النافذة (مش void). السبب: جهاز التنفيذ محتاج مرجع النافذة عشان (1) يعرف
// إن السكربت خلّص لما التاب يتقفل، و(2) يقفل التاب بنفسه بعد ما الخط يخلص. من غير
// المرجع ده كان تاب AXON بيفضل مفتوح للأبد (السكربت بيقول «تقدر تقفل التاب» ومابيقفلش
// نفسه)، والمهمة تفضل «جارٍ التنفيذ» لحد ما المهلة الكاملة تعدّى — فالمستخدم مضطر
// يقفل الصفحة بإيده ويعمل إعادة تشغيل للباتش عشان يكمّل.
export function openProfileOptimization(
  accounts: (string | number | null | undefined)[],
  opts: POOptions = {},
): Window | null {
  const accs = [...new Set(accounts.map((a) => String(a ?? "").trim()).filter(Boolean))];
  if (accs.length === 0) {
    alert(opts.stopOnly ? "لا توجد أرقام أكونت لإيقاف الـ Nightly PO" : "لا توجد أرقام أكونت لرفع السرعة");
    return null;
  }
  const lane = opts.stopOnly && opts.lane && opts.lane > 1 ? opts.lane : 0;
  const flags = (opts.stopOnly ? "&sf_stop=1" : (opts.afterStop ? "&sf_after=1" : "")) + (lane ? `&sf_lane=${lane}` : "");
  const url = `${PO_BASE}?lineId=${encodeURIComponent(accs[0])}#sf_po=${encodeURIComponent(accs.join(","))}${flags}`;
  // نفس اسم نافذة القياس (dzs_measure) — القياس/رفع السرعة/الإيقاف كلهم يعيدوا استخدام **نفس النافذة**
  // (النافذة الجديدة تحلّ محل القديمة) فمفيش نوافذ متعددة ولا تداخل.
  // تاب «إيقاف PO» التانى/التالت… نافذة لوحده (dzs_po_2…). والأول كمان بقى نافذة لوحده (dzs_po_1):
  // الإيقاف بيشتغل جنب «بدون Real» (المالك ٢٠٢٦-١٠-٢٠)، وتاب «بدون Real» الأول اسمه dzs_measure —
  // لو الإيقاف فتح فى نفس الاسم كان هيحلّ محل القياس الشغّال. رفع السرعة لسه dzs_measure (بيشتغل لوحده).
  const name = opts.stopOnly ? `dzs_po_${lane || 1}` : "dzs_measure";
  // «كل خط فى نافذة لوحده» فى الإعدادات ⇒ تاب الإيقاف نافذة Edge لوحده (المالك ٢٠٢٦-١٠-٢٩: «ممكن تعمل الإيقاف فى
  // نافذة منفصلة بناءً على الإعدادات»). النافذة اللى قدّام مابتتنيّمش، والتاب اللى ورا فى نفس النافذة بيتنيّم.
  // ⚠️ لو فيه تاب قديم بنفس الاسم مفتوح، المتصفح بيستخدمه زى ما هو (تاب) — بيبقى نافذة من المرة اللى بعد ما يتقفل.
  if (opts.stopOnly && openView() === "windows") {
    const n = lane || 1;
    const w = window.open(url, name, `width=1280,height=800,left=${40 + ((n * 37) % 300)},top=${40 + ((n * 23) % 150)}`);
    if (w) return w;
  }
  return window.open(url, name);
}

/** طريقة الفتح من «رفع الملفات ← إعدادات» (نفس اختيار الجسر): بتتحفظ فى المتصفح ده كل ما الإعدادات تيجى من السيرفر. */
export const OPEN_VIEW_KEY = "sf_open_view";
export function saveOpenView(v: unknown): void {
  try { if (v === "windows" || v === "tabs") localStorage.setItem(OPEN_VIEW_KEY, v); } catch {}
}
function openView(): "windows" | "tabs" {
  try { return localStorage.getItem(OPEN_VIEW_KEY) === "windows" ? "windows" : "tabs"; } catch { return "tabs"; }
}
