/**
 * شريحة واحدة من «العرض التقديمى» بنفس شكل عرض منطقة أسيوط (الريفرنس): البنفسجى 57318A للغلاف
 * والفواصل، والعناوين والجداول 7030A0، ولوجو WE تحت شمال وtelecomegypt تحت يمين.
 * اللوحة ثابتة ١٢٨٠×٧٢٠ وبتتصغّر/تتكبّر بـ scale — نفس النسب فى المعاينة والعرض الكامل.
 */
import { useEffect, useRef, useState } from "react";
import { compareLayout, lineChartGeom, LINE_CHART, tableFs, tableRowH, subTableLayout, type Slide } from "@shared/presentation-deck";
import { withBase } from "@/lib/base-path";
import weWhite from "@/assets/presentation/we-white.png";
import wePurple from "@/assets/presentation/we-purple.png";
import telecomEgypt from "@/assets/presentation/telecomegypt.png";

export const SLIDE_W = 1280;
export const SLIDE_H = 720;
export const PURPLE = "#57318A";
export const TITLE = "#7030A0";
const ROW_A = "#CFD5EA";
const ROW_B = "#E9EBF5";

// <img> مابيعدّيش على لفّة fetch اللى فى main.tsx — فمسار الجذر (/serviceflow/) بيتحط هنا
export const deckImage = (id: string) => withBase(`/api/presentation/image/${id}`);

const font = "Arial, 'Segoe UI', Tahoma, sans-serif";

function Footer() {
  return (
    <>
      <img src={wePurple} alt="WE" style={{ position: "absolute", left: 22, bottom: 20, width: 72, height: 72 }} />
      <img src={telecomEgypt} alt="telecomegypt" style={{ position: "absolute", right: 28, bottom: 28, width: 264 }} />
    </>
  );
}

function Title({ text }: { text: string }) {
  return (
    <>
      <div style={{ position: "absolute", top: 34, right: 48, left: 48, textAlign: "right", color: TITLE, fontWeight: 700, fontSize: 38, lineHeight: 1.25 }}>
        • {text}
      </div>
      <div style={{ position: "absolute", top: 96, right: 32, left: 32, height: 3, background: TITLE }} />
    </>
  );
}

function Purple({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: PURPLE, color: "#fff" }}>
      <img src={weWhite} alt="WE" style={{ position: "absolute", top: 40, right: 60, width: 110, height: 110 }} />
      {children}
    </div>
  );
}

function SlideBody({ s }: { s: Slide }) {
  switch (s.kind) {
    case "cover":
      return (
        <Purple>
          <div style={{ position: "absolute", top: 230, right: 120, left: 120, textAlign: "center" }}>
            {s.subtitle && <div style={{ fontSize: 34, fontWeight: 400, marginBottom: 14 }}>{s.subtitle}</div>}
            <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.25 }}>{s.title}</div>
            {s.meeting && <div style={{ fontSize: 28, marginTop: 28 }}>{s.meeting}</div>}
            {s.date && <div style={{ fontSize: 24, marginTop: 12, opacity: 0.9 }}>{s.date}</div>}
          </div>
        </Purple>
      );
    case "divider":
    case "closing":
      return (
        <Purple>
          <div style={{ position: "absolute", top: 300, right: 120, left: 120, textAlign: "center", fontSize: 48, fontWeight: 700, lineHeight: 1.3 }}>
            {s.kind === "divider" ? s.title : s.text}
          </div>
        </Purple>
      );
    case "agenda":
      return (
        <>
          <div style={{ position: "absolute", left: -360, top: -120, width: 760, height: 960, borderRadius: "50%", background: PURPLE }} />
          <div style={{ position: "absolute", top: 60, right: 80, color: TITLE, fontWeight: 700, fontSize: 44 }}>• {s.title}</div>
          <div style={{ position: "absolute", top: 160, right: 70, width: 640, display: "flex", flexDirection: "column", gap: 22 }}>
            {s.items.map((it, i) => (
              <div key={i} style={{ marginRight: i * 34, background: `linear-gradient(90deg, #3a1f5c, ${TITLE})`, color: "#fff",
                fontSize: 26, fontWeight: 700, padding: "14px 24px", textAlign: "center", boxShadow: "0 3px 6px rgba(0,0,0,.25)" }}>{it}</div>
            ))}
          </div>
          <Footer />
        </>
      );
    case "cv":
      return (
        <>
          <Title text={s.title} />
          {s.photoId
            ? <img src={deckImage(s.photoId)} alt="" style={{ position: "absolute", left: 40, top: 120, width: 260, height: 300, objectFit: "cover" }} />
            : <div style={{ position: "absolute", left: 40, top: 120, width: 260, height: 300, background: "#eee", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 20 }}>الصورة الشخصية</div>}
          <div style={{ position: "absolute", top: 124, right: 60, left: 330, fontSize: 25, fontWeight: 700, lineHeight: 1.55 }}>
            {s.fields.map(([k, val]) => (
              <div key={k} style={{ display: "flex", gap: 14 }}><span style={{ minWidth: 190 }}>{k} :-</span><span>{val}</span></div>
            ))}
          </div>
          {s.qualifications.length > 0 && (
            <>
              <div style={{ position: "absolute", top: 436, right: 60, background: TITLE, color: "#fff", fontWeight: 700, fontSize: 22, padding: "4px 26px" }}>{s.qualificationsTitle}</div>
              <ul style={{ position: "absolute", top: 478, right: 60, left: 60, listStyle: "disc", margin: 0, paddingRight: 26, fontSize: 21, fontWeight: 700, lineHeight: 1.45 }}>
                {s.qualifications.slice(0, 6).map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </>
          )}
          <Footer />
        </>
      );
    case "list":
      return (
        <>
          <Title text={s.title} />
          {s.lead && <div style={{ position: "absolute", top: 126, right: 60, background: TITLE, color: "#fff", fontWeight: 700, fontSize: 24, padding: "6px 28px" }}>{s.lead}</div>}
          <ul style={{ position: "absolute", top: s.lead ? 190 : 130, right: 60, left: 80, listStyle: "disc", margin: 0, paddingRight: 30, fontSize: s.items.length > 7 ? 22 : 26, fontWeight: 700, lineHeight: 1.6 }}>
            {s.items.slice(0, 10).map((it, i) => <li key={i}>{it}</li>)}
          </ul>
          <Footer />
        </>
      );
    case "table": {
      // الخط وارتفاع الصف من shared (نفس presentation-pptx.ts) — والجدول التانى (sub) تحته فى نفس المكان بالظبط
      const fs = tableFs(s.rows.length, s.columns.length);
      const rowH = tableRowH(fs);
      const cellPad = "0 10px";
      const tbl = (cols: string[], rows: string[][], totalLast: boolean, f: number, top: number, width: number) => (
        <table style={{ position: "absolute", top, right: 40, width, borderCollapse: "collapse", fontSize: f, fontWeight: 700, textAlign: "center", lineHeight: 1.15 }}>
          <thead>
            <tr style={{ height: tableRowH(f) }}>{cols.map((h, i) => <th key={i} style={{ background: TITLE, color: "#fff", padding: cellPad, border: "2px solid #fff" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const total = totalLast && i === rows.length - 1;
              return (
                <tr key={i} style={{ height: tableRowH(f) }}>{r.map((c, j) => (
                  <td key={j} style={{ background: total ? TITLE : i % 2 ? ROW_B : ROW_A, color: total ? "#fff" : "#111", padding: cellPad, border: "2px solid #fff" }}>{c}</td>
                ))}</tr>
              );
            })}
          </tbody>
        </table>
      );
      const sub = s.sub ? subTableLayout(s.rows.length, s.columns.length) : null;
      void rowH;
      return (
        <>
          <Title text={s.title} />
          {s.imageId && <img src={deckImage(s.imageId)} alt="" style={{ position: "absolute", left: 50, top: 120, width: 520, height: 500, objectFit: "contain" }} />}
          {tbl(s.columns, s.rows, s.totalLast, fs, 122, s.imageId ? 640 : 1200)}
          {s.sub && sub && (
            <>
              <div style={{ position: "absolute", top: sub.titleY, right: 44, fontSize: 22, fontWeight: 700, color: TITLE }}>{s.sub.title}</div>
              {tbl(s.sub.columns, s.sub.rows, s.sub.totalLast, sub.fs, sub.top, 1200)}
            </>
          )}
          {s.note && <div style={{ position: "absolute", bottom: 110, right: 48, left: 48, fontSize: 18, color: "#444", textAlign: "right" }}>{s.note}</div>}
          <Footer />
        </>
      );
    }
    case "chart": {
      // المالك ٢٠٢٦-١٠-٢١: رسم خطى — نقطة لكل شهر عليها القيمة بخط واضح، وأسماء الشهور صغيرة ورمادى فاتح،
      // وخط متقطّع «عند الاستلام»، وتحت الرسم سطر المتوسط. الهندسة كلها من lineChartGeom (نفس presentation-pptx.ts)
      const L = LINE_CHART;
      const g = lineChartGeom(s.points, s.unit, s.baseline?.value);
      const poly = g.pts.map((p) => `${p.cx},${p.cy}`).join(" ");
      return (
        <>
          <div style={{ position: "absolute", top: 34, right: 48, left: 48, textAlign: "center" }}>
            <span style={{ background: TITLE, color: "#fff", fontWeight: 700, fontSize: 28, padding: "6px 30px" }}>{s.title}</span>
          </div>
          <div style={{ position: "absolute", top: 110, left: 0, right: 0, textAlign: "center", fontSize: 26, fontWeight: 700 }}>{s.seriesLabel}</div>
          <svg width={SLIDE_W} height={SLIDE_H} style={{ position: "absolute", inset: 0 }}>
            {g.ticks.map((t) => (
              <g key={t.text}>
                <line x1={L.x0} x2={L.x0 + L.W} y1={t.y} y2={t.y} stroke="#E4E4E4" />
                <text x={L.x0 - 12} y={t.y + 5} fontSize={15} textAnchor="end" fill="#888" fontFamily={font}>{t.text}</text>
              </g>
            ))}
            {g.baselineY != null && s.baseline && (
              <g>
                <line x1={L.x0} x2={L.x0 + L.W} y1={g.baselineY} y2={g.baselineY} stroke={TITLE} strokeWidth={2} strokeDasharray="10 7" />
                {/* مثبّت على حافة الشريحة اليمين وبيمتد شمال لحد بعد آخر الخط (من غير ما الخط يعدّى فوقه).
                    direction="ltr" صريح: الـSVG بيورث rtl من الصفحة وساعتها end/start بيتقلبوا */}
                <text x={SLIDE_W - 6} y={g.baselineY + 5} fontSize={15} fontWeight={700} textAnchor="end" direction="ltr" fill={TITLE} fontFamily={font}>{s.baseline.label}</text>
              </g>
            )}
            <polyline points={poly} fill="none" stroke={`#${L.lineColor}`} strokeWidth={4} strokeLinejoin="round" />
            {g.pts.map((p, i) => (
              <g key={i}>
                <circle cx={p.cx} cy={p.cy} r={7} fill="#fff" stroke={`#${L.lineColor}`} strokeWidth={3} />
                <text x={p.cx} y={p.cy - 16} fontSize={g.valueFs} fontWeight={700} textAnchor="middle" fill={`#${L.valueColor}`} fontFamily={font}>{p.text}</text>
                <text x={p.cx} y={L.y0 + 22} fontSize={g.labelFs} textAnchor="middle" fill={`#${L.monthColor}`} fontFamily={font}>
                  {p.label.map((t, j) => <tspan key={j} x={p.cx} dy={j ? g.labelFs + 2 : 0}>{t}</tspan>)}
                </text>
              </g>
            ))}
          </svg>
          {s.note && <div style={{ position: "absolute", top: L.noteY, left: 40, right: 40, textAlign: "center", fontSize: 16, color: "#666" }}>{s.note}</div>}
          {s.avgNote && <div style={{ position: "absolute", top: L.avgY, left: 40, right: 40, textAlign: "center", fontSize: 18, fontWeight: 700, color: TITLE }}>{s.avgNote}</div>}
          <Footer />
        </>
      );
    }
    case "compare": {
      // المالك ٢٠٢٦-١٠-٢١: الحال عند الاستلام ← دلوقتى. لوحة لكل مقارنة (أول واحدة يمين)، وتحتهم جدول التفاصيل.
      const L = compareLayout(s.panels.length);
      return (
        <>
          <Title text={s.title} />
          {s.panels.map((p, i) => {
            const x = L.xOf(i);
            const card = (side: "before" | "after", cx: number) => (
              <div style={{ position: "absolute", left: cx, top: L.cardTop, width: L.cardW, height: L.cardH, background: side === "after" ? "#F3ECFA" : ROW_B,
                border: `2px solid ${side === "after" ? TITLE : "#C9CCE0"}`, borderRadius: 10, textAlign: "center" }}>
                <div style={{ marginTop: 12, fontSize: 17, fontWeight: 700, color: "#444", padding: "0 8px", lineHeight: 1.25 }}>{p[side].label}</div>
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 14, fontSize: 52, fontWeight: 700, color: side === "after" ? TITLE : "#555" }}>{p[side].value}</div>
              </div>
            );
            return (
              <div key={i}>
                <div style={{ position: "absolute", left: x, width: L.panelW, top: 118, textAlign: "center", fontSize: 24, fontWeight: 700, color: TITLE }}>{p.heading}</div>
                {/* RTL: «قبل» يمين و«بعد» شمال، والسهم بينهم */}
                {card("before", x + L.panelW - L.cardW)}
                <div style={{ position: "absolute", left: x + L.cardW, width: L.panelW - 2 * L.cardW, top: L.cardTop + L.cardH / 2 - 30, textAlign: "center", fontSize: 44, fontWeight: 700, color: TITLE }}>←</div>
                {card("after", x)}
                <div style={{ position: "absolute", left: x, width: L.panelW, top: L.cardTop + L.cardH + 14, textAlign: "center" }}>
                  <span style={{ display: "inline-block", background: "#E3F4E8", color: "#1E7B34", fontWeight: 700, fontSize: 26, padding: "3px 22px", borderRadius: 999 }}>{p.delta}</span>
                </div>
                {p.note && <div style={{ position: "absolute", left: x, width: L.panelW, top: L.cardTop + L.cardH + 64, textAlign: "center", fontSize: 17, color: "#444", lineHeight: 1.35 }}>{p.note}</div>}
              </div>
            );
          })}
          {s.table && (
            <table style={{ position: "absolute", top: L.tableTop, right: 40, width: 1200, borderCollapse: "collapse", fontSize: 17, fontWeight: 700, textAlign: "center" }}>
              <thead><tr>{s.table.columns.map((h, i) => <th key={i} style={{ background: TITLE, color: "#fff", padding: "6px 8px", border: "2px solid #fff" }}>{h}</th>)}</tr></thead>
              <tbody>{s.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ background: ROW_A, padding: "6px 8px", border: "2px solid #fff" }}>{c}</td>)}</tr>)}</tbody>
            </table>
          )}
          <Footer />
        </>
      );
    }
    case "photos": {
      const ids = s.photoIds.slice(0, 8);
      const cols = ids.length <= 3 ? ids.length : ids.length <= 6 ? 3 : 4;
      const rows = Math.ceil(ids.length / cols) || 1;
      const gw = 1180, gh = 470, gap = 14;
      const w = (gw - gap * (cols - 1)) / cols, h = (gh - gap * (rows - 1)) / rows;
      return (
        <>
          <div style={{ position: "absolute", top: 34, right: 48, left: 48, textAlign: "center" }}>
            <span style={{ background: TITLE, color: "#fff", fontWeight: 700, fontSize: 28, padding: "6px 40px" }}>{s.title}</span>
          </div>
          {ids.map((id, i) => (
            <img key={id} src={deckImage(id)} alt="" style={{ position: "absolute", objectFit: "cover",
              left: 50 + (i % cols) * (w + gap), top: 120 + Math.floor(i / cols) * (h + gap), width: w, height: h }} />
          ))}
          <Footer />
        </>
      );
    }
  }
}

/** الشريحة بعرض width (بكسل) — بتحافظ على نسبة ١٦:٩ */
export function DeckSlide({ slide, width }: { slide: Slide; width: number }) {
  const scale = width / SLIDE_W;
  return (
    <div style={{ width, height: SLIDE_H * scale, overflow: "hidden", position: "relative", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.18)" }}>
      <div dir="rtl" style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", left: 0, top: 0, fontFamily: font, background: "#fff", color: "#111" }}>
        <SlideBody s={slide} />
      </div>
    </div>
  );
}

/** الشريحة بعرض الخانة اللى هى فيها (المعاينات فى الجريد) — بتتقاس بـ ResizeObserver */
export function DeckSlideFit({ slide }: { slide: Slide }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} style={{ width: "100%", minHeight: 1 }}>{w > 0 && <DeckSlide slide={slide} width={w} />}</div>;
}
