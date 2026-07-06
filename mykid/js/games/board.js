// ===== السبورة الذكية: كتابة/رسم حرّ بالإصبع =====
// لوح أبيض يكتب عليه الطفل بحرية، يختار اللون وعرض القلم، ويمسح.
import { Router } from "../core/router.js";
import { Sfx } from "../core/audio.js";
import { Speech } from "../core/speech.js";
import { gameTopbar } from "./common.js";

const COLORS = ["#3a2c66", "#ff5d5d", "#ff924c", "#ffd23f", "#34d399", "#38bdf8", "#7c5fe6", "#ff6fb5"];

export function renderBoard({ regionId, regionIndex }) {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#e9f3ff,#cfe0ff)";

  const back = () => Router.go(regionId ? "region" : "home", regionId ? { id: regionId, index: regionIndex } : {});
  screen.appendChild(gameTopbar("✋ السبورة الذكية", back));

  const wrap = document.createElement("div");
  wrap.style.cssText = "max-width:760px;margin:0 auto;padding:10px 14px 30px";

  // اللوح
  const board = document.createElement("div");
  board.style.cssText =
    "position:relative;width:100%;aspect-ratio:4/3;background:#fff;border-radius:24px;box-shadow:var(--shadow-card);overflow:hidden";
  wrap.appendChild(board);

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair";
  board.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // ضبط دقّة اللوح
  function resize() {
    const r = board.getBoundingClientRect();
    const prev = ctx.getImageData ? null : null;
    canvas.width = Math.max(300, r.width);
    canvas.height = Math.max(225, r.height);
    ctx.lineCap = ctx.lineJoin = "round";
  }

  let color = COLORS[0];
  let size = 8;
  let drawing = false;
  let last = null;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: (t.clientX - r.left) * (canvas.width / r.width),
      y: (t.clientY - r.top) * (canvas.height / r.height),
    };
  }
  function dot(p) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  function start(e) { e.preventDefault(); drawing = true; last = pos(e); dot(last); Sfx.pop(); }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.strokeStyle = color; ctx.lineWidth = size;
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  }
  function end() { drawing = false; }

  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  // شريط الألوان
  const palette = document.createElement("div");
  palette.style.cssText = "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px";
  COLORS.forEach((col, idx) => {
    const b = document.createElement("button");
    b.style.cssText =
      `width:40px;height:40px;border-radius:50%;border:4px solid ${idx === 0 ? "#fff" : "transparent"};` +
      `background:${col};box-shadow:var(--shadow-card);transition:transform .12s ease`;
    b.addEventListener("click", () => {
      color = col; Sfx.tap();
      palette.querySelectorAll("button").forEach((x) => (x.style.border = "4px solid transparent"));
      b.style.border = "4px solid #fff";
    });
    palette.appendChild(b);
  });
  wrap.appendChild(palette);

  // أحجام القلم + مسح
  const tools = document.createElement("div");
  tools.style.cssText = "display:flex;gap:12px;justify-content:center;align-items:center;margin-top:14px;flex-wrap:wrap";
  [["رفيع", 5], ["متوسط", 10], ["عريض", 20]].forEach(([label, s], idx) => {
    const b = document.createElement("button");
    b.className = "candy-btn";
    b.style.cssText = idx === 0 ? "" : "background:linear-gradient(180deg,#7c5fe6,#5b3fb5)";
    b.textContent = label;
    b.addEventListener("click", () => { size = s; Sfx.tap(); });
    tools.appendChild(b);
  });
  const clearBtn = document.createElement("button");
  clearBtn.className = "candy-btn";
  clearBtn.style.background = "linear-gradient(180deg,#ff8a8a,#ff5d5d)";
  clearBtn.textContent = "🧽 امسح الكل";
  clearBtn.addEventListener("click", () => { ctx.clearRect(0, 0, canvas.width, canvas.height); Sfx.whoosh(); });
  tools.appendChild(clearBtn);
  wrap.appendChild(tools);

  screen.appendChild(wrap);

  setTimeout(() => {
    resize();
    Speech.ar("هذه سبورتك، اكتب وارسم ما تحب!");
  }, 30);
  window.addEventListener("resize", resize);

  return screen;
}
