// ===== عجلة الحظ اليومية: مكافأة مرّة كل يوم تحفّز العودة =====
import { Router } from "../core/router.js";
import { Store } from "../core/storage.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Confetti } from "../core/confetti.js";
import { awardStars, grantRandomCollectible, showRewardPopup } from "../core/rewards.js";
import { gameTopbar } from "../games/common.js";
import { createCharacter } from "../games/character.js";
import { pick, MIZO_CATCH } from "../data/mizo.js";

// شرائح العجلة: نجوم متنوّعة + كنز
const SLICES = [
  { label: "⭐×3", stars: 3, color: "#ffd23f" },
  { label: "⭐×5", stars: 5, color: "#34d399" },
  { label: "🎁 كنز", treasure: true, color: "#ff6fb5" },
  { label: "⭐×8", stars: 8, color: "#7c5fe6" },
  { label: "⭐×5", stars: 5, color: "#22c1c3" },
  { label: "⭐×10", stars: 10, color: "#fc6076" },
];

export function renderSpinWheel() {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffe9b0,#ff9a8b)";
  screen.appendChild(gameTopbar("🎡 عجلة الحظ", () => Router.go("home")));

  const wrap = document.createElement("div");
  wrap.className = "lesson";
  wrap.style.textAlign = "center";
  screen.appendChild(wrap);

  // ميزو مضيف العجلة
  const mizoBox = document.createElement("div");
  mizoBox.style.cssText = "display:grid;place-items:center;margin:2px";
  const mizo = createCharacter();
  mizoBox.appendChild(mizo.el);
  wrap.appendChild(mizoBox);

  // العجلة (متدرّجات مخروطية)
  const n = SLICES.length;
  const seg = 360 / n;
  const stops = SLICES.map((s, i) => `${s.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(",");
  const wheel = document.createElement("div");
  wheel.className = "wheel";
  wheel.style.background = `conic-gradient(${stops})`;
  const labels = SLICES.map((s, i) => {
    const a = i * seg + seg / 2;
    return `<span class="wheel-lbl" style="transform:rotate(${a}deg) translateY(-78px) rotate(${-a}deg)">${s.label}</span>`;
  }).join("");
  wheel.innerHTML = labels;
  const wheelWrap = document.createElement("div");
  wheelWrap.className = "wheel-wrap";
  wheelWrap.innerHTML = `<div class="wheel-pin">▼</div>`;
  wheelWrap.appendChild(wheel);
  wrap.appendChild(wheelWrap);

  const msg = document.createElement("p");
  msg.style.cssText = "font-weight:800;color:#5b3fb5;font-size:clamp(16px,4.5vw,20px);margin:14px;min-height:1.6em";
  wrap.appendChild(msg);

  const btn = document.createElement("button");
  btn.className = "candy-btn";
  btn.style.cssText = "font-size:clamp(18px,5vw,24px);padding:16px 34px";
  wrap.appendChild(btn);

  let rotation = 0;
  let spinning = false;

  function refresh() {
    if (Store.canSpinToday()) {
      btn.textContent = "🎡 لُفّ العجلة!";
      btn.disabled = false;
      btn.style.opacity = "1";
      msg.textContent = "لديك لفّة اليوم — جرّب حظّك!";
      mizo.setMood("happy");
      const greet = pick(MIZO_CATCH);
      mizo.startTalking(greet.length * 90 + 800);
      Speech.mizo(greet);
    } else {
      btn.textContent = "✅ عُد غدًا";
      btn.disabled = true;
      btn.style.opacity = ".6";
      msg.textContent = "أخذت مكافأة اليوم 🌙 عُد غدًا للفّة جديدة!";
    }
  }

  function spin() {
    if (spinning || !Store.canSpinToday()) return;
    spinning = true;
    btn.disabled = true;
    Sfx.pop();
    const idx = (Math.random() * n) | 0;
    // الدوران بحيث تتوقّف الشريحة المختارة أعلى المؤشّر
    const target = 360 * 6 + (360 - (idx * seg + seg / 2));
    rotation += target;
    wheel.style.transform = `rotate(${rotation}deg)`;

    setTimeout(() => {
      Store.markSpun();
      const prize = SLICES[idx];
      Confetti.burst();
      mizo.setMood("cheer", 2000);
      if (prize.treasure) {
        const item = grantRandomCollectible();
        if (item) showRewardPopup(item, refresh);
        else { awardStars(10); Speech.mizo("جامد! خد ١٠ نجوم بدل الكنز!"); }
        msg.textContent = "🎁 ربحت كنزًا!";
      } else {
        awardStars(prize.stars);
        msg.textContent = `🌟 ربحت ${prize.stars} نجوم!`;
        Speech.mizo(`جامد! ربحت ${prize.stars} نجوم!`);
      }
      spinning = false;
      if (!prize.treasure) setTimeout(refresh, 1500);
    }, 4200);
  }

  btn.addEventListener("click", spin);
  setTimeout(refresh, 200);
  return screen;
}
