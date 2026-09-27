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

export async function copyHtmlTable(
  columns: string[],
  rows: (string | number | null | undefined)[][],
): Promise<boolean> {
  const cell = (v: any, head = false) => {
    const raw = latinDigitsForOutlook(v == null ? "" : String(v));
    const hasArabic = /[؀-ۿ]/.test(raw);
    const inner = hasArabic ? raw : `<span dir="ltr" lang="en-US" style="unicode-bidi:embed">${raw}</span>`;
    const tag = head ? "th" : "td";
    const st = `border:1px solid #000;padding:4px 8px;white-space:nowrap;${head ? "background:#f2f2f2;font-weight:bold;" : ""}`;
    return `<${tag} dir="rtl" align="right" style="${st}">${inner}</${tag}>`;
  };
  const head = `<tr dir="rtl">${columns.map((c) => cell(c, true)).join("")}</tr>`;
  const body = rows.map((r) => `<tr dir="rtl">${r.map((c) => cell(c)).join("")}</tr>`).join("");
  const html = `<table dir="rtl" border="1" style="direction:rtl;border-collapse:collapse;font-family:Arial;font-size:13px">${head}${body}</table>`;
  const text = [columns, ...rows].map((r) => r.map((c) => latinDigitsForOutlook(c == null ? "" : String(c))).join("\t")).join("\n");
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
