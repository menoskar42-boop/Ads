// ===== لعبة الفرز: صنّف العنصر إلى فئته الصحيحة =====
// يظهر عنصر، ويختار الطفل الفئة التي ينتمي إليها من فئتين.
// عامّة: تأخذ مجموعتين عبر params.groups = [{label, emoji, datasetKey}, ...].
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity } from "./common.js";
import { glyphMarkup } from "./glyph.js";

const ROUNDS = 8;

export function renderSort({ regionId, regionIndex, title, bg, groups }) {
  const gs = (groups || []).map((g) => ({ ...g, items: getDataset(g.datasetKey).items }));
  // نبني قائمة عناصر مع رقم فئتها
  let pool = [];
  gs.forEach((g, gi) => g.items.forEach((it) => pool.push({ it, gi })));
  pool = shuffle(pool).slice(0, ROUNDS);
  let round = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#bfe3ff,#7aa8f0)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🗂️ الفرز", back));

  const hint = document.createElement("p");
  hint.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(15px,4.2vw,20px);margin:10px";
  screen.appendChild(hint);

  const card = document.createElement("div");
  card.style.cssText = "text-align:center;font-size:clamp(70px,22vw,140px);margin:6px;min-height:1.2em";
  screen.appendChild(card);

  const itemName = document.createElement("p");
  itemName.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(20px,5.5vw,28px);margin:4px";
  screen.appendChild(itemName);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin:18px 12px";
  screen.appendChild(btnRow);

  function render() {
    const { it, gi } = pool[round];
    hint.textContent = "إلى أي فئة ينتمي؟ 🤔";
    card.innerHTML = glyphMarkup(it, "sort-glyph");
    itemName.textContent = it.name || "";
    btnRow.innerHTML = "";
    Speech.ar(`${it.name}، إلى أي فئة ينتمي؟`);

    gs.forEach((g, idx) => {
      const b = document.createElement("button");
      b.className = "candy-btn sort-cat";
      b.innerHTML = `${g.emoji || ""} ${g.label}`;
      b.addEventListener("click", () => {
        if (idx === gi) {
          b.classList.add("ok");
          Sfx.correct();
          Speech.mizo(`برافو، ${it.name} من ${g.label}`);
          awardStars(1);
          setTimeout(nextRound, 1000);
        } else {
          b.classList.add("no");
          Sfx.wrong();
          setTimeout(() => b.classList.remove("no"), 500);
        }
      });
      btnRow.appendChild(b);
    });
  }

  function nextRound() {
    round++;
    if (round >= pool.length) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    else render();
  }

  setTimeout(render, 0);
  return screen;
}
