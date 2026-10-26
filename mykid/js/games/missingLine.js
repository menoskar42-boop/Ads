// ===== «كمّل الأرقام ١–١٠» — الشاشة (المالك ٢٠٢٦-١٠-٢٦) =====
// سطرين (١–٥ و٦–١٠) فيهم أماكن فاضية، وتحت نجوم بأرقام. اسحب النجمة للمكان الفاضى،
// أو المسها وبعدين المس المكان. الرقم الموجود فى السطر ميزو بيقول «موجود»، والرقم فى مكان
// غلط «مش مكانه». ولو غلط مرتين فى نفس الرقم المكان الصح بينوّر.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, finishActivity, mizoBuddy } from "./common.js";
import { femAdapt } from "../data/mizo.js";
import { WB_AR } from "../data/workbook.js";
import { missingLineRounds, ML_SAY, ML_MAX } from "../data/missingLine.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const el = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; };
const COLORS = ["#7c3aed", "#0ea5e9", "#16a34a", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#8b5cf6", "#22c55e", "#f97316"];
const STARS = ["#fde047", "#86efac", "#7dd3fc", "#f9a8d4", "#fdba74"];

export function renderMissingLine({ regionId, regionIndex, title, back: backTo }) {
  const screen = el("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#dbeafe,#93c5fd)";
  const back = () => (backTo ? Router.go(backTo, { regionId, regionIndex }) : Router.go("region", { id: regionId, index: regionIndex }));
  screen.appendChild(gameTopbar(title || "🔢 كمّل الأرقام ١–١٠", back));
  const stage = el("div");
  screen.appendChild(stage);
  const rounds = missingLineRounds();
  let ri = 0;
  let float = null;
  const sayAr = (t) => Speech.ar(fem(t));

  const next = () => {
    if (ri >= rounds.length) { sayAr(ML_SAY.done); return finishActivity({ regionId, regionIndex, stars: 7, onDone: back }); }
    stage.replaceChildren();
    const r = rounds[ri];
    stage.append(el("p", "text-align:center;font-weight:800;color:#1e3a8a;opacity:.8;margin:8px 0 0", `${ri + 1} من ${rounds.length}`));
    stage.append(el("p", "text-align:center;font-weight:800;color:#1e3a8a;font-size:clamp(17px,4.6vw,22px);margin:6px 12px", fem(ML_SAY.intro)));
    const buddy = mizoBuddy();
    stage.append(buddy.el);

    // السطرين: الأرقام بالترتيب من الشمال لليمين (زى الكتاب)
    const board = el("div", "display:grid;grid-template-columns:repeat(5,1fr);gap:8px;max-width:min(94vw,520px);margin:8px auto 18px;direction:ltr");
    const slots = new Map();
    for (let n = 1; n <= ML_MAX; n++) {
      const missing = r.gaps.includes(n);
      const s = el("div", `height:clamp(58px,15vw,78px);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:clamp(34px,10vw,50px);font-weight:900;${missing
        ? "border:3px dashed #1e40af;background:rgba(255,255,255,.55);color:transparent" : `background:#fff;color:${COLORS[n - 1]};box-shadow:0 3px 0 rgba(0,0,0,.1)`}`, missing ? "?" : String(n));
      if (missing) { s.dataset.gap = String(n); s.style.color = "rgba(30,64,175,.35)"; }
      slots.set(n, s);
      board.append(s);
    }
    stage.append(board);

    // النجوم
    const bank = el("div", "display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:min(94vw,520px);margin:0 auto 26px;touch-action:none");
    stage.append(bank);
    let sel = null, left = r.gaps.length;
    const wrongs = new Map();
    const tiles = r.bank.map((n, i) => {
      const t = el("div", `position:relative;width:clamp(70px,19vw,88px);height:clamp(70px,19vw,88px);display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none;user-select:none`);
      t.innerHTML = `<svg viewBox="0 0 100 100" style="position:absolute;inset:0;width:100%;height:100%"><path d="M50 4 L62 36 L96 38 L69 59 L79 93 L50 73 L21 93 L31 59 L4 38 L38 36 Z" fill="${STARS[i % STARS.length]}" stroke="rgba(0,0,0,.15)" stroke-width="3" stroke-linejoin="round"/></svg>`;
      t.append(el("span", "position:relative;font-size:clamp(26px,7vw,34px);font-weight:900;color:#1f2937", String(n)));
      t.dataset.num = String(n);
      bank.append(t);
      return t;
    });
    const select = (t) => {
      tiles.forEach((x) => (x.style.filter = ""));
      sel = t;
      if (t) { t.style.filter = "drop-shadow(0 0 6px #7c3aed)"; Speech.ar(WB_AR[+t.dataset.num]); }
    };
    const drop = (t, gapEl) => {
      const n = +t.dataset.num;
      if (!gapEl) return false;
      const g = +gapEl.dataset.gap;
      if (!r.gaps.includes(n)) { // رقم موجود أصلاً
        Sfx.wrong(); buddy.lose(); sayAr(ML_SAY.here);
        t.animate([{ transform: "rotate(0)" }, { transform: "rotate(-12deg)" }, { transform: "rotate(12deg)" }, { transform: "rotate(0)" }], { duration: 400 });
        return true;
      }
      if (n !== g) {
        Sfx.wrong(); buddy.lose(); sayAr(ML_SAY.notHere);
        gapEl.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 350 });
        const w = (wrongs.get(n) || 0) + 1;
        wrongs.set(n, w);
        if (w >= 2) { const right = slots.get(n); right.animate([{ background: "rgba(255,255,255,.55)" }, { background: "#fef08a" }, { background: "rgba(255,255,255,.55)" }], { duration: 1400 }); }
        return true;
      }
      // صح: الرقم بيدخل مكانه بلونه
      delete gapEl.dataset.gap;
      gapEl.style.cssText += `;border:3px solid #22c55e;background:#ecfdf3;color:${COLORS[n - 1]}`;
      gapEl.textContent = String(n);
      gapEl.animate([{ transform: "scale(.6)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 400 });
      t.remove();
      Sfx.correct(); buddy.win(); awardStars(1);
      Speech.ar(WB_AR[n]);
      select(null);
      if (--left === 0) { ri++; setTimeout(next, 1600); }
      return true;
    };

    // السحب (والّمس: المس النجمة وبعدين المكان الفاضى)
    let drag = null;
    bank.addEventListener("pointerdown", (e) => {
      const t = e.target.closest("[data-num]");
      if (!t) return;
      select(t);
      const b = t.getBoundingClientRect();
      drag = { t, dx: e.clientX - b.left, dy: e.clientY - b.top, moved: false, x0: e.clientX, y0: e.clientY };
      try { bank.setPointerCapture(e.pointerId); } catch (_) { /* متصفح قديم */ }
    });
    bank.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
      if (!drag.moved) {
        drag.moved = true;
        float = drag.t.cloneNode(true);
        float.style.cssText += ";position:fixed;z-index:50;pointer-events:none;opacity:.9;transform:scale(1.1)";
        document.body.append(float);
        drag.t.style.opacity = ".3";
      }
      float.style.left = `${e.clientX - drag.dx}px`;
      float.style.top = `${e.clientY - drag.dy}px`;
    });
    bank.addEventListener("pointerup", (e) => {
      if (!drag) return;
      const { t, moved } = drag;
      drag = null;
      if (float) { float.remove(); float = null; }
      t.style.opacity = "";
      if (!moved) return; // لمسة: النجمة فضلت متختارة
      const under = document.elementFromPoint(e.clientX, e.clientY);
      drop(t, under && under.closest && under.closest("[data-gap]"));
    });
    board.addEventListener("click", (e) => {
      const g = e.target.closest("[data-gap]");
      if (g && sel && sel.isConnected) drop(sel, g);
    });
    sayAr(ML_SAY.intro);
  };
  next();
  return screen;
}
