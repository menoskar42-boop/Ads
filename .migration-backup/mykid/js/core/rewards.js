// ===== نظام المكافآت: نجوم + شخصيات وألعاب تُجمع =====
import { Store } from "./storage.js";
import { Sfx } from "./audio.js";
import { Confetti } from "./confetti.js";
import { Speech } from "./speech.js";
import { createCharacter } from "../games/character.js";
import { track } from "./analytics.js";
import { newAchievements, masteryContext } from "../data/mastery.js";
import { starredLetters } from "../data/letterRecall.js";
import { WB_NUMBER_PAGE_IDS } from "../data/workbook.js";
import { COLORS } from "../data/colors.js";

// مجموعة العناصر القابلة للجمع (حيوانات أليفة، سيارات، أجنحة، قبعات...)
export const COLLECTIBLES = [
  { id: "pet-cat", emoji: "🐱", name: "قطة صغيرة" },
  { id: "pet-dog", emoji: "🐶", name: "كلب لطيف" },
  { id: "pet-bunny", emoji: "🐰", name: "أرنب" },
  { id: "pet-panda", emoji: "🐼", name: "باندا" },
  { id: "car-red", emoji: "🚗", name: "سيارة حمراء" },
  { id: "car-race", emoji: "🏎️", name: "سيارة سباق" },
  { id: "wings", emoji: "🦋", name: "أجنحة سحرية" },
  { id: "hat-magic", emoji: "🎩", name: "قبعة الساحر" },
  { id: "crown", emoji: "👑", name: "تاج ذهبي" },
  { id: "rocket", emoji: "🚀", name: "صاروخ" },
  { id: "unicorn", emoji: "🦄", name: "حصان وحيد القرن" },
  { id: "robot", emoji: "🤖", name: "روبوت صديق" },
  { id: "balloon", emoji: "🎈", name: "بالون" },
  { id: "rainbow", emoji: "🌈", name: "قوس قزح" },
  { id: "star-trophy", emoji: "🏆", name: "كأس البطل" },
];

let starCounterEl = null;
export function bindStarCounter(el) {
  starCounterEl = el;
  updateStarCounter();
}
export function updateStarCounter() {
  if (starCounterEl) starCounterEl.innerHTML = `⭐ <span>${Store.stars}</span>`;
}

/** منح نجوم مع مؤثرات */
export function awardStars(n = 1) {
  Store.addStars(n);
  track("earn_stars", { value: n, total_stars: Store.stars }); // جمع نجوم
  Sfx.star();
  Confetti.stars();
  updateStarCounter();
  // تقدّم الهدف اليومي — احتفال عند بلوغه لأول مرة اليوم
  const reachedGoal = Store.addDailyProgress(n);
  updateStreakUI();
  if (reachedGoal) {
    Sfx.win();
    Confetti.burst();
    Speech.ar("أحسنت! حقّقت هدف اليوم");
  }
}

// ===== واجهة السلسلة اليومية =====
let streakEl = null;
export function bindStreak(el) {
  streakEl = el;
  updateStreakUI();
}
export function updateStreakUI() {
  if (!streakEl) return;
  const s = Store.streak;
  const d = Store.dailyStars;
  const g = Store.dailyGoal;
  streakEl.innerHTML = `🔥 <span>${s}</span> · ⭐ ${Math.min(d, g)}/${g}`;
}

/** منح عنصر جديد للمجموعة إذا لم يكن مملوكاً */
export function grantRandomCollectible() {
  const locked = COLLECTIBLES.filter((c) => !Store.hasCollected(c.id));
  if (!locked.length) return null;
  const item = locked[(Math.random() * locked.length) | 0];
  Store.addToCollection(item.id);
  return item;
}

/** حالة الطفل لحساب الإنجازات (js/data/mastery.js) */
export function currentMasteryContext() {
  return masteryContext({
    arStarred: starredLetters("ar", Store.letterbookDone),
    enStarred: starredLetters("en", Store.englishbookDone),
    workbookDone: Store.workbookDone, numberPageIds: WB_NUMBER_PAGE_IDS,
    mastery: Store.mastery, colorKeys: COLORS.map((c) => c.name),
    grades: Store.letterGrades, writeStats: Store.writeStats, journeys: Store.journeys,
  });
}

/** الإنجازات الجديدة (لو فيه): بتتسجّل، ومع كل إنجاز كنز — بالترتيب مش بالحظ (المالك ٢٠٢٦-١١-٠٤) */
export function claimNewAchievements() {
  const fresh = newAchievements(currentMasteryContext(), Store.achievements);
  if (!fresh.length) return [];
  Store.addAchievements(fresh.map((a) => a.id));
  return fresh.map((a) => {
    const item = COLLECTIBLES.find((c) => !Store.hasCollected(c.id)) || null;
    if (item) Store.addToCollection(item.id);
    return { ...a, item };
  });
}

/** احتفال بإنجاز جديد: ميزو ماسك النجمة + كارت الإنجاز + الكنز اللى جه معاه */
export function showAchievementPopup(a, onClose) {
  Sfx.unlockReward();
  Confetti.stars();
  const overlay = document.createElement("div");
  overlay.className = "cheer";
  overlay.innerHTML = `
    <div class="cheer-card ach-pop">
      <img src="/assets/mizo/mizo-star.webp" alt="ميزو" width="480" height="720" class="ach-mizo" />
      <div class="cheer-text">بقيت شاطر!</div>
      <div class="ach-card"><span class="ach-emoji">${a.emoji}</span><span>${a.title}</span></div>
      ${a.item ? `<p class="ach-gift">ومعاه كنز جديد: ${a.item.emoji} ${a.item.name}</p>` : ""}
      <button class="candy-btn" id="achOk">رائع! 🎉</button>
    </div>`;
  document.body.appendChild(overlay);
  Speech.mizo(`برافو! ${a.title}`);
  track("achievement", { id: a.id });
  overlay.querySelector("#achOk").addEventListener("click", () => {
    overlay.remove();
    if (onClose) onClose();
  });
}

/** نافذة احتفال عند ربح عنصر جديد */
export function showRewardPopup(item, onClose) {
  Sfx.unlockReward();
  Confetti.burst();
  const overlay = document.createElement("div");
  overlay.className = "cheer";
  overlay.innerHTML = `
    <div class="cheer-card">
      <div class="cheer-emoji">${item.emoji}</div>
      <div class="cheer-text">مكافأة جديدة!</div>
      <p style="font-size:20px;font-weight:700;color:var(--c-ink);margin:.2em 0 1em">${item.name}</p>
      <button class="candy-btn" id="rewardOk">رائع! 🎉</button>
    </div>`;
  // ميزو الفرحان محاطاً بنجوم تفرقع
  const mizo = createCharacter();
  mizo.setMood("cheer");
  mizo.el.classList.add("cheer-miz");
  const celebrate = document.createElement("div");
  celebrate.className = "miz-celebrate";
  const burst = document.createElement("div");
  burst.className = "star-burst";
  const DIRS = [[-72, -46], [72, -46], [-92, 14], [92, 14], [-44, -88], [44, -88], [0, -102], [0, 56]];
  DIRS.forEach((d, i) => {
    const s = document.createElement("span");
    s.textContent = "⭐";
    s.style.setProperty("--dx", d[0] + "px");
    s.style.setProperty("--dy", d[1] + "px");
    s.style.animationDelay = (i * 0.12).toFixed(2) + "s";
    burst.appendChild(s);
  });
  celebrate.appendChild(burst);
  celebrate.appendChild(mizo.el);
  overlay.querySelector(".cheer-card").insertBefore(celebrate, overlay.querySelector(".cheer-text"));
  Store.rememberReward(item.name); // ذاكرة ميزو: آخر مكافأة
  document.body.appendChild(overlay);
  Speech.ar(`حصلت على ${item.name}`);
  overlay.querySelector("#rewardOk").addEventListener("click", () => {
    overlay.remove();
    if (onClose) onClose();
  });
}
