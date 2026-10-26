// ===== لوحة «وصّل» (المالك ٢٠٢٦-١٠-٢٦): عمود يمين وعمود شمال، والطفل يسحب خط بينهم =====
// بتستخدمها «وصّل الحرف بالصورة» و«وصّل الرقم بالصورة» (games/letterRecall.js) وخطوة «وصّل»
// جوّه صفحات كراسة الحروف وكتاب الإنجليزى. السحب أو اللمس (الحرف وبعدين الصورة) الاتنين شغّالين.
//
// mountConnect(host, {
//   rtl,                     // العمود الأول (left) يمين فى العربى، شمال فى الإنجليزى
//   left:  [{ key, label }],  // حروف/أرقام
//   right: [{ key, e, w }],   // صور (e ممكن تكون كذا إيموجى — للأرقام)
//   onPickLeft(item), onMatch(item), onWrong(item), onDone()
// }) → { destroy() }
import { Sfx } from "../core/audio.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; };
const CARD = "width:clamp(84px,24vw,112px);min-height:clamp(76px,20vw,96px);border-radius:18px;background:#fff;border:3px solid rgba(0,0,0,.08);box-shadow:0 4px 0 rgba(0,0,0,.12);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;touch-action:none;padding:4px";

export function mountConnect(host, opts) {
  const { rtl = true, left, right } = opts;
  const wrap = el("div", "position:relative;display:flex;justify-content:space-between;gap:24px;max-width:min(94vw,460px);margin:6px auto 24px;padding:4px 6px;touch-action:none;user-select:none");
  wrap.dir = rtl ? "rtl" : "ltr";
  const colL = el("div", "display:flex;flex-direction:column;gap:14px;justify-content:center");
  const colR = el("div", "display:flex;flex-direction:column;gap:14px;justify-content:center");
  const svg = document.createElementNS(NS, "svg");
  svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible";
  wrap.append(colL, colR, svg);
  host.append(wrap);

  const lefts = left.map((it) => {
    const c = el("div", CARD + ";font-size:clamp(38px,11vw,54px);font-weight:900;color:#3a2a6b", it.label);
    c.dataset.left = it.key;
    c._it = it;
    colL.append(c);
    return c;
  });
  right.forEach((it) => {
    const c = el("div", CARD);
    // أكتر من صورة (عدد): بتترصّ فى سطور
    const pics = el("span", `font-size:${it.small ? "clamp(18px,5vw,24px)" : "clamp(40px,11vw,52px)"};line-height:1.1;text-align:center;max-width:100%;word-break:break-all`, it.e);
    c.append(pics);
    if (it.w) c.append(el("small", "font-size:14px;font-weight:800;color:#555", it.w));
    c.dataset.right = it.key;
    c._it = it;
    colR.append(c);
  });

  // نقطة على حافة الكارت اللى ناحية العمود التانى
  const anchor = (card, isLeft) => {
    const w = wrap.getBoundingClientRect(), b = card.getBoundingClientRect();
    const x = isLeft ? (rtl ? b.left : b.right) : (rtl ? b.right : b.left);
    return [x - w.left, b.top + b.height / 2 - w.top];
  };
  const line = (color, width = 7) => {
    const l = document.createElementNS(NS, "line");
    l.setAttribute("stroke", color); l.setAttribute("stroke-width", width); l.setAttribute("stroke-linecap", "round");
    svg.append(l);
    return l;
  };
  const setLine = (l, [x1, y1], [x2, y2]) => { l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2); };
  const doneLines = [];
  const onResize = () => doneLines.forEach(({ l, a, b }) => setLine(l, anchor(a, true), anchor(b, false)));
  window.addEventListener("resize", onResize);

  let sel = null, temp = null, moved = false, matched = 0;
  const pick = (c) => {
    lefts.forEach((x) => { if (!x.dataset.done) x.style.borderColor = "rgba(0,0,0,.08)"; });
    sel = c;
    if (c) { c.style.borderColor = "#8b5cf6"; opts.onPickLeft?.(c._it); }
  };
  const tryRight = (rc) => {
    if (!sel || !rc || rc.dataset.done) return false;
    if (rc.dataset.right === sel.dataset.left) {
      const l = line("#22c55e");
      setLine(l, anchor(sel, true), anchor(rc, false));
      doneLines.push({ l, a: sel, b: rc });
      for (const c of [sel, rc]) { c.dataset.done = "1"; c.style.borderColor = "#22c55e"; c.style.background = "#ecfdf3"; }
      Sfx.correct();
      opts.onMatch?.(rc._it);
      sel = null;
      pick(null);
      if (++matched === lefts.length) opts.onDone?.();
    } else {
      // خط أحمر لحظة وبعدين يختفى
      const l = line("#ef4444");
      setLine(l, anchor(sel, true), anchor(rc, false));
      setTimeout(() => l.remove(), 600);
      Sfx.wrong();
      opts.onWrong?.(rc._it);
      rc.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 350 });
    }
    return true;
  };
  wrap.addEventListener("pointerdown", (e) => {
    const lc = e.target.closest("[data-left]");
    const rc = e.target.closest("[data-right]");
    if (rc && sel) { tryRight(rc); return; }
    if (!lc || lc.dataset.done) return;
    pick(lc);
    moved = false;
    temp = line("#8b5cf6", 6);
    temp.setAttribute("stroke-dasharray", "2 10");
    const w = wrap.getBoundingClientRect();
    setLine(temp, anchor(lc, true), [e.clientX - w.left, e.clientY - w.top]);
    try { wrap.setPointerCapture(e.pointerId); } catch (_) { /* متصفح قديم */ }
  });
  wrap.addEventListener("pointermove", (e) => {
    if (!temp || !sel) return;
    moved = true;
    const w = wrap.getBoundingClientRect();
    setLine(temp, anchor(sel, true), [e.clientX - w.left, e.clientY - w.top]);
  });
  wrap.addEventListener("pointerup", (e) => {
    if (!temp) return;
    temp.remove();
    temp = null;
    if (!moved) return; // لمسة: الاختيار فاضل، والطفل يلمس الصورة بعدها
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const rc = under && under.closest && under.closest("[data-right]");
    if (!tryRight(rc)) pick(null);
  });

  return { el: wrap, destroy() { window.removeEventListener("resize", onResize); wrap.remove(); } };
}
