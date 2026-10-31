// ===== «كمّل الكلمة بإيدك» — الشاشة (المالك ٢٠٢٦-١٠-٣١، صورة امتحان بنته) =====
// الصورة + ميزو يقول الكلمة، والكلمة مكتوبة ومكان الحرف فاضى. الطفل يكتب الحرف بإيده:
//   العربى: بشكله جوّه الكلمة (بـ ـبـ ـب) على لوحة القناع — ١ الشكل فاتح يمشى عليه · ٢ محيطه منقّط ·
//           ٣ مربع فاضى زى الامتحان ويدوس «✓ خلصت» (blankJudge بيقيس الشكل مش المكان، ولو كتب شكل تانى
//           للحرف ميزو بيقوله «ده شكل تانى للحرف، هنا الحرف فى …»).
//   الإنجليزى: الحرف الصغير على لوحة الكتابة بتاعة الكتاب (نقطة البداية والاتجاه) بنفس المستويات.
// ماحدّش بيتقفل: غلطتين فى المربع الفاضى ⇒ الحرف بيبان ثانيتين، والتالتة ⇒ اللوحة بترجع منقّطة.
//
// mountBlankWrite(host, lang, ch, {ask, hint, onDone}) — نفس شكل mountFormsGame (جوّه الكتاب وبرّه).
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, finishActivity, mizoBuddy } from "./common.js";
import { femAdapt } from "../data/mizo.js";
import { strokesFor } from "../data/strokes.js";
import { mountWriteBoard } from "./writeBoard.js";
import { SCORE_PASS } from "./strokeJudge.js";
import { penBoardOptions } from "./grip.js";
import { judge } from "./traceJudge.js";
import { judgeShapes } from "./blankJudge.js";
import { starredLetters } from "../data/letterRecall.js";
import { BW_SAY, BW_AR_LETTERS, BW_EN_LETTERS, arItems, arShapes, enItems, levelFor, nameOf, askFor } from "../data/blankWrite.js";
import { joinsNext, letterTiles } from "../data/letterbook.js";
import { reviewKey, nextReview, todayISO, dueKeys, resolveKey, RV_SAY } from "../data/writeReview.js";

let styled = false;
/** حركات «الحرف الهربان» و«قطر الكلمة» (مرة واحدة فى الصفحة). */
function ensureStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `@keyframes bwBob{0%,100%{transform:translateY(0) rotate(-8deg)}50%{transform:translateY(-12px) rotate(8deg)}}
@keyframes bwDance{0%,100%{transform:rotate(0) scale(1)}25%{transform:rotate(-12deg) scale(1.12)}75%{transform:rotate(12deg) scale(1.12)}}
@keyframes bwShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
.bw-runner{position:absolute;z-index:3;font-weight:900;color:#ec4899;transition:left .9s cubic-bezier(.5,-.4,.5,1.4),top .9s cubic-bezier(.5,-.4,.5,1.4);pointer-events:none;font-family:'Baloo Bhaijaan 2',sans-serif}
.bw-runner.bob{animation:bwBob 1s ease-in-out infinite}
.bw-dance{animation:bwDance .5s ease-in-out 3}
.bw-train{transition:transform 1.6s ease-in}
.bw-train.wait{animation:bwShake .5s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.bw-runner,.bw-train{transition:none}.bw-runner.bob,.bw-dance,.bw-train.wait{animation:none}}`;
  document.head.appendChild(s);
}

/** 🚂 الكلمة عربيات قطر — كل عربية حرف بشكله الموصول، وعربية الحرف الناقص فاضية (أو مليانة لما يكتبه). */
function trainLine(x, lang, filled) {
  const ar = lang === "ar";
  const wrap = el("div", "overflow:hidden;padding:6px 0");
  const row = el("div", "display:flex;align-items:flex-end;justify-content:center;gap:0");
  row.className = "bw-train" + (filled ? "" : " wait");
  row.dir = ar ? "rtl" : "ltr";
  const letters = ar ? letterTiles(x.w, x.letter).tiles : [...x.w];
  const at = x.before ? [...x.before].length : 0;
  const car = (txt, gap) => {
    const c = el("span", `display:inline-flex;flex-direction:column;align-items:center;margin:0 1px`);
    const box = el("span", `display:inline-flex;align-items:center;justify-content:center;min-width:1.15em;height:1.35em;padding:0 3px;border-radius:8px 8px 4px 4px;background:${gap ? (filled ? "#bbf7d0" : "#fff") : "#fde68a"};border:3px ${gap && !filled ? "dashed #8b5cf6" : "solid #f59e0b"};font-size:clamp(26px,7.5vw,38px);font-weight:900;color:${gap ? (filled ? "#16a34a" : "#8b5cf6") : "#78350f"};${ar ? "font-family:'Baloo Bhaijaan 2',sans-serif" : ""}`, txt);
    const wheels = el("span", "font-size:12px;line-height:1;letter-spacing:6px", "⚫⚫");
    c.append(box, wheels);
    return c;
  };
  const link = () => el("span", `width:6px;height:4px;background:${filled ? "#16a34a" : "#a8a29e"};margin-bottom:16px;border-radius:2px`);
  letters.forEach((t, i) => {
    if (i) row.append(link());
    row.append(car(i === at ? (filled ? t : ar ? "؟" : "?") : t, i === at));
  });
  // القاطرة قدّام: العربى ماشى شمال (القاطرة فى الآخر ناحية الشمال)، والإنجليزى ماشى يمين
  const eng = el("span", `font-size:clamp(34px,9vw,48px);margin-bottom:10px;${ar ? "" : "transform:scaleX(-1);display:inline-block"}`, "🚂");
  row.append(link(), eng);
  wrap.append(row);
  return wrap;
}

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const el = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; };
const btn = (css, text, fn) => { const b = el("button", css, text); b.type = "button"; b.addEventListener("click", fn); return b; };
const flash = (node, cls, ms = 450) => { node.classList.add(cls); setTimeout(() => node.classList.remove(cls), ms); };
const CARD = "background:#fff;border-radius:22px;box-shadow:0 6px 0 rgba(0,0,0,.1);padding:10px 14px;margin:6px auto;max-width:min(92vw,460px);text-align:center";
const GAP = "display:inline-block;min-width:1.1em;border-bottom:4px dashed #8b5cf6;color:#8b5cf6;margin:0 2px;line-height:1.05";
const LEVEL_TAG = { 1: "✏️ على الحرف الفاتح", 2: "••• على النقط", 3: "⭐ لوحدك زى الامتحان" };

/** الكلمة ومكان الحرف فاضى (بالكشيدة لو الحرف موصول باللى قبله أو بعده) — أو الكلمة كاملة والحرف ملوّن. */
function wordLine(x, lang, filled) {
  const p = el("p", `font-size:clamp(36px,10vw,54px);font-weight:900;margin:2px 0;color:#3b2a6b;${lang === "ar" ? "font-family:'Baloo Bhaijaan 2',sans-serif" : ""}`);
  p.dir = lang === "ar" ? "rtl" : "ltr";
  const ar = lang === "ar";
  const l = x.before + (ar && x.before && joinsNext(x.before[x.before.length - 1]) ? "ـ" : "");
  const r = (ar && x.after && joinsNext(x.letter) ? "ـ" : "") + x.after;
  const gap = el("span", filled ? "color:#16a34a" : GAP, filled ? (ar ? x.shape.replace(/ـ/g, "") : x.letter) : ar ? "؟" : "?");
  p.append(document.createTextNode(filled ? x.before : l), gap, document.createTextNode(filled ? x.after : r));
  return p;
}

/**
 * لوحة الحرف العربى بشكله (القناع من الخط نفسه — نفس طريقة «اكتب الحرف موصول»).
 * level 1/2: الرسم فوق الحرف (traceJudge) · level 3: مربع فاضى، والحكم بالشكل (blankJudge) لما يدوس «خلصت».
 */
export function maskBoard(shape, shapes, level, { onOk, onBad, onHint }, opt = {}) {
  // opt.latin: حرف إنجليزى (ورقة الامتحان) — نفس الحكم بالشكل. opt.quiet: من غير الخلفية الخضرا لما يصح (الميس بتصحّح بعدين)
  const W = 480, H = 300;
  const box = el("div", "position:relative;width:min(90vw,440px);aspect-ratio:1.6;background:#fff;border-radius:24px;box-shadow:0 6px 0 rgba(0,0,0,.12);margin:8px auto;touch-action:none");
  box.className = "bw-board";
  box.dataset.shape = shape;
  box.dataset.level = String(level);
  const mk = (z) => { const c = el("canvas", `position:absolute;inset:0;width:100%;height:100%;z-index:${z}`); c.width = W; c.height = H; box.append(c); return c; };
  const guide = mk(0), draw = mk(1);
  const g = guide.getContext("2d"), d = draw.getContext("2d");
  const font = (ctx, glyph) => {
    let size = H * 0.62;
    const fam = opt.latin ? `"Baloo Bhaijaan 2", "Comic Sans MS", sans-serif` : `"Baloo Bhaijaan 2", sans-serif`;
    ctx.font = `bold ${size}px ${fam}`;
    const w = ctx.measureText(glyph).width;
    if (w > W * 0.86) size *= (W * 0.86) / w;
    ctx.font = `bold ${size}px ${fam}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.direction = opt.latin ? "ltr" : "rtl";
  };
  const Y = H / 2 + H * 0.06;
  const maskOf = (glyph) => {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const m = c.getContext("2d"); m.fillStyle = "#000"; font(m, glyph); m.fillText(glyph, W / 2, Y);
    const data = m.getImageData(0, 0, W, H).data, a = new Uint8Array(W * H);
    for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3];
    return a;
  };
  const masks = [shape, ...shapes.filter((s) => s !== shape)].map(maskOf);
  const target = masks[0];
  let maskTotal = 0;
  for (let i = 0; i < target.length; i++) if (target[i] > 40) maskTotal++;
  const paint = (lv, color) => {
    g.clearRect(0, 0, W, H);
    if (lv === 1) { g.fillStyle = color || "#ddd6fe"; font(g, shape); g.fillText(shape, W / 2, Y); }
    else if (lv === 2) { g.setLineDash([7, 9]); g.lineWidth = 4; g.strokeStyle = "#a78bfa"; font(g, shape); g.strokeText(shape, W / 2, Y); g.setLineDash([]); }
    else { g.setLineDash([10, 10]); g.strokeStyle = "#e9d5ff"; g.lineWidth = 3; g.beginPath(); g.moveTo(W * 0.08, H * 0.78); g.lineTo(W * 0.92, H * 0.78); g.stroke(); g.setLineDash([]); }
  };
  let lv = level;
  paint(lv);
  d.lineCap = d.lineJoin = "round";
  d.lineWidth = 22;
  d.strokeStyle = d.fillStyle = "#ff6fb5";
  let drawing = false, last = null, done = false, inked = false;
  const pos = (e) => { const r = draw.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; };
  const alpha = () => { const dd = d.getImageData(0, 0, W, H).data, a = new Uint8Array(W * H); for (let i = 0; i < a.length; i++) a[i] = dd[i * 4 + 3]; return a; };
  const win = () => { done = true; if (!opt.quiet) paint(1, "#bbf7d0"); onOk(); };
  const overlay = () => {
    const a = alpha();
    let covered = 0, drawn = 0;
    for (let i = 0; i < a.length; i++) { if (a[i] <= 40) continue; drawn++; if (target[i] > 40) covered++; }
    return judge(covered, drawn, maskTotal);
  };
  const down = (e) => {
    if (done) return;
    e.preventDefault();
    try { draw.setPointerCapture(e.pointerId); } catch (_) { /* قديم */ }
    drawing = true; inked = true;
    last = pos(e);
    d.beginPath(); d.arc(last.x, last.y, d.lineWidth / 2, 0, Math.PI * 2); d.fill();
  };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    d.beginPath(); d.moveTo(last.x, last.y); d.lineTo(p.x, p.y); d.stroke();
    last = p;
  };
  const up = () => {
    if (!drawing) return;
    drawing = false;
    if (done || lv === 3 || !maskTotal) return;
    const r = overlay();
    if (r.ok) return win();
    if (r.coverage >= 0.62) onHint(BW_SAY.out);
    else if (r.coverage >= 0.31) onHint(BW_SAY.more);
  };
  draw.addEventListener("pointerdown", down);
  draw.addEventListener("pointermove", move);
  draw.addEventListener("pointerup", up);
  draw.addEventListener("pointercancel", up);
  let peekTimer = 0;
  return {
    el: box,
    /** الحكم بالشكل من غير ما اللوحة تقفل (ورقة الامتحان: الميس بتصحّح الكل مرة واحدة). */
    check() {
      if (!inked) return { ok: false, wrongShape: -1, empty: true };
      return judgeShapes(alpha(), masks, 0, W, H);
    },
    /** صورة اللى الطفل كتبه (للكارت الصغير فى الورقة). */
    snapshot() { return draw.toDataURL("image/png"); },
    get inked() { return inked; },
    /** المستوى ٣: «✓ خلصت» — الحكم بالشكل. */
    submit() {
      if (done || lv !== 3) return;
      if (!inked) return onHint(BW_SAY.more);
      const r = judgeShapes(alpha(), masks, 0, W, H);
      if (r.ok) return win();
      onBad(r.wrongShape >= 0 ? "shape" : r.empty ? "more" : "bad");
    },
    reset() { if (!done) { d.clearRect(0, 0, W, H); inked = false; } },
    peek(ms = 2500) { clearTimeout(peekTimer); paint(1); peekTimer = setTimeout(() => { if (!done) paint(lv); }, ms); },
    /** ارجع خطوة للمساعدة (بعد ٣ غلطات فى المربع الفاضى). */
    easier() { if (done) return; lv = Math.max(1, lv - 1); box.dataset.level = String(lv); d.clearRect(0, 0, W, H); inked = false; paint(lv); },
    get level() { return lv; },
    destroy() { clearTimeout(peekTimer); },
  };
}

/** اللعبة على حرف واحد (٣ كلمات بالترتيب: أول ← وسط ← آخر، والمستوى بيصعب كل كلمة). */
export function mountBlankWrite(host, lang, ch, opts) {
  // flavor: write (الأساسى) · runaway (الحرف الهربان) · train (قطر الكلمة). items/level: «مراجعة اليوم» (كلمات من حروف مختلفة،
  // كلها فى المربع الفاضى). كل جولة فى المربع الفاضى بتتسجّل فى المراجعة (الغلط يرجع تانى يوم).
  const { ask, hint, onDone, flavor = "write", items: given = null, level: fixed = 0 } = opts;
  ensureStyle();
  const ar = lang === "ar";
  const items = given || (ar ? arItems(ch) : enItems(ch)).map((x) => ({ ch, ...x }));
  const area = el("div", "padding-bottom:18px");
  host.append(area);
  let alive = true, timers = [], boardCleanup = () => {};
  const later = (fn, ms) => timers.push(setTimeout(() => { if (alive && area.isConnected) fn(); }, ms));
  const sayWord = (w) => Speech.say(w, { lang: ar ? "ar-EG" : "en-US" });
  let r = 0;

  const round = () => {
    boardCleanup(); boardCleanup = () => {};
    const x = items[r];
    const level = fixed || levelFor(r, items.length);
    area.replaceChildren();
    ask(askFor(flavor, lang, nameOf(x.ch || ch), x.pos));
    later(() => sayWord(x.w), 2600);
    const card = el("div", CARD + ";position:relative");
    const pic = btn("display:block;margin:2px auto;font-size:clamp(76px,22vw,120px);line-height:1.1;background:none;border:0;cursor:pointer", x.e, () => { Sfx.tap(); sayWord(x.w); });
    pic.setAttribute("aria-label", "اسمع الكلمة");
    const lineOf = (filled) => (flavor === "train" ? trainLine(x, lang, filled) : wordLine(x, lang, filled));
    let line = lineOf(flavor === "runaway");
    card.append(pic, line, el("p", "margin:2px 0;font-weight:800;color:#7c3aed;font-size:15px", `${r + 1} من ${items.length} · ${LEVEL_TAG[level]}`));
    area.append(card);
    let fails = 0;
    // 🏃 الحرف الهربان: الكلمة كاملة ثانية، وبعدين الحرف ينط منها ويقف يتنطّط فى ركن الكارت
    let runner = null;
    const slotPos = () => {
      const g = line.querySelector("span:nth-of-type(1)") || line;
      const a = g.getBoundingClientRect(), c = card.getBoundingClientRect();
      return { left: a.left - c.left, top: a.top - c.top };
    };
    if (flavor === "runaway") {
      later(() => {
        const from = slotPos();
        runner = el("span", `left:${from.left}px;top:${from.top}px;font-size:clamp(36px,10vw,54px)`, ar ? x.shape.replace(/ـ/g, "") : x.letter);
        runner.className = "bw-runner";
        card.append(runner);
        const gapLine = lineOf(false);
        line.replaceWith(gapLine); line = gapLine;
        Sfx.pop();
        requestAnimationFrame(() => { runner.style.left = `${card.clientWidth - 60}px`; runner.style.top = "4px"; });
        later(() => runner && runner.classList.add("bob"), 950);
      }, 1200);
    }
    const record = (ok) => {
      if (level !== 3) return;
      const k = reviewKey(lang, x.ch || ch, x.w);
      Store.setWriteReview(k, nextReview(Store.writeReview[k], ok, todayISO()));
    };
    const finish = () => later(() => { r++; if (r < items.length) round(); else onDone(); }, flavor === "write" ? 3000 : 3600);
    const success = () => {
      if (!fails) record(true);   // الغلط اتسجّل أول مرة غلط
      Sfx.correct();
      awardStars(fails ? 1 : 2);
      const full = lineOf(true);
      if (flavor === "runaway" && runner) {
        // الحرف بيرجع مكانه، والصورة بترقص
        runner.classList.remove("bob");
        const to = slotPos();
        runner.style.left = `${to.left}px`; runner.style.top = `${to.top}px`;
        later(() => { if (runner) runner.remove(); runner = null; line.replaceWith(full); line = full; pic.classList.add("bw-dance"); }, 900);
        Speech.ar(fem(BW_SAY.runBack));
        later(() => sayWord(x.w), 2200);
        return finish();
      }
      line.replaceWith(full); line = full;
      if (flavor === "train") {
        // العربيات اتشبكت ⇒ توووت ⇒ القطر بيتحرّك برّه
        Speech.ar(fem(BW_SAY.trainGo));
        later(() => sayWord(x.w), 1500);
        later(() => { const t = line.querySelector(".bw-train"); if (t) t.style.transform = `translateX(${ar ? "-" : ""}130%)`; }, 2000);
        return finish();
      }
      flash(card, "wbk-pop", 600);
      Speech.ar(fem(BW_SAY.done));
      later(() => sayWord(x.w), 1300);
      finish();
    };

    if (ar) {
      const b = maskBoard(x.shape, arShapes(x.letter), level, {
        onOk: success,
        onHint: (t) => hint(t),
        onBad: (why) => {
          if (!fails) record(false);
          fails++;
          hint(why === "shape" ? BW_SAY.wrongShape(x.pos) : why === "more" ? BW_SAY.more : BW_SAY.out);
          if (fails === 2) later(() => { b.reset(); Speech.ar(fem(BW_SAY.peek)); b.peek(2800); }, 2200);
          if (fails >= 3) later(() => { b.easier(); tools.querySelector("[data-submit]").style.display = b.level === 3 ? "" : "none"; }, 2200);
        },
      });
      area.append(b.el);
      const tools = el("div", "display:flex;gap:8px;justify-content:center;margin:6px 0 10px");
      const sub = btn("", "✓ خلصت", () => { Sfx.tap(); b.submit(); });
      sub.className = "candy-btn"; sub.dataset.submit = "1";
      if (level !== 3) sub.style.display = "none";
      const peek = btn("", "👀 فكّرنى بالحرف", () => { Sfx.tap(); fails++; b.peek(2500); });
      peek.className = "candy-btn";
      const again = btn("", "🔁", () => { Sfx.tap(); b.reset(); });
      again.className = "candy-btn";
      tools.append(sub, peek, again);
      area.append(tools);
      boardCleanup = () => b.destroy();
    } else {
      const wrap = el("div");
      wrap.className = "wbk-write";
      const hintEl = el("p", "text-align:center;font-weight:800;color:#be123c;min-height:1.3em;margin:4px");
      area.append(wrap, hintEl);
      let board = null;
      const mount = (lv) => {
        if (board) board.destroy();
        board = mountWriteBoard(wrap, {
          ...penBoardOptions((t) => { hintEl.textContent = t; }),
          strokes: strokesFor(x.letter),
          level: lv,
          ...(lv === 3 ? { free: true, noStart: true, hideModel: true } : {}),
          onHint: (t) => { hintEl.textContent = t; },
          onDone: ({ score }) => {
            if (score != null && score < SCORE_PASS) {
              if (!fails) record(false);
              fails++;
              hint(BW_SAY.out);
              later(() => {
                board.reset();
                if (fails === 2) { Speech.ar(fem(BW_SAY.peek)); board.peek(2800); }
                if (fails >= 3 && lv === 3) mount(2);
              }, 2000);
              return;
            }
            success();
          },
        });
      };
      mount(level);
      const tools = el("div", "display:flex;gap:8px;justify-content:center;margin:6px 0 10px");
      const peek = btn("", "👀 فكّرنى بالحرف", () => { Sfx.tap(); fails++; board && board.peek(2500); });
      peek.className = "candy-btn";
      tools.append(peek);
      area.append(tools);
      boardCleanup = () => board && board.destroy();
    }
  };
  if (items.length) round(); else later(onDone, 0);
  return {
    el: area,
    destroy() { alive = false; timers.forEach(clearTimeout); timers = []; boardCleanup(); area.remove(); },
  };
}

// ===== اللعبة لوحدها (من قلعة الحروف العربى أو الإنجليزى) =====
export function renderBlankWrite({ regionId, regionIndex, lang = "ar", mode = "write" }) {
  // mode: write · runaway (🏃 الحرف الهربان) · train (🚂 قطر الكلمة) · review (🔁 مراجعة اليوم)
  const ar = lang === "ar";
  const screen = el("div");
  screen.className = "region-screen";
  screen.style.background = ar ? "linear-gradient(180deg,#e9e3ff,#b9a6f5)" : "linear-gradient(180deg,#d6ecff,#8fb8f2)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  const TITLE = { write: ar ? BW_SAY.title : BW_SAY.titleEn, runaway: BW_SAY.runTitle, train: BW_SAY.trainTitle, review: RV_SAY.title };
  screen.appendChild(gameTopbar(TITLE[mode] || TITLE.write, back));
  const SAY_CSS = "text-align:center;font-weight:800;color:#3b2a6b;font-size:clamp(17px,4.8vw,24px);margin:10px 12px";
  const askEl = el("p", SAY_CSS);
  const hintEl = el("p", SAY_CSS + ";color:#be123c;min-height:1.4em;font-size:clamp(15px,4.2vw,20px)");
  const stage = el("div");
  screen.append(stage);
  const buddy = mizoBuddy();
  let game = null, hintTimer = 0;
  const ask = (t) => { askEl.textContent = fem(t); Speech.ar(fem(t)); };
  const hint = (t) => { hintEl.textContent = fem(t); Speech.ar(fem(t)); clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintEl.textContent = ""; }, 3600); };
  const done = () => { buddy.win(); finishActivity({ regionId, regionIndex, stars: 5, onDone: back }); };
  const start = (ch) => {
    if (game) game.destroy();
    stage.replaceChildren(askEl, buddy.el, hintEl);
    game = mountBlankWrite(stage, lang, ch, { ask, hint, onDone: done, flavor: mode === "review" ? "write" : mode });
  };
  // 🔁 مراجعة اليوم: الكلمات اللى عليها الدور (من كل الحروف) — كلها فى المربع الفاضى
  function review() {
    const items = dueKeys(Store.writeReview, lang, todayISO()).map(resolveKey).filter(Boolean);
    if (!items.length) {
      stage.replaceChildren(el("p", SAY_CSS, fem(RV_SAY.none)));
      const go = btn("display:block;margin:12px auto", ar ? BW_SAY.title : BW_SAY.titleEn, () => { Sfx.tap(); Router.go("blankWrite", { regionId, regionIndex, lang }); });
      go.className = "candy-btn";
      stage.append(go);
      Speech.ar(fem(RV_SAY.none));
      return;
    }
    stage.replaceChildren(askEl, buddy.el, hintEl);
    Speech.ar(fem(RV_SAY.intro));
    setTimeout(() => {
      if (!screen.isConnected) return;
      game = mountBlankWrite(stage, lang, items[0].ch, { ask, hint, onDone: done, items, level: 3 });
    }, 3200);
  }
  function chooser() {
    stage.replaceChildren(el("p", SAY_CSS, fem(BW_SAY.choose)));
    const letters = ar ? BW_AR_LETTERS : BW_EN_LETTERS;
    const starred = starredLetters(lang, ar ? Store.letterbookDone : Store.englishbookDone);
    const grid = el("div", "display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:min(94vw,620px);margin:0 auto 24px");
    grid.dir = ar ? "rtl" : "ltr";
    for (const ch of [...letters.filter((c) => starred.includes(c)), ...letters.filter((c) => !starred.includes(c))]) {
      const b = btn("min-width:64px;font-size:32px;font-weight:900;position:relative", ar ? ch : `${ch}${ch.toLowerCase()}`, () => {
        Sfx.tap();
        Speech.say(ar ? nameOf(ch) : ch, { lang: ar ? "ar-EG" : "en-US" });
        start(ch);
      });
      b.className = "choice";
      if (starred.includes(ch)) b.append(el("span", "position:absolute;top:-8px;inset-inline-end:-6px;font-size:16px", "⭐"));
      grid.append(b);
    }
    stage.append(grid);
    Speech.ar(fem(BW_SAY.choose));
  }
  setTimeout(mode === "review" ? review : chooser, 0);
  return screen;
}
