// «تحديث حالة الخط (ASSIA)» (المالك ٢٠٢٦-١١-١١): السكربت بيقرا شاشات DSL للخط من البيانات المسجّلة (من غير Real)
// ويبعتها زى ما هى. شكل كل صفحة (DZS 10.39.0):
//   { url, at, ok, error?, panels: [{ title, rows: [[label, خانة, خانة, ...], ...], text }], charts?: [...], history? }
//   كل سطر بخاناته زى ما هى فى الجدول (الخانة اللى فيها أيقونات بس = «✓n ✗m»)، والرسومات يوم بيوم لكل سلسلة.
// الدوال هنا صافية (من غير قاعدة) عشان تتختبر: line-status.test.ts.

export type LsRow = string[];
export type LsPanel = { title?: string; rows?: LsRow[]; text?: string };
export type LsSeriesDay = { d: string; sum?: number; max?: number; min?: number; last?: number; n?: number };
export type LsSeries = { name?: string; visible?: boolean; n?: number; days?: LsSeriesDay[] };
export type LsChart = { title?: string; series?: LsSeries[] };
export type LsPage = { url?: string; at?: string; ok?: boolean; error?: string; panels?: LsPanel[]; charts?: LsChart[]; history?: boolean | null };
export type LsPages = Record<string, LsPage | undefined>;

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const key = (s: unknown) => norm(s).toLowerCase().replace(/[:：]+$/, "");

/** أول قيمة للابل ده فى الصفحة (أو فى لوحة معيّنة لو اتحدّدت). المقارنة من غير حالة الحروف والنقطتين. */
export function rowValue(page: LsPage | undefined, label: string, panelTitle?: string): string | null {
  if (!page || !Array.isArray(page.panels)) return null;
  const want = key(label), pt = panelTitle ? key(panelTitle) : null;
  for (const p of page.panels) {
    if (pt && key(p.title) !== pt) continue;
    for (const r of p.rows || []) if (Array.isArray(r) && key(r[0]) === want) return norm(r.slice(1).find((c) => norm(c)) ?? "");
  }
  return null;
}

/** كل القيم للابل ده (Operational Data فيها نفس اللابل للرفع والتنزيل) */
export function rowValues(page: LsPage | undefined, label: string): string[] {
  if (!page || !Array.isArray(page.panels)) return [];
  const want = key(label), out: string[] = [];
  for (const p of page.panels) for (const r of p.rows || []) if (Array.isArray(r) && key(r[0]) === want) out.push(norm(r.slice(1).find((c) => norm(c)) ?? ""));
  return out;
}

/** حقائق بتتخزّن فى أعمدة لوحدها: الثبات (Line Summary، وإلا Diagnostic Analysis) وهل XELT ليه بيانات قديمة */
export function lineStatusFacts(pages: LsPages): { stability: string | null; xeltHistory: boolean | null } {
  const stab = rowValue(pages.summary, "Stability") || rowValue(pages.diagnostics, "Stability");
  const m = stab ? stab.match(/very unstable|unstable|stable|unknown|n\/?a/i) : null;
  const x = pages.xelt;
  const xeltHistory = x && typeof x.history === "boolean" ? x.history : null;
  return { stability: m ? m[0].toUpperCase() : (stab ? stab.slice(0, 60) : null), xeltHistory };
}
