// نسخ الأرقام الطويلة لإكسيل من غير ما تبوظ.
//
// إكسيل بيخزّن الرقم بدقّة **١٥ رقم بس**. مسلسل متعذر زى 26060111542441081656
// (٢٠ رقم) لما يتنسخ من الموقع ويتلزق فى خلية، إكسيل بيقراه رقم فبيحتفظ بأول
// ١٥ ويحوّل الباقى أصفار: 26060111542441000000 — والأرقام اللى راحت مابترجعش
// من الخلية تانى. ونفس الحكاية مع أى رقم بيبدأ بصفر (التليفون 0101… بيبقى 101…).
//
// الحل: وقت النسخ، لو التحديد فيه خلية كلها رقم «خطر» (١٦ رقم أو أكتر، أو بيبدأ
// بصفر ومن ٦ أرقام فأكتر)، بنحط فى الحافظة كمان نسخة HTML الخلية دى فيها
// mso-number-format:"\@" — دى علامة إكسيل بتاعة «الخلية دى نص». إكسيل بياخد
// الـHTML لما يكون موجود، فالرقم بيتلزق زى ما هو بالظبط. وأى برنامج تانى
// (واتساب، Notepad، خانة بحث) بياخد النص العادى زى الأول من غير أى تغيير.
//
// مابنلمسش: النسخ من جوّه خانة كتابة (input/textarea/contenteditable)، ولا أى
// نسخ مافيهوش رقم خطر — النسخ ده بيفضل زى ما المتصفح بيعمله بالظبط.

const RISKY_LONG = /^\d{16,}$/;
const RISKY_ZERO = /^0\d{5,}$/;

/** خلية كلها رقم إكسيل هيبوّظه لو اتلزق كرقم. */
export function isExcelRiskyNumber(cell: string): boolean {
  const v = String(cell ?? "").trim();
  return RISKY_LONG.test(v) || RISKY_ZERO.test(v);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * نسخة HTML للحافظة من النص المنسوخ — أو null لو مفيش خلية خطر (ساعتها
 * مانغيّرش حاجة). السطور = صفوف والـTab = أعمدة، زى ما المتصفح بينسخ الجداول.
 */
export function excelSafeHtml(text: string): string | null {
  const body = String(text ?? "").replace(/\r/g, "").replace(/^\n+|\n+$/g, "");
  if (!body) return null;
  const rows = body.split("\n").map((r) => r.split("\t"));
  if (!rows.some((r) => r.some(isExcelRiskyNumber))) return null;
  const td = (c: string) =>
    isExcelRiskyNumber(c)
      ? `<td style='mso-number-format:"\\@"'>${esc(c.trim())}</td>`
      : `<td>${esc(c)}</td>`;
  return `<table>${rows.map((r) => `<tr>${r.map(td).join("")}</tr>`).join("")}</table>`;
}

function inEditable(node: Node | null): boolean {
  const el = (node && (node.nodeType === 1 ? node : node.parentElement)) as HTMLElement | null;
  return !!el?.closest?.("input, textarea, [contenteditable=''], [contenteditable='true']");
}

let installed = false;
export function installExcelSafeCopy(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("copy", (e: ClipboardEvent) => {
    try {
      if (e.defaultPrevented || !e.clipboardData) return;   // زرار «نسخ» عامل حسابه بنفسه
      if (inEditable(document.activeElement)) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || inEditable(sel.anchorNode)) return;
      const text = sel.toString();
      const html = excelSafeHtml(text);
      if (!html) return;
      e.clipboardData.setData("text/plain", text);
      e.clipboardData.setData("text/html", html);
      e.preventDefault();
    } catch { /* النسخ العادى يكمّل زى ما هو */ }
  });
}
