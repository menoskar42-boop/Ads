// وقت الرفع بصيغة مختصرة: "اليوم HH:MM" أو "DD/MM HH:MM" — بتوقيت القاهرة دايماً، مش ساعة الجهاز
// (المالك ٢٠٢٦-١١-٠١: بعد رجوع الساعة، جهاز ساعته متأخّرة/متقدّمة ساعة كان بيعرض ٩:٣٧ بدل ٨:٣٧).
const CAIRO_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function cairoParts(d: Date) {
  const p: Record<string, string> = {};
  for (const x of CAIRO_PARTS.formatToParts(d)) p[x.type] = x.value;
  return p;
}
export function fmtUploadTime(iso?: string | null, now: Date = new Date()): string {
  if (!iso) return "لم يُرفع";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const a = cairoParts(d), b = cairoParts(now);
  const time = `${a.hour}:${a.minute}`;
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
  return sameDay ? `اليوم ${time}` : `${a.day}/${a.month} ${time}`;
}
