// ===== ورقة كتابة للطباعة =====
//
// المالك ٢٠٢٦-١٠-١٠: الصباع على الشاشة بيعلّم شكل الحرف، لكن مسكة القلم مابتتعلّمش
// غير على الورق. الورقة بتتبنى من نفس خطوط اللوحة (`strokes.js`) — نفس النقطة الخضرا
// ونفس الأرقام والأسهم — وبتقلّ المساعدة سطر ورا سطر زى اللوحة بالظبط:
//   نموذج كامل ← على النقط ← نقطة البداية بس ← مربع فاضى.
//
// بتظهر كمعاينة على الشاشة الأول (زرار «اطبع» + «اقفل») — لأن الطباعة من التابلت
// مش دايماً متاحة، والمعاينة لوحدها ممكن تتصوّر أو تتحفظ PDF.
import { densify, cumulative } from "./strokeJudge.js";

const CELLS = 6;

/** خطة الصفوف (دالة صافية — متقاسة): لحرف واحد صفحة كاملة، ولكذا حرف سطرين لكل حرف. */
export function sheetPlan(glyphs) {
  const dots = Array(CELLS - 1).fill("dots");
  if (glyphs.length === 1) {
    const g = glyphs[0];
    return [[
      { g, cells: ["model", ...dots] },
      { g, cells: Array(CELLS).fill("dots") },
      { g, cells: Array(CELLS).fill("dots") },
      { g, cells: Array(CELLS).fill("start") },
      { g, cells: Array(CELLS).fill("start") },
      { g, cells: Array(CELLS).fill("blank") },
    ]];
  }
  const pages = [];
  for (let i = 0; i < glyphs.length; i += 4) {
    pages.push(glyphs.slice(i, i + 4).flatMap((g) => [
      { g, cells: ["model", ...dots] },
      { g, cells: ["start", "start", "start", "blank", "blank", "blank"] },
    ]));
  }
  return pages;
}

const r1 = (n) => Math.round(n * 10) / 10;
const pathD = (st) => st.map(([x, y], i) => (i ? "L" : "M") + r1(x) + " " + r1(y)).join("");

function arrow(st) {
  const d = densify(st, 1);
  const cum = cumulative(d);
  const len = cum[cum.length - 1];
  if (len < 14) return "";
  let i = cum.findIndex((c) => c >= Math.min(18, len * 0.45));
  if (i < 1) i = 1;
  const a = d[i - 1], b = d[Math.min(i + 1, d.length - 1)];
  const an = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return `<polygon points="5,0 -4,-5 -1,0 -4,5" fill="#7c3aed" transform="translate(${r1(d[i][0])} ${r1(d[i][1])}) rotate(${r1(an)})"/>`;
}

function startMark(st, n, many) {
  const [x, y] = st[0];
  return `<circle cx="${r1(x)}" cy="${r1(y)}" r="5.6" fill="#16a34a"/>` +
    (many ? `<text x="${r1(x)}" y="${r1(y) + 2.6}" font-size="7.5" font-weight="800" text-anchor="middle" fill="#fff" font-family="sans-serif">${n}</text>` : "");
}

/** مربع واحد كـSVG (إحداثيات ٠–١٠٠ زى اللوحة). */
export function cellSvg(strokes, mode) {
  const many = strokes.length > 1;
  let body = "";
  strokes.forEach((st, i) => {
    const isDot = st.length === 1;
    if (mode === "model") {
      body += isDot
        ? `<circle cx="${r1(st[0][0])}" cy="${r1(st[0][1])}" r="4.2" fill="#3f3f46"/>`
        : `<path d="${pathD(st)}" fill="none" stroke="#3f3f46" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` + arrow(st);
    } else if (mode === "dots") {
      body += isDot
        ? `<circle cx="${r1(st[0][0])}" cy="${r1(st[0][1])}" r="4" fill="none" stroke="#9ca3af" stroke-width="1.4" stroke-dasharray="1.6 1.6"/>`
        : `<path d="${pathD(st)}" fill="none" stroke="#9ca3af" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="0.01 6"/>`;
    }
  });
  if (mode !== "blank") strokes.forEach((st, i) => { body += startMark(st, i + 1, many); });
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">` +
    `<line x1="6" y1="70" x2="94" y2="70" stroke="#e5e1f5" stroke-width="0.8"/>${body}</svg>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * يفتح المعاينة. glyphs = [{ label, strokes }]. `name` (اختيارى) بيتكتب سطر منقّط فوق.
 */
export function openWorksheet({ title, glyphs, name = "" }) {
  document.querySelectorAll(".ws-overlay").forEach((e) => e.remove());
  const overlay = document.createElement("div");
  overlay.className = "ws-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "ورقة كتابة للطباعة");

  const bar = document.createElement("div");
  bar.className = "ws-bar";
  const printBtn = document.createElement("button");
  printBtn.className = "candy-btn";
  printBtn.type = "button";
  printBtn.textContent = "🖨️ اطبع";
  const closeBtn = document.createElement("button");
  closeBtn.className = "candy-btn";
  closeBtn.type = "button";
  closeBtn.style.background = "linear-gradient(180deg,#9aa7ff,#6b7cff)";
  closeBtn.textContent = "✕ اقفل";
  bar.append(printBtn, closeBtn);
  overlay.appendChild(bar);

  const pages = sheetPlan(glyphs);
  pages.forEach((rows, pi) => {
    const page = document.createElement("section");
    page.className = "ws-page";
    let html = `<header class="ws-head"><div class="ws-title">${esc(title)}</div>` +
      `<div class="ws-meta"><span>الاسم: ............................</span><span>التاريخ: ........../........../..........</span></div>` +
      (pi === 0 ? `<p class="ws-tip">كل خط بيبدأ من النقطة الخضرا وبيمشى فى اتجاه السهم، والأرقام بتقول الترتيب. السطر الأول نموذج، وبعده على النقط، وبعده من النقطة بس، والأخير من غير مساعدة.</p>` : "") +
      `</header>`;
    if (pi === 0 && name) {
      html += `<div class="ws-name"><svg viewBox="0 0 600 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
        `<line x1="10" y1="96" x2="590" y2="96" stroke="#e5e1f5" stroke-width="2"/>` +
        `<text x="300" y="86" text-anchor="middle" font-size="92" font-weight="800" fill="none" stroke="#9ca3af" stroke-width="1.6" stroke-dasharray="0.5 4" stroke-linecap="round" font-family="'Baloo Bhaijaan 2', Tahoma, sans-serif">${esc(name)}</text>` +
        `</svg></div>`;
    }
    for (const row of rows) {
      html += `<div class="ws-row" data-label="${esc(row.g.label)}">` + row.cells.map((m) => cellSvg(row.g.strokes, m)).join("") + `</div>`;
    }
    page.innerHTML = html;
    overlay.appendChild(page);
  });

  const close = () => {
    overlay.remove();
    document.body.classList.remove("ws-printing");
  };
  closeBtn.addEventListener("click", close);
  printBtn.addEventListener("click", () => {
    document.body.classList.add("ws-printing");
    try { window.print(); } catch (e) { /* التابلت ممكن مايطبعش — المعاينة فاضلة قدامه */ }
  });
  window.addEventListener("afterprint", () => document.body.classList.remove("ws-printing"), { once: true });
  document.body.appendChild(overlay);
  return overlay;
}
