// نتيجة «إيقاف PO» (المالك ٢٠٢٦-١٠-٢٧): «Not Started يسجّل التاريخ وإنه لم يقم بعملية الإيقاف ·
// In Nightly PO يسجّل التاريخ وإنه تم الإيقاف». سكربت PO (v0.9.11) بيبعتها مع الحدث، والسيرفر
// بيخزّنها فى line_po_events.last_stop_result، والتقارير بتكتبها جنب «آخر إيقاف PO».
export type PoStopResult = "stopped" | "already" | "inactive";

export const PO_STOP_RESULT_AR: Record<PoStopResult, string> = {
  stopped: "تم الإيقاف",
  already: "لم يتم الإيقاف (كان Not Started)",
  inactive: "لم يتم الإيقاف لأنه Inactive Line",
};

// رفع السرعة على خط «Inactive Line» (المالك ٢٠٢٦-١١-١١): السكربت (0.9.26) مابيرفعش وبيبعت result=inactive، والسيرفر
// بيخزّن الوقت فى line_po_events.raise_inactive_at (مش last_raise_at عشان التقارير ماتقولش «اترفع»).
export const RAISE_INACTIVE_AR = "لم يتم عمل رفع سرعة لأنه Inactive Line";

/** آخر محاولة رفع كانت على خط Inactive (أحدث من آخر رفع فعلى)؟ */
export function raiseWasInactive(inactiveAt: unknown, raiseAt: unknown): boolean {
  const i = inactiveAt ? new Date(String(inactiveAt)).getTime() : NaN;
  if (!Number.isFinite(i)) return false;
  const r = raiseAt ? new Date(String(raiseAt)).getTime() : NaN;
  return !Number.isFinite(r) || i >= r;
}

/** القيمة اللى جاية من السكربت ← قيمة معروفة أو null (سكربت قديم/قيمة غريبة). */
export function poStopResultOf(v: unknown): PoStopResult | null {
  const t = String(v ?? "").trim().toLowerCase();
  return t === "stopped" || t === "already" || t === "inactive" ? t : null;
}

/** التاريخ المعروض + النتيجة لو معروفة (من غير تاريخ ⇒ زى ما هو). */
export function withPoStopResult(dateText: string, result: string | null | undefined): string {
  const r = poStopResultOf(result);
  if (!r || !dateText || /^[-—–\s]*$/.test(dateText)) return dateText;
  return `${dateText} — ${PO_STOP_RESULT_AR[r]}`;
}
