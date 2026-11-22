/**
 * جلسة القداس بتفضل في ذاكرة السيرفر، والمناسبة اللي اتخزّنت فيها بتبقى
 * «اختيار المشغّل» — فمابتتكتشفش تاني.
 *
 * الغلط اللي الملف ده اتعمل عشانه: أول ما الاكتشاف يكتب مناسبة في الجلسة
 * (مثلاً «عيد الصليب» يوم ١٧ توت)، تاني يوم الشاشة بتلاقي قيمة مخزّنة مش
 * `ordinary` فبتحترمها على إنها اختيار يدوي — وتفضل تقول «عيد الصليب»
 * والعيد عدّى. نفس الحكاية خلّت «صوم الرسل» تفضل على الشاشة شهور.
 *
 * القاعدة: **الاختيار اليدوي يخصّ يومه**. لو الجلسة اتكتبت في يوم تاني
 * (بتوقيت القاهرة)، بنرجع نكتشف من التاريخ من أول وجديد.
 */

/** تاريخ اليوم بتوقيت القاهرة بشكل YYYY-MM-DD. */
export function cairoDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(date);
}

/** هل الجلسة دي اتكتبت النهارده؟ جلسة من غير تاريخ = مش النهارده. */
export function sessionIsFromToday(updatedAt: unknown, now: Date = new Date()): boolean {
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return false;
  return cairoDay(new Date(updatedAt)) === cairoDay(now);
}

/**
 * القيمة اللي المشغّل اختارها **النهارده** بس، وإلا `null` عشان الشاشة
 * ترجع تكتشف من التاريخ.
 */
export function choiceForToday<T>(stored: T | null | undefined, updatedAt: unknown, now: Date = new Date()): T | null {
  if (stored === null || stored === undefined) return null;
  return sessionIsFromToday(updatedAt, now) ? stored : null;
}
