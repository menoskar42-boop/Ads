// شهادة تقدير الفنى (المالك ٢٠٢٦-١١-٠٥) — نفس نموذج الشهادة اللى المالك بعته (Cairo + Amiri،
// بنفسجى WE وذهبى، إطار مزدوج بزوايا ذهبية). الصفحة HTML بتتطبع «حفظ PDF» زى باقى تقارير البرنامج،
// وكل فنى فى صفحة لوحده (Letter بالعرض زى النموذج).

export const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const RANKS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];

export interface CertItem { name: string; rank: number }   // rank: ١ = المركز الأول
export interface CertOpts {
  month: string;        // "YYYY-MM" — شهر التقدير
  issued?: string;      // "YYYY-MM-DD" — تاريخ التحرير (الافتراضى: أول الشهر اللى بعده)
  jobTitle?: string;    // «فنــي» افتراضياً
  logoUrl: string;      // رابط مطلق للوجو (الصفحة بتتفتح فى نافذة جديدة)
  toolbar?: boolean;    // زرار الطباعة (مش فى المعاينة)
}

export const rankLabel = (n: number) => RANKS[n - 1] ?? `رقم ${n}`;

export function monthParts(month: string): { name: string; year: number } {
  const [y, m] = month.split("-").map(Number);
  return { name: AR_MONTHS[(m || 1) - 1] ?? "", year: y || new Date().getFullYear() };
}

/** تاريخ التحرير الافتراضى = أول الشهر اللى بعد شهر التقدير (زى النموذج: يوليو ⇒ ١ أغسطس). */
export function defaultIssued(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export function issuedLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${AR_MONTHS[m - 1] ?? ""} ${y}`;
}

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
  @page { size: 11in 8.5in; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  :root { --purple: #5b2382; --purple-2: #6d2d96; --gold: #c9a24a; --gold-2: #a8863a; --ink: #2a1d36; --muted: #6f6680; --paper: #fdfbf8; }
  html, body { margin: 0; background: #e9e5ee; font-family: "Cairo", "Segoe UI", Tahoma, sans-serif; color: var(--ink); }
  .cert { position: relative; width: 11in; height: 8.5in; margin: 16px auto; overflow: hidden; direction: rtl;
    background: radial-gradient(ellipse 70% 55% at 50% 0%, #f1ecf3 0%, rgba(241,236,243,0) 70%), var(--paper);
    box-shadow: 0 2px 14px rgba(40,20,60,.18); page-break-after: always; break-after: page; }
  .cert:last-child { page-break-after: auto; break-after: auto; }
  .frame-o { position: absolute; inset: 0.36in; border: 2px solid var(--purple); }
  .frame-i { position: absolute; inset: 0.44in; border: 1px solid var(--gold); }
  .corner { position: absolute; width: 0.85in; height: 0.85in; border: 0 solid var(--gold); }
  .corner.tr { top: 0.33in; right: 0.33in; border-top-width: 9px; border-right-width: 9px; }
  .corner.tl { top: 0.33in; left: 0.33in; border-top-width: 9px; border-left-width: 9px; }
  .corner.br { bottom: 0.33in; right: 0.33in; border-bottom-width: 9px; border-right-width: 9px; }
  .corner.bl { bottom: 0.33in; left: 0.33in; border-bottom-width: 9px; border-left-width: 9px; }
  .org { position: absolute; top: 0.92in; right: 0.98in; text-align: right; }
  .org b { display: block; color: var(--purple); font-weight: 700; font-size: 19px; line-height: 1.5; }
  .org span { display: block; color: var(--muted); font-size: 13px; margin-top: 6px; }
  .logo { position: absolute; top: 0.72in; left: 0.98in; width: 1.16in; height: 1.16in; border-radius: 50%;
    border: 1px dashed #b9aec6; background: #fff; display: grid; place-items: center; overflow: hidden; }
  .logo img { width: 112%; height: 112%; object-fit: cover; }
  .center { position: absolute; top: 1.86in; left: 0; right: 0; text-align: center; }
  .orn { display: flex; justify-content: center; align-items: center; gap: 12px; }
  .orn i { display: block; width: 0.85in; height: 1.5px; background: var(--gold); }
  .orn em { display: block; width: 9px; height: 9px; background: var(--gold); transform: rotate(45deg); }
  h1 { font-family: "Amiri", serif; font-weight: 700; color: var(--purple); font-size: 74px; line-height: 1.12; margin: 0 0 4px; }
  .en { font-size: 14.5px; letter-spacing: 0.36em; color: var(--gold-2); font-weight: 600; direction: ltr; }
  .lead { margin-top: 0.38in; font-size: 19px; color: #5d5470; }
  .name { font-family: "Amiri", serif; font-weight: 700; font-size: 52px; line-height: 1.3; color: var(--ink); margin: 0.04in auto 0; max-width: 8.6in; }
  .pill { display: inline-flex; align-items: center; gap: 12px; margin-top: 4px; padding: 8px 26px; border: 1.2px solid var(--gold);
    border-radius: 999px; background: #faf3e4; font-size: 16px; color: #5d5470; }
  .pill b { color: var(--purple); font-weight: 600; }
  .pill i { width: 5px; height: 5px; border-radius: 50%; background: var(--gold); display: block; }
  .body { width: 8.6in; margin: 0.16in auto 0; font-size: 20px; line-height: 2.1; color: #3a3046; }
  .body strong { color: var(--purple); font-weight: 700; }
  .body p { margin: 0; }
  .seal { position: absolute; bottom: 0.8in; left: 50%; transform: translateX(-50%); width: 0.95in; height: 0.95in; border-radius: 50%;
    border: 2px solid var(--gold); background: #faf6ee; text-align: center; padding-top: 0.1in; }
  .seal .m { font-size: 14px; font-weight: 700; color: var(--gold-2); line-height: 1.2; }
  .seal .y { font-family: "Amiri", serif; font-weight: 700; font-size: 25px; color: var(--purple); line-height: 1.15; }
  .seal .s { font-size: 9px; color: #9a8fa8; }
  .sig { position: absolute; bottom: 0.5in; width: 4in; text-align: center; font-size: 15.5px; color: var(--ink); font-weight: 500; white-space: nowrap; }
  .sig::before { content: ""; display: block; width: 2.5in; height: 1.5px; background: #b9aec6; margin: 0 auto 0.12in; }
  .sig.r { right: 0.68in; } .sig.l { left: 0.68in; }
  .issued { position: absolute; bottom: 0.52in; left: 0; right: 0; text-align: center; font-size: 13px; color: #8a8199; }
  .toolbar { position: sticky; top: 0; z-index: 2; background: #fff; border-bottom: 1px solid #ddd; padding: 10px 14px; display: flex; gap: 10px; align-items: center; direction: rtl; font-size: 13px; }
  .toolbar button { border: 0; border-radius: 6px; padding: 8px 16px; font-size: 13px; cursor: pointer; font-family: inherit; color: #fff; }
  @media print { html, body { background: #fff; } .toolbar { display: none; } .cert { margin: 0; box-shadow: none; } }
`;

function page(item: CertItem, o: CertOpts): string {
  const { name: mName, year } = monthParts(o.month);
  const job = (o.jobTitle || "فنــي").trim();
  return `
  <section class="cert">
    <div class="frame-o"></div><div class="frame-i"></div>
    <div class="corner tr"></div><div class="corner tl"></div><div class="corner br"></div><div class="corner bl"></div>
    <div class="org"><b>الشركة المصرية للاتصالات</b><span>إدارة تشغيل الشبكة وعمليات العملاء بالغنايم</span></div>
    <div class="logo"><img src="${esc(o.logoUrl)}" alt="WE"></div>
    <div class="center">
      <div class="orn"><i></i><em></em><i></i></div>
      <h1>شهادة تقدير</h1>
      <div class="en">CERTIFICATE OF APPRECIATION</div>
      <div class="lead">تتشرف إدارة تشغيل الشبكة وعمليات العملاء بالغنايم بمنح هذه الشهادة إلى</div>
      <div class="name">${esc(item.name)}</div>
      <div class="pill"><b>${esc(job)}</b><i></i><span>الشركة المصرية للاتصالات</span></div>
      <div class="body">
        <p>وذلك تقديراً لتميّزه في الأداء وحصوله على <strong>المركز ${esc(rankLabel(item.rank))}</strong> على مستوى العاملين بسنترال الغنايم خلال
        شهر <strong>${esc(mName)} ${year}</strong>، نظير ما بذله من جهد مخلص والتزام مهني متميز في أداء مهام عمله.</p>
        <p>مع خالص التمنيات له بدوام التوفيق والنجاح.</p>
      </div>
    </div>
    <div class="seal"><div class="m">${esc(mName)}</div><div class="y">${year}</div><div class="s">ختم الشركة</div></div>
    <div class="sig r">رئيس قسم الشئون الخارجية بالغنايم</div>
    <div class="issued">تحريراً في ${esc(issuedLabel(o.issued || defaultIssued(o.month)))}</div>
    <div class="sig l">مدير تشغيل الشبكة وعمليات العملاء لسنترال الغنايم</div>
  </section>`;
}

/** صفحة الشهادات كاملة (كل فنى صفحة). */
export function certificateHtml(items: CertItem[], o: CertOpts): string {
  const toolbar = o.toolbar
    ? `<div class="toolbar">
        <button style="background:#475569" onclick="try{window.close()}catch(e){};setTimeout(function(){history.length>1?history.back():location.href='/'},150)">↩ رجوع</button>
        <button style="background:#dc2626" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
        <span>اختار «حفظ بصيغة PDF» · الورق Letter بالعرض · الهوامش «بدون».</span>
      </div>`
    : "";
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>شهادات تقدير — ${esc(monthParts(o.month).name)} ${monthParts(o.month).year}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>${toolbar}${items.map((i) => page(i, o)).join("")}</body></html>`;
}
