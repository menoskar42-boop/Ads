// نتيجة «إيقاف PO» (المالك ٢٠٢٦-١٠-٢٧): «Not Started يسجّل التاريخ وإنه لم يقم بعملية الإيقاف ·
// In Nightly PO يسجّل التاريخ وإنه تم الإيقاف». سكربت PO (v0.9.11) بيبعتها مع الحدث، والسيرفر
// بيخزّنها فى line_po_events.last_stop_result، والتقارير بتكتبها جنب «آخر إيقاف PO».
export type PoStopResult = "stopped" | "already";

export const PO_STOP_RESULT_AR: Record<PoStopResult, string> = {
  stopped: "تم الإيقاف",
  already: "لم يتم الإيقاف (كان Not Started)",
};

/** القيمة اللى جاية من السكربت ← قيمة معروفة أو null (سكربت قديم/قيمة غريبة). */
export function poStopResultOf(v: unknown): PoStopResult | null {
  const t = String(v ?? "").trim().toLowerCase();
  return t === "stopped" || t === "already" ? t : null;
}

/** التاريخ المعروض + النتيجة لو معروفة (من غير تاريخ ⇒ زى ما هو). */
export function withPoStopResult(dateText: string, result: string | null | undefined): string {
  const r = poStopResultOf(result);
  if (!r || !dateText || /^[-—–\s]*$/.test(dateText)) return dateText;
  return `${dateText} — ${PO_STOP_RESULT_AR[r]}`;
}
