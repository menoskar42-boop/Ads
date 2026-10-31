// ===== «كراسة الحروف»: كتاب اللغة العربية (المستوى الأول) — حرف حرف بالحركات =====
//
// المالك ٢٠٢٦-١٠-١٣: «ميزو يشرح كل لعبة بطريقة جذابة لطفل ٣ أو ٤ سنين… لا تجعل الطفل يحس
// إنه بليد ولا تحسّسه بالزهق… كل حرف يتاخد بالفتحة والضمة والكسرة».
// الخطوات والإجابات من `data/letterbook.js` (صافى ومتقاس)؛ هنا العرض واللمس بس — بنفس شكل
// «كراسة الأرقام» (فقاعة ميزو، الصباع اللى بيوجّه، نجمة كل خطوة) ونفس لوحة الكتابة.
// ميزو مابيقولش «غلط» أبداً: «قرّب!» وبيعيد الشرح، والغلط مابيقفلش حاجة.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { femAdapt } from "../data/mizo.js";
import { strokesFor, PREWRITING, harakaStrokes, harakaGlyph } from "../data/strokes.js";
import { mountHarakaQuiz } from "./harakaQuiz.js";
import {
  LB_UNITS, LB_PAGES, LB_HARAKAT, letterbookSteps, isLbWrite, nameOf, splitAt, joinsNext, bare, LB_DOTS_PASS,
} from "../data/letterbook.js";
import { LB_SAY, ROUND_MSG, SHOW_BELOW, fixMsg, writeIntro, HQ_SAY } from "../data/writingPhrases.js";
import { gameTopbar, finishActivity, renderEmbedded, endEmbedded } from "./common.js";
import { renderLetterPuzzle, renderFlashlight, renderEggs } from "./funGames.js";
import { renderPhonics } from "./phonics.js";
import { renderCatch } from "./catch.js";
import { renderSequence } from "./sequence.js";
import { renderReview } from "./review.js";
import { letterGrade, LB_GAME_INFO } from "../data/letterGrade.js";
import { showLetterGrade } from "./letterGradeCard.js";
import { mountWriteBoard } from "./writeBoard.js";
import { mountConnect } from "./connectBoard.js";
import { connectOpts } from "./letterRecall.js";
import { connectStepFor, starredLetters, RECALL_SAY } from "../data/letterRecall.js";
import { SCORE_PASS } from "./strokeJudge.js";
import { mountFormsGame } from "./formsPlay.js";
import { mountBlankWrite } from "./blankWrite.js";
import { nameRound, LF_KINDS } from "../data/letterForms.js";
const LF_ICON = { hands: "🤝", formComplete: "🧩", formListen: "🚂", formStamp: "🔖", nameHunt: "📛", blankWrite: "✍️" };
import { showGripCard, whenGripClosed, penBoardOptions } from "./grip.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const preLine = (id) => PREWRITING.find((p) => p.id === id);
const UNIT_COLORS = ["#8b5cf6", "#ef4444", "#f59e0b", "#3b82f6", "#16a34a"];
// لون كل حرف (زى صفحات الكتاب الملوّنة)
const LETTER_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

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

/** الكلمة والحرف المطلوب ملوّن جوّاها (الوصل العربى بيفضل زى ما هو). */
function wordHtml(w, ch) {
  const { before, letter, after } = splitAt(w, ch);
  if (letter == null) return bare(w);
  return `${before}<span class="lbk-hl">${letter}</span>${after}`;
}
/** الكلمة والحرف مكانه فراغ — بالكشيدة لو الحرف موصول باللى قبله أو بعده (كتـ…ـب). */
function gapHtml(before, letter, after) {
  const l = before ? before + (joinsNext(before[before.length - 1]) ? "ـ" : "") : "";
  const r = after ? (joinsNext(letter) ? "ـ" : "") + after : "";
  return `${l}<span class="lbk-gap">؟</span>${r}`;
}

export function renderLetterbook({ regionId, regionIndex, page: startPage, only = null }) {
  const screen = el("div", "region-screen wbk-screen lbk-screen");
  let cur = null;
  let steps = [];
  let idx = 0;
  let cleanup = () => {};
  // تقييم الحرف (المالك ٢٠٢٦-١٠-١٦): كل كتابة بنسبتها، وغلطات كل لعبة/نشاط، واللى اتعدّى
  let res = null;
  let stepWrongs = 0;
  const toRegion = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar("📕 كراسة الحروف", () => {
    Speech.stop();
    if (cur) showChooser();
    else toRegion();
  }));
  const stage = el("div", "stage wbk-stage");
  screen.appendChild(stage);

  // ===== خريطة الكراسة: وحدات الكتاب وكارت لكل صفحة — ونجمة على اللى خلص =====
  function pageCard(pg) {
    if (pg.type === "letter") return { icon: `<b class="lbk-pc-letter">${pg.ch}</b>`, label: `حرف ${nameOf(pg.ch)}` };
    if (pg.type === "review") return { icon: `<b class="lbk-pc-review">${pg.letters.join(" ")}</b>`, label: "أنا اتعلّمت" };
    return { icon: "〰️", label: "التهيئة" };
  }
  function showChooser() {
    cleanup();
    clearGuide();
    cur = null;
    stage.replaceChildren();
    const map = el("div", "wbk-map");
    const done = Store.letterbookDone;
    const nextId = (LB_PAGES.find((pg) => !done[pg.id]) || LB_PAGES[0]).id;
    const head = el("div", "wbk-maphead");
    head.innerHTML = `<img class="wbk-mizo" src="/assets/mizo/mizo-hi.webp" alt="" width="64" height="64">`;
    head.appendChild(el("p", "wbk-say", fem(LB_SAY.chooser)));
    map.appendChild(head);
    // «صور الحروف» و«اكتب من الذاكرة» (المالك ٢٠٢٦-١٠-٢٦): تمارين تتأكد إن الطفل حافظ صور كل حرف،
    // وبيكتب حروف النجمة من غير ما يشوفها (games/letterRecall.js) — والرجوع بيرجّع للكراسة/الكتاب
    const recall = el("div", "wbk-recall");
    recall.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:4px 0 12px";
    recall.append(
      button("candy-btn", "🖼️ صور الحروف", () => { Sfx.tap(); Router.go("letterRecall", { regionId, regionIndex, mode: "pics", lang: "ar", back: "letterbook" }); }),
      button("candy-btn", "🧠 اكتب من الذاكرة", () => { Sfx.tap(); Router.go("letterRecall", { regionId, regionIndex, mode: "write", lang: "ar", back: "letterbook" }); }),
      button("candy-btn", "🔗 وصّل الحرف بالصورة", () => { Sfx.tap(); Router.go("letterRecall", { regionId, regionIndex, mode: "connect", lang: "ar", back: "letterbook" }); }),
    );
    map.appendChild(recall);
    LB_UNITS.forEach((u, ui) => {
      const sec = el("section", "wbk-unit");
      sec.style.setProperty("--unit", UNIT_COLORS[ui % UNIT_COLORS.length]);
      const n = u.pages.filter((pg) => done[pg.id]).length;
      sec.appendChild(el("h3", "wbk-unit-title", `${u.title}  ${"⭐".repeat(n)}`));
      const grid = el("div", "wbk-unit-grid");
      u.pages.forEach((pg) => {
        const { icon, label } = pageCard(pg);
        const card = button("wbk-pc" + (pg.id === nextId ? " is-next" : "") + (done[pg.id] ? " is-done" : ""), "", () => { Sfx.tap(); openPage(pg); });
        card.dataset.id = pg.id;
        card.innerHTML = `<span class="wbk-pc-icon">${icon}</span><span class="wbk-pc-label">${label}</span>`
          + (done[pg.id] ? `<span class="wbk-pc-star">⭐</span>` : "")
          + (pg.id === nextId ? `<img class="wbk-pc-mizo" src="/assets/mizo/mizo-point.webp" alt="" width="44" height="44">` : "");
        card.setAttribute("aria-label", label);
        grid.appendChild(card);
      });
      sec.appendChild(grid);
      map.appendChild(sec);
    });
    stage.appendChild(map);
    Speech.ar(fem(LB_SAY.chooser));
    const nextCard = map.querySelector(".is-next");
    if (nextCard) setTimeout(() => nextCard.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
  }

  function openPage(pg) {
    cur = pg;
    steps = letterbookSteps(pg, Math.random, only); // only: أنشطة بعينها (للاختبار)
    // «وصّل الحرف بالصورة»: الجولة من حروف النجمة دلوقتى — ولو مفيش حرف تانى عليه نجمة الخطوة بتتشال
    steps = steps.flatMap((x) => {
      // «دوّر على حروف اسمك»: بس لو الحرف فى اسم الطفل
      if (x.kind === "nameHunt") return nameRound(Store.childName, x.ch) ? [x] : [];
      if (x.kind !== "connect") return [x];
      const round = connectStepFor("ar", x.ch, starredLetters("ar", Store.letterbookDone));
      return round ? [{ ...x, round }] : [];
    });
    idx = 0;
    res = {
      writes: [], writeFails: 0, games: {}, acts: {}, skipped: [],
      // الحرف بالحركة = مرتين (النقط ولوحده)
      expectedWrites: steps.filter(isLbWrite).reduce((n, x) => n + (x.kind === "harakaWrite" ? 2 : x.reps || 1), 0),
      expectedGames: steps.filter((x) => x.kind === "game").map((x) => x.game),
    };
    const i = Math.max(0, LB_PAGES.indexOf(pg));
    screen.style.setProperty("--wbk-c1", LETTER_COLORS[i % LETTER_COLORS.length]);
    screen.style.setProperty("--wbk-c2", LETTER_COLORS[(i + 3) % LETTER_COLORS.length]);
    renderStep();
  }

  // ===== رأس الصفحة: الحرف كبير + اسمه، وشريط الخطوات (✏️ كتابة · 🎲 لعب) =====
  function header() {
    const head = el("div", "wbk-head");
    const title = button("wbk-title", "", () => {
      Sfx.pop();
      if (cur.type === "letter") Speech.ar(nameOf(cur.ch));
      else Speech.ar(cur.type === "review" ? "أنا اتعلّمت" : "التهيئة");
    });
    if (cur.type === "letter") title.innerHTML = `<b>${cur.ch}</b><span>${nameOf(cur.ch)}</span>`;
    else if (cur.type === "review") title.innerHTML = `<b>🏆</b><span>${cur.letters.join(" ")}</span>`;
    else title.innerHTML = `<b>〰️</b><span>التهيئة</span>`;
    const track = el("div", "wbk-track");
    steps.forEach((s, i) => track.appendChild(el("span", "wbk-chip" + (i < idx ? " done" : i === idx ? " now" : ""),
      isLbWrite(s) || s.kind === "formTrace" ? "✏️" : s.kind === "connect" ? "🔗" : LF_ICON[s.kind] || (s.kind === "game" ? (LB_GAME_INFO[s.game] || {}).icon || "🎲" : "🎲"))));
    track.setAttribute("aria-label", `خطوة ${idx + 1} من ${steps.length}`);
    head.append(title, track);
    return head;
  }

  /** فقاعة ميزو بالتعليمات (بصيغة البنت للبنت) — لمسة على ميزو تعيدها. */
  function prompt(text) {
    const row = el("div", "wbk-prompt");
    const mizo = button("wbk-mizo-btn", "", () => { Sfx.tap(); Speech.ar(fem(text)); showGuide(true); });
    mizo.innerHTML = `<img class="wbk-mizo" src="/assets/mizo/mizo-teach.webp" alt="" width="64" height="64">`;
    mizo.setAttribute("aria-label", "ميزو: اسمع تانى");
    row.append(mizo, el("p", "wbk-say", fem(text)));
    lastPrompt = text;
    Speech.ar(fem(text));
    return row;
  }

  // ===== الصباع اللى بيوجّه: لو الطفل ساكت ٨ ثوانى ميزو يعيد الشرح والصباع يشاور =====
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

  /** سطر التشجيع/التلميح (بيتنطق) من غير ما يمسح التعليمات. */
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
  function stepDone(delay = 1000) {
    const s = steps[idx];
    if (res && s && !isLbWrite(s) && s.kind !== "game") res.acts[s.kind] = (res.acts[s.kind] || 0) + (Sfx.wrongs - stepWrongs);
    // بعد الكتابة صوت ميزو بس (من غير صوت «نجاح»)
    if (!(steps[idx] && isLbWrite(steps[idx]))) Sfx.correct();
    awardStars(1);
    clearGuide();
    const img = stage.querySelector(".wbk-prompt .wbk-mizo");
    if (img) { img.src = "/assets/mizo/mizo-cheer.webp"; img.classList.add("wbk-mizo-cheer"); }
    const body = stage.querySelector(".wbk-body");
    if (body) body.appendChild(el("div", "wbk-step-star", "⭐"));
    setTimeout(() => { if (cur) nextStep(); }, delay);
  }
  function finishPage() {
    Store.markLetterbookDone(cur.id);
    const end = () => finishActivity({ regionId, regionIndex, stars: 5, onDone: showChooser });
    // شهادة الحرف: الدرجة للطفل، والتفاصيل لولى الأمر فى الإعدادات
    if (cur.type !== "letter" || !res) return end();
    const g = letterGrade(res);
    Store.recordLetterGrade("ar", cur.ch, g);
    const pg = cur;
    cur = null;
    // بعد ما نجوم آخر خطوة تطير (عشان ماتغطّيش الدرجة)
    setTimeout(() => showLetterGrade({ glyph: pg.ch, name: nameOf(pg.ch), grade: g, onClose: end }), 900);
  }
  function renderStep() {
    cleanup();
    cleanup = () => {};
    clearGuide();
    lastPrompt = "";
    stage.replaceChildren(header());
    const s = steps[idx];
    const body = el("section", "wbk-body lbk-body wbk-step-" + s.kind);
    stage.appendChild(body);
    const skip = button("wbk-skip", "⏭", () => {
      Sfx.tap(); Speech.stop();
      if (res) res.skipped.push(s.kind === "game" ? s.game : s.kind);
      nextStep();
    });
    skip.setAttribute("aria-label", "الخطوة اللى بعدها");
    stage.appendChild(skip);
    stepWrongs = Sfx.wrongs;
    STEP[s.kind](body, s);
    armGuide();
  }

  /** كارت صورة: الإيموجى + الكلمة (والحرف ملوّن لو اتطلب). */
  function picCard(x, ch, cls = "lbk-pic") {
    const b = el("button", cls);
    b.type = "button";
    b.innerHTML = `<span class="lbk-emoji">${x.e}</span>` + (x.w ? `<span class="lbk-word">${ch ? wordHtml(x.w, ch) : bare(x.w)}</span>` : "");
    b.setAttribute("aria-label", bare(x.w || ""));
    return b;
  }

  // ===== الخطوات =====
  const STEP = {
    // استمع وانطق: الحرف كبير بلون الصفحة، وتحته الحركات التلاتة — كل لمسة بتتنطق
    meet(body, s) {
      const name = nameOf(s.ch);
      const s3 = ["a", "u", "i"].map((h) => s.ch + LB_HARAKAT[h].mark).join("، ");
      body.appendChild(prompt(LB_SAY.meet(name, s3)));
      const big = button("lbk-big", s.ch, () => { Sfx.pop(); Speech.ar(name); big.dataset.on = "1"; check(); });
      big.dataset.good = "1";
      big.setAttribute("aria-label", "حرف " + name);
      const row = el("div", "lbk-syl-row");
      const heard = new Set();
      ["a", "u", "i"].forEach((h) => {
        const v = (s.ch === "أ" && h === "i" ? "إ" : s.ch) + LB_HARAKAT[h].mark;
        const b = button("lbk-syl", "", () => {
          Sfx.pop();
          Speech.ar(v);
          b.dataset.on = "1";
          heard.add(h);
          check();
        });
        b.innerHTML = `<b>${v}</b><small>${LB_HARAKAT[h].hand} ${LB_HARAKAT[h].ar}</small>`;
        b.dataset.good = "1";
        row.appendChild(b);
      });
      let finished = false;
      function check() {
        if (!finished && big.dataset.on && heard.size === 3) { finished = true; stepDone(1400); }
      }
      body.append(big, row);
    },

    // ✏️ الكتابة: الخط العريض ← النقط ← لوحده
    write(body, s) {
      const pre = s.ch.startsWith("pre:");
      // أول كتابة للحرف (على النقط): «اكتب الحرف …»؛ ولوحده: «اكتبه لوحدك»
      const intro = pre ? preLine(s.ch.slice(4)).say
        : s.level === 1 || (s.level === 2 && idx <= 2) ? writeIntro("الحرف", nameOf(s.ch)) : s.level === 2 ? ROUND_MSG.againDots
        : s.noStart ? ROUND_MSG.noDot : LB_SAY.writeAlone;
      writeBoard(body, s.ch, s.level, intro, () => stepDone(800), s.reps || 1, !!s.noStart);
    },

    // ✏️ الحرف بالحركة (المالك ٢٠٢٦-١٠-١٩): على النقط وبعدين لوحده — كل واحدة لازم بنسبتها
    harakaWrite(body, s) {
      const g = harakaGlyph(s.ch, s.h);
      const strokes = harakaStrokes(g, s.h);
      const sylText = g + LB_HARAKAT[s.h].mark;
      const opt = { strokes, say: sylText, glyph: sylText };
      writeBoard(body, s.ch, 2, HQ_SAY.writeH(s.h), () => {
        cleanup();
        body.replaceChildren();
        writeBoard(body, s.ch, 3, ROUND_MSG.harakaAlone, () => stepDone(800), 1, false, opt);
      }, 1, false, opt);
    },

    // 👂 اسمع واعرف الحركة: لحد ما الطفل يعرف كل حركة من صوت الكلمة
    harakaQuiz(body, s) {
      body.appendChild(el("p", "lbk-game-title", "👂 اسمع واعرف الحركة"));
      const q = mountHarakaQuiz(body, { ch: s.ch, fem, onDone: () => stepDone(600) });
      cleanup = () => q.destroy();
    },

    // 🎲 لعبة من ألعاب القلعة جوّه صفحة الحرف — بنفس شكلها، على حرف الصفحة
    game(body, s) {
      const p = { regionId, regionIndex };
      const ar = { ...p, datasetKey: "arabic", lang: "ar-EG" };
      const GAMES = {
        puzzle: () => renderLetterPuzzle({ ...p, kind: "arabic", focus: s.ch }),
        flash: () => renderFlashlight({ ...p, kind: "arabic", focus: s.ch }),
        eggs: () => renderEggs({ ...p, kind: "arabic", focus: s.ch, words: (s.words || []).map((x) => ({ word: x.w, emoji: x.e })) }),
        phonics: () => renderPhonics({ ...ar, focus: s.ch, words: (s.words || []).map((x) => ({ word: x.w, emoji: x.e })) }),
        catch: () => renderCatch({ ...ar, focus: s.ch }),
        sequence: () => renderSequence({ ...ar, focus: s.ch }),
        review: () => renderReview({ ...ar, focus: s.ch }),
      };
      const info = LB_GAME_INFO[s.game] || {};
      body.appendChild(el("p", "lbk-game-title", `${info.icon || "🎲"} ${info.title || ""}`));
      const node = renderEmbedded(GAMES[s.game], ({ mistakes }) => {
        if (res) res.games[s.game] = mistakes;
        stepDone(700);
      });
      body.appendChild(node);
      cleanup = () => endEmbedded();
    },

    // فزّورة ميزو: ٣ صور والحل بيبدأ بالحرف
    riddle(body, s) {
      body.appendChild(prompt(s.text));
      const hint = hintLine();
      const row = el("div", "lbk-pics");
      s.options.forEach((x) => {
        const good = x.w === s.answer.w;
        const c = picCard(x, null);
        if (good) c.dataset.good = "1";
        c.addEventListener("click", () => {
          if (c.classList.contains("ok")) return;
          if (good) {
            c.classList.add("ok");
            c.querySelector(".lbk-word").innerHTML = wordHtml(x.w, s.ch);
            Speech.ar(bare(x.w));
            return stepDone(1600);
          }
          Sfx.wrong();
          flash(c, "wbk-wiggle");
          hint.show(LB_SAY.riddleWrong);
        });
        row.appendChild(c);
      });
      body.append(row, hint);
    },

    // «المس كل اللى فيه الحرف» (أرانب/فراشات/نجوم الكتاب) — بالونات بتتلوّن
    pop(body, s) {
      const name = nameOf(s.ch);
      body.appendChild(prompt(LB_SAY.pop(name)));
      const hint = hintLine();
      const grid = el("div", "lbk-pop");
      const need = s.cells.filter((c) => c.good).length;
      let got = 0;
      s.cells.forEach((c) => {
        const b = button("lbk-balloon", c.ch, () => {
          if (b.dataset.on) return;
          if (!c.good) { Sfx.wrong(); flash(b, "wbk-wiggle"); return hint.show(LB_SAY.popWrong(name)); }
          b.dataset.on = "1";
          Sfx.pop();
          Speech.ar(name);
          if (++got === need) stepDone(1200);
        });
        if (c.good) b.dataset.good = "1";
        grid.appendChild(b);
      });
      body.append(grid, hint);
    },

    // استمع واكتب الحرف بالحركات: الأربع كلمات زى الكتاب، وفوق كل واحدة حركة إيد الولد
    harakat(body, s) {
      body.appendChild(prompt(LB_SAY.harakat(nameOf(s.ch))));
      const grid = el("div", "lbk-hgrid");
      let heard = 0;
      s.words.forEach((x) => {
        const H = LB_HARAKAT[x.h];
        const c = el("button", "lbk-hcard");
        c.type = "button";
        c.innerHTML = `<span class="lbk-hhand" aria-hidden="true">${H.hand}</span><b class="lbk-hsyl">${x.s}</b>`
          + `<span class="lbk-emoji">${x.e}</span><span class="lbk-word">${wordHtml(x.w, s.ch)}</span><small>${H.ar}</small>`;
        c.dataset.good = "1";
        c.addEventListener("click", () => {
          Sfx.pop();
          Speech.sequence([{ text: x.s, lang: "ar-EG" }, { text: x.w, lang: "ar-EG" }]);
          flash(c, "lbk-bounce", 600);
          if (!c.dataset.on) { c.dataset.on = "1"; if (++heard === s.words.length) setTimeout(() => stepDone(1200), 1800); }
        });
        grid.appendChild(c);
      });
      body.appendChild(grid);
    },

    // 🔗 وصّل الحرف بالصورة (games/connectBoard.js) — نفس اللعبة المنفردة
    connect(body, s) {
      body.appendChild(prompt(RECALL_SAY.ar.connect));
      const board = mountConnect(body, connectOpts("ar", s.round, () => stepDone(1500)));
      cleanup = () => board.destroy();
    },

    // ستّ ألعاب أشكال الحرف (المالك ٢٠٢٦-١٠-٢٧) — نفس اللعبة اللى فى القلعة على حرف الصفحة
    ...Object.fromEntries(LF_KINDS.map((k) => [k, (body, s) => {
      let row = null;
      const hint = hintLine();
      const ask = (text) => { const p = prompt(text); if (row) row.replaceWith(p); else body.prepend(p); row = p; };
      const game = mountFormsGame(body, k, s.ch, { ask, hint: (t) => hint.show(t), onDone: () => stepDone(1200), skip: () => nextStep() });
      body.appendChild(hint);
      cleanup = () => game.destroy();
    }])),

    // ✍️ كمّل الكلمة بإيدك: يكتب الحرف بشكله مكانه فى الكلمة (games/blankWrite.js)
    blankWrite(body, s) {
      let row = null;
      const hint = hintLine();
      const ask = (text) => { const p = prompt(text); if (row) row.replaceWith(p); else body.prepend(p); row = p; };
      const game = mountBlankWrite(body, "ar", s.ch, { ask, hint: (t) => hint.show(t), onDone: () => stepDone(800) });
      body.appendChild(hint);
      cleanup = () => game.destroy();
    },

    // ضع دائرة حول الصورة اللى بتبدأ بالحرف
    starts(body, s) {
      const name = nameOf(s.ch);
      body.appendChild(prompt(LB_SAY.starts(name)));
      const hint = hintLine();
      const grid = el("div", "lbk-pics lbk-pics-6");
      const need = s.items.filter((x) => x.good).length;
      let got = 0;
      s.items.forEach((x) => {
        const c = picCard(x, null);
        if (x.good) c.dataset.good = "1";
        c.addEventListener("click", () => {
          if (c.classList.contains("ok")) return;
          Speech.ar(x.w);
          if (!x.good) { Sfx.wrong(); flash(c, "wbk-wiggle"); return setTimeout(() => hint.show(LB_SAY.startsWrong), 900); }
          c.classList.add("ok", "lbk-circled");
          c.querySelector(".lbk-word").innerHTML = wordHtml(x.w, s.ch);
          Sfx.pop();
          if (++got === need) stepDone(1500);
        });
        grid.appendChild(c);
      });
      body.append(grid, hint);
    },

    // لاحظ أشكال الحرف: أول ووسط وآخر الكلمة — الحرف ملوّن والطفل يلمس الكلمة
    forms(body, s) {
      body.appendChild(prompt(LB_SAY.forms(nameOf(s.ch))));
      const grid = el("div", "lbk-forms");
      let seen = 0;
      s.words.forEach((x) => {
        const c = picCard(x, s.ch, "lbk-pic lbk-form");
        c.insertAdjacentHTML("beforeend", `<small class="lbk-pos">${LB_SAY.formPos[x.pos]}</small>`);
        c.dataset.good = "1";
        c.addEventListener("click", () => {
          Sfx.pop();
          Speech.sequence([{ text: bare(x.w), lang: "ar-EG" }, { text: LB_SAY.formPos[x.pos], lang: "ar-EG" }]);
          flash(c, "lbk-bounce", 600);
          if (!c.dataset.on) { c.dataset.on = "1"; c.classList.add("ok"); if (++seen === s.words.length) setTimeout(() => stepDone(1000), 2200); }
        });
        grid.appendChild(c);
      });
      body.appendChild(grid);
    },

    // حط دايرة حوالين الحرف (المالك ٢٠٢٦-١٠-١٤): كلمة وصورتها، والطفل يلمس الحرف فى الكلمة
    // فيترسم حواليه دايرة — فى أول الكلمة، وبعدين آخرها، وبعدين وسطها
    circle(body, s) {
      const name = nameOf(s.ch);
      let r = 0;
      const round = () => {
        const x = s.words[r];
        const hint = hintLine();
        const card = el("div", "lbk-circle-card");
        const pic = button("lbk-circle-pic", x.e, () => { Sfx.tap(); Speech.ar(x.w); });
        pic.setAttribute("aria-label", x.w);
        const ref = el("span", "lbk-circle-ref", s.ch);
        ref.setAttribute("aria-hidden", "true");
        const word = el("div", "lbk-circle-word");
        word.setAttribute("dir", "rtl");
        let done = false;
        x.tiles.forEach((t, i) => {
          const good = x.good.includes(i);
          const b = button("lbk-tile", t, () => {
            if (done) return;
            if (!good) { Sfx.wrong(); flash(b, "wbk-wiggle"); return hint.show(LB_SAY.circleWrong(name)); }
            done = true;
            b.classList.add("lbk-ringed", "ok");
            Sfx.pop();
            Speech.ar(x.w);
            if (++r < s.words.length) setTimeout(() => { if (body.isConnected) round(); }, 1800);
            else stepDone(1800);
          });
          b.setAttribute("aria-label", `حرف ${i + 1} من الكلمة`);
          if (good) b.dataset.good = "1";
          word.appendChild(b);
        });
        card.append(pic, word);
        body.replaceChildren(prompt(LB_SAY.circle(name, x.pos)), ref, card, hint);
      };
      round();
    },

    // اكتب الحرف الناقص: الكلمة ناقصة حرف — يختاره (والخطوة اللى بعدها يكتبه لوحده)
    missing(body, s) {
      body.appendChild(prompt(LB_SAY.missing));
      const hint = hintLine();
      const pic = el("button", "lbk-pic lbk-pic-big");
      pic.type = "button";
      pic.innerHTML = `<span class="lbk-emoji">${s.e}</span><span class="lbk-word">${gapHtml(s.before, s.letter, s.after)}</span>`;
      pic.addEventListener("click", () => { Sfx.tap(); Speech.ar(bare(s.w)); });
      const opts = el("div", "wbk-opts");
      s.options.forEach((o) => {
        const good = o === s.ch;
        const b = button("wbk-opt lbk-opt", o, () => {
          if (b.classList.contains("correct")) return;
          if (!good) { Sfx.wrong(); flash(b, "wbk-wiggle"); return hint.show(LB_SAY.missingWrong); }
          b.classList.add("correct");
          pic.querySelector(".lbk-word").innerHTML = wordHtml(s.w, s.ch);
          Speech.ar(bare(s.w));
          stepDone(1800);
        });
        if (good) b.dataset.good = "1";
        opts.appendChild(b);
      });
      body.append(pic, opts, hint);
      setTimeout(() => Speech.ar(bare(s.w)), 2600);
    },

    // ===== التهيئة: صل الصورة بضلّها (المس الصورة وبعدين الضل — الضل بيتلوّن) =====
    shadow(body, s) {
      body.appendChild(prompt(LB_SAY.shadow));
      pairGame(body, s.pairs.map((x) => ({ key: x.e, x })), s.shadows.map((x) => ({ key: x.e, x })),
        (it) => { const c = picCard({ e: it.x.e }, null, "lbk-pic lbk-mini"); return c; },
        (it) => { const c = picCard({ e: it.x.e }, null, "lbk-pic lbk-mini lbk-shadow"); return c; },
        (it) => Speech.ar(it.x.w), LB_SAY.shadowWrong);
    },

    // ===== المراجعة «أنا اتعلّمت» =====
    // لوّن الحروف اللى اتعلمناها (من وسط حروف تانية)
    colorLearned(body, s) {
      body.appendChild(prompt(LB_SAY.colorLearned));
      const hint = hintLine();
      const grid = el("div", "lbk-pop");
      let got = 0;
      s.cells.forEach((c) => {
        const b = button("lbk-balloon lbk-outline", c.ch, () => {
          if (b.dataset.on) return;
          if (!c.good) { Sfx.wrong(); flash(b, "wbk-wiggle"); return hint.show(LB_SAY.colorWrong); }
          b.dataset.on = "1";
          Sfx.pop();
          Speech.ar(nameOf(c.ch));
          if (++got === s.letters.length) stepDone(1200);
        });
        if (c.good) b.dataset.good = "1";
        grid.appendChild(b);
      });
      body.append(grid, hint);
    },

    // صل كل صورة بأول حرف فيها
    matchFirst(body, s) {
      body.appendChild(prompt(LB_SAY.matchFirst));
      pairGame(body, s.pics.map((x) => ({ key: x.ch, x })), s.letters.map((ch) => ({ key: ch, x: { ch } })),
        (it) => picCard(it.x, null, "lbk-pic lbk-mini"),
        (it) => button("lbk-balloon lbk-letter", it.x.ch, () => {}),
        (it) => Speech.ar(it.x.w ? bare(it.x.w) : nameOf(it.x.ch)), LB_SAY.matchWrong);
    },

    // انطق والمس الصورتين اللى بيبدأوا بنفس الصوت (٣ صفوف)
    sameSound(body, s) {
      body.appendChild(prompt(LB_SAY.sameSound));
      const hint = hintLine();
      const need = s.rows.length * 2;
      let got = 0;
      const rows = el("div", "lbk-rows");
      s.rows.forEach((row) => {
        const r = el("div", "lbk-row");
        row.items.forEach((x) => {
          const c = picCard(x, null, "lbk-pic lbk-mini");
          if (x.good) c.dataset.good = "1";
          c.addEventListener("click", () => {
            if (c.classList.contains("ok")) return;
            Speech.ar(x.w);
            if (!x.good) { Sfx.wrong(); flash(c, "wbk-wiggle"); return setTimeout(() => hint.show(LB_SAY.sameWrong), 900); }
            c.classList.add("ok", "lbk-circled");
            c.querySelector(".lbk-word").innerHTML = wordHtml(x.w, row.ch);
            Sfx.pop();
            if (++got === need) stepDone(1400);
          });
          r.appendChild(c);
        });
        rows.appendChild(r);
      });
      body.append(rows, hint);
    },

    // موضع الحرف فى الكلمة: ٣ خانات (أول · وسط · آخر) من اليمين للشمال زى الكتاب
    position(body, s) {
      const hint = hintLine();
      const area = el("div", "lbk-round");
      let r = 0;
      const show = () => {
        const x = s.rounds[r];
        area.replaceChildren(prompt(LB_SAY.position(nameOf(x.ch))));
        const pic = picCard(x, x.ch, "lbk-pic lbk-pic-big");
        pic.addEventListener("click", () => { Sfx.tap(); Speech.ar(bare(x.w)); });
        const boxes = el("div", "lbk-boxes");
        [0, 1, 2].forEach((p) => {
          const good = p === x.pos;
          const b = button("lbk-box", "", () => {
            if (b.dataset.on) return;
            if (!good) { Sfx.wrong(); flash(b, "wbk-wiggle"); return hint.show(LB_SAY.positionWrong); }
            b.dataset.on = "1";
            b.textContent = x.ch;
            Sfx.correct();
            Speech.ar(LB_SAY.formPos[p]);
            setTimeout(() => { if (++r >= s.rounds.length) stepDone(800); else show(); }, 1600);
          });
          b.setAttribute("aria-label", LB_SAY.formPos[p]);
          if (good) b.dataset.good = "1";
          boxes.appendChild(b);
        });
        area.append(pic, boxes);
      };
      body.append(area, hint);
      show();
    },

    // اقرأ ولوّن الصورة المناسبة: اللافتة عليها «بُ» ← بُرتقال مش بَقرة
    harakaPic(body, s) {
      const hint = hintLine();
      const area = el("div", "lbk-round");
      let r = 0;
      const show = () => {
        const x = s.rounds[r];
        area.replaceChildren(prompt(LB_SAY.harakaPic(x.s)));
        const sign = button("lbk-sign", "", () => { Sfx.tap(); Speech.ar(x.s); });
        sign.innerHTML = `<b>${x.s}</b><small>${LB_HARAKAT[x.h].hand}</small>`;
        const row = el("div", "lbk-pics");
        x.options.forEach((o) => {
          const c = picCard(o, null);
          if (o.good) c.dataset.good = "1";
          c.addEventListener("click", () => {
            if (c.classList.contains("ok")) return;
            Speech.ar(o.w);
            if (!o.good) { Sfx.wrong(); flash(c, "wbk-wiggle"); return setTimeout(() => hint.show(LB_SAY.harakaWrong), 900); }
            c.classList.add("ok", "lbk-circled");
            c.querySelector(".lbk-word").innerHTML = wordHtml(o.w, x.ch);
            setTimeout(() => { if (++r >= s.rounds.length) stepDone(800); else show(); }, 1700);
          });
          row.appendChild(c);
        });
        area.append(sign, row);
        setTimeout(() => Speech.ar(x.s), 2400);
      };
      body.append(area, hint);
      show();
    },

    // انطق ثم اكتب الكلمة: قطعتين بازل (حرف + حرف) = كلمة — اختار صورتها
    build(body, s) {
      body.appendChild(prompt(LB_SAY.build(nameOf(s.a), nameOf(s.b))));
      const hint = hintLine();
      const eq = el("div", "lbk-eq");
      const pa = button("lbk-piece", s.a, () => { Sfx.tap(); Speech.ar(nameOf(s.a)); });
      const pb = button("lbk-piece", s.b, () => { Sfx.tap(); Speech.ar(nameOf(s.b)); });
      const ans = el("span", "lbk-piece lbk-piece-ans", "؟");
      eq.append(pa, el("span", "wbk-op", "+"), pb, el("span", "wbk-op", "="), ans);
      const row = el("div", "lbk-pics");
      s.options.forEach((o) => {
        const good = o.w === s.w;
        const c = picCard({ e: o.e, w: "" }, null);
        if (good) c.dataset.good = "1";
        c.addEventListener("click", () => {
          if (c.classList.contains("ok")) return;
          if (!good) { Sfx.wrong(); flash(c, "wbk-wiggle"); return hint.show(LB_SAY.buildWrong); }
          c.classList.add("ok", "lbk-circled");
          ans.textContent = s.w;
          Speech.ar(s.w);
          stepDone(1600);
        });
        row.appendChild(c);
      });
      body.append(eq, row, hint);
    },
  };

  /** توصيل عمودين (صورة ↔ ضلّها، صورة ↔ حرفها): المس من اليمين وبعدين من الشمال. */
  function pairGame(body, leftItems, rightItems, makeLeft, makeRight, say, wrongText) {
    const hint = hintLine();
    const wrap = el("div", "lbk-pair");
    const colA = el("div", "lbk-col");
    const colB = el("div", "lbk-col");
    let sel = null;
    let done = 0;
    const lefts = leftItems.map((it) => {
      const c = makeLeft(it);
      c.dataset.good = "1";
      c.dataset.key = it.key;
      c.addEventListener("click", () => {
        if (c.classList.contains("ok")) return;
        Sfx.tap();
        say(it);
        lefts.forEach((x) => x.el.classList.remove("sel"));
        c.classList.add("sel");
        sel = it;
      });
      colA.appendChild(c);
      return { it, el: c };
    });
    rightItems.forEach((it) => {
      const c = makeRight(it);
      c.dataset.key = it.key;
      c.addEventListener("click", () => {
        if (c.classList.contains("ok")) return;
        if (!sel) { Sfx.tap(); flash(colA, "wbk-wiggle"); return; }
        if (sel.key !== it.key) { Sfx.wrong(); flash(c, "wbk-wiggle"); return hint.show(wrongText); }
        const L = lefts.find((x) => x.it === sel);
        L.el.classList.remove("sel");
        L.el.classList.add("ok");
        c.classList.add("ok");
        Sfx.pop();
        say(it);
        sel = null;
        if (++done === leftItems.length) stepDone(1200);
      });
      colB.appendChild(c);
    });
    // الصباع: الأول على صورة لسه ماتوصّلتش، ولو فيه صورة متختارة على اللى يقابلها
    guideFn = () => {
      if (sel) return [...colB.children].find((c, i) => !c.classList.contains("ok") && rightItems[i].key === sel.key) || null;
      return lefts.find((x) => !x.el.classList.contains("ok"))?.el || null;
    };
    wrap.append(colA, colB);
    body.append(wrap, hint);
  }

  /** لوحة الكتابة للحرف (أو «pre:…» خط التهيئة) بمستوى المساعدة ده. */
  function writeBoard(host, v, level, intro, done, reps = 1, noStart = false, opt = {}) {
    const line = v.startsWith("pre:") ? preLine(v.slice(4)) : null;
    // opt.strokes: الحرف بالحركة (بَ) — ونطقه opt.say
    const strokes = opt.strokes || (line ? line.strokes : strokesFor(v));
    const hint = hintLine();
    const wrap = el("div", "wbk-write");
    wrap.dataset.glyph = opt.glyph || v;
    // «٣ بالنقط + ٥ لوحده»: النقط بتعدّى بـ٧٥٪ ولوحده بـ٧٠٪، وكل مرة بتتعدّ (✓ ١/٣)
    const pass = !line && level === 2 ? LB_DOTS_PASS : SCORE_PASS;
    let got = 0;
    const count = el("p", "lbk-reps");
    const showCount = () => { count.textContent = `${level === 2 ? "🔵 على النقط" : noStart ? "🌟 من غير النقطة" : "⭐ لوحدك"} · ✓ ${got}/${reps}`; };
    if (reps > 1) { showCount(); host.appendChild(count); }
    host.appendChild(wrap);
    if (intro) host.insertBefore(prompt(intro), reps > 1 ? count : wrap);
    const board = mountWriteBoard(wrap, {
      ...penBoardOptions((text) => hint.show(text)),
      strokes,
      level,
      // «لوحده» (المالك ٢٠٢٦-١٠-١٤ — زى «ارسم الحرف»): الحرف كله من غير وقفة، والحكم بنسبة فى الآخر
      free: !line && level >= 2,
      noStart: !line && noStart,
      from: line && line.from,
      to: line && line.to,
      // من غير صوت «غلط» ولا «نجاح» على اللوحة (المالك ٢٠٢٦-١٠-١٤): صوت ميزو وكلامه بس
      onHint: (text) => hint.show(text),
      onDone: ({ fails, score, result }) => {
        const pct = () => { if (score != null) hint.textContent = `${score}٪ · ${hint.textContent}`; };
        if (score != null && score < pass) {
          if (res && !line) res.writeFails++;
          // نسبة واطية ⇒ نفس الخطوة تانى (وتحت ٥٠٪ الصباع بيوريه الأول)
          // ميزو بيقول السبب بلطف (المالك ٢٠٢٦-١٠-١٤)
          hint.show(fixMsg(result && result.issue));
          pct();
          setTimeout(() => { board.reset(); if (score < SHOW_BELOW) board.demo(); }, 2600);
          return;
        }
        if (score != null) hint.textContent = `${score}٪ ✓`;
        board.el.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 450 });
        if (!line) Speech.ar(opt.say || nameOf(v));
        if (!line && !opt.strokes && level === 3) Store.recordWrite("g:" + v, fails, level);
        if (res && !line && score != null) res.writes.push({ level, score, ...(noStart ? { noStart: true } : {}), ...(opt.glyph ? { glyph: opt.glyph } : {}) });
        got++;
        if (reps > 1) showCount();
        // لسه فيه مرات: نفس اللوحة فاضية تانى بعد ما يشوف النسبة
        if (got < reps) { setTimeout(() => { if (wrap.isConnected) board.reset(); }, 1500); return; }
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
    // الصباع بيوريه إزاى كل مرة اللوحة تتفتح (زى «ارسم الحرف» و«كراسة الأرقام»)
    showGripCard();
    whenGripClosed(() => setTimeout(() => board.demo(), 1400));
  }

  setTimeout(() => {
    const pg = startPage && LB_PAGES.find((x) => x.id === startPage);
    if (pg) openPage(pg);
    else showChooser();
  }, 0);
  return screen;
}

