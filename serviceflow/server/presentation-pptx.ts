/**
 * «العرض التقديمى» → ملف PowerPoint (المالك ٢٠٢٦-١٠-٢٠: «و ممكن اعملها تصدير باور بوينت ايضا و بنفس فورمات الشكل»).
 * نفس قايمة الشرايح اللى بترسمها الشاشة (buildSlides) ونفس الإحداثيات بتاعة DeckSlide.tsx (لوحة ١٢٨٠×٧٢٠)،
 * بتتحوّل لـ OOXML بـ jszip (موجودة أصلاً مع exceljs) — من غير مكتبة جديدة. كل حاجة فى الملف أشكال وجداول
 * ونصوص عادية قابلة للتعديل فى باور بوينت (الرسم البيانى أعمدة مرسومة بنفس شكل الريفرنس).
 */
import JSZip from "jszip";
import { compareLayout, type Slide } from "../shared/presentation-deck";

export type DeckImage = { data: Buffer; ext: "png" | "jpeg"; w: number; h: number };
export type DeckAssets = { weWhite: DeckImage; wePurple: DeckImage; telecomEgypt: DeckImage };

const PX = 9525; // ١ بكسل من لوحة الـ ١٢٨٠ = 9525 EMU (عرض الشريحة 12192000)
const PURPLE = "57318A", TITLE = "7030A0", ROW_A = "CFD5EA", ROW_B = "E9EBF5", BAR = "00B0F0";
const e = (n: number) => Math.round(n * PX);
const sz = (px: number) => Math.round(px * 75); // px → hundredths of a point (١ بكسل = ٠٫٧٥ بوينت)
const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!))
  // XML 1.0 مابيقبلش أحرف التحكم
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

type Run = { text: string; size: number; bold?: boolean; color?: string };
type Para = { runs: Run[]; align?: "r" | "ctr" | "l"; bullet?: boolean; spaceBefore?: number; lineSpacing?: number };

class SlideXml {
  shapes: string[] = [];
  rels: { id: string; target: string }[] = [];
  private nextId = 2;
  constructor(public bg: string | null, private addMedia: (img: DeckImage) => string) {}
  private id() { return this.nextId++; }
  private xfrm(x: number, y: number, w: number, h: number) {
    return `<a:xfrm><a:off x="${e(x)}" y="${e(y)}"/><a:ext cx="${e(Math.max(1, w))}" cy="${e(Math.max(1, h))}"/></a:xfrm>`;
  }
  private runs(runs: Run[]) {
    return runs.map((r) => `<a:r><a:rPr lang="ar-EG" sz="${sz(r.size)}" b="${r.bold ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${r.color || "111111"}"/></a:solidFill>`
      + `<a:latin typeface="Arial"/><a:cs typeface="Arial"/></a:rPr><a:t>${esc(r.text)}</a:t></a:r>`).join("");
  }
  private paras(ps: Para[]) {
    return ps.map((p) => {
      const lsp = p.lineSpacing ? `<a:lnSpc><a:spcPct val="${Math.round(p.lineSpacing * 100000)}"/></a:lnSpc>` : "";
      const spb = p.spaceBefore ? `<a:spcBef><a:spcPts val="${sz(p.spaceBefore)}"/></a:spcBef>` : "";
      const bu = p.bullet ? `<a:buFont typeface="Arial"/><a:buChar char="•"/>` : `<a:buNone/>`;
      const ind = p.bullet ? ` marR="${e(26)}" indent="${-e(26)}"` : "";
      return `<a:p><a:pPr algn="${p.align || "r"}" rtl="1"${ind}>${lsp}${spb}${bu}</a:pPr>${this.runs(p.runs)}`
        + `<a:endParaRPr lang="ar-EG" sz="${sz(p.runs[0]?.size || 18)}" dirty="0"/></a:p>`;
    }).join("");
  }
  /** مستطيل/دايرة (من غير نص أو بنص) */
  box(x: number, y: number, w: number, h: number, o: { fill?: string; grad?: [string, string]; geom?: "rect" | "ellipse" | "roundRect";
    paras?: Para[]; anchor?: "t" | "ctr" | "b"; inset?: number; shadow?: boolean; line?: string } = {}) {
    const fill = o.grad
      ? `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${o.grad[0]}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${o.grad[1]}"/></a:gs></a:gsLst><a:lin ang="0" scaled="0"/></a:gradFill>`
      : o.fill ? `<a:solidFill><a:srgbClr val="${o.fill}"/></a:solidFill>` : "<a:noFill/>";
    const shadow = o.shadow ? `<a:effectLst><a:outerShdw blurRad="76200" dist="38100" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst>` : "";
    const ins = e(o.inset ?? 0);
    const id = this.id();
    this.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr${o.paras ? ' txBox="1"' : ""}/><p:nvPr/></p:nvSpPr>`
      + `<p:spPr>${this.xfrm(x, y, w, h)}<a:prstGeom prst="${o.geom || "rect"}"><a:avLst/></a:prstGeom>${fill}`
      + (o.line ? `<a:ln w="${e(2)}"><a:solidFill><a:srgbClr val="${o.line}"/></a:solidFill></a:ln>` : `<a:ln><a:noFill/></a:ln>`) + `${shadow}</p:spPr>`
      + `<p:txBody><a:bodyPr wrap="square" lIns="${ins}" tIns="${ins}" rIns="${ins}" bIns="${ins}" rtlCol="1" anchor="${o.anchor || "t"}"><a:noAutofit/></a:bodyPr><a:lstStyle/>`
      + (o.paras?.length ? this.paras(o.paras) : `<a:p><a:endParaRPr lang="ar-EG" dirty="0"/></a:p>`) + `</p:txBody></p:sp>`);
  }
  text(x: number, y: number, w: number, h: number, paras: Para[], anchor: "t" | "ctr" | "b" = "t") {
    this.box(x, y, w, h, { paras, anchor });
  }
  /** صورة — cover بتقصّ الزيادة (زى object-fit: cover)، contain بتصغّرها جوّه الخانة */
  pic(img: DeckImage, x: number, y: number, w: number, h: number, fit: "cover" | "contain" | "stretch" = "stretch") {
    let crop = "";
    if (fit === "contain" && img.w && img.h) {
      const s = Math.min(w / img.w, h / img.h), nw = img.w * s, nh = img.h * s;
      x += (w - nw) / 2; y += (h - nh) / 2; w = nw; h = nh;
    } else if (fit === "cover" && img.w && img.h) {
      const ir = img.w / img.h, br = w / h;
      if (ir > br) { const c = Math.round(((1 - br / ir) / 2) * 100000); crop = `<a:srcRect l="${c}" r="${c}"/>`; }
      else if (ir < br) { const c = Math.round(((1 - ir / br) / 2) * 100000); crop = `<a:srcRect t="${c}" b="${c}"/>`; }
    }
    const rid = `rId${this.rels.length + 2}`;
    this.rels.push({ id: rid, target: this.addMedia(img) });
    const id = this.id();
    this.shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
      + `<p:blipFill><a:blip r:embed="${rid}"/>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill>`
      + `<p:spPr>${this.xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`);
  }
  /** جدول عربى (أول عمود على اليمين) بنفس ألوان الريفرنس */
  table(x: number, y: number, w: number, columnsIn: string[], rowsIn: string[][], fs: number, totalLast: boolean, widths?: number[]) {
    // الأعمدة بتتعكس هنا (أول عمود على اليمين) بدل tblPr rtl — LibreOffice/Google Slides بيتجاهلوه
    const n = columnsIn.length;
    const columns = [...columnsIn].reverse();
    const rows = rowsIn.map((r) => Array.from({ length: n }, (_, j) => r[n - 1 - j] ?? ""));
    const ws = (widths && widths.length === n ? widths : Array(n).fill(1)).slice().reverse();
    const sum = ws.reduce((a, b) => a + b, 0);
    const colW = ws.map((v) => Math.round(e((w * v) / sum)));
    const rowH = e(fs * 1.25 + 14);
    const border = (side: string) => `<a:${side} w="${e(2)}"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:${side}>`;
    const cell = (t: string, fill: string, color: string) =>
      `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${this.paras([{ runs: [{ text: t, size: fs, bold: true, color }], align: "ctr" }])}</a:txBody>`
      + `<a:tcPr marL="${e(8)}" marR="${e(8)}" marT="${e(5)}" marB="${e(5)}" anchor="ctr">${border("lnL")}${border("lnR")}${border("lnT")}${border("lnB")}`
      + `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:tcPr></a:tc>`;
    const head = `<a:tr h="${rowH}">${columns.map((c) => cell(c, TITLE, "FFFFFF")).join("")}</a:tr>`;
    const body = rows.map((r, i) => {
      const total = totalLast && i === rows.length - 1;
      return `<a:tr h="${rowH}">${Array.from({ length: n }, (_, j) => cell(r[j] ?? "", total ? TITLE : i % 2 ? ROW_B : ROW_A, total ? "FFFFFF" : "111111")).join("")}</a:tr>`;
    }).join("");
    const id = this.id();
    this.shapes.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>`
      + `<p:xfrm><a:off x="${e(x)}" y="${e(y)}"/><a:ext cx="${colW.reduce((a, b) => a + b, 0)}" cy="${rowH * (rows.length + 1)}"/></p:xfrm>`
      + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/>`
      + `<a:tblGrid>${colW.map((c) => `<a:gridCol w="${c}"/>`).join("")}</a:tblGrid>${head}${body}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`);
  }
  line(x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
    const id = this.id();
    this.shapes.push(`<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Line ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>`
      + `<p:spPr>${this.xfrm(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>`
      + `<a:ln w="${e(width)}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></p:spPr></p:cxnSp>`);
  }
  xml() {
    const bg = this.bg ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${this.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ${NS}><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`
      + `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`
      + this.shapes.join("") + `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }
  relsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`
      + this.rels.map((r) => `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${r.target}"/>`).join("")
      + `</Relationships>`;
  }
}

const NS = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`;

/** عرض تقريبى للنص (عشان الشريط البنفسجى اللى وراه يبقى على قدّه) */
const textW = (t: string, size: number) => Math.min(1180, Math.round(String(t).length * size * 0.56));

function render(s: Slide, sx: SlideXml, A: DeckAssets, img: (id: string) => DeckImage | null) {
  const footer = () => {
    sx.pic(A.wePurple, 22, 720 - 20 - 72, 72, 72);
    const th = (264 * A.telecomEgypt.h) / (A.telecomEgypt.w || 1);
    sx.pic(A.telecomEgypt, 1280 - 28 - 264, 720 - 28 - th, 264, th);
  };
  const title = (t: string) => {
    sx.text(48, 34, 1184, 60, [{ runs: [{ text: `• ${t}`, size: 38, bold: true, color: TITLE }] }]);
    sx.box(32, 96, 1216, 3, { fill: TITLE });
  };
  const pillCenter = (t: string, top: number, size: number) => {
    const w = textW(t, size) + 80;
    sx.box((1280 - w) / 2, top, w, size * 1.25 + 12, { fill: TITLE, anchor: "ctr", paras: [{ runs: [{ text: t, size, bold: true, color: "FFFFFF" }], align: "ctr" }] });
  };
  const purpleLogo = () => sx.pic(A.weWhite, 1280 - 60 - 110, 40, 110, 110);

  switch (s.kind) {
    case "cover": {
      purpleLogo();
      const ps: Para[] = [];
      if (s.subtitle) ps.push({ runs: [{ text: s.subtitle, size: 34, color: "FFFFFF" }], align: "ctr" });
      ps.push({ runs: [{ text: s.title, size: 56, bold: true, color: "FFFFFF" }], align: "ctr", spaceBefore: s.subtitle ? 14 : 0 });
      if (s.meeting) ps.push({ runs: [{ text: s.meeting, size: 28, color: "FFFFFF" }], align: "ctr", spaceBefore: 28 });
      if (s.date) ps.push({ runs: [{ text: s.date, size: 24, color: "F0ECF6" }], align: "ctr", spaceBefore: 12 });
      sx.text(120, 220, 1040, 400, ps);
      return;
    }
    case "divider":
    case "closing":
      purpleLogo();
      sx.text(120, 240, 1040, 240, [{ runs: [{ text: s.kind === "divider" ? s.title : s.text, size: 48, bold: true, color: "FFFFFF" }], align: "ctr" }], "ctr");
      return;
    case "agenda": {
      sx.box(-360, -120, 760, 960, { fill: PURPLE, geom: "ellipse" });
      sx.text(80, 60, 1280 - 160, 70, [{ runs: [{ text: `• ${s.title}`, size: 44, bold: true, color: TITLE }] }]);
      const h = 26 * 1.2 + 28;
      s.items.forEach((it, i) => {
        sx.box(570, 160 + i * (h + 22), 640 - i * 34, h, { grad: ["3A1F5C", TITLE], shadow: true, anchor: "ctr",
          paras: [{ runs: [{ text: it, size: 26, bold: true, color: "FFFFFF" }], align: "ctr" }] });
      });
      footer();
      return;
    }
    case "cv": {
      title(s.title);
      const photo = s.photoId ? img(s.photoId) : null;
      if (photo) sx.pic(photo, 40, 120, 260, 300, "cover");
      s.fields.forEach(([k, v], i) => {
        const y = 124 + i * 38.75;
        sx.text(1280 - 60 - 190, y, 190, 40, [{ runs: [{ text: `${k} :-`, size: 25, bold: true }] }]);
        sx.text(330, y, 1280 - 60 - 190 - 14 - 330, 40, [{ runs: [{ text: v, size: 25, bold: true }] }]);
      });
      if (s.qualifications.length) {
        const w = textW(s.qualificationsTitle, 22) + 52;
        sx.box(1280 - 60 - w, 436, w, 36, { fill: TITLE, anchor: "ctr", paras: [{ runs: [{ text: s.qualificationsTitle, size: 22, bold: true, color: "FFFFFF" }], align: "ctr" }] });
        sx.text(60, 478, 1160, 200, s.qualifications.slice(0, 6).map((q) => ({ runs: [{ text: q, size: 21, bold: true }], bullet: true, lineSpacing: 1.2 })));
      }
      footer();
      return;
    }
    case "list": {
      title(s.title);
      if (s.lead) {
        const w = textW(s.lead, 24) + 56;
        sx.box(1280 - 60 - w, 126, w, 42, { fill: TITLE, anchor: "ctr", paras: [{ runs: [{ text: s.lead, size: 24, bold: true, color: "FFFFFF" }], align: "ctr" }] });
      }
      const fs = s.items.length > 7 ? 22 : 26;
      sx.text(80, s.lead ? 190 : 130, 1280 - 140, 420, s.items.slice(0, 10).map((it) => ({ runs: [{ text: it, size: fs, bold: true }], bullet: true, lineSpacing: 1.3 })));
      footer();
      return;
    }
    case "table": {
      title(s.title);
      const many = s.columns.length > 4;
      const fs = s.rows.length > 9 ? 17 : many ? 19 : 22;
      const map = s.imageId ? img(s.imageId) : null;
      if (map) sx.pic(map, 50, 120, 520, 500, "contain");
      const w = map ? 640 : 1200;
      sx.table(1280 - 40 - w, 122, w, s.columns, s.rows, fs, s.totalLast, s.columns.length === 2 ? [3, 2] : undefined);
      if (s.note) sx.text(48, 720 - 110 - 28, 1184, 28, [{ runs: [{ text: s.note, size: 18, color: "444444" }] }]);
      footer();
      return;
    }
    case "chart": {
      pillCenter(s.title, 34, 28);
      sx.text(48, 108, 1184, 40, [{ runs: [{ text: s.seriesLabel, size: 28, bold: true }], align: "ctr" }]);
      const max = Math.max(1, ...s.points.map((p) => p.value));
      const top = Math.ceil(max / 10) * 10 || 10;
      const W = 1000, H = 380, x0 = 140, y0 = 560;
      const bw = Math.min(110, (W / Math.max(1, s.points.length)) * 0.55);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        sx.line(x0, y0 - t * H, x0 + W, y0 - t * H, "DDDDDD", 1);
        sx.text(x0 - 110, y0 - t * H - 13, 98, 26, [{ runs: [{ text: `${Math.round(t * top)}${s.unit}`, size: 18, color: "555555" }], align: "r" }]);
      }
      s.points.forEach((p, i) => {
        const cx = x0 + (W / s.points.length) * (i + 0.5);
        const h = (p.value / top) * H;
        if (h > 0) sx.box(cx - bw / 2, y0 - h, bw, h, { fill: BAR });
        const fs = s.points.length > 8 ? 16 : 22;   // نفس DeckSlide
        sx.text(cx - 80, y0 - h - 40, 160, 30, [{ runs: [{ text: `${p.value}${s.unit}`, size: fs, bold: true }], align: "ctr" }]);
        sx.text(cx - 80, y0 + 8, 160, 30, [{ runs: [{ text: p.label, size: fs, bold: true }], align: "ctr" }]);
      });
      if (s.note) sx.text(48, 720 - 108 - 28, 1184, 28, [{ runs: [{ text: s.note, size: 18, color: "555555" }], align: "ctr" }]);
      footer();
      return;
    }
    case "compare": {
      // نفس DeckSlide (compareLayout) — الحال عند الاستلام ← دلوقتى، وتحتهم جدول التفاصيل
      title(s.title);
      const L = compareLayout(s.panels.length);
      s.panels.forEach((p, i) => {
        const x = L.xOf(i);
        sx.text(x, 118, L.panelW, 34, [{ runs: [{ text: p.heading, size: 24, bold: true, color: TITLE }], align: "ctr" }]);
        const card = (side: "before" | "after", cx: number) => {
          const after = side === "after";
          sx.box(cx, L.cardTop, L.cardW, L.cardH, { geom: "roundRect", fill: after ? "F3ECFA" : ROW_B, line: after ? TITLE : "C9CCE0", inset: 8,
            paras: [{ runs: [{ text: p[side].label, size: 17, bold: true, color: "444444" }], align: "ctr" },
              { runs: [{ text: p[side].value, size: 52, bold: true, color: after ? TITLE : "555555" }], align: "ctr", spaceBefore: 10 }] });
        };
        card("before", x + L.panelW - L.cardW);
        sx.text(x + L.cardW, L.cardTop + L.cardH / 2 - 30, L.panelW - 2 * L.cardW, 60, [{ runs: [{ text: "←", size: 44, bold: true, color: TITLE }], align: "ctr" }], "ctr");
        card("after", x);
        const dw = Math.min(L.panelW, textW(p.delta, 26) + 60);
        sx.box(x + (L.panelW - dw) / 2, L.cardTop + L.cardH + 14, dw, 42, { geom: "roundRect", fill: "E3F4E8", anchor: "ctr",
          paras: [{ runs: [{ text: p.delta, size: 26, bold: true, color: "1E7B34" }], align: "ctr" }] });
        if (p.note) sx.text(x, L.cardTop + L.cardH + 64, L.panelW, 60, [{ runs: [{ text: p.note, size: 17, color: "444444" }], align: "ctr" }]);
      });
      if (s.table) sx.table(40, L.tableTop, 1200, s.table.columns, s.table.rows, 17, false);
      footer();
      return;
    }
    case "photos": {
      pillCenter(s.title, 34, 28);
      const ids = s.photoIds.map((id) => img(id)).filter(Boolean).slice(0, 8) as DeckImage[];
      const cols = ids.length <= 3 ? ids.length : ids.length <= 6 ? 3 : 4;
      const rows = Math.ceil(ids.length / cols) || 1;
      const gw = 1180, gh = 470, gap = 14;
      const w = (gw - gap * (cols - 1)) / cols, h = (gh - gap * (rows - 1)) / rows;
      ids.forEach((im, i) => sx.pic(im, 50 + (i % cols) * (w + gap), 120 + Math.floor(i / cols) * (h + gap), w, h, "cover"));
      footer();
      return;
    }
  }
}

/** ملف الـ pptx كامل (Buffer) */
export async function deckPptx(slides: Slide[], assets: DeckAssets, images: Map<string, DeckImage>, title = "العرض التقديمى"): Promise<Buffer> {
  const zip = new JSZip();
  const media = new Map<DeckImage, string>();
  const addMedia = (im: DeckImage) => {
    let name = media.get(im);
    if (!name) {
      name = `image${media.size + 1}.${im.ext === "jpeg" ? "jpeg" : "png"}`;
      media.set(im, name);
      zip.file(`ppt/media/${name}`, im.data);
    }
    return name;
  };
  slides.forEach((s, i) => {
    const purple = s.kind === "cover" || s.kind === "divider" || s.kind === "closing";
    const sx = new SlideXml(purple ? PURPLE : "FFFFFF", addMedia);
    render(s, sx, assets, (id) => images.get(id) || null);
    zip.file(`ppt/slides/slide${i + 1}.xml`, sx.xml());
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, sx.relsXml());
  });
  const n = slides.length;
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
    + `<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>`
    + `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`
    + `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`
    + `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`
    + `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`
    + Array.from({ length: n }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")
    + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`
    + `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/>`
    + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`
    + `<Relationship Id="rId3" Type="${R}/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:title>${esc(title)}</dc:title><dc:creator>Service Flow</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Service Flow</Application><Slides>${n}</Slides></Properties>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:presentation ${NS} saveSubsetFonts="1" rtl="1">`
    + `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>`
    + `<p:sldIdLst>${Array.from({ length: n }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join("")}</p:sldIdLst>`
    + `<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="${R}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${R}/theme" Target="theme/theme1.xml"/>`
    + Array.from({ length: n }, (_, i) => `<Relationship Id="rId${i + 3}" Type="${R}/slide" Target="slides/slide${i + 1}.xml"/>`).join("") + `</Relationships>`);
  const emptyTree = `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree>`;
  zip.file("ppt/slideMasters/slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${emptyTree}</p:cSld>`
    + `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`
    + `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${R}/theme" Target="../theme/theme1.xml"/></Relationships>`);
  zip.file("ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${emptyTree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="${R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  zip.file("ppt/theme/theme1.xml", THEME);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

const clr = (n: string, v: string) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
const solid = `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`;
const ln = (w: number) => `<a:ln w="${w}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`;
const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Telecom Egypt"><a:themeElements>`
  + `<a:clrScheme name="TE">${clr("dk1", "000000")}${clr("lt1", "FFFFFF")}${clr("dk2", "3A1F5C")}${clr("lt2", "E9EBF5")}${clr("accent1", TITLE)}${clr("accent2", PURPLE)}`
  + `${clr("accent3", BAR)}${clr("accent4", "CFD5EA")}${clr("accent5", "8064A2")}${clr("accent6", "4BACC6")}${clr("hlink", "0563C1")}${clr("folHlink", "954F72")}</a:clrScheme>`
  + `<a:fontScheme name="TE"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme>`
  + `<a:fmtScheme name="TE"><a:fillStyleLst>${solid}${solid}${solid}</a:fillStyleLst><a:lnStyleLst>${ln(6350)}${ln(12700)}${ln(19050)}</a:lnStyleLst>`
  + `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>`
  + `<a:bgFillStyleLst>${solid}${solid}${solid}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
