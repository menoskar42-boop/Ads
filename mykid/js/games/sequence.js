// ===== لعبة "العنصر الناقص": ترتيب الحروف/الأرقام =====
// تعرض سلسلة متتالية بها فجوة، ويختار الطفل العنصر الناقص.
// تعزّز حفظ ترتيب الأبجدية والأرقام (أسلوب تسلسل مثبت علمياً).
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, progressDots, shuffle, finishActivity, diffCount, revealAnswer } from "./common.js";

const ROUNDS = 6;
const WIN = 3; // طول السلسلة المعروضة

function glyph(it) {
  return it.char || it.arDigit || it.emoji || it.name;
}
function speakName(it, lang) {
  Speech.say(it.name || it.arName || glyph(it), { lang: it.arDigit ? "ar-EG" : lang });
}

export function renderSequence({ regionId, regionIndex, datasetKey, lang, title }) {
  const ds = getDataset(datasetKey);
  const speakLang = lang || ds.lang;
  const items = ds.items;
  let round = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffe9b0,#ff9a6c)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🔢 العنصر الناقص", back));

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function render() {
    // نختار بداية عشوائية تسمح بسلسلة طولها WIN
    const start = (Math.random() * (items.length - WIN)) | 0;
    const seq = items.slice(start, start + WIN);
    const gap = 1 + ((Math.random() * (WIN - 2)) | 0); // موضع الفجوة (ليس الأول)
    const answer = seq[gap];

    stage.innerHTML = "";
    stage.appendChild(progressDots(ROUNDS, round - 1));

    const ask = document.createElement("p");
    ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(17px,4.6vw,22px)";
    ask.textContent = "ما العنصر الناقص؟";
    stage.appendChild(ask);

    // السلسلة المعروضة
    const seqRow = document.createElement("div");
    seqRow.className = "choice-row";
    seq.forEach((it, idx) => {
      const cell = document.createElement("div");
      cell.className = "choice";
      cell.style.cursor = "default";
      if (idx === gap) {
        cell.textContent = "؟";
        cell.style.background = "rgba(255,255,255,.4)";
        cell.style.color = "#fff";
        cell.dataset.gap = "1";
      } else {
        cell.innerHTML = `<span style="font-weight:800">${glyph(it)}</span>`;
        cell.addEventListener("click", () => { Sfx.pop(); speakName(it, speakLang); });
      }
      seqRow.appendChild(cell);
    });
    stage.appendChild(seqRow);

    // الخيارات
    const distractors = shuffle(items.filter((x) => x !== answer)).slice(0, diffCount(1, 2));
    const choices = shuffle([answer, ...distractors]);
    const opts = document.createElement("div");
    opts.className = "choice-row";
    opts.style.marginTop = "24px";
    let wrong = 0, correctBtn = null, solved = false;
    const fillGap = () => {
      const gapCell = seqRow.querySelector('[data-gap="1"]');
      if (gapCell) { gapCell.innerHTML = `<span style="font-weight:800">${glyph(answer)}</span>`; gapCell.style.background = "#fff"; gapCell.style.color = "var(--c-purple)"; }
    };
    const advance = () => {
      round++;
      if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 7, onDone: back }), 900);
      else setTimeout(render, 1000);
    };
    choices.forEach((c) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<span style="font-weight:800">${glyph(c)}</span>`;
      if (c === answer) correctBtn = b;
      b.addEventListener("click", () => {
        if (solved) return;
        if (c === answer) {
          solved = true;
          Sfx.correct();
          b.classList.add("correct");
          fillGap();
          awardStars(1);
          speakName(answer, speakLang);
          advance();
        } else {
          Sfx.wrong();
          b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
          // لحظة تعليمية: بعد محاولتين نُبرز الناقص ونملأه وننطقه
          if (++wrong >= 2) {
            solved = true;
            revealAnswer(correctBtn);
            fillGap();
            Speech.mizo("الناقص هو");
            setTimeout(() => speakName(answer, speakLang), 800);
            setTimeout(advance, 2000);
          }
        }
      });
      opts.appendChild(b);
    });
    stage.appendChild(opts);

    Speech.ar("ما العنصر الناقص؟");
  }

  setTimeout(render, 0);
  return screen;
}
