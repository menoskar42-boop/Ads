// أكتر من مقصّر فى «رد التكرار» (المالك ٢٠٢٦-١٠-٠٧) — دوال من غير قاعدة بيانات عشان تتختبر لوحدها.
const TEXT_MAX = 2000;
const clean = (v: unknown) => String(v ?? "").trim().slice(0, TEXT_MAX);

export interface AtFault { name: string; kind: string }
/** الأسماء اللى جاية من الشاشة (قايمة، أو اسم واحد زى الإصدار القديم) — من غير تكرار ولا فاضى. */
export const atFaultNamesFrom = (body: any): string[] => {
  const raw = Array.isArray(body?.atFaultNames) ? body.atFaultNames : body?.atFaultName != null ? [body.atFaultName] : [];
  return [...new Set(raw.map((x: unknown) => clean(x)).filter(Boolean) as string[])].slice(0, 20);
};
/** أسماء الفنيين (الخمسة) المقصّرين فى الرد — من at_faults، أو العمود القديم لرد قديم. */
export const faultTechNames = (rv: any): string[] => {
  const list: AtFault[] = Array.isArray(rv?.at_faults) ? rv.at_faults
    : rv?.at_fault_name ? [{ name: rv.at_fault_name, kind: rv.at_fault_kind }] : [];
  return list.filter((x) => x.kind === "tech" && x.name).map((x) => x.name);
};
/** الأعمدة القديمة بتفضل مليانة للعرض والبحث: الأسماء مجمّعة، والنوع لو كلهم نوع واحد وإلا mixed. */
export const atFaultColumns = (list: AtFault[]): { name: string | null; kind: string | null } => {
  if (!list.length) return { name: null, kind: null };
  const kinds = [...new Set(list.map((x) => x.kind))];
  return { name: list.map((x) => x.name).join("، "), kind: kinds.length === 1 ? kinds[0] : "mixed" };
};
