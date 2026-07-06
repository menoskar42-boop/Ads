// ===== لعبة الحروف المتشابهة: ميّز الحرف الصحيح بين متشابهاته =====
import { ARABIC_LETTERS } from "../data/arabicLetters.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, mizoBuddy } from "./common.js";

const GROUPS = [
  ["ب", "ت", "ث"], ["ج", "ح", "خ"], ["د", "ذ"], ["ر", "ز"],
  ["س", "ش"], ["ص", "ض"], ["ط", "ظ"], ["ع", "غ"], ["ف", "ق"],
];
const ROUNDS = 6;
const nameOf = (ch) => (ARABIC_LETTERS.find((l) => l.char === ch) || {}).name || ch;

export function renderSimilar({ regionId, regionIndex, title }) {
  const groups = shuffle(GROUPS).slice(0, ROUNDS);
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffe9c7,#ff9a8b)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "👀 الحروف المتشابهة", back));

  const buddy = mizoBuddy();
  screen.appendChild(buddy.el);

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function render() {
    const group = groups[i];
    const target = group[(Math.random() * group.length) | 0];
    stage.innerHTML = "";

    const ask = document.createElement("p");
    ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(20px,6vw,30px)";
    ask.textContent = `اختر حرف: ${nameOf(target)}`;
    stage.appendChild(ask);

    const listen = document.createElement("button");
    listen.className = "candy-btn";
    listen.textContent = "🔊 اسمع";
    listen.addEventListener("click", () => { Sfx.tap(); Speech.ar(nameOf(target)); });
    stage.appendChild(listen);

    const row = document.createElement("div");
    row.className = "choice-row";
    shuffle(group).forEach((ch) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.style.fontWeight = "800";
      b.textContent = ch;
      b.addEventListener("click", () => {
        if (ch === target) {
          Sfx.correct();
          buddy.win();
          b.classList.add("correct");
          Speech.ar(nameOf(target));
          awardStars(1);
          i++;
          if (i >= groups.length) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 800);
          else setTimeout(render, 900);
        } else {
          Sfx.wrong();
          buddy.lose();
          b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
        }
      });
      row.appendChild(b);
    });
    stage.appendChild(row);
    setTimeout(() => Speech.ar(nameOf(target)), 250);
  }

  setTimeout(render, 100);
  return screen;
}
