// ===== عجلة الحظ اليومية: مكافأة مرّة كل يوم تحفّز العودة =====
// المالك ٢٠٢٦-١١-٠٤ (ملاحظة كوديكس «المكافأة لازم تقول حاجة»): العجلة بتتفتح بعد ما رحلة اليوم تخلص،
// وشرايحها جاية من مهام النهارده (كتابة · أرقام · ألوان)، والجايزة بتقول سببها: «عشان كتبت حرف ب…».
// المفاجأة نفسها فاضلة زى ما هى (المالك: «مش مهم» إنها عشوائية).
import { Router } from "../core/router.js";
import { Store } from "../core/storage.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Confetti } from "../core/confetti.js";
import { awardStars, grantRandomCollectible, showRewardPopup } from "../core/rewards.js";
import { gameTopbar } from "../games/common.js";
import { createCharacter } from "../games/character.js";
import { pick, MIZO_CATCH } from "../data/mizo.js";
import { todaySteps } from "./dailyPlan.js";
import { wheelSlices } from "../data/journeyStories.js";

export function renderSpinWheel() {
  const steps = todaySteps();
  const doneKeys = Store.dailyPlan.done;
  const earned = steps.every((st) => doneKeys.includes(st.key));   // رحلة اليوم خلصت ⇒ العجلة اتفتحت
  const SLICES = wheelSlices(steps);
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
    if (!earned) {
      btn.textContent = "🎯 روح لرحلة اليوم";
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.onclick = () => { Sfx.tap(); Router.go("dailyPlan"); };
      const left = steps.filter((st) => !doneKeys.includes(st.key)).length;
      msg.textContent = `العجلة بتتفتح لما تخلّص رحلة اليوم — فاضل ${left} ${left === 1 ? "مهمة" : "مهام"}`;
      mizo.setMood("happy");
      Speech.mizo("خلّص رحلة اليوم الأول، وبعدين نلف العجلة سوا!");
      return;
    }
    btn.onclick = null;
    if (Store.canSpinToday()) {
      btn.textContent = "🎡 لُفّ العجلة!";
      btn.disabled = false;
      btn.style.opacity = "1";
      msg.textContent = "خلّصت رحلة اليوم — لُفّ العجلة واكسب جايزتك!";
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
    if (!earned || spinning || !Store.canSpinToday()) return;   // قبل رحلة اليوم الزرار بيودّى للرحلة (onclick)
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
      // الجايزة بتقول سببها (المهمة اللى عملها النهارده)
      if (prize.treasure) {
        const item = grantRandomCollectible();
        if (item) showRewardPopup({ ...item, name: `${item.name} — ${prize.because}` }, refresh);
        else awardStars(10);
        msg.textContent = item ? `🎁 ${prize.because}: كسبت ${item.emoji} ${item.name}!` : `🌟 ${prize.because}: كسبت ١٠ نجوم!`;
        Speech.mizo(prize.because);
      } else {
        awardStars(prize.stars);
        msg.textContent = `🌟 ${prize.because}: كسبت ${prize.stars} نجوم!`;
        Speech.mizo(prize.because);
      }
      spinning = false;
      if (!prize.treasure) setTimeout(refresh, 1500);
    }, 4200);
  }

  btn.addEventListener("click", spin);
  setTimeout(refresh, 200);
  return screen;
}
