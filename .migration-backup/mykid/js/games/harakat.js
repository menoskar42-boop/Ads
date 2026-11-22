// ===== لعبة الحركات: تعلّم الحرف مع الفتحة والضمة والكسرة =====
import { ARABIC_LETTERS } from "../data/arabicLetters.js";
import { HARAKAT } from "../data/harakat.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, progressDots, shuffle, finishActivity } from "./common.js";

// عدد الحروف في الجولة (نأخذ عيّنة كي لا تطول)
const LETTERS_PER_ROUND = 8;

function syllable(letterChar, sound) {
  return { a: letterChar + "َ", u: letterChar + "ُ", i: letterChar + "ِ" }[sound] || letterChar;
}

export function renderHarakat({ regionId, regionIndex }) {
  const letters = shuffle(ARABIC_LETTERS).slice(0, LETTERS_PER_ROUND);
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffe0a3,#ff9a6c)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar("ﹷ الحركات (فتحة/ضمة/كسرة)", back));

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function speakAll(L) {
    Speech.sequence([
      { text: L.name, lang: "ar-EG" },
      { text: syllable(L.char, "a"), lang: "ar-EG" },
      { text: syllable(L.char, "u"), lang: "ar-EG" },
      { text: syllable(L.char, "i"), lang: "ar-EG" },
    ]);
  }

  function render() {
    const L = letters[i];
    stage.innerHTML = "";
    stage.appendChild(progressDots(letters.length, i - 1));

    const ask = document.createElement("p");
    ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(16px,4.4vw,22px)";
    ask.textContent = `الحرف ${L.name} مع الحركات — اضغط كل بطاقة`;
    stage.appendChild(ask);

    const row = document.createElement("div");
    row.className = "choice-row";
    let tapped = 0;

    HARAKAT.forEach((H) => {
      const sound = H.sound;
      const card = document.createElement("button");
      card.className = "choice haraka-card";
      card.innerHTML =
        `<div style="font-size:1.05em;font-weight:800">${syllable(L.char, sound)}</div>` +
        `<div style="font-size:.32em;opacity:.8">${H.name}</div>`;
      card.addEventListener("click", () => {
        if (card.dataset.done) { Speech.ar(syllable(L.char, sound)); return; }
        card.dataset.done = "1";
        card.classList.add("correct");
        Sfx.pop();
        Speech.ar(syllable(L.char, sound));
        tapped++;
        if (tapped === HARAKAT.length) {
          Sfx.correct();
          awardStars(1);
          setTimeout(next, 900);
        }
      });
      row.appendChild(card);
    });
    stage.appendChild(row);

    const tools = document.createElement("div");
    tools.style.cssText = "margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;justify-content:center";
    const rep = document.createElement("button");
    rep.className = "candy-btn";
    rep.textContent = "🔊 كرّر الكل";
    rep.addEventListener("click", () => { Sfx.tap(); speakAll(L); });
    tools.appendChild(rep);

    // زر "التالي" متاح دائماً حتى لا يعلق الطفل
    const nextBtn = document.createElement("button");
    nextBtn.className = "candy-btn";
    nextBtn.style.background = "linear-gradient(180deg,#34d399,#16a34a)";
    nextBtn.textContent = "التالي ➡️";
    nextBtn.addEventListener("click", () => { Sfx.tap(); next(); });
    tools.appendChild(nextBtn);

    stage.appendChild(tools);

    speakAll(L);
  }

  function next() {
    i++;
    if (i >= letters.length) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    else render();
  }

  setTimeout(render, 0);
  return screen;
}
