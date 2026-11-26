// نسخ جدول كـ HTML بحدود (RTL) للصقه فى الإيميل (Outlook) مباشرة.
// - RTL مضبوط: dir="rtl" على الجدول + الصفوف + الخلايا (Outlook أحياناً بيتجاهل dir على الجدول وحده).
// - أرقام لاتينية (1 2 3) **دايماً**، حتى التاريخ ورقم الكابينة جوّه كلام عربى.
//
// ⚠️ Outlook بيرسم بـWord، وWord إعداد الأرقام عنده «Context»: الرقم بيتشكّل حسب آخر
// حرف «قوى» قبله. الخلية اللى كلها أرقام فى فقرة RTL (أو رقم بعد كلمة عربى زى
// «كابينة 1») بتطلع هندى (١ ٢ ٣) — والـspan dir="ltr" لوحده ماكانش كفاية
// (٢٠٢٦-٠٩-٢٧: السعة ٨٢٠ والتاريخ ٢٠٢٦/٠٩/٢٨ طلعوا هندى فى الميل).
// الحل: علامة LRM (U+200E، مش ظاهرة) قبل كل رقم — فآخر حرف قوى قبله يبقى لاتينى.
const LRM = "\u200E";
const toWesternDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
   .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/** كل رقم (ومعاه / - : . , اللى جوّاه زى التاريخ) يتسبق بـ LRM، والأرقام الهندى تبقى لاتينى. */
export function latinDigitsForOutlook(value: string): string {
  return toWesternDigits(String(value ?? "")).replace(/[0-9][0-9/:.,\-]*/g, (m) => LRM + m);
}

// ⚠️ Word (Outlook) بيضغط الجدول على عرض الرسالة وبيكسر الكلمة حرف حرف فى عمود ضيق — وبيتجاهل
// white-space:nowrap فى الـCSS (٢٠٢٦-١١-١٧: «الساعة» و«Cabinet» و«10 إلى 1» طلعوا حرف فى كل سطر).
// الحل: عرض ثابت لكل عمود بالبكسل (attribute width + nowrap اللى Word بيقراهم) محسوب من المحتوى:
// القيم ماتتكسرش خالص، والعنوان يلفّ بين الكلمات بس (أطول كلمة فيه بتدخل كاملة).
const PX_PER_CHAR = 8;
const CELL_PAD = 20;
const visibleLen = (s: string) => [...s.replace(/[\u200E\u200F]/g, "")].length;

/** عرض كل عمود بالبكسل: أطول قيمة كاملة، وأطول كلمة فى العنوان. */
export function columnWidths(columns: string[], rows: (string | number | null | undefined)[][]): number[] {
  return columns.map((c, i) => {
    const headWord = Math.max(0, ...String(c ?? "").split(/\s+/).map(visibleLen));
    const body = Math.max(0, ...rows.map((r) => visibleLen(latinDigitsForOutlook(r[i] == null ? "" : String(r[i])))));
    return Math.max(44, Math.max(headWord, body) * PX_PER_CHAR + CELL_PAD);
  });
}

export async function copyHtmlTable(
  columns: string[],
  rows: (string | number | null | undefined)[][],
  options?: { introText?: string },
): Promise<boolean> {
  const widths = columnWidths(columns, rows);
  const cell = (v: any, i: number, head = false) => {
    const raw = latinDigitsForOutlook(v == null ? "" : String(v));
    const hasArabic = /[؀-ۿ]/.test(raw);
    const inner = hasArabic ? raw : `<span dir="ltr" lang="en-US" style="unicode-bidi:embed">${raw}</span>`;
    const tag = head ? "th" : "td";
    const w = widths[i];
    // العنوان يلفّ بين الكلمات بس · القيم سطر واحد (nowrap كـattribute عشان Word)
    const wrap = head ? "white-space:normal;" : "white-space:nowrap;";
    const st = `border:1px solid #000;padding:4px 8px;width:${w}px;min-width:${w}px;${wrap}${head ? "background:#f2f2f2;font-weight:bold;" : ""}`;
    return `<${tag} dir="rtl" align="right" valign="middle" width="${w}"${head ? "" : " nowrap"} style="${st}">${inner}</${tag}>`;
  };
  const total = widths.reduce((a, b) => a + b, 0);
  const cols = `<colgroup>${widths.map((w) => `<col width="${w}" style="width:${w}px">`).join("")}</colgroup>`;
  const head = `<tr dir="rtl">${columns.map((c, i) => cell(c, i, true)).join("")}</tr>`;
  const body = rows.map((r) => `<tr dir="rtl">${r.map((c, i) => cell(c, i)).join("")}</tr>`).join("");
  const introHtml = options?.introText
    ? `<p dir="rtl" align="right" style="font-family:Arial;font-size:13px;margin:0 0 8px">${options.introText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
    : "";
  const html = `${introHtml}<table dir="rtl" border="1" cellspacing="0" cellpadding="4" width="${total}" style="direction:rtl;border-collapse:collapse;font-family:Arial;font-size:13px;width:${total}px;table-layout:fixed">${cols}${head}${body}</table>`;
  const tableText = [columns, ...rows].map((r) => r.map((c) => latinDigitsForOutlook(c == null ? "" : String(c))).join("\t")).join("\n");
  const text = options?.introText ? `${latinDigitsForOutlook(options.introText)}\n\n${tableText}` : tableText;
  try {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    })]);
    return true;
  } catch {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }
}
