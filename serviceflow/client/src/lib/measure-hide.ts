/**
 * أعمدة السرعة والاسكور — مخفية عن كل المستخدمين غير السوبر أدمن (المالك ٢٠٢٦-١٠-١٩).
 *
 * «مش عاوز أى مستخدم يشوف أعمدة السرعة أو الاسكور فى أى جدول غير السوبر أدمن… إلا فى تقرير بحث
 * برقم التليفون… والمتوسطات لكل كابينة أو بكس مفيش منها مشكلة».
 *
 * البيانات نفسها بيشيلها السيرفر (server/measure-redact.ts). هنا الأعمدة الفاضية نفسها بتختفى —
 * فى كل جدول فى الشاشة، وفى ملفات الإكسيل (XLSX)، وفى نوافذ طباعة الـPDF — من مكان واحد،
 * عشان أى تقرير جديد يتغطّى لوحده. «بحث برقم التليفون» مستثنى ([data-measure-open]).
 */
import * as XLSX from "xlsx";

/** عنوان عمود سرعة/اسكور لخط؟ (المتوسطات بتفضل) */
export function isMeasureHeader(text: string): boolean {
  const t = String(text || "").trim();
  if (!t || /متوسط|avg|average/i.test(t)) return false;
  return /سرعة|سرعه|اسكور|سكور|score|speed|attainable|القياس الحالى|آخر قياس للرقم/i.test(t);
}

/** يخفى أعمدة القياس فى كل جدول جوّه root (ماعدا اللى جوّه [data-measure-open]). */
export function hideMeasureColumns(root: ParentNode) {
  root.querySelectorAll("table").forEach((table) => {
    if ((table as HTMLElement).closest("[data-measure-open]")) return;
    const head = table.querySelector("thead tr") || table.querySelector("tr");
    if (!head) return;
    const idx: number[] = [];
    let col = 0;
    Array.from(head.children).forEach((th) => {
      const span = Number((th as HTMLTableCellElement).colSpan) || 1;
      if (span === 1 && isMeasureHeader(th.textContent || "")) idx.push(col);
      col += span;
    });
    if (!idx.length) return;
    table.querySelectorAll("tr").forEach((tr) => {
      let c = 0;
      Array.from(tr.children).forEach((cell) => {
        const span = Number((cell as HTMLTableCellElement).colSpan) || 1;
        if (span === 1 && idx.includes(c)) (cell as HTMLElement).style.display = "none";
        c += span;
      });
    });
  });
}

/** نص HTML لنافذة الطباعة من غير أعمدة القياس. */
export function stripMeasureHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    hideMeasureColumns(doc);
    return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
  } catch {
    return html;
  }
}

let installed = false;
let observer: MutationObserver | null = null;
const orig = {
  json: XLSX.utils.json_to_sheet,
  aoa: XLSX.utils.aoa_to_sheet,
  open: typeof window !== "undefined" ? window.open : null,
};

let openDepth = 0;
/** «بحث برقم التليفون»: الإكسيل والطباعة بتاعته بالسرعات (fn متزامنة: بتكتب الملف/النافذة على طول). */
export function withMeasureOpen<T>(fn: () => T): T {
  openDepth++;
  try { return fn(); } finally { openDepth--; }
}

/** يشغّل الإخفاء (للمستخدم اللى مش سوبر أدمن) — ويرجّع دالة بتلغيه. */
export function installMeasureHider(): () => void {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;
  // الشاشة: أى جدول بيترسم أو بيتحدّث
  let pending = 0;
  const run = () => { pending = 0; hideMeasureColumns(document); };
  observer = new MutationObserver(() => { if (!pending) pending = requestAnimationFrame(run); });
  observer.observe(document.body, { childList: true, subtree: true });
  run();
  // الإكسيل: الأعمدة بالاسم (json) أو بأول صف (aoa)
  (XLSX.utils as any).json_to_sheet = (rows: any[], opts?: any) => openDepth ? orig.json(rows, opts) :
    orig.json(Array.isArray(rows) ? rows.map((r) => (r && typeof r === "object"
      ? Object.fromEntries(Object.entries(r).filter(([k]) => !isMeasureHeader(k))) : r)) : rows, opts);
  (XLSX.utils as any).aoa_to_sheet = (rows: any[][], opts?: any) => {
    if (openDepth || !Array.isArray(rows) || !Array.isArray(rows[0])) return orig.aoa(rows, opts);
    const drop = new Set(rows[0].map((h, i) => (isMeasureHeader(String(h ?? "")) ? i : -1)).filter((i) => i >= 0));
    return orig.aoa(drop.size ? rows.map((r) => (Array.isArray(r) ? r.filter((_, i) => !drop.has(i)) : r)) : rows, opts);
  };
  // الـPDF: نوافذ الطباعة اللى بتتكتب بـ document.write
  if (orig.open) {
    window.open = function (...args: any[]) {
      const w = (orig.open as any).apply(window, args);
      try {
        if (w && w.document && !openDepth) {
          const write = w.document.write.bind(w.document);
          w.document.write = (...html: string[]) => write(stripMeasureHtml(html.join("")));
        }
      } catch { /* نافذة من دومين تانى */ }
      return w;
    } as typeof window.open;
  }
  return () => {
    observer?.disconnect();
    observer = null;
    (XLSX.utils as any).json_to_sheet = orig.json;
    (XLSX.utils as any).aoa_to_sheet = orig.aoa;
    if (orig.open) window.open = orig.open;
    installed = false;
  };
}
