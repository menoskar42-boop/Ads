// المالك ٢٠٢٦-١١-٠٣: الفنى الشريك (اللى بيشتغل مع فنى تانى — tech_partners) بيظهر فى سطر لوحده، بس **دايماً بعد**
// سطر الفنى الأساسى على طول (حسن ثم إسلام)، مهما كان ترتيب الجدول.
export function partnersAfterPrincipal<T>(rows: T[], nameOf: (r: T) => string, partnerOf: (r: T) => string | undefined | null): T[] {
  const names = new Set(rows.map(nameOf));
  const isFollower = (r: T) => { const p = partnerOf(r); return !!p && p !== nameOf(r) && names.has(p); };
  const out: T[] = [];
  for (const r of rows) {
    if (isFollower(r)) continue;
    out.push(r);
    for (const f of rows) if (isFollower(f) && partnerOf(f) === nameOf(r)) out.push(f);
  }
  return out;
}
