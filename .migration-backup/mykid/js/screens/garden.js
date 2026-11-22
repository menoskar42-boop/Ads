// ===== حديقة الأحلام: تكبر كلما تعلّم الطفل وجمع النجوم =====
import { COLLECTIBLES } from "../core/rewards.js";
import { Store } from "../core/storage.js";
import { Router } from "../core/router.js";
import { Sfx } from "../core/audio.js";
import { Speech } from "../core/speech.js";

export function renderGarden() {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#aee9ff 0%,#cdeffd 40%,#bdf0b0 60%,#8ed97a 100%)";

  const stars = Store.stars;

  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-btn" id="backBtn" title="رجوع">🏠</button>
    <h2>🌳 حديقة أحلامي</h2>
    <span class="star-counter">⭐ <span>${stars}</span></span>`;
  screen.appendChild(topbar);

  const msg = document.createElement("p");
  msg.style.cssText = "text-align:center;font-weight:800;color:var(--c-ink);font-size:clamp(15px,4.2vw,20px);margin:14px";
  msg.textContent = "كلما تعلّمت أكثر، كبرت حديقتك! 🌱";
  screen.appendChild(msg);

  // مشهد الحديقة
  const scene = document.createElement("div");
  scene.style.cssText =
    "position:relative;width:min(94vw,640px);height:54vh;margin:0 auto 16px;border-radius:28px;overflow:hidden;" +
    "background:linear-gradient(180deg,#d8f3ff 0%,#bdf0b0 55%,#7ccf63 100%);box-shadow:var(--shadow-card)";
  screen.appendChild(scene);

  // عناصر تنمو حسب النجوم
  const decor = [];
  const trees = Math.min(8, Math.floor(stars / 8));
  const flowers = Math.min(14, Math.floor(stars / 4));
  for (let i = 0; i < trees; i++) decor.push("🌳");
  for (let i = 0; i < flowers; i++) decor.push(["🌷", "🌻", "🌼", "🌹"][i % 4]);
  if (stars >= 25) decor.push("🏡");
  if (stars >= 40) decor.push("🌈");
  if (stars >= 60) decor.push("⛲");

  // عناصر المجموعة المملوكة
  COLLECTIBLES.forEach((c) => {
    if (Store.hasCollected(c.id)) decor.push(c.emoji);
  });

  if (decor.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:20px;font-weight:800;color:#3a6b2c";
    empty.innerHTML = "🌱<br>ابدأ التعلّم لتنمو حديقتك!";
    scene.appendChild(empty);
  }

  setTimeout(() => {
    const W = scene.clientWidth, H = scene.clientHeight;
    decor.forEach((emoji, i) => {
      const el = document.createElement("button");
      el.textContent = emoji;
      const big = emoji === "🌳" || emoji === "🏡" || emoji === "🌈" || emoji === "⛲";
      el.style.cssText =
        `position:absolute;border:none;background:transparent;cursor:pointer;` +
        `font-size:${big ? "clamp(44px,11vw,70px)" : "clamp(26px,7vw,40px)"};` +
        `left:${5 + Math.random() * (W - 60)}px;` +
        `top:${H * 0.28 + Math.random() * (H * 0.6)}px;` +
        `animation:pop-in .4s ease both;animation-delay:${i * 0.04}s`;
      el.addEventListener("click", () => {
        Sfx.pop();
        el.animate([{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 350 });
      });
      scene.appendChild(el);
    });
  }, 30);

  setTimeout(() => {
    screen.querySelector("#backBtn").addEventListener("click", () => { Sfx.tap(); Router.go("home"); });
    Speech.ar("هذه حديقة أحلامك، كلما تعلّمت أكثر كبرت أكثر");
  }, 0);

  return screen;
}
