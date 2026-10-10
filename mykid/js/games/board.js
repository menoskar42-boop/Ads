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
  screen.classList.add("sb-screen");

  const back = () => Router.go(regionId ? "region" : "home", regionId ? { id: regionId, index: regionIndex } : {});
  screen.appendChild(gameTopbar("✋ السبورة الذكية", back));

  // المالك ٢٠٢٦-١٠-١٠: «كبّر مساحة السبورة… تملا معظم الشاشة». اللوح بياخد كل الطول
  // اللى فاضل تحت الشريط العلوى، والألوان والأقلام فى صف صغير تحته.
  const wrap = document.createElement("div");
  wrap.className = "sb-wrap";

  // اللوح
  const board = document.createElement("div");
  board.className = "sb-board";
  wrap.appendChild(board);

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair";
  board.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // ضبط دقّة اللوح — والرسم مايتمسحش لما المقاس يتغيّر (شريط عنوان سفارى بيظهر
  // ويختفى، أو الشاشة تلف): بننسخ اللى اترسم ونرجّعه بعد تغيير المقاس.
  let cssW = 0, cssH = 0;
  function resize() {
    const r = board.getBoundingClientRect();
    const w = Math.max(300, Math.round(r.width)), h = Math.max(225, Math.round(r.height));
    if (w === cssW && h === cssH) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let old = null;
    if (cssW && cssH) {
      old = document.createElement("canvas");
      old.width = canvas.width; old.height = canvas.height;
      old.getContext("2d").drawImage(canvas, 0, 0);
    }
    const prevW = cssW, prevH = cssH;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    cssW = w; cssH = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = ctx.lineJoin = "round";
    if (old) ctx.drawImage(old, 0, 0, prevW, prevH);
  }

  let color = COLORS[0];
  let size = 8;
  let drawing = false;
  let last = null;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top }; // بوحدات CSS — الـtransform بيظبط الدقّة
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
  const controls = document.createElement("div");
  controls.className = "sb-controls";
  const palette = document.createElement("div");
  palette.className = "sb-palette";
  COLORS.forEach((col, idx) => {
    const b = document.createElement("button");
    b.className = "sb-color";
    b.setAttribute("aria-label", "لون");
    b.style.cssText = `border:4px solid ${idx === 0 ? "#fff" : "transparent"};background:${col}`;
    b.addEventListener("click", () => {
      color = col; Sfx.tap();
      palette.querySelectorAll("button").forEach((x) => (x.style.border = "4px solid transparent"));
      b.style.border = "4px solid #fff";
    });
    palette.appendChild(b);
  });
  controls.appendChild(palette);

  // أحجام القلم + مسح
  const tools = document.createElement("div");
  tools.className = "sb-tools";
  [["رفيع", 5], ["متوسط", 10], ["عريض", 20]].forEach(([label, s], idx) => {
    const b = document.createElement("button");
    b.className = "candy-btn sb-btn";
    b.style.cssText = idx === 0 ? "" : "background:linear-gradient(180deg,#7c5fe6,#5b3fb5)";
    b.textContent = label;
    b.addEventListener("click", () => { size = s; Sfx.tap(); });
    tools.appendChild(b);
  });
  const clearBtn = document.createElement("button");
  clearBtn.className = "candy-btn sb-btn";
  clearBtn.style.background = "linear-gradient(180deg,#ff8a8a,#ff5d5d)";
  clearBtn.textContent = "🧽 امسح الكل";
  clearBtn.addEventListener("click", () => { ctx.clearRect(0, 0, cssW, cssH); Sfx.whoosh(); });
  tools.appendChild(clearBtn);
  controls.appendChild(tools);
  wrap.appendChild(controls);

  screen.appendChild(wrap);

  setTimeout(() => {
    resize();
    Speech.ar("هذه سبورتك، اكتب وارسم ما تحب!");
  }, 30);
  window.addEventListener("resize", resize);

  return screen;
}
