// ===== أوسمتي: إنجازات تُفتح تلقائياً من تقدّم الطفل (تحفيز وفخر) =====
import { Router } from "../core/router.js";
import { Store } from "../core/storage.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { COLLECTIBLES } from "../core/rewards.js";
import { gameTopbar } from "../games/common.js";
import { createCharacter } from "../games/character.js";
import { pick, MIZO_PRAISE } from "../data/mizo.js";

const learnedCount = () => Object.values(Store.mastery).filter((v) => v >= 1).length;

// كل وسام: شرط فتحه + كيفية الحصول عليه
const BADGES = [
  { emoji: "👣", name: "أول خطوة", how: "أكمل أوّل نشاط", earned: () => Store.friendship.xp >= 1 || Store.stars > 0 },
  { emoji: "⭐", name: "جامع النجوم", how: "اجمع ٥٠ نجمة", earned: () => Store.stars >= 50 },
  { emoji: "🌟", name: "نجم لامع", how: "اجمع ١٥٠ نجمة", earned: () => Store.stars >= 150 },
  { emoji: "💫", name: "أسطورة النجوم", how: "اجمع ٣٠٠ نجمة", earned: () => Store.stars >= 300 },
  { emoji: "💛", name: "صديق ميزو", how: "ابلغ مستوى صداقة ٣", earned: () => Store.friendLevel >= 3 },
  { emoji: "🤝", name: "أعزّ أصدقاء ميزو", how: "ابلغ مستوى صداقة ٦", earned: () => Store.friendLevel >= 6 },
  { emoji: "🔥", name: "مثابر", how: "العب ٣ أيام متتالية", earned: () => Store.streak >= 3 },
  { emoji: "🏃", name: "بطل المواظبة", how: "العب ٧ أيام متتالية", earned: () => Store.streak >= 7 },
  { emoji: "📚", name: "قارئ مبتدئ", how: "تعلّم ١٠ عناصر", earned: () => learnedCount() >= 10 },
  { emoji: "🧠", name: "عقل ذكي", how: "تعلّم ٣٠ عنصرًا", earned: () => learnedCount() >= 30 },
  { emoji: "🎁", name: "جامع الكنوز", how: "اجمع ٥ كنوز", earned: () => Store.state.collection.length >= 5 },
  { emoji: "👑", name: "ملك الكنوز", how: "اجمع كل الكنوز", earned: () => Store.state.collection.length >= COLLECTIBLES.length },
];

export function renderBadges() {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#fff1c2,#ffd1a8)";
  screen.appendChild(gameTopbar("🏅 أوسمتي", () => Router.go("funHub")));

  const earnedList = BADGES.filter((b) => b.earned());
  const count = earnedList.length;

  const head = document.createElement("div");
  head.className = "lesson-teacher";
  head.style.cssText = "max-width:460px;margin:10px auto 4px";
  const m = count
    ? `${pick(MIZO_PRAISE)} عندك ${count} وسام من ${BADGES.length}!`
    : "ابدأ اللعب لتفتح أوّل وسام!";
  head.innerHTML = `<div class="miz-slot"></div><div class="teacher-bubble">${m}</div>`;
  screen.appendChild(head);
  const mizo = createCharacter();
  head.querySelector(".miz-slot").appendChild(mizo.el);
  setTimeout(() => { mizo.setMood(count ? "proud" : "happy", 2200); mizo.startTalking(m.length * 85 + 800); Speech.mizo(m); }, 200);

  const grid = document.createElement("div");
  grid.className = "regions-grid";
  grid.style.marginTop = "10px";
  BADGES.forEach((b, i) => {
    const got = b.earned();
    const card = document.createElement("button");
    card.className = "region-card";
    card.style.cssText = `animation-delay:${i * 0.04}s;background:${got ? "linear-gradient(160deg,#ffd23f,#ff924c)" : "#cdbfe6"}`;
    card.innerHTML = `
      <span class="region-emoji">${got ? b.emoji : "🔒"}</span>
      <span class="region-name">${b.name}</span>
      <span style="font-size:11px;color:#fff;opacity:.95">${got ? "تمّ! ✓" : b.how}</span>`;
    card.addEventListener("click", () => {
      Sfx.tap();
      Speech.mizo(got ? `وسام ${b.name}! ${pick(MIZO_PRAISE)}` : `لتفتح هذا الوسام: ${b.how}`);
    });
    grid.appendChild(card);
  });
  screen.appendChild(grid);
  return screen;
}
