/**
 * القاعدة واقعة ولا الاستعلام نفسه غلط؟
 *
 * ٢٠٢٦-١٠-٠٧: Supabase بعت إن حصة النقل خلصت وإن الطلبات «بتتساب» لحد ٢٤ أكتوبر.
 * لو القاعدة مابتردّش، الجلسة نفسها (اللي بتتقري من القاعدة مع كل طلب) كانت بترجّع
 * خطأ قبل ما الطلب يوصل لأى محتوى — حتى التفسير والسنكسار اللى مش فى القاعدة أصلاً.
 *
 * الفرق المهم: «القاعدة مش متاحة» (اتصال/مهلة/حظر) ⇒ نكمّل القراءة من غير جلسة.
 * أى خطأ تانى (استعلام غلط مثلاً) ⇒ زى ما هو، عشان مانخبّيش غلطة حقيقية.
 *
 * الملف ده خالص (مفيش قاعدة) عشان الاختبار يقدر ينفّذه فعلاً.
 */
const DOWN_CODES = new Set([
  "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "EPIPE",
  // PostgreSQL: الاتصال اتقفل / السيرفر بيقفل / مش قادر يتصل / زحمة اتصالات
  "57P01", "57P02", "57P03", "08000", "08001", "08003", "08004", "08006", "53300",
]);
const DOWN_TEXT = /timeout|timed out|connection terminated|terminated unexpectedly|connection refused|could not connect|ECONNREFUSED|ENOTFOUND|too many clients|max clients|circuit breaker|tenant or user not found|restricted|quota|exceeded/i;

export function isDbUnavailable(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: unknown; message?: unknown; cause?: unknown };
  if (typeof e.code === "string" && DOWN_CODES.has(e.code)) return true;
  if (typeof e.message === "string" && DOWN_TEXT.test(e.message)) return true;
  return e.cause ? isDbUnavailable(e.cause) : false;
}

/** القراءة بس (فتح صفحة أو محتوى). التسجيل والكتابة لازم تفضل بتفشل بوضوح. */
export const isReadRequest = (method: string | undefined): boolean => method === "GET" || method === "HEAD";

let lastLogAt = 0;
/** سطر واحد فى الدقيقة بالكتير — مانغرقش اللوج وقت ما القاعدة واقعة. */
export function logDbDegraded(where: string, err: unknown): void {
  const now = Date.now();
  if (now - lastLogAt < 60_000) return;
  lastLogAt = now;
  const msg = (err as { message?: string })?.message || String(err);
  console.warn(`[db-degraded] ${where}: القاعدة مش بترد — القراءة شغّالة من غير جلسة (${msg.slice(0, 120)})`);
}
