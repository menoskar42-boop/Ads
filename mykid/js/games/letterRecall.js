// ===== «صور الحروف» و«اكتب من الذاكرة» (المالك ٢٠٢٦-١٠-٢٦) — الشاشة =====
// mode = "pics":  الطفل يختار حرف (اللى عليه نجمة الأول) أو «كل حروفى ⭐» → ٦ جولات:
//                 صورة ← «بتبدأ بحرف إيه؟» · و«اختار الصورة اللى بتبدأ بحرف …»
// mode = "write": ميزو يقول الحرف (من حروف النجمة بس) والطفل يكتبه **من غير ما يشوفه**.
//                 لو النسبة قليلة: الحرف بيبان ثانيتين («بص عليه كويس») وبعدين يكتبه تانى لوحده.
// mode = "connect": «وصّل الحرف بالصورة» — عمود حروف وعمود صور، والطفل يسحب خط من الحرف لصورته
//                 (أو يلمس الحرف وبعدين الصورة). ٣ جولات × ٤ حروف، حروف النجمة الأول.
// lang = "ar" | "en". back = "letterbook" | "englishbook" لو جاى من جوّه الكتاب.
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
import { fixMsg } from "../data/writingPhrases.js";
import { penBoardOptions } from "./grip.js";
import {
  RECALL_SAY, starredLetters, pickableLetters, picRounds, writePlan, letterName, connectRounds,
  numberConnectRounds, starredNumbers,
} from "../data/letterRecall.js";
import { mountConnect } from "./connectBoard.js";
import { WB_AR } from "../data/workbook.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const el = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; };
const SAY_CSS = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(17px,4.8vw,24px);margin:10px 12px";

export function renderLetterRecall({ regionId, regionIndex, mode = "pics", lang = "ar", title, bg, back: backTo }) {
  const S = RECALL_SAY[lang];
  const isNum = lang === "num"; // «وصّل الرقم بالصورة» — أرقام النجمة من «كراسة الأرقام»
  const isAr = lang === "ar" || isNum;
  const voice = isAr ? "ar-EG" : "en-US";
  const starred = isNum ? starredNumbers(Store.workbookDone)
    : starredLetters(lang, isAr ? Store.letterbookDone : Store.englishbookDone);

  const screen = el("div");
  screen.className = "region-screen";
  screen.style.background = bg || (isAr ? "linear-gradient(180deg,#ffe0a8,#ff9f5a)" : "linear-gradient(180deg,#bfe3ff,#7aa8f0)");
  const back = () => (backTo ? Router.go(backTo, { regionId, regionIndex }) : Router.go("region", { id: regionId, index: regionIndex }));
  screen.appendChild(gameTopbar(title || (mode === "write" ? "🧠 اكتب من الذاكرة" : mode === "connect" ? (isNum ? "🔗 وصّل الرقم بالصورة" : "🔗 وصّل الحرف بالصورة") : "🖼️ صور الحروف"), back));
  const stage = el("div");
  screen.appendChild(stage);
  let cleanup = () => {};
  const clear = () => { cleanup(); cleanup = () => {}; stage.replaceChildren(); };
  const sayAr = (t) => Speech.ar(fem(t));

  const noStars = () => {
    clear();
    stage.append(el("p", SAY_CSS, fem(S.noStars)));
    const go = el("button", "display:block;margin:12px auto", isAr ? "📗 افتح كراسة الحروف" : "📘 افتح كتاب الإنجليزى");
    go.className = "candy-btn";
    go.addEventListener("click", () => { Sfx.tap(); Router.go(isAr ? "letterbook" : "englishbook", { regionId, regionIndex }); });
    stage.append(go);
    sayAr(S.noStars);
  };

  // ── صور الحروف ────────────────────────────────────────────────────────────
  function chooser() {
    clear();
    stage.append(el("p", SAY_CSS, fem(S.choose)));
    const grid = el("div", "display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:min(94vw,620px);margin:0 auto 24px");
    grid.dir = isAr ? "rtl" : "ltr";
    if (starred.length >= 2) {
      const all = el("button", "font-size:20px", "⭐ كل حروفى");
      all.className = "candy-btn";
      all.addEventListener("click", () => { Sfx.tap(); playPics(null); });
      grid.append(all);
    }
    for (const ch of pickableLetters(lang, starred)) {
      const b = el("button", "min-width:64px;font-size:32px;font-weight:900;position:relative");
      b.className = "choice";
      b.textContent = isAr ? ch : `${ch}${ch.toLowerCase()}`;
      if (starred.includes(ch)) b.append(el("span", "position:absolute;top:-8px;inset-inline-end:-6px;font-size:16px", "⭐"));
      b.addEventListener("click", () => { Sfx.tap(); Speech.say(letterName(lang, ch), { lang: voice }); playPics(ch); });
      grid.append(b);
    }
    stage.append(grid);
    sayAr(S.choose);
  }

  function playPics(ch) {
    const rounds = picRounds(lang, ch, ch ? starred : starred);
    let i = 0;
    const buddy = mizoBuddy();
    const next = () => {
      if (i >= rounds.length) return finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
      clear();
      const r = rounds[i];
      const name = letterName(lang, r.ch);
      const ask = r.kind === "letter" ? S.whichLetter(r.pic.w) : S.whichPicture(name);
      stage.append(el("p", SAY_CSS + ";opacity:.85;font-size:15px", `${i + 1} من ${rounds.length}`));
      if (r.kind === "letter") {
        stage.append(el("div", "text-align:center;font-size:clamp(90px,26vw,150px);line-height:1;margin:4px", r.pic.e));
        stage.append(el("p", SAY_CSS + ";font-size:clamp(26px,7vw,36px)", r.pic.w));
      }
      stage.append(el("p", SAY_CSS, ask));
      stage.append(buddy.el);
      const row = el("div");
      row.className = "choice-row";
      const ok = (b) => {
        b.classList.add("correct");
        Sfx.correct();
        buddy.win();
        awardStars(1);
        Speech.say(S.starts(r.pic.w, name), { lang: voice });
        i++;
        setTimeout(next, 1900);
      };
      const bad = (b) => {
        b.classList.add("wrong");
        Sfx.wrong();
        buddy.lose();
        setTimeout(() => b.classList.remove("wrong"), 450);
      };
      if (r.kind === "letter") {
        for (const o of r.options) {
          const b = el("button", "font-size:40px;font-weight:900;min-width:76px", isAr ? o : `${o}${o.toLowerCase()}`);
          b.className = "choice";
          b.addEventListener("click", () => (o === r.ch ? ok(b) : bad(b)));
          row.append(b);
        }
      } else {
        for (const o of r.options) {
          const b = el("button", "font-size:58px;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:96px");
          b.className = "choice choice-img";
          b.append(el("span", "", o.pic.e), el("small", "font-size:15px;font-weight:800", o.pic.w));
          b.addEventListener("click", () => {
            Speech.say(o.pic.w, { lang: voice });
            if (o.ch === r.ch) ok(b); else bad(b);
          });
          row.append(b);
        }
      }
      stage.append(row);
      Speech.say(ask, { lang: r.kind === "letter" || !isAr ? voice : "ar-EG" });
    };
    next();
  }

  // ── اكتب من الذاكرة ───────────────────────────────────────────────────────
  function playWrite() {
    const plan = writePlan(lang, starred);
    let i = 0;
    const next = () => {
      if (i >= plan.length) return finishActivity({ regionId, regionIndex, stars: 7, onDone: back });
      clear();
      const t = plan[i];
      let fails = 0;
      stage.append(el("p", SAY_CSS + ";opacity:.85;font-size:15px", `${i + 1} من ${plan.length}`));
      // الجملة مابتتكتبش (Write capital A / اكتب حرف لام فيها شكل الحرف نفسه) — الطفل بيسمعها بس
      const ask = el("button", SAY_CSS + ";display:block;margin:6px auto;background:rgba(255,255,255,.18);border:0;border-radius:16px;padding:6px 14px;cursor:pointer", fem("🔊 اسمع ميزو واكتب الحرف"));
      ask.addEventListener("click", () => { Sfx.tap(); Speech.say(t.say, { lang: voice }); });
      const hint = el("p", SAY_CSS + ";font-size:clamp(15px,4.2vw,19px);min-height:1.4em");
      const wrap = el("div");
      wrap.className = "wbk-write";
      stage.append(ask, wrap, hint);
      const board = mountWriteBoard(wrap, {
        ...penBoardOptions((text) => { hint.textContent = text; }),
        strokes: strokesFor(t.glyph),
        level: 3,
        free: true,
        noStart: true,
        hideModel: true,
        onHint: (text) => { hint.textContent = text; },
        onDone: ({ score, result }) => {
          if (score != null && score < SCORE_PASS) {
            fails++;
            hint.textContent = `${score}٪ · ${fem(fixMsg(result && result.issue))}`;
            // نسى شكل الحرف: نوريه ثانيتين وبعدين يكتبه تانى لوحده (والمرة التالتة بالصباع)
            setTimeout(() => {
              if (!wrap.isConnected) return;
              board.reset();
              sayAr(S.peek);
              board.peek(fails >= 2 ? 3500 : 2500);
              if (fails >= 3) setTimeout(() => wrap.isConnected && board.demo(), 3600);
            }, 2200);
            return;
          }
          hint.textContent = score != null ? `${score}٪ ✓` : "✓";
          Sfx.correct();
          awardStars(fails ? 1 : 2);
          board.peek(1500); // يشوف الحرف الصح جنب اللى كتبه
          Speech.say(isAr ? letterName(lang, t.ch) : t.glyph, { lang: voice });
          i++;
          setTimeout(next, 2200);
        },
      });
      const tools = el("div", "display:flex;gap:8px;justify-content:center;margin:6px 0 24px");
      const peekBtn = el("button", "", "👀 فكّرنى بالحرف");
      peekBtn.className = "candy-btn";
      peekBtn.addEventListener("click", () => { Sfx.tap(); fails++; board.peek(2500); });
      const again = el("button", "", "🔁");
      again.className = "candy-btn";
      again.addEventListener("click", () => { Sfx.tap(); board.reset(); });
      tools.append(peekBtn, again);
      stage.append(tools);
      cleanup = () => board.destroy();
      Speech.say(t.say, { lang: voice });
    };
    next();
  }

  // ── وصّل الحرف/الرقم بالصورة (حروف وأرقام النجمة بس) ─────────────────────────
  function playConnect() {
    const rounds = isNum ? numberConnectRounds(starred) : connectRounds(lang, starred);
    if (!rounds.length) {
      clear();
      stage.append(el("p", SAY_CSS, fem(S.needTwo)));
      const go = el("button", "display:block;margin:12px auto", isNum ? "🔢 افتح كراسة الأرقام" : isAr ? "📗 افتح كراسة الحروف" : "📘 افتح كتاب الإنجليزى");
      go.className = "candy-btn";
      go.addEventListener("click", () => { Sfx.tap(); Router.go(isNum ? "workbook" : isAr ? "letterbook" : "englishbook", { regionId, regionIndex }); });
      stage.append(go);
      sayAr(S.needTwo);
      return;
    }
    let ri = 0;
    const next = () => {
      if (ri >= rounds.length) return finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
      clear();
      stage.append(el("p", SAY_CSS + ";opacity:.85;font-size:15px", `${ri + 1} من ${rounds.length}`));
      stage.append(el("p", SAY_CSS, fem(S.connect)));
      const board = mountConnect(stage, connectOpts(lang, rounds[ri], () => { ri++; setTimeout(next, 2200); }));
      cleanup = () => board.destroy();
      sayAr(S.connect);
    };
    next();
  }

  setTimeout(() => {
    if (mode === "write") { if (!starred.length) noStars(); else playWrite(); }
    else if (mode === "connect") playConnect();
    else chooser();
  }, 0);
  return screen;
}

/**
 * إعدادات لوحة «وصّل» لجولة ({letters, pictures}) — نفسها فى اللعبة وفى خطوة الكتاب.
 * lang: "ar" | "en" | "num". onDone لما كل حاجة تتوصّل.
 */
export function connectOpts(lang, round, onDone) {
  const isNum = lang === "num";
  const voice = lang === "en" ? "en-US" : "ar-EG";
  const S = RECALL_SAY[lang === "num" ? "num" : lang];
  const nameOf = (k) => (isNum ? WB_AR[k] : letterName(lang, k));
  return {
    rtl: lang !== "en",
    left: round.letters.map((k) => ({ key: String(k), label: isNum ? String(k) : lang === "ar" ? k : `${k}${k.toLowerCase()}`, k })),
    right: round.pictures.map((p) => ({ key: String(p.ch), e: p.pic.e, w: isNum ? "" : p.pic.w, small: isNum && p.pic.n > 1, p })),
    onPickLeft: (it) => Speech.say(nameOf(it.k), { lang: voice }),
    onMatch: (it) => {
      awardStars(1);
      Speech.say(isNum ? WB_AR[it.p.ch] : S.starts(it.p.pic.w, nameOf(it.p.ch)), { lang: voice });
    },
    onWrong: (it) => { if (!isNum) Speech.say(it.p.pic.w, { lang: voice }); },
    onDone,
  };
}
