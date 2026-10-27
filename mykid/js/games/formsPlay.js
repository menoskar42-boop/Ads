// ===== ستّ ألعاب «شكل الحرف فى أول ووسط وآخر الكلمة» (المالك ٢٠٢٦-١٠-٢٧) =====
// نفس الكود بيشتغل لعبة لوحدها (renderFormsPlay — من قلعة الحروف) وخطوة جوّه صفحة الحرف فى
// «كراسة الحروف» (mountFormsGame — games/letterbook.js). البيانات والجمل فى data/letterForms.js.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { femAdapt } from "../data/mizo.js";
import { nameOf, joinsNext } from "../data/letterbook.js";
import { starredLetters } from "../data/letterRecall.js";
import { judge } from "./traceJudge.js";
import { gameTopbar, finishActivity, mizoBuddy } from "./common.js";
import {
  LF_LETTERS, LF_TITLES, LF_SAY, LF_POS, LF_CAR,
  handsRounds, completeRounds, listenRounds, stampBoard, traceItems, nameRound, nameRounds,
} from "../data/letterForms.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const el = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; };
function btn(css, text, onClick) {
  const b = el("button", css, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}
const flash = (node, kf, ms = 420) => node.animate(kf, { duration: ms });
const WIGGLE = [{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(7px)" }, { transform: "translateX(0)" }];
const POP = [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }];

const HL = "#7c3aed";
const CARD = "background:#fff;border-radius:22px;box-shadow:0 6px 0 rgba(0,0,0,.12);padding:12px 16px;margin:8px auto;max-width:min(94vw,560px)";
const WORD = "font-size:clamp(46px,13vw,72px);font-weight:900;line-height:1.5;text-align:center;color:#1f2937";
const CHOICE = "min-width:clamp(78px,22vw,104px);font-size:clamp(40px,11vw,56px);font-weight:900;padding:6px 14px;border-radius:18px;background:#fff;border:3px solid #ddd6fe;box-shadow:0 4px 0 rgba(0,0,0,.12);color:#1f2937";

/** الكلمة والحرف ملوّن (الوصل العربى بيفضل زى ما هو). */
const wordHtml = (x) => `${x.before}<span style="color:${HL}">${x.letter}</span>${x.after}`;
/** الكلمة والحرف مكانه فراغ — بالكشيدة لو الجيران بيمسكوا إيده. */
function gapHtml(x, gapCss = "") {
  const l = x.before ? x.before + (joinsNext(x.before[x.before.length - 1]) ? "ـ" : "") : "";
  const r = x.after ? (joinsNext(x.letter) ? "ـ" : "") + x.after : "";
  return `${l}<span data-gap style="display:inline-block;min-width:1.2em;margin:0 3px;border:3px dashed ${HL};border-radius:10px;color:#a1a1aa;text-align:center;${gapCss}">؟</span>${r}`;
}

/**
 * لعبة واحدة على حرف واحد جوّه `host`.
 * opts: ask(text) تعليمات الجولة (بتتنطق) · hint(text) تلميح الغلط · onDone() لما تخلص ·
 *       skip() (nameHunt بس) لو الحرف مش فى اسم الطفل · rnd
 */
export function mountFormsGame(host, kind, ch, opts) {
  const { ask, hint, onDone, rnd = Math.random } = opts;
  const name = nameOf(ch);
  const area = el("div", "padding-bottom:18px");
  host.append(area);
  let alive = true;
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(() => { if (alive && area.isConnected) fn(); }, ms));
  const win = () => { Sfx.correct(); awardStars(1); };
  const say = (t) => Speech.ar(fem(t));
  const seq = (parts) => Speech.sequence(parts.map((t) => ({ text: fem(t), lang: "ar-EG" })), 120);
  let cleanup = () => {};

  const pic = (x, big = false) => {
    const b = btn(`display:block;margin:4px auto;font-size:${big ? "clamp(96px,28vw,150px)" : "clamp(64px,18vw,96px)"};line-height:1.1;background:none;border:0`, x.e, () => { Sfx.tap(); Speech.ar(x.w); });
    b.setAttribute("aria-label", "اسمع الكلمة");
    b.classList.add("lf-aux");
    return b;
  };

  // 🤝 الحرف بيمسك إيد صاحبه
  function hands() {
    const rounds = handsRounds(ch);
    let r = 0;
    const round = () => {
      const x = rounds[r];
      area.replaceChildren();
      ask(LF_SAY.hands(name));
      const card = el("div", CARD);
      card.append(pic(x));
      const row = el("div", "display:flex;gap:clamp(10px,3vw,18px);justify-content:center;flex-wrap:wrap;margin:6px 0");
      row.dir = "rtl";
      let done = false;
      x.letters.forEach((c, i) => {
        const me = i === x.at;
        const t = btn(`${WORD};min-width:1.2em;padding:0 8px;border-radius:16px;border:3px ${me ? "solid " + HL : "dashed #e5e7eb"};background:${me ? "#f5f3ff" : "#fff"};color:${me ? HL : "#9ca3af"}`, c, () => {
          if (done) return;
          if (!me) { Sfx.wrong(); flash(t, WIGGLE); return hint(LF_SAY.hands(name)); }
          done = true;
          t.dataset.on = "1";
          win();
          const joined = el("div", WORD);
          joined.dir = "rtl";
          joined.innerHTML = wordHtml(x);
          const morph = el("div", "display:flex;align-items:center;justify-content:center;gap:16px;margin-top:4px");
          morph.dir = "rtl";
          const from = el("span", "font-size:clamp(40px,11vw,60px);font-weight:900;color:#9ca3af", x.letter);
          const to = el("span", `font-size:clamp(52px,14vw,76px);font-weight:900;color:${HL}`, x.shape);
          morph.append(from, el("span", "font-size:34px", "🤝"), to);
          row.replaceWith(joined);
          card.append(morph);
          flash(joined, POP, 600);
          seq([x.w, LF_SAY.how[x.how]]);
          r++;
          later(() => (r < rounds.length ? round() : onDone()), 5200);
        });
        t.setAttribute("aria-label", me ? `حرف ${name}` : "حرف تانى");
        if (me) t.dataset.good = "1";
        row.append(t);
      });
      card.append(row);
      area.append(card);
    };
    round();
  }

  // 🧩 كمّل الكلمة بالشكل الصح
  function complete() {
    const rounds = completeRounds(ch, rnd);
    let r = 0;
    const round = () => {
      const x = rounds[r];
      area.replaceChildren();
      ask(LF_SAY.complete(name));
      const card = el("div", CARD);
      const word = el("div", WORD);
      word.dir = "rtl";
      word.innerHTML = gapHtml(x);
      card.append(pic(x), word);
      const opts = el("div", "display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:10px 0");
      opts.dir = "rtl";
      let done = false;
      x.options.forEach((o) => {
        const good = o === x.shape;
        const b = btn(CHOICE, o, () => {
          if (done) return;
          if (!good) { Sfx.wrong(); flash(b, WIGGLE); return hint(LF_SAY.completeWrong); }
          done = true;
          b.dataset.on = "1";
          b.style.borderColor = "#22c55e";
          b.style.background = "#ecfdf3";
          win();
          word.innerHTML = wordHtml(x);
          flash(word, POP, 600);
          seq([x.w, LF_POS[x.pos]]);
          r++;
          later(() => (r < rounds.length ? round() : onDone()), 2600);
        });
        if (good) b.dataset.good = "1";
        opts.append(b);
      });
      area.append(card, opts);
      later(() => Speech.ar(x.w), 2600);
    };
    round();
  }

  // 🚂 اسمع وحط فى العربية
  function listen() {
    const rounds = listenRounds(ch, rnd);
    let r = 0;
    const round = () => {
      const x = rounds[r];
      area.replaceChildren();
      ask(LF_SAY.listen(name));
      const card = el("div", CARD);
      const ear = btn("display:block;margin:0 auto;font-size:22px;padding:6px 16px;border-radius:14px;border:0;background:#ede9fe;font-weight:800", "🔊 اسمع تانى", () => { Sfx.tap(); Speech.ar(x.w); });
      ear.classList.add("lf-aux");
      const word = el("div", WORD + ";min-height:1.5em");
      word.dir = "rtl";
      card.append(pic(x, true), ear, word);
      const train = el("div", "display:flex;gap:8px;justify-content:center;align-items:flex-end;margin:12px 0");
      train.dir = "rtl";
      train.append(el("span", "font-size:clamp(46px,12vw,64px);line-height:1", "🚂"));
      let done = false;
      LF_CAR.forEach((label, p) => {
        const good = p === x.pos;
        const car = btn("display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 10px;border-radius:16px;border:3px solid #fde68a;background:#fff7d6;box-shadow:0 4px 0 rgba(0,0,0,.12);min-width:clamp(78px,22vw,104px)", "", () => {
          if (done) return;
          if (!good) { Sfx.wrong(); flash(car, WIGGLE); hint(LF_SAY.listenWrong); return later(() => Speech.ar(x.w), 2600); }
          done = true;
          car.dataset.on = "1";
          win();
          car.style.borderColor = "#22c55e";
          car.querySelector("[data-load]").textContent = x.letter;
          word.innerHTML = wordHtml(x);
          seq([x.w, LF_POS[x.pos]]);
          r++;
          later(() => (r < rounds.length ? round() : onDone()), 2800);
        });
        car.append(el("span", "font-size:clamp(36px,10vw,50px);line-height:1", "🚃"), el("span", `font-size:28px;font-weight:900;color:${HL};min-height:1.2em`, ""), el("small", "font-weight:800;color:#92400e", label));
        car.children[1].dataset.load = "1";
        car.setAttribute("aria-label", `عربية ${label}`);
        if (good) car.dataset.good = "1";
        train.append(car);
      });
      area.append(card, train);
      later(() => Speech.ar(x.w), 3400);
    };
    round();
  }

  // 📛 دوّر على حروف اسمك — جولة على حرف (فى الكراسة) أو على كل حروف الاسم (لوحدها)
  function nameHunt(rounds) {
    let r = 0;
    const round = () => {
      const x = rounds[r];
      const n = nameOf(x.ch);
      area.replaceChildren();
      ask(LF_SAY.name(n));
      const card = el("div", CARD);
      card.append(el("div", "text-align:center;font-weight:800;color:#6d28d9;font-size:18px", "📛 " + LF_SAY.nameTitle));
      const row = el("div", "display:flex;justify-content:center;flex-wrap:wrap");
      row.dir = "rtl";
      const need = new Set(x.good);
      x.tiles.forEach((t, i) => {
        const good = need.has(i);
        const b = btn(`${WORD};background:none;border:0;padding:0 2px;position:relative`, t, () => {
          if (b.dataset.on) return;
          if (!good) { Sfx.wrong(); flash(b, WIGGLE); return hint(LF_SAY.nameWrong(n)); }
          b.dataset.on = "1";
          b.style.color = "#16a34a";
          b.style.outline = "5px solid #f43f5e";
          b.style.borderRadius = "50%";
          Sfx.pop();
          say(LF_POS[x.positions[x.good.indexOf(i)]]);
          need.delete(i);
          if (!need.size) {
            win();
            r++;
            later(() => (r < rounds.length ? round() : onDone()), 2400);
          }
        });
        if (good) b.dataset.good = "1";
        row.append(b);
      });
      card.append(row);
      area.append(card);
    };
    round();
  }

  // 🔖 ختم الحرف
  function stamp() {
    const { words, stamps } = stampBoard(ch, rnd);
    ask(LF_SAY.stamp(name));
    let picked = null;
    let left = words.length;
    const tray = el("div", "display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:6px 0 10px");
    tray.dir = "rtl";
    const stampBtns = stamps.map((s) => {
      const b = btn(CHOICE + ";background:#fef3c7;border-color:#f59e0b", s, () => {
        Sfx.tap();
        picked = s;
        stampBtns.forEach((x) => { x.style.transform = ""; x.style.borderColor = "#f59e0b"; });
        b.style.transform = "translateY(-6px)";
        b.style.borderColor = HL;
      });
      b.setAttribute("aria-label", "ختم");
      b.className = "lf-aux lf-stamp";
      tray.append(b);
      return b;
    });
    const list = el("div", "");
    words.forEach((x) => {
      const row = el("div", CARD + ";display:flex;align-items:center;gap:12px;justify-content:center;padding:6px 12px");
      row.dir = "rtl";
      const p = btn("font-size:clamp(46px,12vw,64px);background:none;border:0", x.e, () => { Sfx.tap(); Speech.ar(x.w); });
      p.classList.add("lf-aux");
      const word = el("div", WORD + ";font-size:clamp(40px,11vw,58px)");
      word.innerHTML = gapHtml(x);
      word.dir = "rtl";
      let done = false;
      word.addEventListener("click", () => {
        if (done) return;
        if (!picked) return hint(LF_SAY.stampPick);
        if (picked !== x.shape) { Sfx.wrong(); flash(word, WIGGLE); return hint(LF_SAY.stampWrong); }
        done = true;
        Sfx.pop();
        awardStars(1);
        word.innerHTML = wordHtml(x);
        flash(word, [{ transform: "scale(1.25) rotate(-4deg)" }, { transform: "scale(1)" }], 450);
        seq([x.w, LF_POS[x.pos]]);
        if (--left === 0) { Sfx.correct(); later(onDone, 2600); }
      });
      word.style.cursor = "pointer";
      word.dataset.shape = x.shape;
      word.classList.add("lf-stamp-word");
      row.append(p, word);
      list.append(row);
    });
    area.append(tray, list);
  }

  // ✍️ اكتب الحرف وهو ماسك إيد صاحبه
  function trace() {
    const items = traceItems(ch);
    let r = 0;
    const round = () => {
      cleanup();
      const x = items[r];
      area.replaceChildren();
      ask(LF_SAY.trace(name));
      const card = el("div", CARD + ";display:flex;align-items:center;gap:12px;justify-content:center;padding:4px 12px");
      card.dir = "rtl";
      const word = el("div", WORD + ";font-size:clamp(40px,11vw,58px)");
      word.dir = "rtl";
      word.innerHTML = wordHtml(x);
      const p = btn("font-size:clamp(46px,12vw,64px);background:none;border:0", x.e, () => { Sfx.tap(); Speech.ar(x.w); });
      p.classList.add("lf-aux");
      card.append(p, word);
      const board = traceBoard(x.shape, () => {
        win();
        say(LF_SAY.traceDone);
        r++;
        later(() => (r < items.length ? round() : onDone()), 1800);
      }, (t) => hint(t));
      cleanup = board.destroy;
      const again = btn("display:block;margin:8px auto;font-size:20px;padding:8px 18px;border-radius:14px;border:0;background:#ede9fe;font-weight:800", "🔁 امسح", () => { Sfx.tap(); board.reset(); });
      again.classList.add("lf-aux");
      area.append(card, board.el, again);
    };
    round();
  }

  const run = {
    hands, formComplete: complete, formListen: listen, formStamp: stamp, formTrace: trace,
    "nameHunt-all": () => {}, // اللعبة لوحدها — الجولات بتيجى من _nameAll
    nameHunt: () => {
      const one = nameRound(Store.childName, ch);
      if (!one) { alive = false; return opts.skip ? opts.skip() : onDone(); }
      nameHunt([one]);
    },
  };
  (run[kind] || onDone)();
  return {
    el: area,
    destroy() { alive = false; timers.forEach(clearTimeout); timers = []; cleanup(); area.remove(); },
    /** اللعبة لوحدها: «دوّر على حروف اسمك» على كل حروف الاسم */
    _nameAll: (rounds) => nameHunt(rounds),
  };
}

/** لوحة تتبّع شكل الحرف الموصول (ـبـ): الحكم بنفس قواعد «اكتب الحرف» (traceJudge). */
function traceBoard(glyph, onOk, onHint) {
  const W = 480, H = 300;
  const box = el("div", "position:relative;width:min(90vw,440px);aspect-ratio:1.6;background:#fff;border-radius:24px;box-shadow:0 6px 0 rgba(0,0,0,.12);margin:8px auto;touch-action:none");
  const mk = (z) => { const c = el("canvas", `position:absolute;inset:0;width:100%;height:100%;z-index:${z}`); c.width = W; c.height = H; box.append(c); return c; };
  const guide = mk(0), draw = mk(1);
  const g = guide.getContext("2d"), d = draw.getContext("2d");
  const font = (ctx) => {
    let size = H * 0.62;
    ctx.font = `bold ${size}px "Baloo Bhaijaan 2", sans-serif`;
    const w = ctx.measureText(glyph).width;
    if (w > W * 0.86) size *= (W * 0.86) / w;
    ctx.font = `bold ${size}px "Baloo Bhaijaan 2", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = "rtl";
  };
  const paint = (color) => { g.clearRect(0, 0, W, H); g.fillStyle = color; font(g); g.fillText(glyph, W / 2, H / 2 + H * 0.06); };
  paint("#ddd6fe");
  const mask = document.createElement("canvas");
  mask.width = W; mask.height = H;
  const m = mask.getContext("2d");
  m.fillStyle = "#000"; font(m); m.fillText(glyph, W / 2, H / 2 + H * 0.06);
  const maskData = m.getImageData(0, 0, W, H).data;
  let maskTotal = 0;
  for (let p = 3; p < maskData.length; p += 4) if (maskData[p] > 40) maskTotal++;
  d.lineCap = d.lineJoin = "round";
  d.lineWidth = 24;
  d.strokeStyle = d.fillStyle = "#ff6fb5";
  let drawing = false, last = null, done = false;
  const pos = (e) => { const r = draw.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; };
  const measure = () => {
    const dd = d.getImageData(0, 0, W, H).data;
    let covered = 0, drawn = 0;
    for (let p = 3; p < dd.length; p += 4) { if (dd[p] <= 40) continue; drawn++; if (maskData[p] > 40) covered++; }
    return judge(covered, drawn, maskTotal);
  };
  const down = (e) => {
    if (done) return;
    e.preventDefault();
    try { draw.setPointerCapture(e.pointerId); } catch (_) { /* قديم */ }
    drawing = true;
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
    if (done || !maskTotal) return;
    const r = measure();
    if (r.ok) { done = true; paint("#34d399"); flash(box, POP, 500); return onOk(); }
    if (r.coverage >= 0.62 && !r.ok) onHint(LF_SAY.traceOut);
    else if (r.coverage >= 0.31) onHint(LF_SAY.traceMore);
  };
  draw.addEventListener("pointerdown", down);
  draw.addEventListener("pointermove", move);
  draw.addEventListener("pointerup", up);
  draw.addEventListener("pointercancel", up);
  return {
    el: box,
    reset() { if (!done) d.clearRect(0, 0, W, H); },
    destroy() {},
  };
}

// ===== اللعبة لوحدها (من قلعة الحروف) =====
export function renderFormsPlay({ regionId, regionIndex, mode = "hands" }) {
  const screen = el("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#e9e3ff,#b9a6f5)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(LF_TITLES[mode] || LF_TITLES.hands, back));
  const SAY_CSS = "text-align:center;font-weight:800;color:#3b2a6b;font-size:clamp(17px,4.8vw,24px);margin:10px 12px";
  const askEl = el("p", SAY_CSS);
  const hintEl = el("p", SAY_CSS + ";color:#be123c;min-height:1.4em;font-size:clamp(15px,4.2vw,20px)");
  const stage = el("div");
  screen.append(stage);
  const buddy = mizoBuddy();
  let game = null;
  let hintTimer = 0;
  const ask = (t) => { askEl.textContent = fem(t); Speech.ar(fem(t)); };
  const hint = (t) => { hintEl.textContent = fem(t); Speech.ar(fem(t)); clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintEl.textContent = ""; }, 3600); };
  const done = () => { buddy.win(); finishActivity({ regionId, regionIndex, stars: 5, onDone: back }); };
  const start = (ch) => {
    stage.replaceChildren(askEl, buddy.el, hintEl);
    game = mountFormsGame(stage, mode, ch, { ask, hint, onDone: done });
  };

  function chooser() {
    stage.replaceChildren(el("p", SAY_CSS, fem(LF_SAY.choose)));
    const starred = starredLetters("ar", Store.letterbookDone);
    const grid = el("div", "display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:min(94vw,620px);margin:0 auto 24px");
    grid.dir = "rtl";
    for (const ch of [...LF_LETTERS.filter((c) => starred.includes(c)), ...LF_LETTERS.filter((c) => !starred.includes(c))]) {
      const b = btn("min-width:64px;font-size:32px;font-weight:900;position:relative", ch, () => { Sfx.tap(); Speech.ar(nameOf(ch)); start(ch); });
      b.className = "choice";
      if (starred.includes(ch)) b.append(el("span", "position:absolute;top:-8px;inset-inline-end:-6px;font-size:16px", "⭐"));
      grid.append(b);
    }
    stage.append(grid);
    Speech.ar(fem(LF_SAY.choose));
  }

  // 📛 لوحدها: حروف اسم الطفل كلها (ولو مفيش اسم — يكتبه الأول)
  function names() {
    const rounds = nameRounds(Store.childName);
    if (!rounds.length) {
      stage.replaceChildren(el("p", SAY_CSS, fem(LF_SAY.noName)));
      const input = el("input", "display:block;margin:10px auto;font-size:28px;padding:8px 14px;border-radius:14px;border:3px solid #c4b5fd;text-align:center;max-width:80vw");
      input.dir = "rtl";
      input.value = Store.childName || "";
      input.setAttribute("aria-label", LF_SAY.nameTitle);
      const go = btn("display:block;margin:8px auto", "👍 يلا", () => {
        Sfx.tap();
        Store.setChildName(input.value);
        if (nameRounds(Store.childName).length) names();
      });
      go.className = "candy-btn";
      stage.append(input, go);
      Speech.ar(fem(LF_SAY.noName));
      return;
    }
    stage.replaceChildren(askEl, buddy.el, hintEl);
    game = mountFormsGame(stage, "nameHunt-all", rounds[0].ch, { ask, hint, onDone: done });
    game._nameAll(rounds);
  }

  setTimeout(() => (mode === "nameHunt" ? names() : chooser()), 0);
  return screen;
}
