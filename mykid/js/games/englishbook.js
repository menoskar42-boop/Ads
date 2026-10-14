// ===== «كتاب الإنجليزى» (Hello! Little Stars) — الشاشة =====
//
// المالك ٢٠٢٦-١٠-١٤: «كتاب الإنجليزى بتاع بنتى… بطريقة شيقة تجذبها وفى نفس الوقت تخليها
// شاطرة… ومتزهقش الطفل مع كلمات مشجعة ليها». نفس شكل «كراسة الحروف»: خريطة الكتاب (وحدة
// وصفحاتها) ← الصفحة خطوات (✏️ كتابة · 🎲 لعب بالتناوب) ← نجمة على الصفحة.
// ميزو بيشرح بالعربى، وأى كلمة/جملة إنجليزى بتتنطق إنجليزى، والتشجيع بالإنجليزى («Great job!»).
// الأنشطة والبيانات فى data/englishbook.js (صافية ومتقاسة فى node).
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { femAdapt } from "../data/mizo.js";
import { strokesFor } from "../data/strokes.js";
import { EB_UNITS, EB_PAGES, ebSteps, isEbWrite, EB_WORDS, emojiOf, NUM_EN } from "../data/englishbook.js";
import { EB_SAY, SHOW_BELOW, fixMsg } from "../data/writingPhrases.js";
import { gameTopbar, finishActivity } from "./common.js";
import { mountWriteBoard } from "./writeBoard.js";
import { SCORE_PASS } from "./strokeJudge.js";
import { showGripCard, whenGripClosed, penBoardOptions } from "./grip.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const UNIT_COLORS = ["#ec4899", "#f97316", "#8b5cf6", "#3b82f6", "#16a34a", "#eab308"];
const PAGE_COLORS = ["#ec4899", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6"];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function button(cls, text, onClick) {
  const b = el("button", cls, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}
const flash = (node, cls, ms = 450) => { node.classList.add(cls); setTimeout(() => node.classList.remove(cls), ms); };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const en = (t) => Speech.en(t);

/** الكلمة والحرف اللى فيه الصوت ملوّن (أولها — أو آخرها لـ X). */
function hlWord(w, pos = "start") {
  return pos === "end" ? `${w.slice(0, -1)}<span class="ebk-hl">${w.slice(-1)}</span>` : `<span class="ebk-hl">${w[0]}</span>${w.slice(1)}`;
}
/** كارت صورة + كلمة إنجليزى (الحرف اللى فيه الصوت ملوّن لو `ch`). */
function picCard(w, { word = true, ch = null, pos = "start", cls = "lbk-pic" } = {}) {
  const b = el("button", cls + " ebk-pic");
  b.type = "button";
  const at = pos === "end" ? w.slice(-1) : w[0];
  const label = ch && at.toUpperCase() === ch ? hlWord(w, pos) : w;
  b.innerHTML = `<span class="lbk-emoji">${emojiOf(w)}</span>` + (word ? `<span class="ebk-word">${label}</span>` : "");
  b.setAttribute("aria-label", w);
  b.dataset.w = w;
  return b;
}
/** جملة إنجليزى كلمة كلمة (عشان تتلوّن وهى بتتقرا). */
function sentenceEl(text, hl) {
  const p = el("p", "ebk-sent");
  p.setAttribute("dir", "ltr");
  text.split(" ").forEach((t, i) => {
    if (i) p.appendChild(document.createTextNode(" "));
    const bare = t.replace(/[.,?!]/g, "");
    p.appendChild(el("span", "ebk-w" + (hl && bare.toLowerCase() === hl.toLowerCase() ? " ebk-sight" : ""), t));
  });
  return p;
}
/** بيقرا الجملة إنجليزى وبيلوّن كل كلمة وهى بتتقال (تقريباً). */
function readAlong(p, text) {
  en(text);
  const ws = [...p.querySelectorAll(".ebk-w")];
  ws.forEach((w, i) => setTimeout(() => {
    ws.forEach((x) => x.classList.remove("on"));
    w.classList.add("on");
    if (i === ws.length - 1) setTimeout(() => w.classList.remove("on"), 600);
  }, 250 + i * 420));
}

export function renderEnglishbook({ regionId, regionIndex, page: startPage, only = null }) {
  const screen = el("div", "region-screen wbk-screen lbk-screen ebk-screen");
  let cur = null;
  let steps = [];
  let idx = 0;
  let cleanup = () => {};
  const toRegion = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar("📘 My English Book", () => {
    Speech.stop();
    if (cur) showChooser();
    else toRegion();
  }));
  const stage = el("div", "stage wbk-stage");
  screen.appendChild(stage);

  // ===== خريطة الكتاب =====
  function pageCard(pg) {
    if (pg.type === "letter") { const L = pg.label || pg.ch; return { icon: `<b class="ebk-pc-letter">${L}${L.toLowerCase()}</b>`, label: `Letter ${L}` }; }
    if (pg.type === "cvc") return { icon: `<b class="ebk-pc-sight">cat</b>`, label: pg.title };
    if (pg.type === "sight") return { icon: `<b class="ebk-pc-sight">${pg.word}</b>`, label: "Sight word ⭐" };
    if (pg.type === "story") return { icon: pg.icon || "📖", label: pg.title };
    if (pg.type === "review") return { icon: "🏆", label: "Review" };
    return { icon: EB_WORDS[pg.words[0]] || "🗣️", label: pg.title };
  }
  function showChooser() {
    cleanup();
    clearGuide();
    cur = null;
    stage.replaceChildren();
    const map = el("div", "wbk-map");
    const done = Store.englishbookDone;
    const nextId = (EB_PAGES.find((pg) => !done[pg.id]) || EB_PAGES[0]).id;
    const head = el("div", "wbk-maphead");
    head.innerHTML = `<img class="wbk-mizo" src="/assets/mizo/mizo-hi.webp" alt="" width="64" height="64">`;
    head.appendChild(el("p", "wbk-say", fem(EB_SAY.chooser)));
    map.appendChild(head);
    EB_UNITS.forEach((u, ui) => {
      const sec = el("section", "wbk-unit");
      sec.style.setProperty("--unit", UNIT_COLORS[ui % UNIT_COLORS.length]);
      const n = u.pages.filter((pg) => done[pg.id]).length;
      const h = el("h3", "wbk-unit-title");
      h.innerHTML = `<span dir="ltr">${u.title}</span> <small>${u.ar}</small> ${"⭐".repeat(n)}`;
      sec.appendChild(h);
      const grid = el("div", "wbk-unit-grid");
      u.pages.forEach((pg) => {
        const { icon, label } = pageCard(pg);
        const card = button("wbk-pc" + (pg.id === nextId ? " is-next" : "") + (done[pg.id] ? " is-done" : ""), "", () => { Sfx.tap(); openPage(pg); });
        card.dataset.id = pg.id;
        card.innerHTML = `<span class="wbk-pc-icon">${icon}</span><span class="wbk-pc-label" dir="ltr">${label}</span>`
          + (done[pg.id] ? `<span class="wbk-pc-star">⭐</span>` : "")
          + (pg.id === nextId ? `<img class="wbk-pc-mizo" src="/assets/mizo/mizo-point.webp" alt="" width="44" height="44">` : "");
        card.setAttribute("aria-label", label);
        grid.appendChild(card);
      });
      sec.appendChild(grid);
      map.appendChild(sec);
    });
    stage.appendChild(map);
    Speech.ar(fem(EB_SAY.chooser));
    const nextCard = map.querySelector(".is-next");
    if (nextCard) setTimeout(() => nextCard.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
  }

  function openPage(pg) {
    cur = pg;
    steps = ebSteps(pg, Math.random, only);
    idx = 0;
    const i = Math.max(0, EB_PAGES.indexOf(pg));
    screen.style.setProperty("--wbk-c1", PAGE_COLORS[i % PAGE_COLORS.length]);
    screen.style.setProperty("--wbk-c2", PAGE_COLORS[(i + 3) % PAGE_COLORS.length]);
    renderStep();
  }

  function header() {
    const head = el("div", "wbk-head");
    const title = button("wbk-title ebk-title", "", () => {
      Sfx.pop();
      if (cur.type === "letter") en(cur.label || cur.ch);
      else if (cur.type === "sight") en(cur.word);
      else en(cur.title || "Review");
    });
    if (cur.type === "letter") { const L = cur.label || cur.ch; title.innerHTML = `<b dir="ltr">${L}${L.toLowerCase()}</b><span dir="ltr">/${cur.sound}/</span>`; }
    else if (cur.type === "sight") title.innerHTML = `<b dir="ltr">⭐ ${cur.word}</b><span>Sight word</span>`;
    else if (cur.type === "review") title.innerHTML = `<b>🏆</b><span dir="ltr">Review</span>`;
    else title.innerHTML = `<b>${cur.type === "story" ? cur.icon || "📖" : cur.type === "cvc" ? "🔤" : "🗣️"}</b><span dir="ltr">${cur.title}</span>`;
    const track = el("div", "wbk-track");
    steps.forEach((s, i) => track.appendChild(el("span", "wbk-chip" + (i < idx ? " done" : i === idx ? " now" : ""), isEbWrite(s) ? "✏️" : "🎲")));
    track.setAttribute("aria-label", `خطوة ${idx + 1} من ${steps.length}`);
    head.append(title, track);
    return head;
  }

  /** فقاعة ميزو بالعربى — وبعدها (لو فيه) كلمة/جملة إنجليزى بصوت إنجليزى. لمسة على ميزو تعيدها. */
  function prompt(text, enText = null) {
    const row = el("div", "wbk-prompt");
    const sayIt = () => {
      const items = [{ text: fem(text), lang: "ar-EG" }];
      if (enText) items.push({ text: enText, lang: "en-US" });
      Speech.sequence(items, 250);
    };
    const mizo = button("wbk-mizo-btn", "", () => { Sfx.tap(); sayIt(); showGuide(true); });
    mizo.innerHTML = `<img class="wbk-mizo" src="/assets/mizo/mizo-teach.webp" alt="" width="64" height="64">`;
    mizo.setAttribute("aria-label", "ميزو: اسمع تانى");
    const say = el("p", "wbk-say", fem(text));
    if (enText) { say.appendChild(document.createTextNode(" ")); say.appendChild(el("b", "ebk-en-inline", enText)); }
    row.append(mizo, say);
    lastPrompt = text;
    sayIt();
    return row;
  }

  // ===== الصباع اللى بيوجّه لو الطفل ساكت =====
  let lastPrompt = "";
  let guideFn = null;
  let guideTimer = 0;
  let hand = null;
  function clearGuide() {
    clearTimeout(guideTimer);
    if (hand) { hand.remove(); hand = null; }
    guideFn = null;
  }
  function armGuide() {
    clearTimeout(guideTimer);
    if (hand) { hand.remove(); hand = null; }
    if (cur) guideTimer = setTimeout(() => showGuide(false), 8000);
  }
  function autoTarget() {
    const body = stage.querySelector(".wbk-body");
    if (!body) return null;
    return [...body.querySelectorAll("[data-good]")].find((e) => !e.dataset.on && !e.classList.contains("ok") && e.getClientRects().length) || null;
  }
  function showGuide(now) {
    if (!cur || !screen.isConnected) return;
    if (stage.querySelector(".wb-box")) return armGuide();
    const target = (guideFn && guideFn()) || autoTarget();
    if (!now && lastPrompt) Speech.ar(fem(lastPrompt));
    if (target) {
      if (hand) hand.remove();
      hand = el("div", "wbk-guide-hand", "👆");
      hand.setAttribute("aria-hidden", "true");
      const r = target.getBoundingClientRect();
      hand.style.left = r.left + r.width / 2 + "px";
      hand.style.top = r.top + r.height / 2 + "px";
      document.body.appendChild(hand);
      const h = hand;
      setTimeout(() => { if (hand === h) { h.remove(); hand = null; } }, 3200);
    }
    clearTimeout(guideTimer);
    guideTimer = setTimeout(() => showGuide(false), 12000);
  }
  stage.addEventListener("pointerdown", armGuide);

  function hintLine() {
    const h = el("p", "wbk-hint");
    let timer = 0;
    h.show = (text) => {
      const t = fem(text);
      h.textContent = t;
      Speech.ar(t);
      clearTimeout(timer);
      timer = setTimeout(() => { h.textContent = ""; }, 3600);
    };
    return h;
  }

  let cheerN = 0;
  function nextStep() {
    cleanup();
    cleanup = () => {};
    idx++;
    if (idx >= steps.length) return finishPage();
    renderStep();
  }
  function stepDone(delay = 1300) {
    // بعد الكتابة صوت ميزو بس (من غير صوت «نجاح»)
    if (!(steps[idx] && isEbWrite(steps[idx]))) Sfx.correct();
    awardStars(1);
    clearGuide();
    // تشجيع بالإنجليزى بعد كل خطوة («Great job!» …) — بيتبدّل عشان مايتكررش
    setTimeout(() => en(EB_SAY.cheerEn[cheerN++ % EB_SAY.cheerEn.length]), 350);
    const img = stage.querySelector(".wbk-prompt .wbk-mizo");
    if (img) { img.src = "/assets/mizo/mizo-cheer.webp"; img.classList.add("wbk-mizo-cheer"); }
    const body = stage.querySelector(".wbk-body");
    if (body) body.appendChild(el("div", "wbk-step-star", "⭐"));
    setTimeout(() => { if (cur) nextStep(); }, delay + 600);
  }
  function finishPage() {
    Store.markEnglishbookDone(cur.id);
    finishActivity({ regionId, regionIndex, stars: 5, onDone: showChooser });
  }
  function renderStep() {
    cleanup();
    cleanup = () => {};
    clearGuide();
    lastPrompt = "";
    stage.replaceChildren(header());
    const s = steps[idx];
    const body = el("section", "wbk-body lbk-body ebk-body wbk-step-" + s.kind);
    stage.appendChild(body);
    const skip = button("wbk-skip", "⏭", () => { Sfx.tap(); Speech.stop(); nextStep(); });
    skip.setAttribute("aria-label", "الخطوة اللى بعدها");
    stage.appendChild(skip);
    STEP[s.kind](body, s);
    armGuide();
  }

  /** جولات ورا بعض جوّه نفس الخطوة: `round(i, next)` بيرسم الجولة i. */
  function rounds(body, n, round) {
    let i = 0;
    const next = () => { if (++i < n) setTimeout(() => { if (body.isConnected) { body.replaceChildren(); round(i, next); } }, 900); else stepDone(); };
    round(0, next);
  }

  // ===== الأنشطة =====
  const STEP = {
    // Listen, find and repeat: المس كل صورة واسمع اسمها
    meetWords(body, s) {
      body.appendChild(prompt(EB_SAY.meetWords));
      const grid = el("div", "lbk-pics" + (s.words.length > 4 ? " lbk-pics-6" : ""));
      let seen = 0;
      s.words.forEach((w) => {
        const c = picCard(w);
        c.dataset.good = "1";
        c.addEventListener("click", () => {
          Sfx.pop();
          en(w);
          flash(c, "lbk-bounce", 600);
          if (!c.dataset.on) { c.dataset.on = "1"; c.classList.add("ok"); if (++seen === s.words.length) stepDone(1500); }
        });
        grid.appendChild(c);
      });
      body.appendChild(grid);
    },

    // اسمع الكلمة والمس صورتها (من غير الكلمة مكتوبة — عشان يسمع)
    find(body, s) {
      rounds(body, s.rounds.length, (i, next) => {
        const r = s.rounds[i];
        body.appendChild(prompt(EB_SAY.find, r.target));
        const hint = hintLine();
        const again = button("candy-btn ebk-again", "🔊", () => { Sfx.tap(); en(r.target); });
        again.setAttribute("aria-label", "اسمع تانى");
        const grid = el("div", "lbk-pics");
        let done = false;
        r.options.forEach((w) => {
          const c = picCard(w, { word: false });
          const good = w === r.target;
          if (good) c.dataset.good = "1";
          c.addEventListener("click", () => {
            if (done) return;
            if (!good) { Sfx.wrong(); flash(c, "wbk-wiggle"); hint.show(EB_SAY.findWrong); return setTimeout(() => en(r.target), 1800); }
            done = true;
            c.classList.add("ok");
            c.insertAdjacentHTML("beforeend", `<span class="ebk-word">${w}</span>`);
            Sfx.pop();
            en(w);
            next();
          });
          grid.appendChild(c);
        });
        body.append(again, grid, hint);
      });
    },

    // He / She — أو air / land / water: صورة صورة، والطفل يختار
    sort(body, s) {
      rounds(body, s.items.length, (i, next) => {
        const it = s.items[i];
        body.appendChild(prompt(s.say || EB_SAY.find));
        const hint = hintLine();
        const card = picCard(it.w, { cls: "lbk-pic lbk-pic-big" });
        card.addEventListener("click", () => { Sfx.tap(); en(it.w); });
        const opts = el("div", "wbk-opts ebk-bins");
        let done = false;
        s.bins.forEach((b) => {
          const good = b.en === it.bin;
          const btn = button("wbk-opt ebk-bin", "", () => {
            if (done) return;
            if (!good) { Sfx.wrong(); flash(btn, "wbk-wiggle"); return hint.show(EB_SAY.sortWrong); }
            done = true;
            btn.classList.add("correct");
            Sfx.pop();
            en(it.say);
            setTimeout(next, 900);
          });
          btn.innerHTML = `<b dir="ltr">${b.en}</b><small>${b.ar}</small>`;
          if (good) btn.dataset.good = "1";
          opts.appendChild(btn);
        });
        body.append(card, opts, hint);
        setTimeout(() => en(it.w), 1600);
      });
    },

    // I have 1 / I have 2: اعدّ واختار
    count12(body, s) {
      rounds(body, s.items.length, (i, next) => {
        const [w, n] = s.items[i];
        body.appendChild(prompt(EB_SAY.count12));
        const hint = hintLine();
        const show = el("div", "ebk-count", Array(n).fill(emojiOf(w)).join(" "));
        const opts = el("div", "wbk-opts");
        let done = false;
        [1, 2].forEach((k) => {
          const b = button("wbk-opt ebk-num", String(k), () => {
            if (done) return;
            if (k !== n) { Sfx.wrong(); flash(b, "wbk-wiggle"); return hint.show(EB_SAY.count12Wrong); }
            done = true;
            b.classList.add("correct");
            Sfx.pop();
            const line = sentenceEl(`I have ${NUM_EN[n]} ${w}.`);
            body.insertBefore(line, opts);
            readAlong(line, `I have ${NUM_EN[n]} ${w}.`);
            setTimeout(next, 1800);
          });
          if (k === n) b.dataset.good = "1";
          opts.appendChild(b);
        });
        body.append(show, opts, hint);
      });
    },

    // Look, think and pretend to read: المس الجملة واسمعها (الكلمات بتنوّر وهى بتتقرا)
    sentences(body, s) {
      body.appendChild(prompt(EB_SAY.sentences));
      const list = el("div", "ebk-sents");
      let seen = 0;
      s.lines.forEach((l) => {
        const card = el("button", "ebk-sentcard");
        card.type = "button";
        card.dataset.good = "1";
        card.appendChild(el("span", "ebk-sent-pic", l.e));
        const p = sentenceEl(l.text, l.hl);
        card.appendChild(p);
        card.addEventListener("click", () => {
          Sfx.tap();
          readAlong(p, l.text);
          if (!card.dataset.on) { card.dataset.on = "1"; card.classList.add("ok"); if (++seen === s.lines.length) stepDone(2600); }
        });
        list.appendChild(card);
      });
      body.appendChild(list);
    },

    // اسمع الجملة واختار الصورة
    pickSentence(body, s) {
      rounds(body, s.rounds.length, (i, next) => {
        const r = s.rounds[i];
        body.appendChild(prompt(EB_SAY.pickSentence));
        const hint = hintLine();
        const line = sentenceEl(r.text);
        const again = button("ebk-sentcard ebk-sent-play", "", () => { Sfx.tap(); readAlong(line, r.text); });
        again.append(el("span", "ebk-sent-pic", "🔊"), line);
        const grid = el("div", "lbk-pics");
        let done = false;
        r.options.forEach((e) => {
          const c = el("button", "lbk-pic ebk-pic");
          c.type = "button";
          c.innerHTML = `<span class="lbk-emoji">${e}</span>`;
          const good = e === r.answer;
          if (good) c.dataset.good = "1";
          c.addEventListener("click", () => {
            if (done) return;
            if (!good) { Sfx.wrong(); flash(c, "wbk-wiggle"); hint.show(EB_SAY.pickWrong); return setTimeout(() => readAlong(line, r.text), 1800); }
            done = true;
            c.classList.add("ok");
            Sfx.pop();
            next();
          });
          grid.appendChild(c);
        });
        body.append(again, grid, hint);
        setTimeout(() => readAlong(line, r.text), 1700);
      });
    },

    // old / young — girl / boy: كلمتين عكس بعض
    opposites(body, s) {
      body.appendChild(prompt(EB_SAY.opposites));
      const grid = el("div", "lbk-pics ebk-opp");
      let seen = 0;
      s.pair.forEach(([w, e]) => {
        const c = el("button", "lbk-pic lbk-pic-big ebk-pic");
        c.type = "button";
        c.dataset.good = "1";
        c.innerHTML = `<span class="lbk-emoji">${e}</span><span class="ebk-word">${w}</span>`;
        c.addEventListener("click", () => {
          Sfx.pop();
          en(w);
          if (!c.dataset.on) { c.dataset.on = "1"; c.classList.add("ok"); if (++seen === s.pair.length) stepDone(1400); }
        });
        grid.appendChild(c);
      });
      body.appendChild(grid);
    },

    // الحرف وكلماته الـ٣ (زى الكتاب: Mm /m/ man, mom, mud)
    letterMeet(body, s) {
      const L = s.label || s.ch;
      body.appendChild(prompt(EB_SAY.letterMeet(L)));
      const big = button("ebk-bigletter", "", () => { Sfx.pop(); en(L); big.dataset.on = "1"; check(); });
      big.innerHTML = `<b dir="ltr">${L}${L.toLowerCase()}</b><small dir="ltr">/${s.sound}/</small>`;
      big.dataset.good = "1";
      const grid = el("div", "lbk-pics");
      const heard = new Set();
      s.words.forEach((w) => {
        const c = picCard(w, { ch: s.ch, pos: s.pos });
        c.dataset.good = "1";
        c.addEventListener("click", () => {
          Sfx.pop();
          en(w);
          flash(c, "lbk-bounce", 600);
          c.dataset.on = "1";
          c.classList.add("ok");
          heard.add(w);
          check();
        });
        grid.appendChild(c);
      });
      let fin = false;
      function check() { if (!fin && big.dataset.on && heard.size === s.words.length) { fin = true; stepDone(1500); } }
      body.append(big, grid);
    },

    // Look at the letter. Circle the first-sound picture
    firstSound(body, s) {
      const end = s.pos === "end";
      body.appendChild(prompt(end ? EB_SAY.endSound(s.label || s.ch) : EB_SAY.firstSound(s.label || s.ch)));
      const hint = hintLine();
      const grid = el("div", "lbk-pics lbk-pics-6");
      const need = s.items.filter((x) => x.good).length;
      let got = 0;
      s.items.forEach((x) => {
        const c = picCard(x.w, { word: false });
        if (x.good) c.dataset.good = "1";
        c.addEventListener("click", () => {
          if (c.dataset.on) return;
          en(x.w);
          if (!x.good) { Sfx.wrong(); flash(c, "wbk-wiggle"); return setTimeout(() => hint.show(end ? EB_SAY.endWrong : EB_SAY.firstWrong), 900); }
          c.dataset.on = "1";
          c.classList.add("ok", "lbk-ringed-card");
          c.insertAdjacentHTML("beforeend", `<span class="ebk-word">${hlWord(x.w, s.pos)}</span>`);
          Sfx.pop();
          if (++got === need) stepDone(1500);
          else hint.show(EB_SAY.firstMore);
        });
        grid.appendChild(c);
      });
      body.append(grid, hint);
    },

    // فرقع البلالين اللى فيها الحرف (الكبير والصغير)
    popLetter(body, s) {
      body.appendChild(prompt(EB_SAY.popLetter(s.ch)));
      const hint = hintLine();
      const grid = el("div", "lbk-pop");
      const isIt = (c) => c.toUpperCase() === s.ch;
      const need = s.cells.filter(isIt).length;
      let got = 0;
      s.cells.forEach((c) => {
        const b = button("lbk-balloon ebk-balloon", c, () => {
          if (b.dataset.on) return;
          if (!isIt(c)) { Sfx.wrong(); flash(b, "wbk-wiggle"); return hint.show(EB_SAY.popWrong(s.ch)); }
          b.dataset.on = "1";
          Sfx.pop();
          en(c === s.ch ? `big ${s.ch}` : `small ${c}`);
          if (++got === need) stepDone(1300);
        });
        if (isIt(c)) b.dataset.good = "1";
        grid.appendChild(b);
      });
      body.append(grid, hint);
    },

    // ✏️ الكتابة: الخط العريض ← النقط ← لوحده (لوحده = الحرف كله والحكم بنسبة)
    write(body, s) {
      const cap = s.glyph === s.glyph.toUpperCase();
      const intro = cap ? EB_SAY.writeCap(s.glyph) : EB_SAY.writeSmall(s.glyph);
      writeBoard(body, s.glyph, s.level, intro, () => stepDone(900));
    },

    // كلمة النجمة (Sight word)
    sightMeet(body, s) {
      body.appendChild(prompt(EB_SAY.sightMeet(s.word)));
      const star = button("ebk-star", "", () => {
        Sfx.pop();
        en(s.word);
        flash(star, "lbk-bounce", 600);
        if (!star.dataset.on) { star.dataset.on = "1"; setTimeout(() => stepDone(1200), 900); }
      });
      star.innerHTML = `<b dir="ltr">${s.word}</b>`;
      star.dataset.good = "1";
      body.append(star, el("div", "ebk-sight-pic", s.e));
    },

    // Practice writing: الكلمة حرف حرف على النقط
    spell(body, s) {
      const letters = [...s.word];
      let i = 0;
      const one = () => {
        body.replaceChildren();
        cleanup();
        const ch = letters[i];
        const show = el("p", "ebk-spell", "");
        show.setAttribute("dir", "ltr");
        letters.forEach((c, k) => show.appendChild(el("span", k < i ? "done" : k === i ? "now" : "", c)));
        body.appendChild(show);
        writeBoard(body, ch, 2, i === 0 ? EB_SAY.spell(s.word) : null, () => {
          if (++i < letters.length) setTimeout(() => { if (body.isConnected) one(); }, 700);
          else { en(s.word); stepDone(1000); }
        }, show);
      };
      one();
    },

    // Find "the" — Color it!
    findColor(body, s) {
      body.appendChild(prompt(EB_SAY.findColor(s.word)));
      const hint = hintLine();
      const grid = el("div", "ebk-stars");
      const need = s.cells.filter((w) => w === s.word).length;
      let got = 0;
      s.cells.forEach((w) => {
        const b = button("ebk-starcell", "", () => {
          if (b.dataset.on) return;
          en(w);
          if (w !== s.word) { Sfx.wrong(); flash(b, "wbk-wiggle"); return setTimeout(() => hint.show(EB_SAY.findColorWrong(s.word)), 700); }
          b.dataset.on = "1";
          Sfx.pop();
          if (++got === need) stepDone(1300);
        });
        b.innerHTML = `<span dir="ltr">${w}</span>`;
        if (w === s.word) b.dataset.good = "1";
        grid.appendChild(b);
      });
      body.append(grid, hint);
    },

    // Match, think and speak: الحرف ← الصورة اللى بتبدأ بيه
    matchLetter(body, s) {
      body.appendChild(prompt(EB_SAY.matchLetter));
      const hint = hintLine();
      const wrap = el("div", "lbk-pair");
      const colA = el("div", "lbk-col"), colB = el("div", "lbk-col");
      let sel = null, done = 0;
      const lefts = s.pairs.map((p) => {
        const b = button("lbk-balloon lbk-letter ebk-balloon", p.ch, () => {
          if (b.classList.contains("ok")) return;
          Sfx.tap();
          en(p.ch);
          lefts.forEach((x) => x.el.classList.remove("sel"));
          b.classList.add("sel");
          sel = p;
        });
        b.dataset.good = "1";
        b.dataset.key = p.w;
        colA.appendChild(b);
        return { p, el: b };
      });
      shuffle(s.pairs).forEach((p) => {
        const c = picCard(p.w, { word: false });
        c.dataset.key = p.w;
        c.addEventListener("click", () => {
          if (c.classList.contains("ok")) return;
          if (!sel) { Sfx.tap(); en(p.w); return flash(colA, "wbk-wiggle"); }
          if (sel !== p) { Sfx.wrong(); flash(c, "wbk-wiggle"); en(p.w); return setTimeout(() => hint.show(EB_SAY.matchWrong), 800); }
          const L = lefts.find((x) => x.p === p);
          L.el.classList.remove("sel");
          L.el.classList.add("ok");
          c.classList.add("ok");
          const at = p.w.indexOf(p.ch);
          const word = at < 0 ? p.w : `${p.w.slice(0, at)}<span class="ebk-hl">${p.ch}</span>${p.w.slice(at + p.ch.length)}`;
          c.insertAdjacentHTML("beforeend", `<span class="ebk-word">${word}</span>`);
          Sfx.pop();
          en(p.w);
          sel = null;
          if (++done === s.pairs.length) stepDone(1300);
        });
        colB.appendChild(c);
      });
      guideFn = () => {
        if (sel) return [...colB.children].find((c) => !c.classList.contains("ok") && c.dataset.w === sel.w) || null;
        return lefts.find((x) => !x.el.classList.contains("ok"))?.el || null;
      };
      wrap.append(colA, colB);
      body.append(wrap, hint);
    },

    // Count: اعدّ الحاجات واختار الرقم
    count(body, s) {
      rounds(body, s.rounds.length, (i, next) => {
        const [w, n] = s.rounds[i];
        body.appendChild(prompt(EB_SAY.count));
        const hint = hintLine();
        const show = el("div", "ebk-count", Array(n).fill(emojiOf(w)).join(" "));
        const opts = el("div", "wbk-opts");
        let done = false;
        [1, 2, 3, 4].forEach((k) => {
          const b = button("wbk-opt ebk-num", String(k), () => {
            if (done) return;
            if (k !== n) { Sfx.wrong(); flash(b, "wbk-wiggle"); return hint.show(EB_SAY.countWrong); }
            done = true;
            b.classList.add("correct");
            Sfx.pop();
            en(`${NUM_EN[n]} ${n > 1 ? w + "s" : w}`);
            setTimeout(next, 900);
          });
          if (k === n) b.dataset.good = "1";
          opts.appendChild(b);
        });
        body.append(show, opts, hint);
      });
    },

    // Do you like yogurt? / What do you want to be? — سؤال رأى: أى اختيار صح، وميزو يقول الجملة
    choose(body, s) {
      rounds(body, s.rounds.length, (i, next) => {
        const r = s.rounds[i];
        body.appendChild(prompt(EB_SAY.choose, r.q));
        const q = sentenceEl(r.q);
        const qcard = button("ebk-sentcard ebk-sent-play", "", () => { Sfx.tap(); readAlong(q, r.q); });
        qcard.append(el("span", "ebk-sent-pic", r.e), q);
        const opts = el("div", "ebk-choose" + (r.options.length > 2 ? " ebk-choose-many" : ""));
        let done = false;
        r.options.forEach((o) => {
          const b = button("ebk-choice", "", () => {
            if (done) return;
            done = true;
            b.classList.add("ok");
            Sfx.pop();
            const line = sentenceEl(o.say);
            body.insertBefore(line, opts);
            readAlong(line, o.say);
            setTimeout(next, 2200);
          });
          b.dataset.good = "1";
          b.innerHTML = `<span class="lbk-emoji">${o.e}</span><span class="ebk-word" dir="ltr">${o.label}</span>`;
          opts.appendChild(b);
        });
        body.append(qcard, opts);
      });
    },

    // Match the rhyming words: cat ↔ hat
    rhyme(body, s) {
      body.appendChild(prompt(EB_SAY.rhyme));
      const hint = hintLine();
      const wrap = el("div", "lbk-pair");
      const colA = el("div", "lbk-col"), colB = el("div", "lbk-col");
      let sel = null, done = 0;
      const lefts = s.pairs.map(([a, b]) => {
        const c = picCard(a);
        c.addEventListener("click", () => {
          if (c.classList.contains("ok")) return;
          Sfx.tap();
          en(a);
          lefts.forEach((x) => x.el.classList.remove("sel"));
          c.classList.add("sel");
          sel = b;
        });
        c.dataset.good = "1";
        c.dataset.key = b;
        colA.appendChild(c);
        return { a, b, el: c };
      });
      const rights = shuffle(s.pairs.map(([, b]) => b)).map((b) => {
        const c = picCard(b);
        c.dataset.key = b;
        c.addEventListener("click", () => {
          if (c.classList.contains("ok")) return;
          if (!sel) { Sfx.tap(); en(b); return flash(colA, "wbk-wiggle"); }
          const L = lefts.find((x) => x.b === sel);
          if (sel !== b) { Sfx.wrong(); flash(c, "wbk-wiggle"); Speech.sequence([{ text: L.a, lang: "en-US" }, { text: b, lang: "en-US" }], 300); return setTimeout(() => hint.show(EB_SAY.rhymeWrong), 1400); }
          L.el.classList.remove("sel");
          L.el.classList.add("ok");
          c.classList.add("ok");
          Sfx.pop();
          Speech.sequence([{ text: L.a, lang: "en-US" }, { text: b, lang: "en-US" }], 300);
          sel = null;
          if (++done === s.pairs.length) stepDone(1600);
        });
        colB.appendChild(c);
        return c;
      });
      guideFn = () => {
        if (sel) return rights.find((c) => !c.classList.contains("ok") && c.dataset.w === sel) || null;
        return lefts.find((x) => !x.el.classList.contains("ok"))?.el || null;
      };
      wrap.append(colA, colB);
      body.append(wrap, hint);
    },

    // Unscramble: ركّب الكلمة — المس الحروف بالترتيب (p-i-n)
    build(body, s) {
      rounds(body, s.rounds.length, (i, next) => {
        const r = s.rounds[i];
        body.appendChild(prompt(EB_SAY.build, r.w));
        const hint = hintLine();
        const card = picCard(r.w, { word: false, cls: "lbk-pic lbk-pic-big" });
        card.addEventListener("click", () => { Sfx.tap(); en(r.w); });
        const slots = el("p", "ebk-slots");
        slots.setAttribute("dir", "ltr");
        const cells = [...r.w].map(() => slots.appendChild(el("span", "ebk-slot", "")));
        const tiles = el("div", "ebk-tiles");
        tiles.setAttribute("dir", "ltr");
        let k = 0;
        r.tiles.forEach((ch) => {
          const t = button("ebk-tile", ch, () => {
            if (t.dataset.on) return;
            if (ch !== r.w[k]) { Sfx.wrong(); flash(t, "wbk-wiggle"); en(r.w[k]); return hint.show(EB_SAY.buildWrong); }
            t.dataset.on = "1";
            t.classList.add("used");
            cells[k].textContent = ch;
            cells[k].classList.add("on");
            Sfx.pop();
            en(ch);
            if (++k === r.w.length) {
              card.insertAdjacentHTML("beforeend", `<span class="ebk-word">${r.w}</span>`);
              card.classList.add("ok");
              setTimeout(() => en(r.w), 500);
              setTimeout(next, 700);
            }
          });
          tiles.appendChild(t);
        });
        guideFn = () => [...tiles.children].find((t) => !t.dataset.on && t.textContent === r.w[k]) || null;
        body.append(card, slots, tiles, hint);
        setTimeout(() => en(r.w), 1700);
      });
    },

    // Choose the correct letter: na_ ← p
    missing(body, s) {
      rounds(body, s.rounds.length, (i, next) => {
        const r = s.rounds[i];
        body.appendChild(prompt(EB_SAY.missing, r.w));
        const hint = hintLine();
        const card = picCard(r.w, { word: false, cls: "lbk-pic lbk-pic-big" });
        card.addEventListener("click", () => { Sfx.tap(); en(r.w); });
        const word = el("p", "ebk-slots");
        word.setAttribute("dir", "ltr");
        const gap = r.pattern.indexOf("_");
        [...r.pattern].forEach((c, k) => word.appendChild(el("span", k === gap ? "ebk-slot" : "ebk-slot on", k === gap ? "" : c)));
        const opts = el("div", "ebk-tiles");
        opts.setAttribute("dir", "ltr");
        let done = false;
        r.options.forEach((ch) => {
          const good = ch === r.answer;
          const t = button("ebk-tile", ch, () => {
            if (done) return;
            if (!good) { Sfx.wrong(); flash(t, "wbk-wiggle"); return hint.show(EB_SAY.missingWrong); }
            done = true;
            t.classList.add("used");
            const slot = word.children[gap];
            slot.textContent = ch;
            slot.classList.add("on", "ebk-slot-new");
            Sfx.pop();
            en(r.w);
            setTimeout(next, 900);
          });
          if (good) t.dataset.good = "1";
          opts.appendChild(t);
        });
        body.append(card, word, opts, hint);
        setTimeout(() => en(r.w), 1700);
      });
    },
  };

  /** لوحة الكتابة للحرف بمستوى المساعدة ده (٣ = لوحده: الحرف كله والحكم بنسبة). */
  function writeBoard(host, v, level, intro, done, before = null) {
    const strokes = strokesFor(v);
    const hint = hintLine();
    const wrap = el("div", "wbk-write");
    wrap.dataset.glyph = v;
    host.appendChild(wrap);
    if (intro) host.insertBefore(prompt(intro), before || wrap);
    const board = mountWriteBoard(wrap, {
      ...penBoardOptions((text) => hint.show(text)),
      strokes,
      level,
      free: level === 3,
      // من غير صوت «غلط» ولا «نجاح» على اللوحة (المالك ٢٠٢٦-١٠-١٤): صوت ميزو وكلامه بس
      onHint: (text) => hint.show(text),
      onDone: ({ fails, score, result }) => {
        const pct = () => { if (score != null) hint.textContent = `${score}٪ · ${hint.textContent}`; };
        if (score != null && score < SCORE_PASS) {
          hint.show(fixMsg(result && result.issue));
          pct();
          setTimeout(() => { board.reset(); if (score < SHOW_BELOW) board.demo(); }, 2600);
          return;
        }
        if (score != null) hint.textContent = `${score}٪ ✓`;
        board.el.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 450 });
        en(v);
        if (level === 3) Store.recordWrite("g:" + v, fails, level);
        done(fails);
      },
    });
    const tools = el("div", "wbk-tools");
    tools.append(
      button("candy-btn", fem("👀 شوف إزاى"), () => { Sfx.tap(); board.demo(); }),
      button("candy-btn", "🔁", () => { Sfx.tap(); board.reset(); }),
    );
    host.append(hint, tools);
    cleanup = () => board.destroy();
    showGripCard();
    whenGripClosed(() => setTimeout(() => board.demo(), 1400));
  }

  setTimeout(() => {
    const pg = startPage && EB_PAGES.find((x) => x.id === startPage);
    if (pg) openPage(pg);
    else showChooser();
  }, 0);
  return screen;
}
