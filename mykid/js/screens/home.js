// ===== الشاشة الرئيسية: الخريطة السحرية =====
import { REGIONS } from "../data/regions.js";
import { Store } from "../core/storage.js";
import { Router } from "../core/router.js";
import { Speech, whenSpeechReady } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { bindStarCounter, bindStreak } from "../core/rewards.js";
import { avatarEmoji } from "./profile.js";
import { FEATURES } from "../core/features.js";
import { createCharacter } from "../games/character.js";
import { MIZO_WELCOME, pick, adaptDisplay } from "../data/mizo.js";

const GUIDE = "🐨"; // المرشد اللطيف
let greetedSession = false; // ميزو يرحّب صوتياً مرّة واحدة في الجلسة

export function renderHome() {
  const screen = document.createElement("div");
  screen.className = "map-screen";

  // الشريط العلوي
  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <div style="display:flex;gap:8px">
      <button class="icon-btn" id="funBtn" title="المرح والتحدّيات">🏆</button>
      <button class="icon-btn" id="rewardsBtn" title="كنوزي">🎁</button>
      <button class="icon-btn" id="dailyBtn" title="رحلة اليوم">🎯</button>
      <button class="icon-btn" id="songBtn" title="نشيد ميزو">🎶</button>
      <button class="icon-btn" id="colorBtn" title="تلوين">🎨</button>
      ${FEATURES.videos ? '<button class="icon-btn" id="videosBtn" title="أغاني وفيديو">🎵</button>' : ""}
      <button class="icon-btn" id="gardenBtn" title="حديقتي">🌳</button>
      <button class="icon-btn" id="arBtn" title="الواقع المعزّز">📸</button>
      <button class="icon-btn" id="parentBtn" title="ولي الأمر">⚙️</button>
    </div>
    <h2>🗺️ خريطة المغامرة</h2>
    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
      <span class="star-counter" id="starCounter">⭐ <span>0</span></span>
      <span class="streak-badge" id="streakBadge">🔥 <span>0</span></span>
    </div>
  `;
  screen.appendChild(topbar);

  // لافتة المرشد (تعرض أفاتار الطفل واسمه، وتفتح الملف عند الضغط)
  const banner = document.createElement("div");
  banner.className = "guide-banner";
  const f = Store.friendship;
  // «هوك» ترحيب مصري مختلف كل مرّة يجذب الطفل، مع ذكر العودة للعائد أحياناً
  let hook = pick(MIZO_WELCOME);
  if (f.visits > 1 && f.lastRegion && Math.random() < 0.5) {
    hook = `وحشتني يا بطل! أنا ميزو، آخر مرّة لعبنا في ${f.lastRegion}، يلا نكمّل!`;
  }
  const spoken = hook; // Speech.mizo يضيف الاسم وصيغة الجنس تلقائياً
  // الفقاعة المعروضة تطابق المنطوق (جنس + اسم)
  const displayed = adaptDisplay(hook, Store.childGender, Store.childName);
  const bubbleMsg = `${displayed.replace(/ميزو/g, "<b>ميزو</b>")} 👋✨`;
  banner.innerHTML = `
    <button class="guide-emoji guide-miz" id="profileBtn" style="background:none;border:none;cursor:pointer" title="ملفي"></button>
    <div class="bubble">${bubbleMsg}</div>
  `;
  // ميزو المرشد: أنيميشن ٣D يلوّح (مولّد بالذكاء الاصطناعي، شفّاف وخفيف) بدل الرسم الثابت
  const guideImg = document.createElement("img");
  guideImg.className = "guide-anim";
  guideImg.src = "/assets/mizo/mizo-wave-anim.webp";
  guideImg.alt = "ميزو";
  banner.querySelector("#profileBtn").appendChild(guideImg);
  // ترحيب صوتي مرّة واحدة في الجلسة — ننتظر جاهزية الـ AI كي يستخدم صوت ميزو
  if (!greetedSession) {
    greetedSession = true;
    whenSpeechReady().then(() => { Speech.mizo(spoken); });
  }
  screen.appendChild(banner);

  // زرّ «كمّل من حيث وقفت» — وصول سريع لآخر منطقة زارها الطفل
  const spot = Store.lastSpot;
  if (spot) {
    const r = REGIONS.find((x) => x.id === spot.regionId);
    if (r) {
      const resume = document.createElement("button");
      resume.className = "resume-btn";
      resume.innerHTML = `▶ كمّل: ${r.emoji} ${r.name}`;
      resume.addEventListener("click", () => {
        Sfx.whoosh();
        Router.go("region", { id: r.id, index: spot.index });
      });
      screen.appendChild(resume);
    }
  }

  // المناطق التأسيسية مفتوحة دائماً. المناطق المتقدّمة تُفتح تدريجياً:
  // كل منطقة يكملها الطفل تفتح واحدة جديدة من المتقدّمة.
  const completed = Store.completedCount();
  let lockedSeen = 0;

  // ترتيب الفئات وعناوينها
  const CATS = [
    { key: "basics", label: "🔤 الأساسيات", en: "Basics" },
    { key: "nature", label: "🦁 الحيوانات والطبيعة", en: "Animals & Nature" },
    { key: "self", label: "🧍 أنا وعائلتي", en: "Me & Family" },
    { key: "life", label: "🏙️ حياتي اليومية", en: "Daily Life" },
    { key: "think", label: "🧠 مهارات التفكير", en: "Thinking" },
    { key: "story", label: "📖 قصص وقيم", en: "Stories & Values" },
  ];

  function buildCard(region, index, unlocked) {
    const prog = Store.regionProgress(region.id);
    const card = document.createElement("button");
    card.className = `region-card ${region.bg}`;
    card.style.animationDelay = `${(index % 6) * 0.05}s`;
    if (!unlocked) card.classList.add("locked");
    if (prog.completed) card.classList.add("done");
    card.innerHTML = `
      ${prog.stars ? `<span class="region-stars">⭐ ${prog.stars}</span>` : ""}
      <span class="region-emoji">${region.emoji}</span>
      <span class="region-name">${region.name}</span>
      <span class="region-name-en">${region.nameEn}</span>
    `;
    card.addEventListener("click", () => {
      Sfx.unlock();
      if (!unlocked) {
        Sfx.wrong();
        Speech.mizo("اكمّل مغامرة تانية الأول علشان تفتح دي يا بطل");
        card.animate(
          [{ transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
          { duration: 250 }
        );
        return;
      }
      Sfx.whoosh();
      Router.go("region", { id: region.id, index }); // ميزو يرحّب بالعامية داخل المنطقة
    });
    return card;
  }

  // نحسب حالة الفتح بترتيب REGIONS الأصلي (حفاظاً على التدرّج)
  const unlockedMap = new Map();
  REGIONS.forEach((region, index) => {
    let unlocked;
    if (FEATURES.unlockAll || region.open) unlocked = true;
    else { unlocked = lockedSeen < completed; lockedSeen++; }
    unlockedMap.set(region.id, { unlocked, index });
  });

  // نعرض كل فئة بعنوانها وشبكتها
  CATS.forEach((cat) => {
    const inCat = REGIONS.filter((r) => (r.cat || "life") === cat.key);
    if (!inCat.length) return;

    const header = document.createElement("h3");
    header.className = "cat-header";
    header.innerHTML = `${cat.label} <span class="cat-en">${cat.en}</span>`;
    screen.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "regions-grid";
    inCat.forEach((region) => {
      const { unlocked, index } = unlockedMap.get(region.id);
      grid.appendChild(buildCard(region, index, unlocked));
    });
    screen.appendChild(grid);
  });

  // ربط الأحداث بعد الإضافة
  setTimeout(() => {
    bindStarCounter(screen.querySelector("#starCounter"));
    bindStreak(screen.querySelector("#streakBadge"));
    screen.querySelector("#profileBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("profile");
    });
    screen.querySelector("#funBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("funHub");
    });
    screen.querySelector("#rewardsBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("rewards");
    });
    screen.querySelector("#colorBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("coloring", { title: "🎨 لوّن الصور" });
    });
    screen.querySelector("#dailyBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("dailyPlan");
    });
    screen.querySelector("#songBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("mizoSong");
    });
    const videosBtn = screen.querySelector("#videosBtn");
    if (videosBtn) videosBtn.addEventListener("click", () => {
      Sfx.tap();
      Router.go("videos");
    });
    screen.querySelector("#gardenBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("garden");
    });
    screen.querySelector("#arBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("ar");
    });
    screen.querySelector("#parentBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("parent");
    });
    // (أُزيل الترحيب المكرّر هنا — ميزو يرحّب مرّة واحدة بصوت OpenAI أعلى الصفحة)
  }, 0);

  return screen;
}
