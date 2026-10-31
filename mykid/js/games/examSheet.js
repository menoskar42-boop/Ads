// ===== «ورقة الامتحان» — الشاشة (الفكرة التانية، المالك ٢٠٢٦-١٠-٣١) =====
// ورقة بيضا مسطّرة زى المدرسة: اسم الطفل، والسؤال («اكتب الحرف الأول للكلمة»)، و٣ كروت (صورة + كلمة ناقصة).
// يلمس الكارت ⇒ لوحة كبيرة تحت يكتب فيها الحرف (اللى كتبه بيبان مكان «؟» فى الكارت). «سلّم الورقة» ⇒ الميس
// بتصحّح كارت كارت بالأحمر: ✓، أو ✗ والحرف الصح جنبه. كله صح ⇒ نجمة الميس. «صحّح» ⇒ الكروت الغلط بس تتفتح تانى.
// الحكم = blankJudge بالشكل (زى المستوى ٣ فى «كمّل الكلمة بإيدك»)، والإنجليزى لو كتب الحرف كابيتال: «اكتب الحرف الصغير».
// «🖨️ اطبع ورقة» ⇒ معاينة للطباعة (نفس ستايل «ورقة كتابة للطباعة») لكل الحروف المختارة.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, finishActivity, mizoBuddy } from "./common.js";
import { femAdapt } from "../data/mizo.js";
import { starredLetters } from "../data/letterRecall.js";
import { joinsNext } from "../data/letterbook.js";
import { arShapes } from "../data/blankWrite.js";
import { maskBoard } from "./blankWrite.js";
import { EX_SAY, sheetItems, sheetLetters, teacherSay, printPages } from "../data/examSheet.js";
import { reviewKey, nextReview, todayISO } from "../data/writeReview.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const el = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; };
const btn = (css, text, fn) => { const b = el("button", css, text); b.type = "button"; b.addEventListener("click", fn); return b; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const RED = "#dc2626";
const PAPER = "background:#fff repeating-linear-gradient(180deg,transparent 0 33px,#dbeafe 33px 34px);border-radius:14px;box-shadow:0 6px 18px rgba(40,30,90,.18);margin:8px auto;max-width:min(94vw,560px);padding:12px 14px 16px;position:relative";

let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = `@keyframes exDraw{to{stroke-dashoffset:0}}@keyframes exPop{0%{transform:scale(0) rotate(-30deg)}70%{transform:scale(1.2) rotate(8deg)}100%{transform:scale(1) rotate(0)}}
.ex-mark path{stroke-dasharray:140;stroke-dashoffset:140;animation:exDraw .55s ease-out forwards}
.ex-star{animation:exPop .6s ease-out both}
@media (prefers-reduced-motion:reduce){.ex-mark path{animation:none;stroke-dashoffset:0}.ex-star{animation:none}}`;
  document.head.appendChild(s);
}

/** الكلمة والحرف الناقص — slot = اللى بيتحط مكان الحرف (؟ أو صورة اللى كتبه أو الحرف الصح). */
function wordRow(x, lang, slot) {
  const ar = lang === "ar";
  const p = el("div", `display:flex;align-items:flex-end;justify-content:center;gap:1px;font-size:clamp(24px,7vw,34px);font-weight:900;color:#1e1b4b;min-height:1.5em;${ar ? "font-family:'Baloo Bhaijaan 2',sans-serif" : ""}`);
  p.dir = ar ? "rtl" : "ltr";
  const l = x.before + (ar && x.before && joinsNext(x.before[x.before.length - 1]) ? "ـ" : "");
  const r = (ar && x.after && joinsNext(x.letter) ? "ـ" : "") + x.after;
  p.append(el("span", "", l), slot, el("span", "", r));
  return p;
}

/**
 * ورقة واحدة (القلعة وصفحة الحرف فى الكراستين): ٣ كروت، لوحة كتابة كبيرة، والميس بتصحّح بالأحمر.
 * onPerfect(tools) = الورقة كلها صح (tools = شريط الأزرار تحت عشان القلعة تحط «ورقة جديدة»).
 * @returns {{ destroy(): void, paper: HTMLElement }}
 */
export function mountExamPaper(host, lang, items, { heading, onPerfect }) {
  ensureStyle();
  const ar = lang === "ar";
  const voice = ar ? "ar-EG" : "en-US";
  const say = (t) => Speech.ar(fem(t));
  const buddy = mizoBuddy();
  const stage = host;
  const boards = [];
  const paper = el("div", PAPER);
  paper.dir = ar ? "rtl" : "ltr";
  // هامش أحمر زى الكشكول
  paper.append(el("div", `position:absolute;top:0;bottom:0;${ar ? "right" : "left"}:34px;width:2px;background:#fca5a5`));
  const head = el("div", `display:flex;justify-content:space-between;gap:8px;font-weight:800;color:#475569;font-size:14px;padding-${ar ? "right" : "left"}:42px`);
  head.append(el("span", "", `${ar ? "الاسم" : "Name"}: ${Store.childName || "................"}`), el("span", "", ar ? "التاريخ: ..../..../...." : "Date: ..../..../...."));
  const q = el("p", `font-weight:900;font-size:clamp(18px,5vw,24px);color:#1e1b4b;margin:10px 0 8px;padding-${ar ? "right" : "left"}:42px`, "⭐ " + heading);
  const row = el("div", "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px");
  paper.append(head, q, row);
  stage.append(paper);

  const area = el("div", "max-width:min(94vw,560px);margin:0 auto");
  const tip = el("p", "text-align:center;font-weight:800;color:#3b2a6b;font-size:clamp(15px,4.4vw,20px);margin:8px 6px;min-height:1.4em", fem(EX_SAY.pickCard));
  const boardHost = el("div");
  const tools = el("div", "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:8px 0");
  area.append(tip, boardHost, buddy.el, tools);
  stage.append(area);

  const cards = items.map((x, i) => {
    const card = el("button", "position:relative;background:#fff;border:3px solid #e0e7ff;border-radius:16px;padding:6px 2px 4px;cursor:pointer;min-width:0");
    card.type = "button";
    const pic = el("div", "font-size:clamp(40px,12vw,58px);line-height:1.1", x.e);
    const slot = el("span", `display:inline-flex;align-items:center;justify-content:center;width:1.25em;height:1.35em;border-bottom:3px dashed #8b5cf6;color:#8b5cf6`, ar ? "؟" : "?");
    card.append(pic, wordRow(x, lang, slot));
    card.addEventListener("click", () => { Sfx.tap(); Speech.say(x.w, { lang: voice }); select(i); });
    row.append(card);
    return { x, card, slot, ok: null, mark: null };
  });

  let active = -1;
  const thumb = (i) => {
    const b = boards[i];
    if (!b || !b.inked) return;
    const img = el("img", "width:100%;height:100%;object-fit:contain");
    img.alt = "";
    img.src = b.snapshot();
    cards[i].slot.replaceChildren(img);
  };
  function select(i) {
    if (cards[i].ok === true) return;
    if (active >= 0) { thumb(active); boards[active].el.style.display = "none"; cards[active].card.style.borderColor = "#e0e7ff"; }
    active = i;
    cards[i].card.style.borderColor = "#8b5cf6";
    if (!boards[i]) {
      const x = cards[i].x;
      const shapes = ar ? arShapes(x.letter) : [x.letter, x.letter.toUpperCase()];
      boards[i] = maskBoard(ar ? x.shape : x.letter, shapes, 3, { onOk: () => {}, onBad: () => {}, onHint: (t) => say(t) }, { latin: !ar, quiet: true });
      boardHost.append(boards[i].el);
    }
    boards[i].el.style.display = "";
    tip.textContent = fem(EX_SAY.writeHere);
  }

  const submit = btn("", "📝 " + EX_SAY.submit, () => {
    Sfx.tap();
    if (active >= 0) thumb(active);
    if (cards.some((c, i) => c.ok !== true && !(boards[i] && boards[i].inked))) { tip.textContent = fem(EX_SAY.notYet); return say(EX_SAY.notYet); }
    check();
  });
  submit.className = "candy-btn";
  const erase = btn("", "🔁", () => { Sfx.tap(); if (active >= 0 && boards[active]) boards[active].reset(); if (active >= 0) cards[active].slot.textContent = ar ? "؟" : "?"; });
  erase.className = "candy-btn";
  tools.append(submit, erase);

  function check() {
    if (active >= 0) { boards[active].el.style.display = "none"; cards[active].card.style.borderColor = "#e0e7ff"; active = -1; }
    tip.textContent = fem(EX_SAY.checking);
    say(EX_SAY.checking);
    let right = 0;
    cards.forEach((c, i) => {
      if (c.ok === true) { right++; return; }
      const r = boards[i].check();
      // أول تصحيح للكارت بس يتسجّل فى «مراجعة اليوم» (الغلط يرجع تانى يوم)
      if (!c.recorded) { c.recorded = true; const k = reviewKey(lang, c.x.ch, c.x.w); Store.setWriteReview(k, nextReview(Store.writeReview[k], r.ok, todayISO())); }
      c.ok = r.ok;
      if (r.ok) right++;
      c.why = r.wrongShape >= 0 ? (ar ? "shape" : "case") : "bad";
    });
    // الميس بتعلّم كارت كارت
    cards.forEach((c, i) => setTimeout(() => {
      if (!paper.isConnected) return;
      if (c.mark) c.mark.remove();
      c.mark = el("div", "position:absolute;inset:0;pointer-events:none");
      c.mark.className = "ex-mark";
      c.mark.innerHTML = c.ok
        ? `<svg viewBox="0 0 100 100" style="position:absolute;top:2px;${ar ? "left" : "right"}:2px;width:42%"><path d="M18 52 L42 76 L84 22" fill="none" stroke="${RED}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : `<svg viewBox="0 0 100 100" style="position:absolute;top:2px;${ar ? "left" : "right"}:2px;width:34%"><path d="M22 22 L78 78 M78 22 L22 78" fill="none" stroke="${RED}" stroke-width="9" stroke-linecap="round"/></svg>`;
      c.mark.dataset.ok = c.ok ? "1" : "0";
      c.card.append(c.mark);
      // الميس بتكتب الحرف الصح بالأحمر مكانه فى الكلمة
      if (!c.ok) { c.slot.replaceChildren(); c.slot.style.color = RED; c.slot.style.borderBottomColor = RED; c.slot.textContent = ar ? c.x.shape : c.x.letter; c.slot.style.width = "auto"; }
      if (c.ok) Sfx.pop(); else Sfx.wrong();
    }, 700 + i * 650));
    setTimeout(() => {
      if (!paper.isConnected) return;
      const total = cards.length;
      const line = teacherSay(right, total);
      tip.textContent = `${right} ${ar ? "من" : "/"} ${total} — ${fem(line)}`;
      say(line);
      tools.replaceChildren();
      if (right === total) {
        const star = el("div", `position:absolute;top:6px;${ar ? "left" : "right"}:10px;font-size:46px`, "🌟");
        star.className = "ex-star";
        paper.append(star);
        buddy.win();
        awardStars(3);
        onPerfect(tools);
      } else {
        const fix = btn("", "✏️ " + EX_SAY.fix, () => {
          Sfx.tap();
          say(EX_SAY.fixSay);
          cards.forEach((c, i) => { if (!c.ok) { boards[i].reset(); c.slot.style.color = ""; c.slot.style.borderBottomColor = ""; c.slot.style.width = "1.25em"; c.slot.textContent = ar ? "؟" : "?"; c.ok = null; } });
          tools.replaceChildren(submit, erase);
          select(cards.findIndex((c) => c.ok !== true));
        });
        fix.className = "candy-btn";
        tools.append(fix);
        if (!ar && cards.some((c) => !c.ok && c.why === "case")) setTimeout(() => say(EX_SAY.smallLetter), 2600);
      }
    }, 900 + cards.length * 650);
  }
  return { paper, destroy() { boards.forEach((b) => b && b.destroy()); } };
}

export function renderExamSheet({ regionId, regionIndex, lang = "ar" }) {
  ensureStyle();
  const ar = lang === "ar";
  const screen = el("div");
  screen.className = "region-screen";
  screen.style.background = ar ? "linear-gradient(180deg,#fde68a,#fbbf24)" : "linear-gradient(180deg,#bfdbfe,#60a5fa)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(ar ? EX_SAY.title : EX_SAY.titleEn, back));
  const say = (t) => Speech.ar(fem(t));
  const stage = el("div", "padding-bottom:24px");
  screen.append(stage);
  let mode = "first";
  let sheet = null;
  let sheetsDone = 0;

  const letters = () => sheetLetters(lang, starredLetters(lang, ar ? Store.letterbookDone : Store.englishbookDone));

  function newSheet() {
    if (sheet) sheet.destroy();
    const items = sheetItems(lang, letters(), ar ? mode : "first");
    stage.replaceChildren();
    sheet = mountExamPaper(stage, lang, items, {
      heading: ar ? EX_SAY.head[mode] : EX_SAY.headEn,
      onPerfect: (tools) => {
        sheetsDone++;
        const next = btn("", "➡️ " + EX_SAY.next, () => { Sfx.tap(); if (sheetsDone >= 3) return finishActivity({ regionId, regionIndex, stars: 5, onDone: back }); newSheet(); });
        next.className = "candy-btn";
        tools.append(next);
      },
    });

    // شريط تحت: نوع الورقة (العربى) + الطباعة
    const bottom = el("div", "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:14px 0 0");
    if (ar) for (const m of ["first", "any"]) {
      const b = btn(`opacity:${m === mode ? 1 : 0.7}`, (m === mode ? "● " : "○ ") + EX_SAY.mode[m], () => { Sfx.tap(); mode = m; newSheet(); });
      b.className = "candy-btn";
      bottom.append(b);
    }
    const pr = btn("", EX_SAY.print, () => { Sfx.tap(); openExamPrint(lang, letters(), ar ? mode : "first"); });
    pr.className = "candy-btn";
    bottom.append(pr);
    stage.append(bottom);
    say(EX_SAY.intro);
  }

  setTimeout(newSheet, 0);
  return screen;
}

/** معاينة للطباعة: سطر لكل حرف (كلماته بصورها والحرف مكانه خط فاضى) — نفس ستايل «ورقة كتابة للطباعة». */
export function openExamPrint(lang, letters, mode) {
  const ar = lang === "ar";
  document.querySelectorAll(".ws-overlay").forEach((e) => e.remove());
  const overlay = el("div");
  overlay.className = "ws-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "ورقة امتحان للطباعة");
  const bar = el("div");
  bar.className = "ws-bar";
  const printBtn = btn("", "🖨️ اطبع", () => { document.body.classList.add("ws-printing"); try { window.print(); } catch (e) { /* التابلت ممكن مايطبعش */ } });
  printBtn.className = "candy-btn";
  const closeBtn = btn("background:linear-gradient(180deg,#9aa7ff,#6b7cff)", "✕ اقفل", () => { overlay.remove(); document.body.classList.remove("ws-printing"); });
  closeBtn.className = "candy-btn";
  bar.append(printBtn, closeBtn);
  overlay.append(bar);
  const blank = `<span style="display:inline-block;width:1.2em;border-bottom:2px solid #27272a;margin:0 2px">&nbsp;</span>`;
  const word = (x) => {
    const l = x.before + (ar && x.before && joinsNext(x.before[x.before.length - 1]) ? "ـ" : "");
    const r = (ar && x.after && joinsNext(x.letter) ? "ـ" : "") + x.after;
    return `<div dir="${ar ? "rtl" : "ltr"}" style="font-size:22px;font-weight:800;font-family:'Baloo Bhaijaan 2',Tahoma,sans-serif">${esc(l)}${blank}${esc(r)}</div>`;
  };
  printPages(lang, letters, mode).forEach((rows) => {
    const page = el("section");
    page.className = "ws-page";
    page.dir = ar ? "rtl" : "ltr";
    let html = `<header class="ws-head"><div class="ws-title">⭐ ${esc(ar ? EX_SAY.head[mode] : EX_SAY.headEn)}</div>` +
      `<div class="ws-meta"><span>${ar ? "الاسم" : "Name"}: ............................</span><span>${ar ? "التاريخ" : "Date"}: ........../........../..........</span></div></header>`;
    for (const r of rows) {
      html += `<div style="display:flex;gap:3mm;justify-content:center;margin-bottom:3mm">` + r.items.map((x) =>
        `<div style="flex:1 1 0;max-width:42mm;border:1.5px solid #d4cdee;border-radius:3mm;padding:2mm;text-align:center"><div style="font-size:34px;line-height:1.2">${x.e}</div>${word(x)}</div>`).join("") + `</div>`;
    }
    page.innerHTML = html;
    overlay.append(page);
  });
  window.addEventListener("afterprint", () => document.body.classList.remove("ws-printing"), { once: true });
  document.body.appendChild(overlay);
  return overlay;
}
