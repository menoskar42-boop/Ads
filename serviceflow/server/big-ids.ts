/**
 * أرقام طويلة فى ملفات الإكسيل (المسلسل/رقم الخدمة ٢٠ رقم، رقم المرجع ١٧ رقم) —
 * لازم تفضل نص زى ما هى فى الملف.
 *
 * المالك ٢٠٢٦-١٠-٢٦: المسلسل فى «المعاينات الحالية» ظاهر 26102611502945812000
 * والشيت فيه 26102611502945814096. السبب: XLSX بيقرا الخلية كرقم، والرقم اللى
 * أكبر من 2^53 بيتقرّب (آخره أصفار أو رقم غلط). القيمة الأصلية موجودة فى `w`
 * (النص المكتوب فى الملف) — فبنرجّعها هى.
 */
export function keepBigIntegersAsText(ws: Record<string, any>): number {
  let fixed = 0;
  for (const [addr, cell] of Object.entries(ws)) {
    if (addr[0] === "!" || !cell || cell.t !== "n") continue;
    if (Number.isSafeInteger(cell.v) || Math.abs(cell.v) < Number.MAX_SAFE_INTEGER) continue;
    const text = String(cell.w ?? "").trim();
    if (!/^\d+$/.test(text)) continue; // رقم علمى/عشرى حقيقى — نسيبه
    cell.t = "s";
    cell.v = text;
    fixed++;
  }
  return fixed;
}
