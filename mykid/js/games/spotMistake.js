// ===== «غلطة ميزو» — الشاشة (الفكرة الخامسة، المالك ٢٠٢٦-١٠-٣١) =====
// ميزو بيقول: «يا خبر! أنا كتبت كلمة … وغلطت فى حرف. دوّر على الحرف الغلط وطلّعه». الكلمة حروف منفصلة (كل حرف
// بشكله الموصول)، والطفل يلمس الحرف الغلط ⇒ بيطلع لفوق ويختفى ومكانه «؟» ⇒ يختار الصح من ٣ ⇒ بيرجع مكانه أخضر.
// لمس حرف صح: «الحرف ده مكتوب صح. دوّر تانى» (من غير «غلط» للطفل — الغلطة غلطة ميزو).
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, finishActivity, mizoBuddy } from "./common.js";
import { femAdapt } from "../data/mizo.js";
import { starredLetters } from "../data/letterRecall.js";
import { nameOf } from "../data/blankWrite.js";
import { SP_SAY, spotRounds, SPOT_LETTERS } from "../data/spotMistake.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const el = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; };
const btn = (css, text, fn) => { const b = el("button", css, text); b.type = "button"; b.addEventListener("click", fn); return b; };
const TILE = "min-width:1.1em;padding:2px 6px;border-radius:14px;border:3px solid #e0e7ff;background:#fff;font-weight:900;font-size:clamp(34px,10vw,52px);line-height:1.25;color:#1e1b4b;cursor:pointer;transition:transform .5s,opacity .5s";

export function renderSpotMistake({ regionId, regionIndex, lang = "ar" }) {
  const ar = lang === "ar";
  const voice = ar ? "ar-EG" : "en-US";
  const screen = el("div");
  screen.className = "region-screen";
  screen.style.background = ar ? "linear-gradient(180deg,#ffe4e6,#fda4af)" : "linear-gradient(180deg,#e0f2fe,#7dd3fc)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(SP_SAY.title, back));
  const SAY_CSS = "text-align:center;font-weight:800;color:#3b2a6b;font-size:clamp(17px,4.8vw,23px);margin:10px 12px";
  const stage = el("div", "padding-bottom:24px");
  screen.append(stage);
  const buddy = mizoBuddy();
  const say = (t) => Speech.ar(fem(t));
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(() => { if (screen.isConnected) fn(); }, ms));

  function play(rounds) {
    let r = 0;
    const round = () => {
      if (r >= rounds.length) return finishActivity({ regionId, regionIndex, stars: 5, onDone: back });
      const x = rounds[r];
      stage.replaceChildren();
      const talk = el("p", SAY_CSS);
      talk.textContent = `${fem(SP_SAY.intro1)} «${x.w}» ${fem(SP_SAY.intro2)}`;
      const card = el("div", "background:#fff;border-radius:22px;box-shadow:0 6px 0 rgba(0,0,0,.1);padding:10px 14px 14px;margin:6px auto;max-width:min(92vw,460px);text-align:center");
      const pic = btn("display:block;margin:2px auto;font-size:clamp(70px,20vw,110px);line-height:1.1;background:none;border:0;cursor:pointer", x.e, () => { Sfx.tap(); Speech.say(x.w, { lang: voice }); });
      pic.setAttribute("aria-label", "اسمع الكلمة");
      const row = el("div", "display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:6px 0;font-family:'Baloo Bhaijaan 2',sans-serif");
      row.dir = ar ? "rtl" : "ltr";
      const hint = el("p", SAY_CSS + ";color:#be123c;min-height:1.3em;font-size:clamp(15px,4.2vw,19px)");
      const opts = el("div", "display:flex;gap:10px;justify-content:center;margin:10px 0");
      let found = false, mistakes = 0;
      const tiles = x.tiles.map((t, i) => {
        const b = btn(TILE, t, () => {
          if (found) return;
          if (i !== x.at) {
            mistakes++;
            Sfx.wrong();
            b.animate([{ transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "none" }], { duration: 300 });
            hint.textContent = fem(SP_SAY.notThis); say(SP_SAY.notThis);
            return;
          }
          // لقاه: الحرف بيطلع من الكلمة لفوق، ومكانه «؟»
          found = true;
          Sfx.pop();
          b.style.transform = "translateY(-60px) rotate(-20deg)";
          b.style.opacity = "0";
          later(() => {
            b.style.transition = "none";
            b.style.transform = ""; b.style.opacity = "1";
            b.textContent = ar ? "؟" : "?";
            b.style.borderStyle = "dashed"; b.style.borderColor = "#8b5cf6"; b.style.color = "#8b5cf6";
            showOptions(b);
          }, 550);
          const t2 = x.type === "form" ? SP_SAY.foundForm : SP_SAY.foundLetter;
          hint.textContent = fem(t2); say(t2);
        });
        b.setAttribute("aria-label", `حرف ${i + 1} من الكلمة`);
        if (i === x.at) b.dataset.wrong = "1";
        row.append(b);
        return b;
      });
      function showOptions(slot) {
        opts.replaceChildren();
        for (const o of x.options) {
          const ob = btn("min-width:72px;font-size:clamp(34px,9vw,46px);font-weight:900;font-family:'Baloo Bhaijaan 2',sans-serif", o, () => {
            if (o !== x.answer) {
              mistakes++;
              Sfx.wrong();
              ob.classList.add("wrong"); setTimeout(() => ob.classList.remove("wrong"), 450);
              hint.textContent = fem(SP_SAY.pickWrong); say(SP_SAY.pickWrong);
              return;
            }
            // الحرف الصح بيرجع مكانه — والكلمة كلها بشكلها الصح
            ob.classList.add("correct");
            Sfx.correct();
            buddy.win();
            awardStars(mistakes ? 1 : 2);
            tiles.forEach((t, i) => { t.textContent = x.fixed[i]; });
            slot.style.borderStyle = "solid"; slot.style.borderColor = "#16a34a"; slot.style.color = "#16a34a"; slot.style.background = "#dcfce7";
            hint.textContent = fem(SP_SAY.fixed);
            say(SP_SAY.fixed);
            later(() => Speech.say(x.w, { lang: voice }), 2000);
            later(() => { r++; round(); }, 3800);
          });
          ob.className = "choice";
          if (o === x.answer) ob.dataset.good = "1";
          opts.append(ob);
        }
      }
      card.append(pic, row, opts);
      stage.append(talk, card, buddy.el, hint);
      Speech.sequence([{ text: fem(SP_SAY.intro1), lang: "ar-EG" }, { text: x.w, lang: voice }, { text: fem(SP_SAY.intro2), lang: "ar-EG" }], 150);
    };
    round();
  }

  function chooser() {
    stage.replaceChildren(el("p", SAY_CSS, fem(SP_SAY.choose)));
    const letters = SPOT_LETTERS[lang];
    const starred = starredLetters(lang, ar ? Store.letterbookDone : Store.englishbookDone);
    const grid = el("div", "display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:min(94vw,620px);margin:0 auto 24px");
    grid.dir = ar ? "rtl" : "ltr";
    const mix = btn("font-size:20px", SP_SAY.mix, () => { Sfx.tap(); play(spotRounds(lang, starred.length >= 2 ? starred : letters)); });
    mix.className = "candy-btn";
    grid.append(mix);
    for (const ch of [...letters.filter((c) => starred.includes(c)), ...letters.filter((c) => !starred.includes(c))]) {
      const b = btn("min-width:64px;font-size:32px;font-weight:900;position:relative", ar ? ch : `${ch}${ch.toLowerCase()}`, () => {
        Sfx.tap();
        Speech.say(ar ? nameOf(ch) : ch, { lang: voice });
        play(spotRounds(lang, [ch]));
      });
      b.className = "choice";
      if (starred.includes(ch)) b.append(el("span", "position:absolute;top:-8px;inset-inline-end:-6px;font-size:16px", "⭐"));
      grid.append(b);
    }
    stage.append(grid);
    say(SP_SAY.choose);
  }
  setTimeout(chooser, 0);
  return screen;
}
