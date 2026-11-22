// ===== شاشة المكافآت: مجموعة الطفل من الكنوز =====
import { COLLECTIBLES } from "../core/rewards.js";
import { Store } from "../core/storage.js";
import { Router } from "../core/router.js";
import { Sfx } from "../core/audio.js";
import { Speech } from "../core/speech.js";

export function renderRewards() {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffe9a8,#ffd1ec)";

  const collected = Store.state.collection.length;
  const total = COLLECTIBLES.length;

  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-btn" id="backBtn" title="رجوع">🏠</button>
    <h2>🎁 كنوزي</h2>
    <span class="star-counter">⭐ <span>${Store.stars}</span></span>
  `;
  screen.appendChild(topbar);

  const info = document.createElement("p");
  info.style.cssText = "text-align:center;font-weight:800;font-size:20px;color:var(--c-purple);margin:16px";
  info.textContent = `جمعت ${collected} من ${total} كنزاً 🌟`;
  screen.appendChild(info);

  const grid = document.createElement("div");
  grid.className = "regions-grid";
  COLLECTIBLES.forEach((item, i) => {
    const owned = Store.hasCollected(item.id);
    const card = document.createElement("button");
    card.className = "region-card";
    card.style.cssText = `animation-delay:${i * 0.04}s;background:${owned ? "linear-gradient(160deg,#ffd23f,#ff924c)" : "#cdbfe6"}`;
    card.innerHTML = `
      <span class="region-emoji">${owned ? item.emoji : "❓"}</span>
      <span class="region-name">${owned ? item.name : "؟؟؟"}</span>
    `;
    if (owned) {
      card.addEventListener("click", () => {
        Sfx.pop();
        Speech.ar(item.name);
      });
    } else {
      card.addEventListener("click", () => {
        Sfx.tap();
        Speech.mizo("اتعلّم أكتر علشان تفتح الكنز ده");
      });
    }
    grid.appendChild(card);
  });
  screen.appendChild(grid);

  setTimeout(() => {
    screen.querySelector("#backBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("home");
    });
  }, 0);

  return screen;
}
