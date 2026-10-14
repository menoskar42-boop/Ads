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
// المالك ٢٠٢٦-١٠-١٤: «لو القياس طلع اسكور أعلى من ١٠٠ تجدول قياس تانى بعد دقيقتين» — على قياس
// السلسلة بس (رفع ← إيقاف ← قياس)، ومرة واحدة (القياس التانى مالوش علامة فمابيكرّرش).
export const RECHECK_MARK = "+تأكيد";
export const RECHECK_SCORE_ABOVE = 100;
export const RECHECK_AFTER_MIN = 2;
// النتايج اللى معناها إن المهمة اتنفّذت (أو التاب اتقفل بعد ما خلص) — غير كده مفيش متابعة
const FINISHED = new Set(["", "done", "tab_closed"]);

export interface FollowupJob { type: string; note: string | null; result: string | null }
export interface Followup { type: "stop" | "measure"; note: string; afterMin: number }

/** المتابعة اللى المفروض تتعمل بعد ما المهمة دى خلصت (أو null). */
export function followupFor(job: FollowupJob): Followup | null {
  const note = String(job.note || "");
  if (!FINISHED.has(String(job.result || ""))) return null;
  const base = baseNote(note);
  if (job.type === "raise" && note.includes(RAISE_STOP_MARK)) {
    return { type: "stop", note: `${base} ${STOP_MEASURE_MARK}`.trim(), afterMin: STOP_AFTER_RAISE_MIN };
  }
  if (job.type === "stop" && note.includes(STOP_MEASURE_MARK)) {
    // قياس Real عادى — نفس مصدر الطلب (بحث برقم التليفون ⇒ «A recent fix» زى أى قياس من هناك)
    // وعليه علامة «+تأكيد»: لو طلع اسكور أعلى من ١٠٠ بيتعمل قياس تانى (recheckFor)
    return { type: "measure", note: `${base} ${RECHECK_MARK}`.trim(), afterMin: MEASURE_AFTER_STOP_MIN };
  }
  return null;
}

/** الملاحظة من غير علامات السلسلة. */
export function baseNote(note: string | null | undefined): string {
  let t = String(note || "");
  for (const m of [RAISE_STOP_MARK, STOP_MEASURE_MARK, RECHECK_MARK]) t = t.split(m).join("");
  return t.replace(/\s+/g, " ").trim();
}

/**
 * قياس السلسلة خلص بالاسكور ده ⇒ قياس تانى بعد دقيقتين لو الاسكور أعلى من ١٠٠ (أو null).
 * `score` = آخر قياس اتسجّل للأكونت **بعد** ما المهمة اتسحبت (غير كده null ⇒ مفيش إعادة).
 */
export function recheckFor(job: FollowupJob, score: number | null | undefined): Followup | null {
  if (job.type !== "measure" || !String(job.note || "").includes(RECHECK_MARK)) return null;
  if (!FINISHED.has(String(job.result || ""))) return null;
  if (score == null || !Number.isFinite(Number(score)) || Number(score) <= RECHECK_SCORE_ABOVE) return null;
  return { type: "measure", note: baseNote(job.note), afterMin: RECHECK_AFTER_MIN };
}
