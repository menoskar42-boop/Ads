// خطاب «ردود التكرار» (قرار المالك ٢٠٢٦-١٠-٠٥): من رئيس قسم الشئون الخارجية إلى مدير تشغيل
// الشبكة وعمليات العملاء بالغنايم، بتوقيع تحت. لكل خط: البيان (صح ولا اتصحّح وإيه اللى
// اتغيّر)، وملاحظات فحص البكس، وإفادة العميل والفنى، ورأى الشئون الخارجية والمقصّر.
// خطاب لرد واحد أو خطاب مجمّع لكل الردود — نفس الشكل.

export const LETTER_TO = "السيد الأستاذ / مدير تشغيل الشبكة وعمليات العملاء بالغنايم";
export const LETTER_FROM = "رئيس قسم الشئون الخارجية";
const KIND_AR: Record<string, string> = { tech: "فنى", maintenance: "فنى صيانة", splice: "لحام" };

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl = (v: unknown) => esc(v).replace(/\n/g, "<br>");
const day = (v: unknown) => (v ? String(v).slice(0, 10) : "");
const monthAr = (m: string) => { const [y, mo] = String(m || "").split("-"); return y && mo ? `${mo}/${y}` : m; };
const cairoToday = () => new Date().toLocaleDateString("en-GB", { timeZone: "Africa/Cairo" });

// بيان الخط: صحيح، ولا اتصحّح (من إيه لإيه)
export function lineText(r: any): string {
  if (r.line_status === "confirmed") return "صحيح — تم التأكد منه.";
  if (r.line_status !== "corrected") return "لم يتم التأكد منه بعد.";
  const fields: [string, string, string][] = [
    ["السنترال", r.line_before_central, r.corr_central ?? r.line_central],
    ["الكابينة", r.line_before_cabin, r.corr_cabin ?? r.line_cabin],
    ["البكس", r.line_before_box, r.corr_box ?? r.line_box],
    ["الترمنال", r.line_before_terminal, r.corr_terminal ?? r.line_terminal],
  ];
  const hasBefore = fields.some(([, b]) => b != null && b !== "");
  const changes = fields
    .filter(([, b, a]) => a != null && a !== "" && (!hasBefore || String(b ?? "") !== String(a)))
    .map(([k, b, a]) => (hasBefore ? `${k} من ${b || "—"} إلى ${a}` : `${k}: ${a}`));
  const head = hasBefore ? "كان به خطأ وتم تصحيحه" : "كان به خطأ وتم تصحيحه إلى";
  return `${head}${changes.length ? ": " + changes.join("، ") : ""}.`;
}

function inspectionHtml(r: any): string {
  if (!r.inspection_id) return "لم يتم ربط فحص بعد.";
  const head = `بتاريخ ${esc(day(r.inspection_date))}${r.inspection_by ? ` — الفاحص: ${esc(r.inspection_by)}` : ""}`;
  const items: any[] = r.inspection_items || [];
  const list = items.length
    ? `<ul>${items.map((x) => {
        const extra = [x.extraType, x.extraDistance != null && x.extraDistance !== "" ? `${x.extraDistance} م` : ""].filter(Boolean).join(" — ");
        return `<li><b>${esc(x.label)}</b>${x.notes ? `: ${nl(x.notes)}` : ""}${extra ? ` (${esc(extra)})` : ""}</li>`;
      }).join("")}</ul>`
    : `<div>البكس سليم — لا توجد ملاحظات.</div>`;
  const general = r.inspection_general_notes ? `<div>ملاحظات عامة: ${nl(r.inspection_general_notes)}</div>` : "";
  return `${head}${list}${general}`;
}

function opinionHtml(r: any): string {
  const cause = r.cause ? `سبب العطل: ${nl(r.cause)}` : "سبب العطل: —";
  const fault = r.has_fault === true
    ? `يوجد مقصّر: <b>${esc(r.at_fault_name || "")}</b>${r.at_fault_kind ? ` (${esc(KIND_AR[r.at_fault_kind] ?? r.at_fault_kind)})` : ""}`
    : r.has_fault === false ? "لا يوجد مقصّر." : "يوجد مقصّر: —";
  return `${cause}<br>${fault}`;
}

function sectionHtml(r: any, n: number | null): string {
  const title = `${n != null ? `${n}) ` : ""}الخط ${esc(r.phone_short)} — شهر ${esc(monthAr(r.month))}`
    + ` — ${esc(r.line_central || "")} / كابينة ${esc(r.line_cabin || "—")} / بكس ${esc(r.line_box || "—")}`;
  const row = (k: string, v: string) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  return `<section class="line">
    <h3>${title}</h3>
    <table>
      ${row("بيان الخط", esc(lineText(r)))}
      ${row("فحص البكس", inspectionHtml(r))}
      ${row("إفادة العميل", nl(r.customer_statement || "—"))}
      ${row("إفادة الفنى", nl(r.tech_statement || "—"))}
      ${row("رأى الشئون الخارجية", opinionHtml(r))}
    </table>
  </section>`;
}

/** HTML الخطاب كامل (صفحة A4 للطباعة/PDF). */
export function buildRepeatLetterHtml(reviews: any[], opts: { signerName?: string } = {}): string {
  const one = reviews.length === 1;
  const months = Array.from(new Set(reviews.map((r) => monthAr(r.month)))).join(" و");
  const subject = one
    ? `نتيجة فحص الخط المكرر ${esc(reviews[0].phone_short)} — شهر ${esc(monthAr(reviews[0].month))}`
    : `نتيجة فحص الخطوط المكررة — عدد ${reviews.length} خط — شهر ${esc(months)}`;
  const intro = one
    ? "نتشرف بالإحاطة بأنه تم فحص الخط المكرر الموضح أدناه، وكانت النتيجة كالآتى:"
    : "نتشرف بالإحاطة بأنه تم فحص الخطوط المكررة الموضحة أدناه، وكانت النتائج كالآتى:";
  const signer = String(opts.signerName ?? "").trim();
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>${subject}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Noto Naskh Arabic", "Traditional Arabic", Tahoma, serif; font-size: 13.5px; line-height: 1.9; color: #111; margin: 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
  .org { font-weight: 700; }
  .to { font-weight: 700; margin: 14px 0 6px; }
  .subject { font-weight: 700; text-decoration: underline; margin: 10px 0; }
  .line { break-inside: avoid; page-break-inside: avoid; margin: 14px 0; }
  .line h3 { font-size: 14px; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #555; padding: 5px 8px; vertical-align: top; text-align: right; }
  th { width: 22%; background: #f1f1f1; white-space: nowrap; }
  ul { margin: 4px 0; padding-inline-start: 18px; }
  .closing { margin-top: 18px; }
  .sign { margin-top: 28px; width: 46%; margin-inline-start: auto; text-align: center; break-inside: avoid; }
  .sign .who { font-weight: 700; }
  .sign .blank { margin-top: 10px; }
</style></head><body>
  <div class="top">
    <div class="org">سنترال الغنايم<br>قسم الشئون الخارجية</div>
    <div>التاريخ: ${esc(cairoToday())}</div>
  </div>
  <div class="to">${LETTER_TO}</div>
  <div>تحية طيبة وبعد ،،،</div>
  <div class="subject">الموضوع: ${subject}</div>
  <div>${intro}</div>
  ${reviews.map((r, i) => sectionHtml(r, one ? null : i + 1)).join("")}
  <div class="closing">وتفضلوا بقبول فائق الاحترام ،،،</div>
  <div class="sign">
    <div class="who">${LETTER_FROM}</div>
    <div class="blank">${signer ? esc(signer) : "الاسم: ...................................."}</div>
    <div class="blank">التوقيع: ....................................</div>
  </div>
</body></html>`;
}

/** يفتح نافذة الطباعة **فوراً** (جوّه ضغطة الزرار — وإلا المتصفح بيمنعها لأنها بعد انتظار)،
 *  ويجيب بيانات الخطاب من السيرفر، ويكتبه فيها ويطبعه (Save as PDF). */
export async function openRepeatLetter(ids: number[], opts: { signerName?: string } = {}) {
  const w = window.open("", "_blank");
  if (!w) { alert("المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة للموقع."); return; }
  w.document.write('<p dir="rtl" style="font-family:Tahoma;padding:24px">جارى تجهيز الخطاب…</p>');
  try {
    const r = await fetch(`/api/repeat-reviews/letter?ids=${ids.join(",")}`, { credentials: "include" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.message || "تعذّر تجهيز الخطاب");
    w.document.open();
    w.document.write(buildRepeatLetterHtml(j.data || [], opts));
    w.document.close();
    const go = () => { try { w.focus(); w.print(); } catch { /* المستخدم قفل النافذة */ } };
    const fonts = (w.document as any).fonts;
    if (fonts?.ready) fonts.ready.then(() => setTimeout(go, 150)); else setTimeout(go, 600);
  } catch (e: any) {
    w.document.open();
    w.document.write(`<p dir="rtl" style="font-family:Tahoma;padding:24px;color:#b91c1c">${esc(e?.message || "تعذّر تجهيز الخطاب")}</p>`);
    w.document.close();
  }
}
