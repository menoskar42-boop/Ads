/**
 * شريحة واحدة من «العرض التقديمى» بنفس شكل عرض منطقة أسيوط (الريفرنس): البنفسجى 57318A للغلاف
 * والفواصل، والعناوين والجداول 7030A0، ولوجو WE تحت شمال وtelecomegypt تحت يمين.
 * اللوحة ثابتة ١٢٨٠×٧٢٠ وبتتصغّر/تتكبّر بـ scale — نفس النسب فى المعاينة والعرض الكامل.
 */
import { useEffect, useRef, useState } from "react";
import type { Slide } from "@shared/presentation-deck";
import weWhite from "@/assets/presentation/we-white.png";
import wePurple from "@/assets/presentation/we-purple.png";
import telecomEgypt from "@/assets/presentation/telecomegypt.png";

export const SLIDE_W = 1280;
export const SLIDE_H = 720;
export const PURPLE = "#57318A";
export const TITLE = "#7030A0";
const ROW_A = "#CFD5EA";
const ROW_B = "#E9EBF5";

export const deckImage = (id: string) => `/api/presentation/image/${id}`;

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
      const many = s.columns.length > 4;
      const fs = s.rows.length > 9 ? 17 : many ? 19 : 22;
      return (
        <>
          <Title text={s.title} />
          {s.imageId && <img src={deckImage(s.imageId)} alt="" style={{ position: "absolute", left: 50, top: 120, width: 520, height: 500, objectFit: "contain" }} />}
          <table style={{ position: "absolute", top: 122, right: 40, width: s.imageId ? 640 : 1200, borderCollapse: "collapse", fontSize: fs, fontWeight: 700, textAlign: "center" }}>
            <thead>
              <tr>{s.columns.map((h, i) => <th key={i} style={{ background: TITLE, color: "#fff", padding: "8px 10px", border: "2px solid #fff" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {s.rows.map((r, i) => {
                const total = s.totalLast && i === s.rows.length - 1;
                return (
                  <tr key={i}>{r.map((c, j) => (
                    <td key={j} style={{ background: total ? TITLE : i % 2 ? ROW_B : ROW_A, color: total ? "#fff" : "#111", padding: "7px 10px", border: "2px solid #fff" }}>{c}</td>
                  ))}</tr>
                );
              })}
            </tbody>
          </table>
          {s.note && <div style={{ position: "absolute", bottom: 110, right: 48, left: 48, fontSize: 18, color: "#444", textAlign: "right" }}>{s.note}</div>}
          <Footer />
        </>
      );
    }
    case "chart": {
      const max = Math.max(1, ...s.points.map((p) => p.value));
      const top = Math.ceil(max / 10) * 10 || 10;
      const W = 1000, H = 380, x0 = 140, y0 = 560;
      const bw = Math.min(110, (W / Math.max(1, s.points.length)) * 0.55);
      return (
        <>
          <div style={{ position: "absolute", top: 34, right: 48, left: 48, textAlign: "center" }}>
            <span style={{ background: TITLE, color: "#fff", fontWeight: 700, fontSize: 28, padding: "6px 30px" }}>{s.title}</span>
          </div>
          <div style={{ position: "absolute", top: 110, left: 0, right: 0, textAlign: "center", fontSize: 28, fontWeight: 700 }}>{s.seriesLabel}</div>
          <svg width={SLIDE_W} height={SLIDE_H} style={{ position: "absolute", inset: 0 }}>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={x0} x2={x0 + W} y1={y0 - t * H} y2={y0 - t * H} stroke="#ddd" />
                <text x={x0 - 12} y={y0 - t * H + 6} fontSize={18} textAnchor="end" fill="#555" fontFamily={font}>{Math.round(t * top)}{s.unit}</text>
              </g>
            ))}
            {s.points.map((p, i) => {
              const cx = x0 + (W / s.points.length) * (i + 0.5);
              const h = (p.value / top) * H;
              return (
                <g key={p.label}>
                  <rect x={cx - bw / 2} y={y0 - h} width={bw} height={h} fill="#00B0F0" />
                  <text x={cx} y={y0 - h - 12} fontSize={22} fontWeight={700} textAnchor="middle" fill="#111" fontFamily={font}>{p.value}{s.unit}</text>
                  <text x={cx} y={y0 + 30} fontSize={22} fontWeight={700} textAnchor="middle" fill="#111" fontFamily={font}>{p.label}</text>
                </g>
              );
            })}
          </svg>
          {s.note && <div style={{ position: "absolute", bottom: 108, left: 0, right: 0, textAlign: "center", fontSize: 18, color: "#555" }}>{s.note}</div>}
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
