// ===== لعبة الذاكرة: مطابقة البطاقات المتشابهة =====
// تُقلب البطاقات، يبحث الطفل عن الزوجين المتطابقين. تصلح لأي مجموعة.
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity } from "./common.js";
import { glyphMarkup } from "./glyph.js";

const PAIRS = 6; // عدد الأزواج (12 بطاقة)

export function renderMemory({ regionId, regionIndex, datasetKey, title, bg }) {
  const ds = getDataset(datasetKey);
  const picks = shuffle(ds.items).slice(0, PAIRS);
  // بطاقتان لكل عنصر
  const cards = shuffle([...picks, ...picks].map((it, idx) => ({ it, idx })));

  let first = null;
  let lock = false;
  let matched = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#cfe9ff,#9bbcff)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🧩 لعبة الذاكرة", back));

  const hint = document.createElement("p");
  hint.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(15px,4.2vw,20px);margin:12px";
  hint.textContent = "اقلب بطاقتين متشابهتين! 🔍";
  screen.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "memory-grid";
  screen.appendChild(grid);

  cards.forEach((card) => {
    const el = document.createElement("button");
    el.className = "mem-card";
    el.innerHTML = `<span class="mem-face mem-back">❓</span><span class="mem-face mem-front">${glyphMarkup(card.it, "mem-glyph")}</span>`;
    el.addEventListener("click", () => flip(card, el));
    card.el = el;
    grid.appendChild(el);
  });

  function flip(card, el) {
    if (lock || el.classList.contains("flipped") || el.classList.contains("done")) return;
    Sfx.pop();
    el.classList.add("flipped");
    if (!first) { first = { card, el }; return; }

    lock = true;
    if (first.card.it === card.it) {
      // تطابق
      Sfx.correct();
      Speech.ar(card.it.name);
      setTimeout(() => {
        first.el.classList.add("done");
        el.classList.add("done");
        first = null; lock = false;
        matched++;
        awardStars(1);
        if (matched >= PAIRS) {
          setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 600);
        }
      }, 500);
    } else {
      Sfx.wrong();
      setTimeout(() => {
        first.el.classList.remove("flipped");
        el.classList.remove("flipped");
        first = null; lock = false;
      }, 800);
    }
  }

  return screen;
}
