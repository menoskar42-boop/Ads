// ===== تمرين تصنيف الكلمات إلى فئتين (قواعد القراءة) =====
import { getClassifySet } from "../data/readingRules.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, mizoBuddy } from "./common.js";

export function renderClassify({ regionId, regionIndex, setId, title }) {
  const set = getClassifySet(setId);
  const rounds = shuffle(set.items);
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#fde9c8,#ffb98a)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || `🗂️ ${set.title}`, back));

  const hint = document.createElement("p");
  hint.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(14px,3.8vw,18px);margin:10px 14px;line-height:1.5";
  hint.textContent = set.explain;
  screen.appendChild(hint);

  const word = document.createElement("div");
  word.style.cssText = "text-align:center;font-size:clamp(40px,12vw,72px);font-weight:800;color:var(--c-purple);margin:10px";
  screen.appendChild(word);

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin:8px 12px";
  screen.appendChild(row);

  const buddy = mizoBuddy();
  screen.appendChild(buddy.el);

  function render() {
    const it = rounds[i];
    word.textContent = it.word;
    row.innerHTML = "";
    Speech.ar(it.word);
    [["A", set.catA], ["B", set.catB]].forEach(([cat, label]) => {
      const b = document.createElement("button");
      b.className = "candy-btn";
      b.style.fontSize = "clamp(16px,4.6vw,22px)";
      if (cat === "B") b.style.background = "linear-gradient(180deg,#7c5fe6,#5b3fb5)";
      b.textContent = label;
      b.addEventListener("click", () => {
        if (it.cat === cat) {
          Sfx.correct();
          buddy.win();
          Speech.ar(it.word);
          awardStars(1);
          i++;
          if (i >= rounds.length) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 800);
          else setTimeout(render, 800);
        } else {
          Sfx.wrong();
          buddy.lose();
          b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
        }
      });
      row.appendChild(b);
    });
  }

  setTimeout(render, 200);
  return screen;
}
