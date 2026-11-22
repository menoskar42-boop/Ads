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
// المالك ٢٠٢٦-١٠-٢٧: «لو الإيقاف قعد ١٠ دقايق واتقفل علشان الطابور يكمل ⇒ يجدول إيقاف تانى لنفس
// الرقم بعد ١٠ دقايق». الإيقاف خلص (تاب اتقفل/وقف) ومفيش إيقاف اتسجّل للرقم من ساعة ما اتسحب ⇒
// إيقاف جديد بعد ١٠ دقايق بنفس الملاحظة (فالقياس بعده لسه شغّال) + «+إعادة<رقم>»، لحد ٣ مرات.
export const STOP_RETRY_MARK = "+إعادة";
// «تحديث المسافة» (المالك ٢٠٢٦-١١-٠٣): قياس «بدون Real» مابقاش بيقرا المسافة — قراية «Estimated Loop Length»
// بقت مهمة لوحدها. بتتحط فى note مع «بدون Real» فبتاخد نفس تابات «بدون Real» وQياس Real يشتغل جنبها،
// وسكربت القياس بيفتح شاشة DSL بس (sf_mode=loop). مسارها: /api/loop-length/ingest ← line_loop_lengths.
export const LOOP_MARK = "تحديث المسافة";
// «Perform XELT» (ASSIA المرحلة ٣ — المالك ٢٠٢٦-١١-١١): خط عطل جديد XELT بتاعه مالوش بيانات قديمة ⇒ مهمة قياس
// عاجلة لوحدها (من غير «بدون Real» فبتشتغل لوحدها زى Real)، وسكربت القياس (≥10.41.0) بـ sf_mode=xelt.
export const XELT_MARK = "Perform XELT";
// «إعادة بعد 102 و 104» (المالك ٢٠٢٦-١١-٠٣): قياس Real طلع 102 (حقل Dispatch Score مش موجود) أو 104 (timeout/مشغول)
// ⇒ بعد ٥ دقايق قياس Real تانى للخط فى باتش لوحده بالاسم ده — إلا لو أى حد قاس الخط فى الخمس دقايق دول.
// مرة واحدة: لو الإعادة نفسها طلعت 102/104 تانى (جوّه نص ساعة) مفيش إعادة تالتة.
export const RETRY_102_MARK = "إعادة بعد 102 و 104";
export const RETRY_102_SCORES = new Set([102, 104]);
export const RETRY_102_AFTER_MIN = 5;
export const RETRY_102_ONCE_MIN = 30;
/** القياس ده محتاج إعادة بعد ٥ دقايق؟ Real بس، والاسكور 102 أو 104. */
export function retry102For(measureMode: string | null | undefined, score: unknown): boolean {
  if (String(measureMode || "real") !== "real") return false;
  const n = typeof score === "number" ? score : /^\s*\d+\s*$/.test(String(score ?? "")) ? parseInt(String(score), 10) : NaN;
  return RETRY_102_SCORES.has(n);
}
export const STOP_RETRY_AFTER_MIN = 10;
export const STOP_RETRY_MAX = 3;
const STOP_RETRY_RE = /\+إعادة(\d*)/g;
// النتايج اللى معناها إن الإيقاف اتقفل من غير ما يخلص (مش إلغاء يدوى ولا جهاز اتقفل ولا مقاطعة)
const STOP_RETRY_RESULTS = new Set(["", "tab_closed", "timeout"]);
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
  t = t.replace(STOP_RETRY_RE, "");
  for (const m of [RAISE_STOP_MARK, STOP_MEASURE_MARK, RECHECK_MARK]) t = t.split(m).join("");
  return t.replace(/\s+/g, " ").trim();
}

/** رقم إعادة الإيقاف اللى على الملاحظة (٠ = الإيقاف الأصلى). */
export function stopRetryCount(note: string | null | undefined): number {
  let n = 0;
  for (const m of String(note || "").matchAll(STOP_RETRY_RE)) n = Math.max(n, Number(m[1]) || 1);
  return n;
}

/**
 * الإيقاف خلص من غير ما يتسجّل للرقم (`recorded` = فيه line_po_events.last_stop_at بعد ما
 * المهمة اتسحبت) ⇒ إيقاف تانى بعد ١٠ دقايق (أو null). بيحتفظ بـ«+قياس» لو كانت موجودة فالقياس
 * مابيتعملش غير بعد إيقاف حقيقى.
 */
export function stopRetryFor(job: FollowupJob, recorded: boolean): Followup | null {
  if (job.type !== "stop" || recorded) return null;
  if (!STOP_RETRY_RESULTS.has(String(job.result || ""))) return null;
  const n = stopRetryCount(job.note);
  if (n >= STOP_RETRY_MAX) return null;
  const note = String(job.note || "").replace(STOP_RETRY_RE, "").replace(/\s+/g, " ").trim();
  return { type: "stop", note: `${note} ${STOP_RETRY_MARK}${n + 1}`.trim(), afterMin: STOP_RETRY_AFTER_MIN };
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
