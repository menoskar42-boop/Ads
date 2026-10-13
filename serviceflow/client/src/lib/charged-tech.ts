// العطل محسوب على مين (المالك ٢٠٢٦-١٠-١٣): «الأولوية لفنى الإغلاق تتحسب عليه، لكن لو فنى الإغلاق
// غير معروف تتحسب على فنى المنطقة» — نفس قاعدة الأرقام فى الجداول (effTechSql فى السيرفر).
// السيرفر بيبعت chargedTech جاهز؛ ولو مش موجود (رد قديم) بنحسبه بنفس القاعدة.
export const UNKNOWN_TECH = "غير معروف";

export function chargedTechOf(r: { chargedTech?: string | null; closeByName?: string | null; areaTechName?: string | null }): string {
  if (r.chargedTech) return r.chargedTech;
  const close = (r.closeByName || "").trim();
  if (close && close !== UNKNOWN_TECH) return close;
  return (r.areaTechName || "").trim() || UNKNOWN_TECH;
}

/** أسماء الفنيين اللى ليهم صفوف محسوبة عليهم — لقايمة الفلتر. */
export function chargedTechOptions(rows: any[] | null | undefined): string[] {
  const s = new Set<string>();
  for (const r of rows ?? []) {
    const t = chargedTechOf(r);
    if (t && t !== UNKNOWN_TECH) s.add(t);
  }
  return [...s].sort((a, b) => a.localeCompare(b, "ar"));
}
