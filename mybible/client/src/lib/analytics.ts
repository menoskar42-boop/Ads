// أحداث Google Analytics (المالك ٢٠٢٦-١١-٠٣ — بعد تقرير Ask Advisor: «مفيش أى حدث غير purchase»).
// بتتبعت بالـgtag اللى فى index.html. ⛔ من غير أى بيانات شخصية: مفيش اسم ولا رقم عضوية ولا موبايل ولا نص رسالة —
// أى مفتاح فيه كلمة من دول بيتشال قبل الإرسال (شروط Google Analytics بتمنع إرسال بيانات تعرّف الشخص).
// الأحداث: group_join · reading_log · plan_start · plan_day_complete · plan_complete · verse_share · verse_save ·
// daily_verse_on · offline_download · search
type Params = Record<string, string | number | boolean | null | undefined>;

const PII_KEY = /name|phone|mobile|member|key|email|message|text|user/i;

export function track(event: string, params: Params = {}): void {
  try {
    const g = (window as any).gtag;
    if (typeof g !== 'function') return;
    const clean: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v == null || PII_KEY.test(k)) continue;
      clean[k] = typeof v === 'string' ? v.slice(0, 100) : v;
    }
    g('event', event, clean);
  } catch {
    // التتبّع إضافة — مايوقّفش أى حاجة لو فشل
  }
}
