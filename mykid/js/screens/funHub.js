// ===== مركز المرح والتحدّيات: يجمع ميزات الجذب التعليمي في مكان واحد =====
import { Router } from "../core/router.js";
import { Store } from "../core/storage.js";
import { Sfx } from "../core/audio.js";
import { gameTopbar } from "../games/common.js";

// كل بطاقة: route للوصول، أو soon=true إن لم تُبنَ بعد
const CARDS = [
  { emoji: "🎡", name: "عجلة الحظ", desc: "مكافأة كل يوم", route: "spinWheel", badge: () => (Store.canSpinToday() ? "!" : "") },
  { emoji: "🏅", name: "أوسمتي", desc: "إنجازاتك", route: "badges" },
  { emoji: "🏆", name: "تحدّي ميزو", desc: "اختبر معلوماتك", route: "challenge" },
  { emoji: "🎁", name: "كنوزي", desc: "مجموعتك", route: "rewards" },
];

export function renderFunHub() {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#c2e9fb,#a18cd1)";
  screen.appendChild(gameTopbar("🏆 المرح والتحدّيات", () => Router.go("home")));

  const grid = document.createElement("div");
  grid.className = "regions-grid";
  grid.style.marginTop = "16px";
  CARDS.forEach((c, i) => {
    const card = document.createElement("button");
    card.className = "region-card";
    card.style.cssText = `animation-delay:${i * 0.05}s`;
    const flag = c.badge ? c.badge() : "";
    card.innerHTML = `
      <span class="region-emoji">${c.emoji}</span>
      <span class="region-name">${c.name}</span>
      <span style="font-size:12px;color:#fff;opacity:.9">${c.desc}</span>
      ${flag ? `<span class="hub-flag">${flag}</span>` : ""}
      ${c.soon ? `<span class="hub-soon">قريبًا</span>` : ""}`;
    card.addEventListener("click", () => {
      Sfx.tap();
      if (c.soon) return;
      Router.go(c.route);
    });
    grid.appendChild(card);
  });
  screen.appendChild(grid);
  return screen;
}
