// ===== لعبة تكوين الكلمة: رتّب الحروف لتكوّن الكلمة الصحيحة =====
import { SPELL_WORDS } from "../data/spelling.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity } from "./common.js";

const ROUNDS = 5;

export function renderWordBuild({ regionId, regionIndex, title }) {
  const words = shuffle(SPELL_WORDS).slice(0, ROUNDS);
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#d7f0ff,#8fb8ff)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🔤 كوّن الكلمة", back));

  const pic = document.createElement("div");
  pic.style.cssText = "text-align:center;font-size:clamp(70px,20vw,120px);margin:6px";
  screen.appendChild(pic);

  const slots = document.createElement("div");
  slots.style.cssText = "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:8px 12px;direction:rtl";
  screen.appendChild(slots);

  const tiles = document.createElement("div");
  tiles.style.cssText = "display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:18px 12px";
  screen.appendChild(tiles);

  let next = 0;

  function render() {
    const w = words[i];
    next = 0;
    pic.textContent = w.emoji;
    slots.innerHTML = "";
    tiles.innerHTML = "";
    Speech.ar(`كوّن كلمة ${w.word}`);

    w.letters.forEach(() => {
      const s = document.createElement("div");
      s.className = "wb-slot";
      slots.appendChild(s);
    });

    shuffle(w.letters).forEach((ch) => {
      const t = document.createElement("button");
      t.className = "wb-tile";
      t.textContent = ch;
      t.addEventListener("click", () => {
        if (t.disabled) return;
        if (ch === w.letters[next]) {
          Sfx.pop();
          const slot = slots.children[next];
          slot.textContent = ch;
          slot.classList.add("filled");
          t.disabled = true;
          t.style.visibility = "hidden";
          next++;
          if (next >= w.letters.length) {
            Sfx.correct();
            Speech.ar(w.word);
            awardStars(1);
            i++;
            if (i >= words.length) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 900);
            else setTimeout(render, 1000);
          }
        } else {
          Sfx.wrong();
          t.classList.add("shake");
          setTimeout(() => t.classList.remove("shake"), 450);
        }
      });
      tiles.appendChild(t);
    });
  }

  setTimeout(render, 100);
  return screen;
}
