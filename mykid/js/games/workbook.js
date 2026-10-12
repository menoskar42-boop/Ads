// ===== «كراسة الأرقام»: صفحة الرقم زى الكتاب — يكتب شوية ويلعب شوية =====
//
// المالك ٢٠٢٦-١٠-١٢ (كتاب «Little Mathematics – Level One»): نفس تمارين الكتاب جوّه mykid،
// والطفل «مش بيتعلم الكتابه انما يكتب شويه و يلعب شويه كل فى نفس التاب».
// الخطوات والإجابات من `data/workbook.js` (صافى ومتقاس)؛ هنا العرض واللمس بس.
// الكتابة بنفس لوحة «ارسم الرقم» (writeBoard): نقطة البداية والأسهم والصباع اللى بيوريه.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { femAdapt } from "../data/mizo.js";
import { NUMBERS } from "../data/numbers.js";
import { strokesFor, PREWRITING } from "../data/strokes.js";
import {
  WB_COLORS, WB_AR, WB_PAGES, WB_UNITS, WB_COLOR_PAIRS, WB_SHAPES, WB_SHAPE_PAIRS, WB_HOUR_AR,
  pageSteps, colorPairOf, isWriteStep,
} from "../data/workbook.js";
import { WB_SAY, writeIntro } from "../data/writingPhrases.js";
import { gameTopbar, finishActivity } from "./common.js";
import { mountWriteBoard } from "./writeBoard.js";
import { showGripCard, whenGripClosed, penBoardOptions } from "./grip.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const enName = (n) => (n === 0 ? "zero" : (NUMBERS.find((x) => x.value === n) || {}).enName || String(n));
const preLine = (id) => PREWRITING.find((p) => p.id === id);
const col = (key) => WB_COLORS[key];

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

/** نقط العدد زى الزهر/الدومينو (لحد ٦)، وبعد كده صفّين. */
function dotsFor(v) {
  const box = el("span", "wbk-dots" + (v > 6 ? " wbk-dots-rows" : ""));
  const DICE = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  if (v <= 6) {
    for (let i = 0; i < 9; i++) box.appendChild(el("i", DICE[v].includes(i) ? "on" : ""));
  } else {
    for (let i = 0; i < v; i++) box.appendChild(el("i", "on"));
  }
  box.setAttribute("aria-label", `${v} نقط`);
  return box;
}
/** إيد بعدد صوابع مرفوعة (٠–٥): السبابة ← الوسطى ← البنصر ← الخنصر ← الإبهام — زى صور الكتاب. */
function handSvg(k) {
  // [x, ارتفاع المرفوع] للسبابة والوسطى والبنصر والخنصر (من الشمال لليمين: إيد يمين من ضهرها)
  const F = [[22, 40], [36, 44], [50, 40], [63, 32]];
  const up = (i) => i < k;
  const fingers = F.map(([x, h], i) => {
    const hh = up(i) ? h : 12;
    return `<rect x="${x - 6}" y="${52 - hh}" width="12" height="${hh + 10}" rx="6"/>`;
  }).join("");
  const thumb = k >= 5
    ? `<rect x="-4" y="54" width="34" height="14" rx="7" transform="rotate(-38 26 61)"/>`
    : `<rect x="8" y="58" width="22" height="11" rx="5.5" transform="rotate(-10 18 62)"/>`;
  return `<svg class="wbk-hand" viewBox="-6 0 82 100" aria-hidden="true"><g>${fingers}${k < 5 ? thumb : ""}<rect x="12" y="50" width="58" height="44" rx="16"/>${k >= 5 ? thumb : ""}</g></svg>`;
}
/** صوابع العدد: إيد واحدة لحد ٥، وإيدين بعد كده (٥ + الباقى). */
function fingersOf(count, cls = "wbk-fingers") {
  const g = el("span", cls);
  g.innerHTML = count > 5 ? handSvg(5) + handSvg(count - 5) : handSvg(count);
  g.setAttribute("aria-label", `${count} صوابع`);
  return g;
}
/** مجموعة حاجات متعدّة (🦆🦆🦆). */
function groupOf(thing, count, cls = "wbk-group") {
  const g = el("span", cls);
  for (let i = 0; i < count; i++) g.appendChild(el("span", "wbk-thing", thing));
  g.setAttribute("aria-label", `${count} ${thing}`);
  return g;
}

export function renderWorkbook({ regionId, regionIndex, n: startN, only = null }) {
  const screen = el("div", "region-screen wbk-screen");
  let cur = null; // الصفحة المفتوحة من WB_PAGES (null = اختيار الصفحة)
  let steps = [];
  let idx = 0;
  let cleanup = () => {};
  const toRegion = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar("📒 كراسة الأرقام", () => {
    Speech.stop();
    if (cur) showChooser();
    else toRegion();
  }));
  const stage = el("div", "stage wbk-stage");
  screen.appendChild(stage);

  // ===== خريطة الكراسة: وحدات الكتاب (Unit 1 … 6) وكارت لكل صفحة — ونجمة على اللى خلص =====
  const PAGE_META = {
    lines: { icon: "〰️", ar: "الخطوط", en: "lines" },
    seq: { icon: "<b dir=ltr>1 2 _</b>", ar: "قبل وبعد", en: "next" },
    general: { icon: "🧩", ar: "تمارين", en: "practice" },
    clock: { icon: "🕐", ar: "الساعة", en: "o'clock" },
    add: { icon: "➕", ar: "الجمع", en: "addition" },
    review: { icon: "🏆", ar: "مراجعة", en: "review" },
  };
  function pageCard(pg) {
    let icon, label;
    if (pg.type === "number" || pg.type === "zero") { icon = `<b class="wbk-pc-digit" dir="ltr">${pg.n}</b>`; label = enName(pg.n); }
    else if (pg.type === "colors") { icon = WB_COLOR_PAIRS[pg.pair].map((k) => `<i class="wbk-pc-sw" style="background:${col(k).hex}"></i>`).join(""); label = "ألوان"; }
    else if (pg.type === "shapes") { icon = WB_SHAPE_PAIRS[pg.pair].map((k) => shapeSvg(k, "wbk-shape-mini")).join(""); label = "أشكال"; }
    else { icon = PAGE_META[pg.type].icon; label = PAGE_META[pg.type].ar; }
    return { icon, label };
  }
  const map = el("div", "wbk-map");

  function showChooser() {
    cleanup();
    clearGuide();
    cur = null;
    stage.replaceChildren();
    map.replaceChildren();
    const nextId = (WB_PAGES.find((pg) => !Store.workbookDone[pg.id]) || WB_PAGES[0]).id;
    const head = el("div", "wbk-maphead");
    head.innerHTML = `<img class="wbk-mizo" src="/assets/mizo/mizo-hi.webp" alt="" width="64" height="64">`;
    const say = el("p", "wbk-say", fem(WB_SAY.chooser));
    head.appendChild(say);
    map.appendChild(head);
    WB_UNITS.forEach((u, ui) => {
      const sec = el("section", "wbk-unit");
      sec.style.setProperty("--unit", ["#ef4444", "#f59e0b", "#3b82f6", "#16a34a", "#8b5cf6", "#ec4899"][ui % 6]);
      const done = u.pages.filter((pg) => Store.workbookDone[pg.id]).length;
      sec.appendChild(el("h3", "wbk-unit-title", `${u.title}  ${"⭐".repeat(done)}`));
      const grid = el("div", "wbk-unit-grid");
      u.pages.forEach((pg) => {
        const { icon, label } = pageCard(pg);
        const card = button("wbk-pc" + (pg.id === nextId ? " is-next" : "") + (Store.workbookDone[pg.id] ? " is-done" : ""), "", () => { Sfx.tap(); openPage(pg); });
        card.dataset.id = pg.id;
        card.innerHTML = `<span class="wbk-pc-icon">${icon}</span><span class="wbk-pc-label">${label}</span>`
          + (Store.workbookDone[pg.id] ? `<span class="wbk-pc-star">⭐</span>` : "")
          + (pg.id === nextId ? `<img class="wbk-pc-mizo" src="/assets/mizo/mizo-point.webp" alt="" width="44" height="44">` : "");
        card.setAttribute("aria-label", label);
        grid.appendChild(card);
      });
      sec.appendChild(grid);
      map.appendChild(sec);
    });
    stage.appendChild(map);
    Speech.ar(fem(WB_SAY.chooser));
    const nextCard = map.querySelector(".is-next");
    if (nextCard) setTimeout(() => nextCard.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
  }

  function openPage(pg) {
    cur = pg;
    steps = pageSteps(pg, Math.random, only); // only: تمارين بعينها (للاختبار)
    idx = 0;
    const [c1, c2] = pg.type === "number" ? colorPairOf(pg.n) : pg.type === "shapes" ? WB_COLOR_PAIRS[(pg.pair + 2) % 4]
      : pg.type === "colors" ? WB_COLOR_PAIRS[pg.pair] : WB_COLOR_PAIRS[(WB_PAGES.indexOf(pg) + 1) % 4];
    screen.style.setProperty("--wbk-c1", col(c1).hex);
    screen.style.setProperty("--wbk-c2", col(c2).hex);
    renderStep();
  }

  // ===== رأس الصفحة: «4 four» أو 🎨 «red · pink» + شريط الخطوات (✏️ كتابة · 🎲 لعب) =====
  function header() {
    const head = el("div", "wbk-head");
    const title = el("button", "wbk-title");
    title.type = "button";
    if (cur.type === "number" || cur.type === "zero") {
      title.innerHTML = `<b dir="ltr">${cur.n}</b><span dir="ltr">${enName(cur.n)}</span>`;
      title.setAttribute("aria-label", `اسمع الرقم ${cur.n}`);
      title.addEventListener("click", () => { Sfx.pop(); sayNumber(cur.n); });
    } else if (PAGE_META[cur.type]) {
      const m = PAGE_META[cur.type];
      title.classList.add("wbk-title-colors");
      title.innerHTML = `<b>${m.icon}</b><span>${m.ar}</span>`;
      title.setAttribute("aria-label", m.ar);
      title.addEventListener("click", () => { Sfx.pop(); Speech.ar(m.ar); });
    } else if (cur.type === "shapes") {
      const pair = WB_SHAPE_PAIRS[cur.pair].map((k) => WB_SHAPES[k]);
      title.classList.add("wbk-title-colors");
      title.innerHTML = `<b>🔷</b>` + pair.map((x) => `<span dir="ltr">${x.en}</span>`).join("");
      title.setAttribute("aria-label", "اسمع الأشكال");
      title.addEventListener("click", () => { Sfx.pop(); sayColors(pair); });
    } else {
      const pair = WB_COLOR_PAIRS[cur.pair].map(col);
      title.classList.add("wbk-title-colors");
      title.innerHTML = `<b>🎨</b>` + pair.map((c) => `<span dir="ltr" style="color:${c.hex}">${c.en}</span>`).join("");
      title.setAttribute("aria-label", "اسمع الألوان");
      title.addEventListener("click", () => { Sfx.pop(); sayColors(pair); });
    }
    const track = el("div", "wbk-track");
    steps.forEach((s, i) => {
      const chip = el("span", "wbk-chip" + (i < idx ? " done" : i === idx ? " now" : ""), isWriteStep(s) ? "✏️" : "🎲");
      track.appendChild(chip);
    });
    track.setAttribute("aria-label", `خطوة ${idx + 1} من ${steps.length}`);
    head.append(title, track);
    return head;
  }

  const sayColors = (cs) => Speech.sequence(cs.flatMap((c) => [{ text: c.ar, lang: "ar-EG" }, { text: c.en, lang: "en-US" }]));
  const sayNumber = (v) => Speech.sequence([{ text: enName(v), lang: "en-US" }, { text: WB_AR[v], lang: "ar-EG" }]);

  /** سطر التعليمات: بيتكتب ويتنطق (بصيغة البنت للبنت) — وزرار 🔊 يعيده. */
  function prompt(text) {
    const row = el("div", "wbk-prompt");
    // ميزو بيشرح المطلوب فى كل لعبة (فقاعة كلام) — ولمسة عليه بتعيد الشرح
    const mizo = button("wbk-mizo-btn", "", () => { Sfx.tap(); Speech.ar(fem(text)); showGuide(true); });
    mizo.innerHTML = `<img class="wbk-mizo" src="/assets/mizo/mizo-teach.webp" alt="" width="64" height="64">`;
    mizo.setAttribute("aria-label", "ميزو: اسمع تانى");
    const t = el("p", "wbk-say", fem(text));
    row.append(mizo, t);
    lastPrompt = text;
    Speech.ar(fem(text));
    return row;
  }

  // ===== الصباع اللى بيوجّه (لسن ٣–٤): لو الطفل ساكت ٨ ثوانى ميزو يعيد الشرح والصباع يشاور =====
  // كل خطوة بتعلّم الإجابة الصح بـ data-good (و data-need = اللون المطلوب)، أو بتدّى setGuide(fn).
  let lastPrompt = "";
  let guideFn = null;
  let guideTimer = 0;
  let hand = null;
  function clearGuide() {
    clearTimeout(guideTimer);
    if (hand) { hand.remove(); hand = null; }
    guideFn = null;
  }
  function setGuide(fn) { guideFn = fn; }
  function armGuide() {
    clearTimeout(guideTimer);
    if (hand) { hand.remove(); hand = null; }
    if (cur) guideTimer = setTimeout(() => showGuide(false), 8000);
  }
  function autoTarget() {
    const body = stage.querySelector(".wbk-body");
    if (!body) return null;
    const pending = [...body.querySelectorAll("[data-good]")].find((e) =>
      !e.dataset.on && !e.classList.contains("correct") && !e.classList.contains("on") && !e.classList.contains("ok")
      && !e.classList.contains("seen") && !e.closest("[data-ok]") && e.getClientRects().length);
    if (pending) {
      const need = pending.dataset.need;
      const pal = body.querySelector(".wbk-palette");
      if (need && pal && !pal.querySelector(`.wbk-crayon.is-on[data-color="${need}"]`)) return pal.querySelector(`[data-color="${need}"]`) || pending;
      return pending;
    }
    return body.querySelector(".wbk-done:not([disabled])");
  }
  function showGuide(now) {
    if (!cur || !screen.isConnected) return;
    if (stage.querySelector(".wb-box")) return armGuide(); // لوحة الكتابة ليها صباعها
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
  /** جملة سريعة فى نفس السطر (غلط/تلميح) من غير ما تمسح التعليمات. */
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

  function nextStep() {
    cleanup();
    cleanup = () => {};
    idx++;
    if (idx >= steps.length) return finishPage();
    renderStep();
  }
  function stepDone(delay = 900) {
    Sfx.correct();
    awardStars(1);
    clearGuide();
    const img = stage.querySelector(".wbk-prompt .wbk-mizo");
    if (img) { img.src = "/assets/mizo/mizo-cheer.webp"; img.classList.add("wbk-mizo-cheer"); }
    const body = stage.querySelector(".wbk-body");
    if (body) { const star = el("div", "wbk-step-star", "⭐"); body.appendChild(star); }
    setTimeout(() => { if (cur) nextStep(); }, delay);
  }

  function finishPage() {
    Store.markWorkbookDone(cur.id);
    finishActivity({ regionId, regionIndex, stars: 5, onDone: showChooser });
  }

  function renderStep() {
    cleanup();
    cleanup = () => {};
    clearGuide();
    lastPrompt = "";
    stage.replaceChildren(header());
    const s = steps[idx];
    const body = el("section", "wbk-body wbk-step-" + s.kind);
    stage.appendChild(body);
    const skip = button("wbk-skip", "⏭", () => { Sfx.tap(); Speech.stop(); nextStep(); });
    skip.setAttribute("aria-label", "الخطوة اللى بعدها");
    stage.appendChild(skip);
    STEP[s.kind](body, s);
    armGuide();
  }

  // ===== الخطوات =====
  const STEP = {
    // ١) اعرف الرقم: الرقم كبير، والدواير فى الشريط — الطفل يلمسها ويعدّ
    meet(body, s) {
      body.appendChild(prompt(WB_SAY.meet(WB_AR[s.n])));
      const big = button("wbk-big", "", () => { Sfx.pop(); sayNumber(s.n); });
      big.innerHTML = `<b dir="ltr">${s.n}</b><small dir="ltr">${enName(s.n)}</small>`;
      const frame = el("div", "wbk-frame" + (s.frame === 10 ? " ten" : ""));
      frame.dir = "ltr";
      let counted = 0;
      for (let i = 0; i < s.frame; i++) {
        const cell = el("span", "wbk-cell");
        if (i < s.n) {
          const dot = button("wbk-ball", "", () => {
            if (dot.classList.contains("on")) return;
            dot.classList.add("on");
            counted++;
            Sfx.pop();
            Speech.ar(WB_AR[counted]);
            if (counted === s.n) setTimeout(() => { sayNumber(s.n); stepDone(1500); }, 700);
          });
          dot.setAttribute("aria-label", "دايرة");
          dot.dataset.good = "1";
          cell.appendChild(dot);
        }
        frame.appendChild(cell);
      }
      body.append(big, frame);
    },

    // ✏️ الكتابة: على الخط ← على النقط (والـ«لوحده» جوّه الرقم الناقص)
    write(body, s) {
      writeBoard(body, s.n, s.level, s.level === 1 ? writeIntro("الرقم", WB_AR[s.n]) : WB_SAY.againDots, () => stepDone(700));
    },

    // «Color four of the dresses» — بلون الكتاب من علبة الألوان
    colorN(body, s) {
      const c = col(s.color);
      body.appendChild(prompt(WB_SAY.colorN(WB_AR[s.n], c.al)));
      const hint = hintLine();
      let crayon = null;
      const pal = palette(s.palette, (k) => { crayon = k; });
      const grid = el("div", "wbk-color-grid");
      const tiles = [];
      // الصباع بيشاور على الحاجات اللى لسه مااتلوّنتش، ولما العدد يكمل على «خلّصت»
      const refresh = () => {
        const full = tiles.filter((t) => t.dataset.on).length >= s.n;
        tiles.forEach((t) => { if (!full && !t.dataset.on) { t.dataset.good = "1"; t.dataset.need = s.color; } else delete t.dataset.good; });
      };
      for (let i = 0; i < s.total; i++) {
        const t = button("wbk-tile", s.thing, () => {
          if (t.dataset.on) {
            delete t.dataset.on;
            t.style.removeProperty("--fill");
            Sfx.tap();
            refresh();
            return;
          }
          if (crayon !== s.color) {
            Sfx.wrong();
            flash(pal, "wbk-wiggle");
            return hint.show(WB_SAY.pickColor(c.al));
          }
          t.dataset.on = "1";
          t.style.setProperty("--fill", c.hex);
          Sfx.pop();
          refresh();
        });
        tiles.push(t);
        grid.appendChild(t);
      }
      refresh();
      const done = button("candy-btn wbk-done", fem("✓ خلّصت"), () => {
        const k = tiles.filter((t) => t.dataset.on).length;
        if (k === s.n) {
          done.disabled = true;
          sayNumber(s.n);
          return stepDone(1400);
        }
        Sfx.wrong();
        hint.show(k > s.n ? WB_SAY.tooMany(WB_AR[s.n]) : WB_SAY.tooFew(WB_AR[s.n]));
      });
      body.append(pal, grid, hint, done);
    },

    // «Count and choose the correct number»
    countChoose(body, s) {
      body.appendChild(prompt(WB_SAY.countChoose));
      const row = el("div", "wbk-cards");
      let left = s.cards.length;
      s.cards.forEach((card) => {
        const box = el("div", "wbk-card");
        box.appendChild(groupOf(card.thing, card.count));
        const opts = el("div", "wbk-opts");
        opts.dir = "ltr";
        card.options.forEach((v) => {
          const b = button("wbk-opt", String(v), () => {
            if (box.dataset.ok) return;
            if (v !== card.count) { Sfx.wrong(); flash(b, "wrong"); return; }
            box.dataset.ok = "1";
            b.classList.add("correct");
            Sfx.correct();
            Speech.ar(WB_AR[v]);
            if (--left === 0) stepDone(1000);
          });
          if (v === card.count) b.dataset.good = "1";
          opts.appendChild(b);
        });
        box.appendChild(opts);
        row.appendChild(box);
      });
      body.appendChild(row);
    },

    // «Count, then match» — المس المجموعة وبعدين رقمها، وخط بيوصّلهم
    match(body, s) {
      const equal = s.right === "groups";
      body.appendChild(prompt(equal ? WB_SAY.matchEqual : s.right === "times" ? WB_SAY.clockMatch : WB_SAY.match));
      const area = el("div", "wbk-match" + (equal ? " wbk-match-eq" : ""));
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "wbk-lines");
      const groups = el("div", "wbk-mcol");
      const nums = el("div", "wbk-mcol");
      area.append(groups, nums, svg);
      let sel = null; // { node, value, side }
      let left = s.groups.length;
      const select = (node, value, side) => {
        if (node.dataset.ok) return;
        if (!sel || sel.side === side) {
          if (sel) sel.node.classList.remove("sel");
          sel = { node, value, side };
          node.classList.add("sel");
          Sfx.tap();
          return;
        }
        const other = sel;
        sel = null;
        other.node.classList.remove("sel");
        if (other.value !== value) { Sfx.wrong(); flash(node, "wrong"); flash(other.node, "wrong"); return; }
        node.dataset.ok = other.node.dataset.ok = "1";
        node.classList.add("ok");
        other.node.classList.add("ok");
        drawLine(area, svg, other.node, node);
        Sfx.correct();
        Speech.ar(WB_AR[value]);
        if (--left === 0) stepDone(1100);
      };
      // الصباع: المجموعة اللى عليها الدور، ولو فيه واحدة متعلّمة يشاور على اللى تتوصّل بيها
      setGuide(() => {
        if (!sel) return groups.querySelector(".wbk-mgroup:not([data-ok])");
        const other = sel.side === "g" ? nums : groups;
        return [...other.children].find((x) => !x.dataset.ok && +x.dataset.v === sel.value) || null;
      });
      s.groups.forEach((g) => {
        const b = button("wbk-mgroup", "", () => select(b, g.count, "g"));
        b.dataset.v = String(g.count);
        b.appendChild(g.rep === "fingers" ? fingersOf(g.count) : g.rep === "dots" ? dotsFor(g.count)
          : g.rep === "clock" ? clockFace(g.count) : g.rep === "candles" ? candlesOf(g.count) : groupOf(g.thing, g.count));
        groups.appendChild(b);
      });
      s.numbers.forEach((v) => {
        const b = button("wbk-mnum", equal ? "" : s.right === "times" ? `${v}:00` : String(v), () => select(b, v, "n"));
        b.dataset.v = String(v);
        if (s.right === "times") { b.classList.add("wbk-time"); b.dir = "ltr"; }
        if (equal) { b.classList.add("wbk-mgroup"); b.appendChild(groupOf(s.rightThing, v)); }
        nums.appendChild(b);
      });
      body.appendChild(area);
    },

    // «Color the octopus that has the number 1» — لوّن كل الدواير اللى فيها الرقم
    find(body, s) {
      body.appendChild(prompt(WB_SAY.find(WB_AR[s.n])));
      const grid = el("div", "wbk-find");
      grid.dir = "ltr";
      let left = s.cells.filter((v) => v === s.n).length;
      s.cells.forEach((v) => {
        const b = button("wbk-bubble", String(v), () => {
          if (b.dataset.on) return;
          if (v !== s.n) { Sfx.wrong(); flash(b, "wrong"); return; }
          b.dataset.on = "1";
          b.style.setProperty("--fill", col(s.color).hex);
          Sfx.pop();
          if (--left === 0) stepDone(900);
        });
        if (v === s.n) b.dataset.good = "1";
        grid.appendChild(b);
      });
      body.appendChild(grid);
    },

    // مكوّنات الرقم: «2 and 1 = 3» بالصور
    parts(body, s) {
      body.appendChild(prompt(WB_SAY.parts(WB_AR[s.a], WB_AR[s.b])));
      const eq = el("div", "wbk-eq");
      eq.dir = "ltr";
      const ans = el("span", "wbk-ans", "?");
      const part = (k) => {
        if (s.rep === "fingers") return fingersOf(k, "wbk-fingers wbk-part");
        if (s.rep === "dots") { const d = dotsFor(k); d.classList.add("wbk-part", "wbk-die"); d.setAttribute("aria-label", `${k} نقط`); return d; }
        return groupOf(s.thing, k, "wbk-group wbk-part");
      };
      eq.append(part(s.a), el("span", "wbk-op", "+"), part(s.b), el("span", "wbk-op", "="), ans);
      // «7 and 2 = __» بالأرقام بس، أو الجمع الرأسى (5 فوق 1 وخط تحتهم)
      if (s.rep === "digits" || s.rep === "vertical") eq.classList.add("hidden");
      const nums = el("div", "wbk-eq wbk-eq-n");
      nums.dir = "ltr";
      nums.innerHTML = s.rep === "vertical"
        ? `<span class="wbk-vert"><b>${s.a}</b><b><i>+</i>${s.b}</b><b class="wbk-q">?</b></span>`
        : `<b>${s.a}</b><span class="wbk-op">and</span><b>${s.b}</b><span class="wbk-op">=</span><b class="wbk-q">?</b>`;
      const opts = el("div", "wbk-opts");
      opts.dir = "ltr";
      let done = false;
      s.options.forEach((v) => {
        const b = button("wbk-opt", String(v), () => {
          if (done) return;
          if (v !== s.n) { Sfx.wrong(); flash(b, "wrong"); return; }
          done = true;
          b.classList.add("correct");
          ans.textContent = String(v);
          nums.querySelector(".wbk-q").textContent = String(v);
          sayNumber(v);
          if (!s.write) return stepDone(1400);
          // «Add and write the numbers»: بعد ما يختار، يكتب الناتج بإيده
          Sfx.correct();
          setTimeout(() => {
            opts.remove();
            writeBoard(body, s.n, s.write, WB_SAY.writeAnswer, () => stepDone(900));
          }, 1300);
        });
        if (v === s.n) b.dataset.good = "1";
        opts.appendChild(b);
      });
      if (s.rep === "digits") nums.classList.add("wbk-eq-big");
      body.append(eq, nums, opts);
    },

    // «Draw according to the required number»: كوباية عليها الرقم والشكل — كل لمسة جوّاها بترسم شكل
    stamp(body, s) {
      body.appendChild(prompt(WB_SAY.stamp));
      const hint = hintLine();
      const sign = el("div", "wbk-stamp-sign");
      sign.dir = "ltr";
      sign.innerHTML = `<b>${s.n}</b>${shapeSvg(s.shape, "wbk-shape-cell")}`;
      const cup = el("div", "wbk-cup");
      cup.style.setProperty("--fill", col(s.color).hex);
      cup.setAttribute("aria-label", "الكوباية");
      cup.addEventListener("click", (e) => {
        if (e.target.closest(".wbk-stampmark")) return;
        const r = cup.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        if (x < 6 || x > 74 || y < 8 || y > 92) return; // جوّه جسم الكوباية بس (مش الودن)
        const m = button("wbk-stampmark", "", () => { m.remove(); Sfx.tap(); });
        m.innerHTML = shapeSvg(s.shape, "wbk-shape-cell");
        m.style.left = x + "%";
        m.style.top = y + "%";
        m.setAttribute("aria-label", "شكل — المس عشان تشيله");
        cup.appendChild(m);
        Sfx.pop();
        Speech.ar(WB_AR[cup.querySelectorAll(".wbk-stampmark").length] || "");
      });
      const done = button("candy-btn wbk-done", fem("✓ خلّصت"), () => {
        const k = cup.querySelectorAll(".wbk-stampmark").length;
        if (k === s.n) { done.disabled = true; sayNumber(s.n); return stepDone(1300); }
        Sfx.wrong();
        hint.show(k > s.n ? WB_SAY.stampTooMany(WB_AR[s.n]) : WB_SAY.tooFew(WB_AR[s.n]));
      });
      setGuide(() => (cup.querySelectorAll(".wbk-stampmark").length < s.n ? cup : done));
      body.append(sign, cup, hint, done);
    },

    // «Complete the missing numbers»: يلاقى الناقص، وبعدين يكتبه لوحده
    missing(body, s) {
      const say = s.mode === "prev" ? WB_SAY.missPrev(WB_AR[s.seq[1]])
        : s.mode === "mid" ? WB_SAY.missMid(WB_AR[s.seq[0]], WB_AR[s.seq[2]])
        : s.mode === "next" ? WB_SAY.missNext(WB_AR[s.seq[1]]) : WB_SAY.missing;
      body.appendChild(prompt(say));
      const row = el("div", "wbk-snow");
      row.dir = "ltr";
      const slots = s.seq.map((v, i) => {
        const m = el("div", "wbk-snowman");
        m.innerHTML = `<span class="wbk-snow-face">⛄</span>`;
        const num = el("span", "wbk-snow-num" + (i === s.blank ? " blank" : ""), i === s.blank ? "" : String(v));
        m.appendChild(num);
        row.appendChild(m);
        return num;
      });
      body.appendChild(row);
      const opts = el("div", "wbk-opts");
      opts.dir = "ltr";
      s.options.forEach((v) => {
        const b = button("wbk-opt", String(v), () => {
          if (opts.dataset.ok) return;
          if (v !== s.n) { Sfx.wrong(); flash(b, "wrong"); return; }
          opts.dataset.ok = "1";
          delete b.dataset.good;
          b.classList.add("correct");
          Sfx.correct();
          slots[s.blank].classList.add("found");
          setTimeout(() => {
            opts.remove();
            writeBoard(body, s.n, s.level, null, (fails) => {
              slots[s.blank].textContent = String(s.n);
              slots[s.blank].classList.remove("blank");
              if (s.level === 3) Store.recordWrite("g:" + s.n, fails, 3);
              stepDone(900);
            });
          }, 700);
        });
        if (v === s.n) b.dataset.good = "1";
        opts.appendChild(b);
      });
      body.appendChild(opts);
    },

    // «Color number 1 pink and number 2 yellow»: الرقم ونقطه وحاجاته — كل واحد بلونه
    paint(body, s) {
      const [p, q] = s.pairs;
      body.appendChild(prompt(WB_SAY.paint(WB_AR[p.value], col(p.color).ar, WB_AR[q.value], col(q.color).ar)));
      const hint = hintLine();
      const legend = el("div", "wbk-legend");
      legend.dir = "ltr";
      s.pairs.forEach((x) => {
        const chip = el("span", "wbk-key");
        chip.innerHTML = `<b>${x.value}</b><i style="background:${col(x.color).hex}"></i>`;
        chip.title = col(x.color).ar;
        legend.appendChild(chip);
      });
      let crayon = null;
      const pal = palette(s.pairs.map((x) => x.color), (k) => { crayon = k; });
      const grid = el("div", "wbk-paint");
      let left = s.tiles.length;
      s.tiles.forEach((t) => {
        const want = s.pairs.find((x) => x.value === t.value).color;
        const b = button("wbk-ptile", "", () => {
          if (b.dataset.on) return;
          if (!crayon) { Sfx.wrong(); flash(pal, "wbk-wiggle"); return hint.show(WB_SAY.pickColor(col(want).al)); }
          if (crayon !== want) { Sfx.wrong(); flash(b, "wrong"); return hint.show(WB_SAY.paintWrong); }
          b.dataset.on = "1";
          b.style.setProperty("--fill", col(want).hex);
          Sfx.pop();
          if (--left === 0) stepDone(1000);
        });
        b.dataset.good = "1";
        b.dataset.need = want;
        if (t.rep === "digit") b.appendChild(el("span", "wbk-pdigit", String(t.value)));
        else if (t.rep === "dots") b.appendChild(dotsFor(t.value));
        else if (t.rep === "fingers") b.appendChild(fingersOf(t.value, "wbk-fingers wbk-mini"));
        else b.appendChild(groupOf(t.thing, t.value, "wbk-group wbk-mini"));
        b.setAttribute("aria-label", `العدد ${t.value}`);
        grid.appendChild(b);
      });
      body.append(legend, pal, grid, hint);
    },

    // «Count, write the number, then add dots»: يحط نقطة فى الشريط لكل حاجة
    frameFill(body, s) {
      body.appendChild(prompt(WB_SAY.frameFill));
      const hint = hintLine();
      const things = groupOf(s.thing, s.count, "wbk-group wbk-ff-things");
      const frame = el("div", "wbk-frame" + (s.frame === 10 ? " ten" : ""));
      frame.dir = "ltr";
      for (let i = 0; i < s.frame; i++) {
        const cell = el("span", "wbk-cell");
        const dot = button("wbk-ball", "", () => { dot.classList.toggle("on"); Sfx.pop(); });
        dot.setAttribute("aria-label", "خانة");
        cell.appendChild(dot);
        frame.appendChild(cell);
      }
      const done = button("candy-btn wbk-done", fem("✓ خلّصت"), () => {
        const k = frame.querySelectorAll(".wbk-ball.on").length;
        if (k === s.count) { done.disabled = true; sayNumber(s.count); return stepDone(1300); }
        Sfx.wrong();
        hint.show(k > s.count ? WB_SAY.tooMany(WB_AR[s.count]) : WB_SAY.tooFew(WB_AR[s.count]));
      });
      setGuide(() => {
        const on = frame.querySelectorAll(".wbk-ball.on").length;
        return on < s.count ? frame.querySelector(".wbk-ball:not(.on)") : on === s.count ? done : frame.querySelector(".wbk-ball.on");
      });
      body.append(things, frame, hint, done);
    },

    // «Color the required number»: فراولاية عليها الرقم، وشريط خانات يتلوّن على قدّه
    colorBar(body, s) {
      body.appendChild(prompt(s.n === 1 ? WB_SAY.colorBarOne : WB_SAY.colorBar(WB_AR[s.n])));
      const hint = hintLine();
      const row = el("div", "wbk-barrow");
      row.dir = "ltr";
      const berry = el("span", "wbk-berry");
      berry.innerHTML = `<span>🍓</span><b>${s.n}</b>`;
      const bar = el("div", "wbk-bar");
      bar.style.setProperty("--fill", col(s.color).hex);
      for (let i = 0; i < s.cells; i++) {
        const c = button("wbk-barcell", "", () => { c.classList.toggle("on"); Sfx.pop(); });
        c.setAttribute("aria-label", "خانة");
        bar.appendChild(c);
      }
      row.append(berry, bar);
      const done = button("candy-btn wbk-done", fem("✓ خلّصت"), () => {
        const k = bar.querySelectorAll(".on").length;
        if (k === s.n) { done.disabled = true; sayNumber(s.n); return stepDone(1300); }
        Sfx.wrong();
        hint.show(k > s.n ? WB_SAY.tooMany(WB_AR[s.n]) : WB_SAY.tooFew(WB_AR[s.n]));
      });
      setGuide(() => {
        const on = bar.querySelectorAll(".on").length;
        return on < s.n ? bar.querySelector(".wbk-barcell:not(.on)") : on === s.n ? done : bar.querySelector(".on");
      });
      body.append(row, hint, done);
    },

    // «Circle the repeated number»: فى كل صف رقم متكرّر — يلمس الاتنين
    repeated(body, s) {
      body.appendChild(prompt(WB_SAY.repeated));
      const box = el("div", "wbk-reprows");
      let left = s.rows.length;
      s.rows.forEach((row) => {
        const r = el("div", "wbk-reprow");
        r.dir = "ltr";
        let found = 0;
        row.cells.forEach((v) => {
          const b = button("wbk-repcell", String(v), () => {
            if (b.dataset.on || r.dataset.ok) return;
            if (v !== row.repeated) { Sfx.wrong(); flash(b, "wrong"); return; }
            b.dataset.on = "1";
            Sfx.pop();
            if (++found === 2) {
              r.dataset.ok = "1";
              Speech.ar(WB_AR[v]);
              if (--left === 0) stepDone(1000);
            }
          });
          if (v === row.repeated) b.dataset.good = "1";
          r.appendChild(b);
        });
        box.appendChild(r);
      });
      body.appendChild(box);
    },

    // «Color using the coloring key»: خلايا سداسية عليها أرقام، وكل رقم ليه لون
    hexKey(body, s) {
      body.appendChild(prompt(WB_SAY.picture));
      const hint = hintLine();
      const legend = el("div", "wbk-legend");
      legend.dir = "ltr";
      s.key.forEach((x) => {
        const chip = el("span", "wbk-key");
        chip.innerHTML = `<b>${x.value}</b><i style="background:${col(x.color).hex}"></i>`;
        chip.title = col(x.color).ar;
        legend.appendChild(chip);
      });
      let crayon = null;
      const pal = palette(s.key.map((x) => x.color), (k) => { crayon = k; });
      const grid = el("div", "wbk-hexes");
      grid.dir = "ltr";
      let left = s.cells.length;
      s.cells.forEach((v) => {
        const want = s.key.find((x) => x.value === v).color;
        const b = button("wbk-hex", String(v), () => {
          if (b.dataset.on) return;
          if (!crayon) { Sfx.wrong(); flash(pal, "wbk-wiggle"); return hint.show(WB_SAY.pickFirst); }
          if (crayon !== want) { Sfx.wrong(); flash(b, "wrong"); return hint.show(WB_SAY.paintWrong); }
          b.dataset.on = "1";
          b.style.setProperty("--fill", col(want).hex);
          Sfx.pop();
          if (--left === 0) stepDone(1000);
        });
        b.dataset.good = "1";
        b.dataset.need = want;
        grid.appendChild(b);
      });
      body.append(legend, pal, grid, hint);
    },

    // ===== باقى الكتاب =====
    // ✏️ «Trace the lines» (ص ٥–٦): نفس تمارين ما قبل الكتابة بحكايتها (السحابة ← الوردة…)
    traceLine(body, s) {
      const ln = preLine(s.line);
      writeBoard(body, "pre:" + s.line, s.level, ln.say, () => stepDone(800));
    },

    // «فين الخط …؟»: ٣ رسومات خطوط، يلمس اللى اسمه اتقال
    lineSpot(body, s) {
      body.appendChild(prompt(WB_SAY.lineSpot(preLine(s.want).name)));
      const hint = hintLine();
      const row = el("div", "wbk-cards wbk-lines-pick");
      s.options.forEach((id) => {
        const b = button("wbk-card wbk-linecard", "", () => {
          if (row.dataset.ok) return;
          if (id !== s.want) { Sfx.wrong(); flash(b, "wrong"); return hint.show(WB_SAY.shapeWrong); }
          row.dataset.ok = "1";
          b.classList.add("ok");
          Speech.ar(preLine(id).name);
          stepDone(1000);
        });
        b.innerHTML = lineSvg(id) + `<span>${preLine(id).emoji}</span>`;
        b.setAttribute("aria-label", preLine(id).name);
        if (id === s.want) b.dataset.good = "1";
        row.appendChild(b);
      });
      body.append(row, hint);
    },

    // خط الأعداد والأرنب (ص ٢٩، ٥٩، ٦٢): التالى / السابق / اللى فى النص / الجمع بالنطّ
    lineHop(body, s) {
      const say = s.mode === "next" ? WB_SAY.hopNext(WB_AR[s.from]) : s.mode === "prev" ? WB_SAY.hopPrev(WB_AR[s.from])
        : s.mode === "mid" ? WB_SAY.hopMid(WB_AR[s.from], WB_AR[s.to]) : WB_SAY.hopAdd(WB_AR[s.from], WB_AR[s.by]);
      body.appendChild(prompt(say));
      const hint = hintLine();
      if (s.mode === "add") {
        const eq = el("div", "wbk-eq wbk-eq-n wbk-eq-big");
        eq.dir = "ltr";
        eq.innerHTML = `<b>${s.from}</b><span class="wbk-op">+</span><b>${s.by}</b><span class="wbk-op">=</span><b class="wbk-q">?</b>`;
        body.appendChild(eq);
      }
      const line = el("div", "wbk-numline");
      line.dir = "ltr";
      const bunny = el("span", "wbk-bunny", "🐇");
      line.appendChild(bunny);
      const ticks = [];
      for (let v = 0; v <= 10; v++) {
        const t = button("wbk-nl", String(v), () => {
          if (line.dataset.ok) return;
          if (v !== s.answer) { Sfx.wrong(); flash(t, "wrong"); return hint.show(say); }
          line.dataset.ok = "1";
          t.classList.add("correct");
          bunny.style.left = ((v + 0.5) / 11) * 100 + "%";
          const q = body.querySelector(".wbk-q");
          if (q) q.textContent = String(v);
          sayNumber(v);
          stepDone(1500);
        });
        if (v === s.answer) t.dataset.good = "1";
        if (s.mode === "mid" && (v === s.from || v === s.to)) t.classList.add("mark");
        if (v === s.from && s.mode !== "mid") t.classList.add("mark");
        ticks.push(t);
        line.appendChild(t);
      }
      bunny.style.left = ((s.from + 0.5) / 11) * 100 + "%";
      body.append(line, hint);
    },

    // «Put (✗) on the different color»
    oddColor(body, s) {
      body.appendChild(prompt(WB_SAY.oddColor));
      const box = el("div", "wbk-reprows");
      let left = s.rows.length;
      s.rows.forEach((row) => {
        const r = el("div", "wbk-oddrow");
        r.dir = "ltr";
        for (let i = 0; i < row.size; i++) {
          const odd = i === row.at;
          const b = button("wbk-oddcell", "", () => {
            if (r.dataset.ok) return;
            if (!odd) { Sfx.wrong(); flash(b, "wrong"); return; }
            r.dataset.ok = "1";
            b.classList.add("crossed");
            Sfx.pop();
            Speech.ar(col(row.odd).ar);
            if (--left === 0) stepDone(1000);
          });
          b.innerHTML = shapeSvg(row.shape, "wbk-shape-cell") + `<span class="wbk-x">✗</span>`;
          b.style.setProperty("--fill", col(odd ? row.odd : row.base).hex);
          if (odd) b.dataset.good = "1";
          r.appendChild(b);
        }
        box.appendChild(r);
      });
      body.appendChild(box);
    },

    // «Count, color, and then write as shown in the example»: صورة فيها حاجات، وصف خانات لكل نوع
    countKinds(body, s) {
      body.appendChild(prompt(WB_SAY.countKinds));
      const hint = hintLine();
      const scene = el("div", "wbk-scene");
      scene.textContent = s.scene.join(" ");
      const table = el("div", "wbk-kinds");
      const rows = s.rows.map((row) => {
        const r = el("div", "wbk-kindrow");
        r.dir = "ltr";
        r.appendChild(el("span", "wbk-kind-thing", row.thing));
        const bar = el("div", "wbk-bar");
        bar.style.setProperty("--fill", "var(--wbk-c1)");
        for (let i = 0; i < s.cells; i++) {
          const c = button("wbk-barcell", "", () => { c.classList.toggle("on"); Sfx.pop(); });
          c.setAttribute("aria-label", "خانة");
          bar.appendChild(c);
        }
        const out = el("b", "wbk-kind-n", "");
        r.append(bar, out);
        table.appendChild(r);
        return { row, bar, out, r };
      });
      setGuide(() => {
        for (const x of rows) {
          const on = x.bar.querySelectorAll(".on").length;
          if (on < x.row.count) return x.bar.querySelector(".wbk-barcell:not(.on)");
          if (on > x.row.count) return x.bar.querySelector(".on");
        }
        return done;
      });
      const done = button("candy-btn wbk-done", fem("✓ خلّصت"), () => {
        let ok = true;
        for (const x of rows) {
          const on = x.bar.querySelectorAll(".on").length;
          if (on === x.row.count) { x.out.textContent = String(on); x.r.dataset.ok = "1"; }
          else if (ok) { ok = false; flash(x.r, "wrong"); hint.show(on > x.row.count ? WB_SAY.tooMany(WB_AR[x.row.count]) : WB_SAY.tooFew(WB_AR[x.row.count])); }
        }
        if (!ok) { Sfx.wrong(); return; }
        done.disabled = true;
        stepDone(1300);
      });
      body.append(scene, table, hint, done);
    },

    // ===== الساعة =====
    meetClock(body, s) {
      body.appendChild(prompt(WB_SAY.meetClock));
      let h = s.start;
      let taps = 0;
      const face = button("wbk-clockbtn", "", () => {
        h = (h % 12) + 1;
        face.innerHTML = clockSvg(h);
        Sfx.pop();
        Speech.ar(fem(WB_SAY.clockSay(WB_HOUR_AR[h])));
        timeTag.textContent = `${h}:00`;
        if (++taps === 3) { face.dataset.on = "1"; stepDone(1800); }
      });
      face.innerHTML = clockSvg(h);
      face.setAttribute("aria-label", "الساعة");
      face.dataset.good = "1";
      const timeTag = el("div", "wbk-time-tag", `${h}:00`);
      timeTag.dir = "ltr";
      body.append(face, timeTag);
    },
    // «Choose the correct o'clock»
    clockChoose(body, s) {
      body.appendChild(prompt(WB_SAY.clockChoose));
      const hint = hintLine();
      const list = el("div", "wbk-cards");
      let left = s.rows.length;
      s.rows.forEach((row) => {
        const box = el("div", "wbk-card");
        box.appendChild(clockFace(row.h));
        const opts = el("div", "wbk-opts");
        opts.dir = "ltr";
        row.options.forEach((v) => {
          const b = button("wbk-opt wbk-time", `${v}:00`, () => {
            if (box.dataset.ok) return;
            if (v !== row.h) { Sfx.wrong(); flash(b, "wrong"); return hint.show(WB_SAY.clockWrong); }
            box.dataset.ok = "1";
            b.classList.add("correct");
            Sfx.correct();
            Speech.ar(fem(WB_SAY.clockSay(WB_HOUR_AR[v])));
            if (--left === 0) stepDone(1300);
          });
          if (v === row.h) b.dataset.good = "1";
          opts.appendChild(b);
        });
        box.appendChild(opts);
        list.appendChild(box);
      });
      body.append(list, hint);
    },
    // ✏️ «Write the time»: الساعة كام؟ يكتب رقم الساعة
    clockWrite(body, s) {
      body.appendChild(prompt(WB_SAY.clockWrite));
      const face = clockFace(s.h);
      face.classList.add("wbk-clock-big");
      body.appendChild(face);
      writeBoard(body, s.h, s.level, null, (fails) => {
        Speech.ar(fem(WB_SAY.clockSay(WB_HOUR_AR[s.h])));
        if (s.level === 3) Store.recordWrite("g:" + s.h, fails, 3);
        stepDone(1100);
      });
    },
    // «Draw the clock»: الوقت مكتوب، والطفل يلمس الرقم اللى العقرب القصير يروحله
    clockSet(body, s) {
      body.appendChild(prompt(WB_SAY.clockSet(WB_HOUR_AR[s.h])));
      const hint = hintLine();
      const tag = el("div", "wbk-time-tag", `${s.h}:00`);
      tag.dir = "ltr";
      const wrap = el("div", "wbk-clockset");
      wrap.innerHTML = clockSvg(null, true);
      wrap.querySelectorAll(".wbk-hr").forEach((g) => {
        const v = +g.dataset.h;
        if (v === s.h) g.dataset.good = "1";
        g.addEventListener("click", () => {
          if (wrap.dataset.ok) return;
          if (v !== s.h) { Sfx.wrong(); g.classList.add("wrong"); setTimeout(() => g.classList.remove("wrong"), 450); return hint.show(WB_SAY.clockWrong); }
          wrap.dataset.ok = "1";
          wrap.innerHTML = clockSvg(s.h);
          Speech.ar(fem(WB_SAY.clockSay(WB_HOUR_AR[s.h])));
          stepDone(1500);
        });
      });
      body.append(tag, wrap, hint);
    },

    // ===== الصفر: «There are zero birds» =====
    meetZero(body) {
      body.appendChild(prompt(WB_SAY.meetZero));
      const row = el("div", "wbk-zero");
      const cage = button("wbk-cage", "", () => {
        if (cage.dataset.on) return;
        cage.dataset.on = "1";
        Sfx.pop();
        sayNumber(0);
        stepDone(1600);
      });
      cage.innerHTML = `<span class="wbk-cage-top"></span><span class="wbk-cage-bars"></span><b dir="ltr">0</b>`;
      cage.setAttribute("aria-label", "القفص");
      cage.dataset.good = "1";
      const fist = el("div", "wbk-fist", "✊");
      const frame = el("div", "wbk-frame");
      for (let i = 0; i < 5; i++) frame.appendChild(el("span", "wbk-cell"));
      const big = el("div", "wbk-big");
      big.innerHTML = `<b dir="ltr">0</b><small dir="ltr">zero</small>`;
      row.append(cage, fist);
      body.append(big, row, frame);
    },

    // «Write the correct number in place of the image»: مفتاح فوق (رقم ← صورة)
    codeKey(body, s) {
      body.appendChild(prompt(WB_SAY.codeKey));
      const hint = hintLine();
      const key = el("div", "wbk-codekey");
      key.dir = "ltr";
      s.key.forEach((k) => { key.insertAdjacentHTML("beforeend", `<span><b>${k.value}</b><i>${k.thing}</i></span>`); });
      const list = el("div", "wbk-cards");
      let left = s.ask.length;
      let lastBox = null;
      s.ask.forEach((q) => {
        const box = el("div", "wbk-card");
        box.appendChild(el("span", "wbk-code-thing", q.thing));
        const opts = el("div", "wbk-opts");
        opts.dir = "ltr";
        q.options.forEach((v) => {
          const b = button("wbk-opt", String(v), () => {
            if (box.dataset.ok) return;
            if (v !== q.value) { Sfx.wrong(); flash(b, "wrong"); return hint.show(WB_SAY.codeKey); }
            box.dataset.ok = "1";
            b.classList.add("correct");
            Speech.ar(WB_AR[v]);
            lastBox = q;
            if (--left > 0) return Sfx.correct();
            if (!s.write) return stepDone(1100);
            // وآخر واحدة يكتب رقمها بإيده
            Sfx.correct();
            setTimeout(() => { list.remove(); writeBoard(body, lastBox.value, s.write, null, () => stepDone(900)); }, 900);
          });
          if (v === q.value) b.dataset.good = "1";
          opts.appendChild(b);
        });
        box.appendChild(opts);
        list.appendChild(box);
      });
      body.append(key, list, hint);
    },

    // ===== صفحات الأشكال =====
    meetShapes(body, s) {
      const [a, b] = s.shapes.map((k) => WB_SHAPES[k]);
      body.appendChild(prompt(WB_SAY.meetShapes(a.ar, b.ar)));
      const row = el("div", "wbk-swatches");
      const seen = new Set();
      s.shapes.forEach((k) => {
        const sh = WB_SHAPES[k];
        const card = button("wbk-swatch wbk-shapecard", "", () => {
          Sfx.pop();
          sayColors([sh]);
          card.classList.add("seen");
          delete card.dataset.good;
          seen.add(k);
          if (seen.size === s.shapes.length) setTimeout(() => stepDone(600), 1600);
        });
        card.innerHTML = shapeSvg(k, "wbk-shape-big") + `<span class="wbk-sw-things">${sh.things.slice(0, 2).join(" ")}</span>`
          + `<b>${sh.ar}</b><small dir="ltr">${sh.en}</small>`;
        card.setAttribute("aria-label", "الشكل " + sh.ar);
        card.dataset.good = "1";
        row.appendChild(card);
      });
      body.appendChild(row);
    },

    // ✏️ «Trace the shapes» (على النقط) / «Draw the required shape inside the cloud» (لوحده)
    traceShape(body, s) {
      const sh = WB_SHAPES[s.shape];
      writeBoard(body, s.shape, s.level, s.level === 3 ? WB_SAY.drawAlone(sh.ar) : WB_SAY.drawShape(sh.ar), () => stepDone(800));
      if (s.level === 3) body.querySelector(".wbk-write")?.classList.add("wbk-cloud");
    },

    // «Put a check mark inside the oval shapes»: يلمس الشكل المطلوب بس
    checkShape(body, s) {
      body.appendChild(prompt(WB_SAY.checkShape(WB_SHAPES[s.say].ar)));
      const hint = hintLine();
      const grid = el("div", "wbk-checkgrid");
      let left = s.items.filter((k) => s.target.includes(k)).length;
      s.items.forEach((k) => {
        const b = button("wbk-checkcell", "", () => {
          if (b.dataset.on) return;
          if (!s.target.includes(k)) { Sfx.wrong(); flash(b, "wrong"); return hint.show(WB_SAY.shapeWrong); }
          b.dataset.on = "1";
          Sfx.pop();
          if (--left === 0) stepDone(1000);
        });
        b.innerHTML = shapeSvg(k, "wbk-shape-cell") + `<span class="wbk-tick">✓</span>`;
        b.setAttribute("aria-label", WB_SHAPES[k].ar);
        if (s.target.includes(k)) b.dataset.good = "1";
        grid.appendChild(b);
      });
      body.append(grid, hint);
    },

    // «Choose the picture that matches the shape»
    matchShape(body, s) {
      body.appendChild(prompt(WB_SAY.matchShape));
      const hint = hintLine();
      const list = el("div", "wbk-shaperows");
      let left = s.rows.length;
      s.rows.forEach((row) => {
        const r = el("div", "wbk-shaperow");
        const head = el("span", "wbk-shapehead");
        head.innerHTML = shapeSvg(row.shape, "wbk-shape-cell");
        head.setAttribute("aria-label", WB_SHAPES[row.shape].ar);
        r.appendChild(head);
        row.options.forEach((t) => {
          const b = button("wbk-opt wbk-shapeopt", t, () => {
            if (r.dataset.ok) return;
            if (t !== row.right) { Sfx.wrong(); flash(b, "wrong"); return hint.show(WB_SAY.shapeWrong); }
            r.dataset.ok = "1";
            b.classList.add("correct");
            Sfx.correct();
            Speech.ar(WB_SHAPES[row.shape].ar);
            if (--left === 0) stepDone(1000);
          });
          if (t === row.right) b.dataset.good = "1";
          r.appendChild(b);
        });
        list.appendChild(r);
      });
      body.append(list, hint);
    },

    // ===== صفحات الألوان =====
    // «Colors»: كارت لكل لون (زى الكتاب: بقعة اللون وحاجتين لونهم كده) — يلمس الاتنين
    meetColors(body, s) {
      const [a, b] = s.colors.map(col);
      body.appendChild(prompt(WB_SAY.meetColors(a.ar, b.ar)));
      const row = el("div", "wbk-swatches");
      const seen = new Set();
      s.colors.forEach((k) => {
        const c = col(k);
        const card = button("wbk-swatch", "", () => {
          Sfx.pop();
          sayColors([c]);
          card.classList.add("seen");
          delete card.dataset.good;
          seen.add(k);
          if (seen.size === s.colors.length) setTimeout(() => stepDone(600), 1600);
        });
        card.style.setProperty("--sw", c.hex);
        card.innerHTML = `<span class="wbk-drip"></span><span class="wbk-sw-things">${s.examples[k].join(" ")}</span>`
          + `<b>${c.ar}</b><small dir="ltr">${c.en}</small>`;
        card.setAttribute("aria-label", "اللون " + c.ar);
        card.dataset.good = "1";
        row.appendChild(card);
      });
      body.appendChild(row);
    },

    // «Color the shapes yellow or orange»: الحاجة رمادى، والطفل يعرف لونها الحقيقى
    realColor(body, s) {
      const [a, b] = s.colors.map(col);
      body.appendChild(prompt(WB_SAY.realColor(a.ar, b.ar)));
      const hint = hintLine();
      let crayon = null;
      const pal = palette(s.colors, (k) => { crayon = k; });
      const grid = el("div", "wbk-color-grid wbk-real");
      let left = s.items.length;
      s.items.forEach((it) => {
        const t = button("wbk-tile", it.thing, () => {
          if (t.dataset.on) return;
          if (!crayon) { Sfx.wrong(); flash(pal, "wbk-wiggle"); return hint.show(WB_SAY.pickFirst); }
          if (crayon !== it.color) { Sfx.wrong(); flash(t, "wrong"); return hint.show(WB_SAY.realWrong); }
          t.dataset.on = "1";
          t.style.setProperty("--fill", col(it.color).hex);
          Sfx.pop();
          Speech.ar(col(it.color).ar);
          if (--left === 0) stepDone(1000);
        });
        t.dataset.good = "1";
        t.dataset.need = it.color;
        grid.appendChild(t);
      });
      body.append(pal, grid, hint);
    },

    // «Count, write, then color as required»: يلوّنهم باللون المطلوب وهو بيعدّ، وبعدين يكتب العدد
    countWrite(body, s) {
      const c = col(s.color);
      body.appendChild(prompt(WB_SAY.countWrite(c.al)));
      const hint = hintLine();
      let crayon = null;
      const pal = palette(s.palette, (k) => { crayon = k; });
      const row = el("div", "wbk-color-grid wbk-cw");
      let colored = 0;
      for (let i = 0; i < s.count; i++) {
        const t = button("wbk-tile", s.thing, () => {
          if (t.dataset.on) return;
          if (crayon !== s.color) { Sfx.wrong(); flash(pal, "wbk-wiggle"); return hint.show(WB_SAY.pickColor(c.al)); }
          t.dataset.on = "1";
          t.style.setProperty("--fill", c.hex);
          colored++;
          Sfx.pop();
          Speech.ar(WB_AR[colored]);
          if (colored === s.count) setTimeout(writeIt, 900);
        });
        t.dataset.good = "1";
        t.dataset.need = s.color;
        row.appendChild(t);
      }
      body.append(pal, row, hint);
      function writeIt() {
        pal.remove();
        hint.remove();
        writeBoard(body, s.count, s.level, null, (fails) => {
          if (s.level === 3) Store.recordWrite("g:" + s.count, fails, 3);
          stepDone(900);
        });
      }
    },

    // «Choose and color»: كل حاجة جنبها لونين — يلمس لونها الحقيقى
    chooseColor(body, s) {
      body.appendChild(prompt(WB_SAY.chooseColor));
      const hint = hintLine();
      const list = el("div", "wbk-choose");
      let left = s.items.length;
      s.items.forEach((it) => {
        const row = el("div", "wbk-choose-row");
        const t = el("span", "wbk-tile", it.thing);
        const opts = el("div", "wbk-choose-opts");
        it.options.forEach((k) => {
          const b = button("wbk-dot", "", () => {
            if (t.dataset.on) return;
            if (k !== it.color) { Sfx.wrong(); flash(b, "wrong"); return hint.show(WB_SAY.realWrong); }
            t.dataset.on = "1";
            t.style.setProperty("--fill", col(k).hex);
            b.classList.add("correct");
            Sfx.pop();
            Speech.ar(col(k).ar);
            if (--left === 0) stepDone(1000);
          });
          b.style.setProperty("--crayon", col(k).hex);
          b.setAttribute("aria-label", "لون " + col(k).ar);
          if (k === it.color) b.dataset.good = "1";
          opts.appendChild(b);
        });
        row.append(t, opts);
        list.appendChild(row);
      });
      body.append(list, hint);
    },

    // «Color according to the number»: كب كيك، كل حتة عليها رقم ولكل رقم لون
    picture(body, s) {
      const robot = s.art === "robot";
      body.appendChild(prompt(robot ? WB_SAY.robot : WB_SAY.picture));
      const hint = hintLine();
      const legend = el("div", "wbk-legend");
      legend.dir = "ltr";
      s.key.forEach((x) => {
        const chip = el("span", "wbk-key");
        chip.innerHTML = `<b>${x.value}</b>` + (x.shape ? shapeSvg(x.shape, "wbk-shape-mini") : "") + `<i style="background:${col(x.color).hex}"></i>`;
        chip.title = col(x.color).ar;
        legend.appendChild(chip);
      });
      if (robot) legend.classList.add("wbk-legend-wrap");
      let crayon = null;
      const pal = palette(s.key.map((x) => x.color), (k) => { crayon = k; });
      const wrap = el("div", "wbk-cake" + (robot ? " wbk-robot" : ""));
      wrap.innerHTML = robot ? robotSvg(s.regions) : cupcakeSvg(s.regions);
      let left = s.regions.length;
      wrap.querySelectorAll(".wbk-reg").forEach((reg) => {
        const v = +reg.dataset.v;
        const want = s.key.find((x) => x.value === v).color;
        reg.dataset.good = "1";
        reg.dataset.need = want;
        reg.addEventListener("click", () => {
          if (reg.dataset.on) return;
          if (!crayon) { Sfx.wrong(); flash(pal, "wbk-wiggle"); return hint.show(WB_SAY.pickFirst); }
          if (crayon !== want) { Sfx.wrong(); flash(reg, "wrong"); return hint.show(WB_SAY.paintWrong); }
          reg.dataset.on = "1";
          reg.style.fill = col(want).hex;
          Sfx.pop();
          if (--left === 0) stepDone(1200);
        });
      });
      body.append(legend, pal, wrap, hint);
    },
  };

  /** علبة ألوان (أقلام) — اختيار واحد. */
  function palette(keys, onPick) {
    const box = el("div", "wbk-palette");
    keys.forEach((k) => {
      const c = col(k);
      const b = button("wbk-crayon", c.ar, () => {
        box.querySelectorAll(".wbk-crayon").forEach((x) => x.classList.toggle("is-on", x === b));
        Sfx.tap();
        Speech.ar(c.ar);
        onPick(k);
      });
      b.style.setProperty("--crayon", c.hex);
      b.setAttribute("aria-label", "لون " + c.ar);
      b.dataset.color = k;
      box.appendChild(b);
    });
    return box;
  }

  /** لوحة الكتابة للرقم v بمستوى المساعدة ده. done(fails). */
  /** `v` = رقم، أو مفتاح شكل من WB_SHAPES (ارسم الشكل). */
  function writeBoard(host, v, level, intro, done) {
    const shape = WB_SHAPES[v];
    const line = typeof v === "string" && v.startsWith("pre:") ? preLine(v.slice(4)) : null;
    const strokes = line ? line.strokes : shape ? shape.strokes : strokesFor(String(v));
    const hint = hintLine();
    const wrap = el("div", "wbk-write");
    wrap.dataset.glyph = String(v);
    host.appendChild(wrap);
    if (intro) host.insertBefore(prompt(intro), wrap);
    const board = mountWriteBoard(wrap, {
      ...penBoardOptions((text) => hint.show(text)),
      strokes,
      level,
      from: line && line.from,
      to: line && line.to,
      onHint: (text) => { Sfx.wrong(); hint.show(text); },
      onDone: ({ fails }) => {
        board.el.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 450 });
        if (!line) Speech.en(shape ? shape.en : enName(v));
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
    // أول كتابة فى اليوم: كارت مسكة القلم. والصباع بيوريه إزاى كل مرة اللوحة تتفتح —
    // كل المستويات (المالك ٢٠٢٦-١٠-١٠: «عاوزها تظهر فى كل مرة»)
    showGripCard();
    whenGripClosed(() => setTimeout(() => board.demo(), 1400));
  }

  setTimeout(() => {
    const pg = startN != null && WB_PAGES.find((x) => x.id === String(startN));
    if (pg) openPage(pg);
    else showChooser();
  }, 0);
  return screen;
}

/** خط بين مجموعة ورقمها جوّه منطقة التوصيل (بيترسم بعد ما الاتنين يتوصّلوا). */
function drawLine(area, svg, a, b) {
  const r = area.getBoundingClientRect();
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  const left = ra.left < rb.left ? ra : rb;
  const right = ra.left < rb.left ? rb : ra;
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(left.right - r.left));
  line.setAttribute("y1", String(left.top + left.height / 2 - r.top));
  line.setAttribute("x2", String(right.left - r.left));
  line.setAttribute("y2", String(right.top + right.height / 2 - r.top));
  svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
  svg.appendChild(line);
}

/** كب كيك «لوّن حسب الرقم»: كريزة · ٣ طبقات كريمة · ٥ خطوط ورقة (WB_PICTURE_REGIONS = ٩). */
function cupcakeSvg(values) {
  const top = [44, 66.4, 88.8, 111.2, 133.6, 156];
  const bot = [62, 77.2, 92.4, 107.6, 122.8, 138];
  const shapes = [
    { d: "M86 24a14 14 0 1 0 28 0a14 14 0 1 0 -28 0", at: [100, 29] },
    { d: "M66 66 C62 40 138 40 134 66 Z", at: [100, 60] },
    { d: "M50 92 C40 74 58 64 66 66 L134 66 C142 64 160 74 150 92 Z", at: [100, 84] },
    { d: "M40 118 C28 100 44 90 50 92 L150 92 C156 90 172 100 160 118 Z", at: [100, 110] },
    ...top.slice(0, 5).map((x, i) => ({
      d: `M${x} 118 L${top[i + 1]} 118 L${bot[i + 1]} 205 L${bot[i]} 205 Z`,
      at: [(x + top[i + 1] + bot[i] + bot[i + 1]) / 4, 166],
    })),
  ];
  const regs = shapes.map((sh, i) =>
    `<path class="wbk-reg" data-v="${values[i]}" d="${sh.d}"/>`
    + `<text x="${sh.at[0]}" y="${sh.at[1]}">${values[i]}</text>`).join("");
  return `<svg viewBox="0 0 200 212" role="img" aria-label="كب كيك للتلوين بالأرقام">`
    + `<path class="wbk-stem" d="M100 11 C102 5 108 2 114 1"/>${regs}</svg>`;
}

/** الشكل كرسمة SVG من نفس نقط خطّه (مربع ٠–١٠٠). */
function shapeSvg(key, cls) {
  const d = WB_SHAPES[key].strokes.map((st) => st.map(([x, y], i) => (i ? "L" : "M") + x + " " + y).join("") + "Z").join("");
  return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><path d="${d}"/></svg>`;
}

/** الروبوت (WB_ROBOT_PARTS بنفس الترتيب): قبعة مثلث · نجمة · راس دايرة · رقبة ومربع الجسم ·
 *  دراعين مستطيل · إيدين دواير · رجلين مستطيل · رجلين بيضاوى · قلب. */
function robotSvg(values) {
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180, r = i % 2 ? 7 : 16;
    return `${(166 + r * Math.cos(a)).toFixed(1)},${(30 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  const parts = [
    [`<polygon points="100,6 122,40 78,40"/>`, [100, 32]],
    [`<polygon points="${star}"/>`, [166, 34]],
    [`<circle cx="100" cy="60" r="20"/>`, [100, 65]],
    [`<rect x="91" y="80" width="18" height="12"/>`, [100, 90]],
    [`<rect x="70" y="92" width="60" height="60"/>`, [100, 128]],
    [`<rect x="32" y="100" width="40" height="14" transform="rotate(35 70 107)"/>`, [52, 99]],
    [`<rect x="128" y="100" width="40" height="14" transform="rotate(-35 130 107)"/>`, [148, 99]],
    [`<circle cx="36" cy="80" r="10"/>`, [36, 85]],
    [`<circle cx="164" cy="80" r="10"/>`, [164, 85]],
    [`<rect x="78" y="152" width="16" height="44"/>`, [86, 178]],
    [`<rect x="106" y="152" width="16" height="44"/>`, [114, 178]],
    [`<ellipse cx="80" cy="204" rx="16" ry="9"/>`, [80, 209]],
    [`<ellipse cx="120" cy="204" rx="16" ry="9"/>`, [120, 209]],
    [`<path d="M30 168 C24 156 8 160 12 174 C14 182 24 188 30 194 C36 188 46 182 48 174 C52 160 36 156 30 168 Z"/>`, [30, 180]],
  ];
  const regs = parts.map(([shape, [x, y]], i) =>
    shape.replace(/^<(\w+)/, `<$1 class="wbk-reg" data-v="${values[i]}"`) + `<text x="${x}" y="${y}">${values[i]}</text>`).join("");
  return `<svg viewBox="0 0 200 220" role="img" aria-label="روبوت من الأشكال للتلوين">${regs}</svg>`;
}

/** شمع على تورتة (صفر شمعة = تورتة من غير شمع) — لمباراة الصفر. */
function candlesOf(k) {
  const g = el("span", "wbk-cake-candles");
  g.innerHTML = `<span class="wbk-candles">${"🕯️".repeat(k) || "&nbsp;"}</span><span class="wbk-cake-base">🎂</span>`;
  g.setAttribute("aria-label", `${k} شمع`);
  return g;
}

/** رسمة خط من تمارين ما قبل الكتابة (نفس نقطه). */
function lineSvg(id) {
  const ln = PREWRITING.find((p) => p.id === id);
  const d = ln.strokes.map((st) => st.map(([x, y], i) => (i ? "L" : "M") + x + " " + y).join("")).join("");
  return `<svg class="wbk-linesvg" viewBox="0 0 100 100" aria-hidden="true"><path d="${d}"/></svg>`;
}

/** ساعة بعقربين: الطويل فوق عند ١٢، والقصير على الساعة h. h = null ⇒ من غير قصير (ارسم الساعة).
 *  `pick` ⇒ الأرقام نفسها بتتلمس (كل رقم جوّه دايرة كبيرة سهلة اللمس). */
function clockSvg(h, pick = false) {
  const nums = Array.from({ length: 12 }, (_, i) => {
    const v = i + 1, a = ((v * 30 - 90) * Math.PI) / 180;
    const x = 50 + 37 * Math.cos(a), y = 50 + 37 * Math.sin(a);
    return pick
      ? `<g class="wbk-hr" data-h="${v}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8"/><text x="${x.toFixed(1)}" y="${(y + 3.6).toFixed(1)}">${v}</text></g>`
      : `<text x="${x.toFixed(1)}" y="${(y + 3.6).toFixed(1)}">${v}</text>`;
  }).join("");
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i * 6 * Math.PI) / 180, r0 = i % 5 ? 45 : 43;
    return `<line x1="${(50 + r0 * Math.cos(a)).toFixed(1)}" y1="${(50 + r0 * Math.sin(a)).toFixed(1)}" x2="${(50 + 47 * Math.cos(a)).toFixed(1)}" y2="${(50 + 47 * Math.sin(a)).toFixed(1)}"/>`;
  }).join("");
  let hour = "";
  if (h != null) {
    const a = ((h * 30 - 90) * Math.PI) / 180;
    hour = `<line class="wbk-hand-h" x1="50" y1="50" x2="${(50 + 22 * Math.cos(a)).toFixed(1)}" y2="${(50 + 22 * Math.sin(a)).toFixed(1)}"/>`;
  }
  return `<svg class="wbk-clock" viewBox="0 0 100 100" role="img" aria-label="${h != null ? h + ":00" : "ساعة"}">`
    + `<circle class="wbk-clock-rim" cx="50" cy="50" r="48"/><g class="wbk-clock-ticks">${ticks}</g>${nums}`
    + `<line class="wbk-hand-m" x1="50" y1="50" x2="50" y2="14"/>${hour}<circle cx="50" cy="50" r="3"/></svg>`;
}
/** ساعة صغيرة (للتوصيل والاختيار). */
function clockFace(h) {
  const g = el("span", "wbk-clockface");
  g.innerHTML = clockSvg(h);
  g.setAttribute("aria-label", `${h} ساعة`);
  return g;
}
