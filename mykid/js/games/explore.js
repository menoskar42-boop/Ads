// ===== لعبة "استكشاف": اضغط على الكائن ليتكلّم (حيوانات/أسماك/طيور/فواكه) =====
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, finishActivity } from "./common.js";
import { glyphMarkup } from "./glyph.js";

export function renderExplore({ regionId, regionIndex, datasetKey, title, bg, sound }) {
  const ds = getDataset(datasetKey);
  const items = ds.items;
  const seen = new Set();

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#bff0c9,#7fd99b)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🔍 استكشف", back));

  const hint = document.createElement("p");
  hint.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(15px,4.2vw,20px);margin:12px";
  hint.textContent = "اضغط على كل صديق ليتكلّم! 👆";
  screen.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "regions-grid";
  items.forEach((it, idx) => {
    const card = document.createElement("button");
    card.className = "region-card";
    card.style.cssText = `animation-delay:${idx * 0.03}s;background:linear-gradient(160deg,#9be15d,#00c46a)`;
    card.innerHTML = `${glyphMarkup(it, "region-emoji")}<span class="region-name">${it.name}</span><span class="region-name-en">${it.en}</span>`;
    card.addEventListener("click", () => {
      Sfx.pop();
      const seq = [
        { text: it.name, lang: "ar-EG" },
        { text: it.en, lang: "en-US" },
      ];
      if (sound && it.sound) seq.push({ text: it.sound, lang: "ar-EG" });
      Speech.sequence(seq);
      card.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
        { duration: 400 }
      );
      if (!seen.has(it.emoji)) {
        seen.add(it.emoji);
        awardStars(1);
      }
    });
    grid.appendChild(card);
  });
  screen.appendChild(grid);

  const doneBtn = document.createElement("button");
  doneBtn.className = "candy-btn";
  doneBtn.style.cssText = "display:block;margin:10px auto 30px";
  doneBtn.textContent = "أنهيت ✅";
  doneBtn.addEventListener("click", () => finishActivity({ regionId, regionIndex, stars: 5, onDone: back }));
  screen.appendChild(doneBtn);

  return screen;
}
