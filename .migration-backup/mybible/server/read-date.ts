/**
 * تاريخ القراءة الحقيقى لقراءة اتسجّلت على الموبايل وقت ما القاعدة كانت واقعة.
 *
 * ٢٠٢٦-١٠-٠٧: Supabase وقف الطلبات لحد ٢٤ أكتوبر. العضو بيقرا فى درس مار مرقس، والقراءة
 * بتتحفظ على موبايله بوقتها (readAt) وتتبعت لما الخدمة ترجع. من غير ده كانت هتتسجّل بيوم
 * الإرسال — فأيام المواظبة طول الوقفة تبان فاضية وكل القراءات متكوّمة فى يوم واحد.
 *
 * بنقبل الوقت ده بس لو: مش فى المستقبل (هامش ١٠ دقايق لساعة الموبايل) ومش أقدم من
 * ٣١ يوم. أى حاجة تانية ⇒ النهارده زى الأول بالظبط.
 * التاريخ بتوقيت القاهرة (cairo-day.ts — من ٢٠٢٦-١١-٠٩؛ قبلها كان UTC فاليوم كان بيتغيّر الساعة ٢ الفجر).
 */
import { cairoDay } from "./cairo-day";

const MAX_PAST_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 10 * 60 * 1000;

export interface ReadDate { date: string; at: Date; late: boolean }

export function readDateFrom(raw: unknown, now: number = Date.now()): ReadDate {
  const fresh = (): ReadDate => { const at = new Date(now); return { date: cairoDay(at), at, late: false }; };
  if (typeof raw !== "string" || !raw) return fresh();
  const t = Date.parse(raw);
  if (!Number.isFinite(t) || t > now + MAX_FUTURE_MS || t < now - MAX_PAST_MS) return fresh();
  const at = new Date(Math.min(t, now));
  const date = cairoDay(at);
  // «متأخرة» = اتقرت فى يوم قبل النهارده (يعنى جاية من الطابور اللى على الموبايل)
  return { date, at, late: date !== cairoDay(now) };
}
