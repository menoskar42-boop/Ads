// ===== رحلة اليوم: ٣ مهام على ٣ قواعد (كتابة · أرقام · ألوان) + خريطة تقدّم =====
// المهام مبنية على احتياج الطفل (js/data/dailyJourney.js)، وكل رحلة تخلص بتنوّر حجر على الخريطة
// وكل ٧ بتفتح مكان. تصميم الشاشة من اقتراحات كوديكس (٢٠٢٦-١١-٠٤) — ميزو مكان الأسد.
// الخطوة بتتعلّم بمفتاحها (write/number/color) عند إتمام نشاطها (finishActivity).
import { REGIONS } from "../data/regions.js";
import { Router } from "../core/router.js";
import { Store } from "../core/storage.js";
import { Sfx } from "../core/audio.js";
import { Speech } from "../core/speech.js";
import { Confetti } from "../core/confetti.js";
import { awardStars } from "../core/rewards.js";
import { MIZO_CATCH, pick } from "../data/mizo.js";
import { journeySteps, dayIndex, mapState, JOURNEY_PLACES } from "../data/dailyJourney.js";
import { dueKeys, todayISO } from "../data/writeReview.js";
import { starredLetters } from "../data/letterRecall.js";
import { LB_ORDER } from "../data/letterbook.js";
import { storyState } from "../data/journeyStories.js";

const ri = (id) => REGIONS.findIndex((r) => r.id === id);

// أحجار البركة فى صورة الخريطة (assets/journey/map.webp) — نسبة من العرض/الطول، من البنفسجى (القريب) للأحمر
const STONE_POS = [[12.9, 83.4], [18.8, 78.1], [24.5, 73.3], [29.6, 69.6], [34.4, 65.9], [37.7, 61.6]];
// الأماكن اللى بتتفتح: المكتبة (القلعة) · بوابة قوس قزح · حديقة الورد
const PLACE_POS = { library: [12, 30], rainbow: [86, 24], garden: [74, 36] };

function todaySteps() {
  return journeySteps(dayIndex(), {
    dueWords: dueKeys(Store.writeReview, "ar", todayISO()).length,
    starred: starredLetters("ar", Store.letterbookDone),
    grades: Store.letterGrades,
    order: LB_ORDER,
  });
}

function journeyMap(ms) {
  const box = document.createElement("div");
  box.className = "jr-map";
  box.innerHTML = `<img src="/assets/journey/map.webp" alt="خريطة رحلة ميزو" width="1280" height="720" loading="eager" />`;
  STONE_POS.forEach(([x, y], i) => {
    const st = document.createElement("span");
    st.className = "jr-stone" + (i < ms.lit ? " on" : "");
    st.style.left = x + "%"; st.style.top = y + "%";
    st.textContent = i < ms.lit ? "⭐" : String(i + 1);
    box.appendChild(st);
  });
  JOURNEY_PLACES.forEach((pl, i) => {
    const [x, y] = PLACE_POS[pl.id];
    const tag = document.createElement("span");
    tag.className = "jr-place" + (i < ms.opened ? " open" : "");
    tag.style.left = x + "%"; tag.style.top = y + "%";
    tag.textContent = i < ms.opened ? `${pl.emoji} ${pl.name}` : "🔒";
    tag.title = pl.name;
    box.appendChild(tag);
  });
  return box;
}

export function renderDailyPlan() {
  const steps = todaySteps();
  const plan = Store.dailyPlan;
  const doneKeys = plan.done.map((d) => (typeof d === "number" ? (steps[d] || {}).key : d));
  const isDone = (st) => doneKeys.includes(st.key);

  const screen = document.createElement("div");
  screen.className = "region-screen jr-screen";

  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-btn" id="dpBack" title="رجوع">🏠</button>
    <h2>🎯 رحلة اليوم</h2>
    <span style="width:48px"></span>`;
  screen.appendChild(topbar);
  topbar.querySelector("#dpBack").addEventListener("click", () => { Sfx.tap(); Router.go("home"); });

  const wrap = document.createElement("div");
  wrap.className = "jr-wrap";

  const doneCount = steps.filter(isDone).length;
  const allDone = doneCount >= steps.length;
  // الرحلة خلصت ⇒ حجر جديد على الخريطة (مرة فى اليوم) قبل ما نرسمها
  let newStone = false;
  if (allDone && Store.markDailyBonus()) {
    newStone = Store.addJourney();
    awardStars(5);
  }
  const ms = mapState(Store.journeys);

  wrap.appendChild(journeyMap(ms));
  const prog = document.createElement("p");
  prog.className = "jr-progress";
  prog.textContent = ms.next
    ? `خلّصت ${ms.total} رحلة — فاضل ${ms.left} وتتفتح «${ms.next.name}» ${ms.next.emoji}`
    : `خلّصت ${ms.total} رحلة — فتحت كل الأماكن! 🎉`;
  wrap.appendChild(prog);

  // ميزو بيشاور على القواعد التلاتة
  const stage = document.createElement("div");
  stage.className = "jr-stage";
  // القصة: ميزو بيفكّر بهدف أول مهمة لسه ماخلصتش (قوس قزح · القطار · البيض)
  const firstLeft = steps.find((st) => !isDone(st));
  const story = firstLeft ? storyState(firstLeft.key, Store.storyProgress[firstLeft.key] || 0) : null;
  const msg = allDone ? "برافو! خلّصنا رحلة النهارده سوا 🎉" : `${pick(MIZO_CATCH)} ${story ? story.nudge : "دى مهام النهارده، اختار واحدة!"}`;
  stage.innerHTML = `<img class="jr-mizo" src="/assets/mizo/${allDone ? "mizo-star" : "mizo-present"}.webp" alt="ميزو" width="480" height="720" />
    <div class="jr-bubble">${msg}</div><div class="jr-pedestals"></div>`;
  const row = stage.querySelector(".jr-pedestals");
  steps.forEach((step, i) => {
    const done = isDone(step);
    const card = document.createElement("button");
    card.className = "jr-ped" + (done ? " done" : "");
    card.dataset.key = step.key;
    card.innerHTML = `<span class="jr-ring">${done ? "✅" : step.emoji}</span>
      <span class="jr-base"></span>
      <span class="jr-title">${step.title}</span>
      <span class="jr-desc">${done ? "تمّ ✓" : step.desc}</span>
      <span class="jr-story" title="${storyState(step.key, Store.storyProgress[step.key] || 0).title}">${storyState(step.key, Store.storyProgress[step.key] || 0).strip}</span>`;
    card.addEventListener("click", () => {
      Sfx.tap();
      Store.activeStep = step.key; // تُعلَّم عند إتمام النشاط (finishActivity)
      Router.go(step.screen, { regionId: step.regionId, regionIndex: ri(step.regionId), ...step.params });
    });
    row.appendChild(card);
  });
  wrap.appendChild(stage);
  setTimeout(() => Speech.mizo(newStone ? "برافو! خلّصت رحلة النهارده ونوّرت حجر جديد على الخريطة!" : msg), 250);
  if (newStone) setTimeout(() => Confetti.stars(), 200);

  screen.appendChild(wrap);
  return screen;
}
