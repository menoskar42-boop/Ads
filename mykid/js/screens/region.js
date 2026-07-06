// ===== شاشة المنطقة: تعرض أنشطة المنطقة أو رسالة "قريباً" =====
import { getRegion } from "../data/regions.js";
import { Router } from "../core/router.js";
import { Sfx } from "../core/audio.js";
import { Speech } from "../core/speech.js";
import { ACTIVITIES } from "../data/activities.js";
import { FEATURES } from "../core/features.js";
import { Store } from "../core/storage.js";
import { regionHook } from "../data/mizo.js";
import { track } from "../core/analytics.js";

export function renderRegion({ id, index }) {
  const region = getRegion(id);
  if (region) {
    Store.rememberRegion(region.name); // ذاكرة ميزو: آخر منطقة
    Store.setLastSpot(id, index); // لزرّ «كمّل من حيث وقفت»
    track("start_adventure", { region_id: id, region_name: region.name }); // بدأ مغامرة
  }
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#bfe9ff,#e9f7d8)";

  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-btn" id="backBtn" title="رجوع">🏠</button>
    <h2>${region.emoji} ${region.name}</h2>
    <span style="width:48px"></span>
  `;
  screen.appendChild(topbar);

  // نُخفي أنشطة الميزات المعطّلة (القصص حالياً) + القواعد المتقدّمة (إلا لو فُتحت)
  const showAdvanced = FEATURES.advancedGrammarForAll || Store.advancedUnlocked;
  const activities = (ACTIVITIES[id] || []).filter(
    (a) => !(a.screen === "story" && !FEATURES.stories) && !(a.advanced && !showAdvanced)
  );

  if (region.ready && activities && activities.length) {
    // قائمة الأنشطة
    const list = document.createElement("div");
    list.className = "activity-list";
    activities.forEach((act, i) => {
      const btn = document.createElement("button");
      btn.className = "activity-btn";
      btn.style.animationDelay = `${i * 0.06}s`;
      btn.innerHTML = `
        <span class="act-emoji">${act.emoji}</span>
        <span class="act-text">
          <span class="act-title">${act.title}</span>
          <span class="act-desc">${act.desc}</span>
        </span>
        <span class="act-arrow">‹</span>
      `;
      btn.addEventListener("click", () => {
        Sfx.whoosh();
        Router.go(act.screen, { regionId: id, regionIndex: index, ...act.params });
      });
      list.appendChild(btn);
    });
    screen.appendChild(list);
    // هوك دخول مصري مرح يجذب الطفل (مختلف كل مرّة)
    setTimeout(() => Speech.mizo(regionHook(region.name)), 250);
  } else {
    // رسالة قريباً
    const soon = document.createElement("div");
    soon.className = "stage";
    soon.innerHTML = `
      <div class="hero-emoji">🚧</div>
      <h2 style="color:var(--c-purple)">هذه المنطقة قيد البناء</h2>
      <p style="font-size:20px;font-weight:700;color:var(--c-ink)">سنفتحها قريباً جداً! ✨</p>
      <button class="candy-btn" id="soonBack">⟵ ارجع للخريطة</button>
    `;
    screen.appendChild(soon);
    setTimeout(() => {
      soon.querySelector("#soonBack").addEventListener("click", () => {
        Sfx.tap();
        Router.go("home");
      });
      Speech.mizo("المغامرة دي لسه بنجهّزها، هتفتح قريب أوي!");
    }, 0);
  }

  setTimeout(() => {
    screen.querySelector("#backBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("home");
    });
  }, 0);

  return screen;
}
