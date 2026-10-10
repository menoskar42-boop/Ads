// ===== لوحة الكتابة: كل خط من نقطته الخضرا وفى اتجاهه =====
//
// المالك ٢٠٢٦-١٠-١٠ (بنته ٤ سنين بتتعلّم تكتب): بدل «غطّى الحرف بأى شكل» —
//   • نقطة خضرا برقم الخط «ابدأ من هنا»، وأسهم بتوضّح الاتجاه.
//   • الخطوط بالترتيب: الخط اللى بعده مايتفتحش غير لما اللى قبله يتكتب صح.
//   • لو بدأ غلط أو مشى بالعكس أو خرج بعيد → ميزو بيقول إيه الغلط والحبر بيتمسح.
//   • غلط مرتين على نفس الخط → اللوحة بتوريه إزاى (صباع ماشى على الخط).
//   • المساعدة بتقلّ بالتدريج: ١ خط عريض كامل · ٢ نقط بس · ٣ مربع فاضى.
//
// الحكم نفسه فى `strokeJudge.js` (دوال صافية متقاسة فى node).
import { StrokeTracker, densify, cumulative, hintForResult } from "./strokeJudge.js";
import { Sfx } from "../core/audio.js";

const RES = 300;
const K = RES / 100; // وحدات المربع (٠–١٠٠) → بكسلات الكانفاس
const INK = "#ff6fb5";
const DONE = "#34d399";
const ROAD = "#ece4ff";
const ROAD_NOW = "#ffd9ec";
const LINE = "#b9a6f5";
const ARROW = "#8b5cf6";

export const LEVEL_LABELS = { 1: "✏️ على الخط", 2: "••• على النقط", 3: "⭐ لوحدك" };

function pathOn(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * K, y * K) : ctx.moveTo(x * K, y * K)));
}

/** أسهم صغيرة على طول الخط (كل `every` وحدة) — بتوضّح الاتجاه من غير كلام. */
function arrowsOn(ctx, pts, every, only1 = false) {
  const d = densify(pts, 1);
  const cum = cumulative(d);
  const len = cum[cum.length - 1];
  if (len < 14) return;
  const marks = only1 ? [Math.min(16, len * 0.4)] : [];
  if (!only1) for (let s = 14; s < len - 6; s += every) marks.push(s);
  ctx.fillStyle = ARROW;
  for (const s of marks) {
    let i = cum.findIndex((c) => c >= s);
    if (i < 1) i = 1;
    const a = d[i - 1], b = d[Math.min(i + 1, d.length - 1)];
    const an = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.save();
    ctx.translate(d[i][0] * K, d[i][1] * K);
    ctx.rotate(an);
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * يركّب لوحة الكتابة جوّه `host`.
 * opts: { strokes, level, from, to, onStroke(ok), onHint(text, result), onDone({fails}) }
 * بيرجّع { el, demo(), reset(), destroy() }.
 */
export function mountWriteBoard(host, opts) {
  const { strokes, level = 1, from, to } = opts;
  let cur = 0;
  let fails = 0;       // غلطات الخط الحالى (مرتين ⇒ نوريه إزاى)
  let totalFails = 0;  // غلطات الحرف كله (لتعديل المستوى)
  let busy = false;    // العرض شغّال ⇒ مفيش إدخال
  let finished = false;
  let tracker = null;
  let drawing = false;
  let pid = null;
  let last = null;
  let alive = true;

  // نموذج صغير فوق المربع فى المستوى ٣ (المربع فاضى — بس الطفل لازم يعرف هيكتب إيه).
  // برّه المربع: جوّاه كان بيغطّى مكان بداية حروف زى ج.
  let mini = null;
  if (level === 3) {
    mini = document.createElement("canvas");
    mini.width = mini.height = 120;
    mini.className = "wb-mini";
    mini.setAttribute("aria-hidden", "true");
    const m = mini.getContext("2d");
    m.lineCap = m.lineJoin = "round";
    m.strokeStyle = m.fillStyle = "#8b5cf6";
    m.lineWidth = 7;
    for (const st of strokes) {
      if (st.length === 1) { m.beginPath(); m.arc(st[0][0] * 1.2, st[0][1] * 1.2, 5, 0, 7); m.fill(); continue; }
      m.beginPath();
      st.forEach(([x, y], i) => (i ? m.lineTo(x * 1.2, y * 1.2) : m.moveTo(x * 1.2, y * 1.2)));
      m.stroke();
    }
    host.appendChild(mini);
  }

  const box = document.createElement("div");
  box.className = "wb-box";
  host.appendChild(box);

  const mk = (cls) => {
    const c = document.createElement("canvas");
    c.width = c.height = RES;
    c.className = cls;
    box.appendChild(c);
    return c;
  };
  const guide = mk("wb-layer");
  const ink = mk("wb-layer wb-ink");
  const gctx = guide.getContext("2d");
  const ictx = ink.getContext("2d");
  ictx.lineCap = ictx.lineJoin = "round";

  // النقطة الخضرا «ابدأ من هنا» — عنصر DOM عشان تنبض بالـCSS
  const start = document.createElement("div");
  start.className = "wb-start";
  start.setAttribute("aria-hidden", "true");
  box.appendChild(start);

  // صور الحكاية (السحابة ← الوردة) لتمارين ما قبل الحروف
  function placeEmoji(char, [x, y], [dx, dy]) {
    const n = Math.hypot(dx, dy) || 1;
    const e = document.createElement("div");
    e.className = "wb-emoji";
    e.textContent = char;
    const px = Math.max(7, Math.min(93, x + (dx / n) * 10));
    const py = Math.max(7, Math.min(93, y + (dy / n) * 10));
    e.style.left = px + "%";
    e.style.top = py + "%";
    box.appendChild(e);
  }
  if (from) {
    const s = strokes[0];
    placeEmoji(from, s[0], [s[0][0] - s[1][0], s[0][1] - s[1][1]]);
  }
  if (to) {
    const s = strokes[strokes.length - 1];
    const a = s[s.length - 2], b = s[s.length - 1];
    placeEmoji(to, b, [b[0] - a[0], b[1] - a[1]]);
  }

  function paint() {
    gctx.clearRect(0, 0, RES, RES);
    gctx.lineCap = gctx.lineJoin = "round";
    strokes.forEach((st, i) => {
      const done = i < cur;
      const now = i === cur && !finished;
      if (st.length === 1) {
        const [x, y] = st[0];
        if (done) { gctx.fillStyle = DONE; gctx.beginPath(); gctx.arc(x * K, y * K, 13, 0, 7); gctx.fill(); }
        else if (level === 1) { gctx.strokeStyle = LINE; gctx.lineWidth = 4; gctx.beginPath(); gctx.arc(x * K, y * K, 14, 0, 7); gctx.stroke(); }
        else if (level === 2) { gctx.fillStyle = LINE; gctx.beginPath(); gctx.arc(x * K, y * K, 5, 0, 7); gctx.fill(); }
        return;
      }
      if (done) {
        gctx.strokeStyle = DONE; gctx.lineWidth = 24; pathOn(gctx, st); gctx.stroke();
        return;
      }
      if (level === 1) {
        gctx.strokeStyle = now ? ROAD_NOW : ROAD; gctx.lineWidth = 38; pathOn(gctx, st); gctx.stroke();
        gctx.strokeStyle = LINE; gctx.lineWidth = 3; gctx.setLineDash([3, 9]); pathOn(gctx, st); gctx.stroke();
        gctx.setLineDash([]);
        if (now) arrowsOn(gctx, st, 24);
      } else if (level === 2) {
        gctx.fillStyle = now ? "#f59ac9" : LINE;
        for (const [x, y] of densify(st, 6)) { gctx.beginPath(); gctx.arc(x * K, y * K, 4.2, 0, 7); gctx.fill(); }
        if (now) arrowsOn(gctx, st, 0, true);
      }
      // المستوى ٣: مفيش خط — النقطة الخضرا بس
    });
    if (finished || cur >= strokes.length) { start.style.display = "none"; return; }
    const [sx, sy] = strokes[cur][0];
    start.style.display = "";
    start.style.left = sx + "%";
    start.style.top = sy + "%";
    start.textContent = strokes.length > 1 ? String(cur + 1) : "";
  }

  function toUnits(e) {
    const r = ink.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
  }
  function inkDot([x, y]) {
    ictx.fillStyle = INK;
    ictx.beginPath();
    ictx.arc(x * K, y * K, 11, 0, 7);
    ictx.fill();
  }
  function inkLine(a, b) {
    ictx.strokeStyle = INK;
    ictx.lineWidth = 22;
    ictx.beginPath();
    ictx.moveTo(a[0] * K, a[1] * K);
    ictx.lineTo(b[0] * K, b[1] * K);
    ictx.stroke();
  }
  function clearInk(fade) {
    if (!fade) { ictx.clearRect(0, 0, RES, RES); return; }
    ink.classList.add("wb-fade");
    setTimeout(() => {
      if (!alive) return;
      ictx.clearRect(0, 0, RES, RES);
      ink.classList.remove("wb-fade");
    }, 380);
  }

  function succeed() {
    drawing = false;
    tracker = null;
    clearInk(false);
    cur++;
    fails = 0;
    Sfx.pop();
    if (opts.onStroke) opts.onStroke(true);
    if (cur >= strokes.length) {
      finished = true;
      paint();
      if (opts.onDone) opts.onDone({ fails: totalFails });
      return;
    }
    paint();
  }

  function fail(result) {
    drawing = false;
    tracker = null;
    fails++;
    totalFails++;
    clearInk(true);
    if (result === "wrong-start") {
      start.classList.remove("wb-call");
      void start.offsetWidth; // يعيد الأنيميشن
      start.classList.add("wb-call");
    }
    if (opts.onStroke) opts.onStroke(false);
    if (opts.onHint) opts.onHint(hintForResult(result, strokes[cur].length === 1), result);
    // غلط مرتين على نفس الخط: بدل ما نكرّر الكلام، نوريه
    if (fails >= 2) {
      fails = 0;
      setTimeout(() => { if (alive && !finished) demo({ only: cur }); }, 900);
    }
  }

  function down(e) {
    if (busy || finished || drawing) return;
    e.preventDefault();
    try { ink.setPointerCapture(e.pointerId); } catch (_) {}
    pid = e.pointerId;
    const p = toUnits(e);
    tracker = new StrokeTracker(strokes[cur], level);
    inkDot(p);
    const r = tracker.begin(p);
    if (r === "ok") return succeed();
    if (r) return fail(r);
    drawing = true;
    last = p;
  }
  function move(e) {
    if (!drawing || e.pointerId !== pid) return;
    e.preventDefault();
    const evs = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) {
      const p = toUnits(ev);
      // الصباع السريع بيقفز — نملا الفراغ بنقط كل وحدتين عشان الحكم يشوف الطريق كله
      const seg = densify([last, p], 2).slice(1);
      for (const q of seg) {
        inkLine(last, q);
        last = q;
        const r = tracker.move(q);
        if (r) return fail(r);
      }
    }
  }
  function up(e) {
    if (!drawing || e.pointerId !== pid) return;
    const r = tracker.end();
    if (r === "ok") succeed();
    else fail(r);
  }
  ink.addEventListener("pointerdown", down);
  ink.addEventListener("pointermove", move);
  ink.addEventListener("pointerup", up);
  ink.addEventListener("pointercancel", up);

  /**
   * «شوف إزاى»: صباع بيمشى على الخطوط بالترتيب وبيسيب أثر. `only` = خط واحد بس.
   */
  function demo({ only } = {}) {
    if (busy || finished) return Promise.resolve();
    busy = true;
    drawing = false;
    clearInk(false);
    const hand = document.createElement("div");
    hand.className = "wb-hand";
    hand.textContent = "👆";
    box.appendChild(hand);
    const list = only != null ? [only] : strokes.map((_, i) => i).filter((i) => i >= cur);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const playOne = (i) => new Promise((res) => {
      const st = strokes[i];
      const pts = st.length === 1 ? st : densify(st, 1);
      const ms = st.length === 1 ? 500 : Math.max(700, pts.length * (reduce ? 10 : 22));
      const t0 = performance.now();
      let k = 0;
      ictx.strokeStyle = "rgba(139,92,246,.55)";
      ictx.fillStyle = "rgba(139,92,246,.55)";
      ictx.lineWidth = 16;
      const step = (now) => {
        if (!alive) return res();
        const want = Math.min(pts.length - 1, Math.floor(((now - t0) / ms) * (pts.length - 1)));
        while (k < want) {
          ictx.beginPath();
          ictx.moveTo(pts[k][0] * K, pts[k][1] * K);
          ictx.lineTo(pts[k + 1][0] * K, pts[k + 1][1] * K);
          ictx.stroke();
          k++;
        }
        hand.style.left = pts[k][0] + "%";
        hand.style.top = pts[k][1] + "%";
        if (st.length === 1 || k >= pts.length - 1) {
          if (st.length === 1) { ictx.beginPath(); ictx.arc(pts[0][0] * K, pts[0][1] * K, 9, 0, 7); ictx.fill(); }
          setTimeout(res, st.length === 1 ? 450 : 250);
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    return list.reduce((p, i) => p.then(() => playOne(i)), Promise.resolve()).then(() => {
      if (!alive) return;
      setTimeout(() => {
        hand.remove();
        clearInk(true);
        busy = false;
      }, 350);
    });
  }

  /** «من الأول»: نفس الحرف من الخط الأول. */
  function reset() {
    if (busy) return;
    cur = 0;
    fails = 0;
    finished = false;
    drawing = false;
    clearInk(false);
    paint();
  }

  paint();
  return {
    el: box,
    demo,
    reset,
    get level() { return level; },
    destroy() { alive = false; box.remove(); if (mini) mini.remove(); },
  };
}
