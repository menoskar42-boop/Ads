/**
 * «النهارده» بتوقيت القاهرة (YYYY-MM-DD).
 *
 * المالك ٢٠٢٦-١١-٠٥: عضو فى جروب درس مار مرقس «بيفتح الجروب الساعه 12 و خمسه فى نص الليل بيلاقى القرايات لسه بتاعه
 * اليوم السابق». السيرفر كان بيحسب اليوم بـUTC (toISOString) — ونص الليل فى القاهرة = ١٠ بالليل UTC (الشتا)، فاليوم
 * كان بيتغيّر الساعة ٢ الفجر. دلوقتى «النهارده» و«قرأوا النهارده» وتاريخ القراءة كلهم بتوقيت القاهرة.
 */
const FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });

export function cairoDay(at: Date | number = Date.now()): string {
  return FMT.format(typeof at === "number" ? new Date(at) : at);
}
