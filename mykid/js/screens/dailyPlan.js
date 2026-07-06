// ===== رحلة اليوم: خطة تعلّم يومية قصيرة ومتوازنة =====
// أربع خطوات تتغيّر يومياً (حرف + أرقام + مراجعة + ذاكرة). تُعلَّم الخطوة عند
// إتمام نشاطها (عبر finishActivity)، ومكافأة خاصّة عند إكمال الرحلة.
import { REGIONS } from "../data/regions.js";
import { Router } from "../core/router.js";
import { Store } from "../core/storage.js";
import { Sfx } from "../core/audio.js";
import { Speech } from "../core/speech.js";
import { Confetti } from "../core/confetti.js";
import { awardStars } from "../core/rewards.js";
import { createCharacter } from "../games/character.js";
import { MIZO_CATCH, pick } from "../data/mizo.js";

const ri = (id) => REGIONS.findIndex((r) => r.id === id);

function todaySteps() {
  const d = new Date();
  const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const letterRegion = day % 2 ? "english" : "arabic";
  const letterLang = letterRegion === "english" ? "en-US" : "ar-EG";
  const numGame = ["countPick", "addition", "compare"][day % 3];
  const memReg = ["animals", "fruits", "birds", "fish"][day % 4];
  const memName = { animals: "الحيوانات", fruits: "الفواكه", birds: "الطيور", fish: "الأسماك" }[memReg];
  return [
    { emoji: "🧑‍🏫", title: "درس حرف مع ميزو", regionId: letterRegion, screen: "lesson",
      params: { datasetKey: letterRegion, lang: letterLang, title: "🧑‍🏫 معلّم الحروف" } },
    { emoji: "🔢", title: "لعبة أرقام", regionId: "numbers", screen: numGame, params: {} },
    { emoji: "🧠", title: "مراجعة سريعة", regionId: letterRegion, screen: "review",
      params: { datasetKey: letterRegion, lang: letterLang, title: "🧠 مراجعة" } },
    { emoji: "🧩", title: `ذاكرة ${memName}`, regionId: memReg, screen: "memory",
      params: { datasetKey: memReg, title: "🧩 ذاكرة" } },
  ];
}

export function renderDailyPlan() {
  const steps = todaySteps();
  const plan = Store.dailyPlan;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#fff0c8,#ffd59e)";

  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-btn" id="dpBack" title="رجوع">🏠</button>
    <h2>🎯 رحلة اليوم</h2>
    <span style="width:48px"></span>`;
  screen.appendChild(topbar);
  topbar.querySelector("#dpBack").addEventListener("click", () => { Sfx.tap(); Router.go("home"); });

  const wrap = document.createElement("div");
  wrap.style.cssText = "max-width:560px;margin:0 auto;padding:14px 16px 40px";

  const doneCount = plan.done.length;
  const allDone = doneCount >= steps.length;

  // ميزو يقود الرحلة
  const lead = document.createElement("div");
  lead.className = "lesson-teacher";
  lead.style.cssText = "max-width:460px;margin:4px auto 6px";
  const msg = allDone ? "برافو! خلّصنا رحلة النهارده سوا 🎉" : `${pick(MIZO_CATCH)} دي رحلتنا النهارده، يلا بينا!`;
  lead.innerHTML = `<div class="miz-slot"></div><div class="teacher-bubble">${msg}</div>`;
  wrap.appendChild(lead);
  const leadMizo = createCharacter();
  lead.querySelector(".miz-slot").appendChild(leadMizo.el);
  setTimeout(() => {
    leadMizo.setMood(allDone ? "cheer" : "wave", 2400);
    leadMizo.startTalking(msg.length * 85 + 1200);
    Speech.mizo(msg);
  }, 250);

  const head = document.createElement("p");
  head.style.cssText = "text-align:center;font-weight:800;color:#5b3fb5;font-size:clamp(17px,4.6vw,22px);margin:6px 0 16px";
  head.textContent = allDone ? "أحسنت! أكملت رحلة اليوم 🎉" : `أنجز خطوات اليوم: ${doneCount}/${steps.length} ⭐`;
  wrap.appendChild(head);

  steps.forEach((step, i) => {
    const done = plan.done.includes(i);
    const card = document.createElement("button");
    card.className = "activity-btn" + (done ? " done" : "");
    card.innerHTML = `
      <span class="act-emoji">${done ? "✅" : step.emoji}</span>
      <span class="act-text">
        <span class="act-title">${i + 1}. ${step.title}</span>
        <span class="act-desc">${done ? "تمّ ✓" : "اضغط لتبدأ"}</span>
      </span>
      <span class="act-arrow">${done ? "" : "›"}</span>`;
    card.addEventListener("click", () => {
      Sfx.tap();
      Store.activeStep = i; // تُعلَّم عند إتمام النشاط
      Router.go(step.screen, { regionId: step.regionId, regionIndex: ri(step.regionId), ...step.params });
    });
    wrap.appendChild(card);
  });

  // مكافأة إكمال الرحلة (مرّة واحدة في اليوم)
  if (allDone && Store.markDailyBonus()) {
    awardStars(5);
    setTimeout(() => { Confetti.stars(); Speech.mizo("برافو! خلّصت رحلة النهارده، إنت بطل!"); }, 200);
  }

  screen.appendChild(wrap);
  return screen;
}
