// «رفع السرعة ثم الإيقاف» على مراحل فى الطابور (المالك ٢٠٢٦-١٠-١٢):
//   رفع سرعة عادى (من غير إيقاف فى نفس التشغيلة) ← بعد ٧ دقايق «إيقاف PO» بيدخل الطابور
//   لوحده ← بعد ما الإيقاف يخلص بدقيقتين «قياس Real» بيدخل الطابور — وكل واحد بياخد دوره.
// قبل كده «+إيقاف» كان بيشغّل الرفع والإيقاف فى تشغيلة PO واحدة.
//
// المتابعة بتستنى فى exec_followups ومابتدخلش exec_jobs غير لما وقتها ييجى — فمابتعطّلش
// سحب الطابور ولا بتحجز الموقع وهى لسه مستنية.
export const RAISE_STOP_MARK = "+إيقاف";     // على مهمة الرفع: بعدها إيقاف PO
export const STOP_MEASURE_MARK = "+قياس";    // على مهمة الإيقاف: بعدها قياس Real
export const STOP_AFTER_RAISE_MIN = 7;
export const MEASURE_AFTER_STOP_MIN = 2;
// النتايج اللى معناها إن المهمة اتنفّذت (أو التاب اتقفل بعد ما خلص) — غير كده مفيش متابعة
const FINISHED = new Set(["", "done", "tab_closed"]);

export interface FollowupJob { type: string; note: string | null; result: string | null }
export interface Followup { type: "stop" | "measure"; note: string; afterMin: number }

/** المتابعة اللى المفروض تتعمل بعد ما المهمة دى خلصت (أو null). */
export function followupFor(job: FollowupJob): Followup | null {
  const note = String(job.note || "");
  if (!FINISHED.has(String(job.result || ""))) return null;
  const base = note.split(RAISE_STOP_MARK).join("").split(STOP_MEASURE_MARK).join("").replace(/\s+/g, " ").trim();
  if (job.type === "raise" && note.includes(RAISE_STOP_MARK)) {
    return { type: "stop", note: `${base} ${STOP_MEASURE_MARK}`.trim(), afterMin: STOP_AFTER_RAISE_MIN };
  }
  if (job.type === "stop" && note.includes(STOP_MEASURE_MARK)) {
    // قياس Real عادى — نفس مصدر الطلب (بحث برقم التليفون ⇒ «A recent fix» زى أى قياس من هناك)
    return { type: "measure", note: base, afterMin: MEASURE_AFTER_STOP_MIN };
  }
  return null;
}
