// ===== أوضة «أنا بقيت شاطر فى…» (اقتراح كوديكس — المالك ٢٠٢٦-١١-٠٤) =====
// على صورة الأوضة (assets/journey/room.webp): ٦ دواير على الحيطة و٥ خانات فى الرف — كل مكان إنجاز
// (js/data/mastery.js). اللى اتكسب بيبان كارت منوّر، والباقى باهت وعليه فاضل كام.
import { Router } from "../core/router.js";
import { Store } from "../core/storage.js";
import { Sfx } from "../core/audio.js";
import { Speech } from "../core/speech.js";
import { achievementStatus } from "../data/mastery.js";
import { currentMasteryContext, claimNewAchievements } from "../core/rewards.js";

// أماكن الإنجازات على الصورة (٪ من العرض/الطول): الدواير الشمال ثم اليمين، وبعدين خانات الرف
export const ROOM_SLOTS = [
  [18.9, 25.5], [18.9, 45.2], [18.9, 64.8],
  [81.2, 25.5], [81.2, 45.2], [81.2, 64.8],
  [27.8, 84], [38.6, 84], [49.3, 84], [60.4, 84], [71.2, 84],
];

export function renderMasteryRoom() {
  claimNewAchievements();   // اللى اتكسب ومااتسجّلش (مثلاً قبل التحديث)
  const list = achievementStatus(currentMasteryContext());
  const got = list.filter((a) => a.got).length;

  const screen = document.createElement("div");
  screen.className = "region-screen mr-screen";
  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-btn" id="mrBack" title="رجوع">🏠</button>
    <h2>🏆 أنا بقيت شاطر</h2>
    <span style="width:48px"></span>`;
  screen.appendChild(topbar);
  topbar.querySelector("#mrBack").addEventListener("click", () => { Sfx.tap(); Router.go("home"); });

  const wrap = document.createElement("div");
  wrap.className = "jr-wrap";
  const room = document.createElement("div");
  room.className = "mr-room";
  room.innerHTML = `<img src="/assets/journey/room.webp" alt="أوضة الإنجازات" width="1280" height="720" />`;
  list.forEach((a, i) => {
    const [x, y] = ROOM_SLOTS[i] || [50, 50];
    const b = document.createElement("button");
    b.className = "mr-slot" + (a.got ? " got" : "") + (i >= 6 ? " shelf" : "");
    b.style.left = x + "%"; b.style.top = y + "%";
    b.dataset.id = a.id;
    b.innerHTML = a.got ? `<span class="mr-emoji">${a.emoji}</span>` : `<span class="mr-left">${a.have}/${a.need}</span>`;
    b.title = a.title;
    b.setAttribute("aria-label", a.got ? a.title : `${a.title} — ${a.have} من ${a.need}`);
    b.addEventListener("click", () => { Sfx.tap(); show(a); Speech.mizo(a.got ? `برافو! ${a.title}` : `فاضل ${a.need - a.have} و${a.title}`); });
    room.appendChild(b);
  });
  wrap.appendChild(room);

  const head = document.createElement("p");
  head.className = "jr-progress";
  head.textContent = got ? `فتحت ${got} من ${list.length} إنجاز 🌟` : "كل مهارة تتعلّمها هتنوّر مكان هنا 🌟";
  wrap.appendChild(head);

  // الكروت تحت الصورة: الاسم كامل (الصورة صغيرة على الموبايل)
  const cards = document.createElement("div");
  cards.className = "mr-cards";
  const show = (a) => {
    cards.querySelectorAll(".mr-card").forEach((c) => c.classList.toggle("sel", c.dataset.id === a.id));
  };
  for (const a of list) {
    const c = document.createElement("div");
    c.className = "mr-card" + (a.got ? " got" : "");
    c.dataset.id = a.id;
    const pct = Math.round((a.have / a.need) * 100);
    c.innerHTML = `<span class="mr-cemoji">${a.got ? a.emoji : "🔒"}</span>
      <span class="mr-ctext"><b>${a.title}</b>
      ${a.got ? "<small>اتعلّمتها ✓</small>" : `<span class="mr-bar"><i style="width:${pct}%"></i></span><small>${a.have} من ${a.need}</small>`}</span>`;
    cards.appendChild(c);
  }
  wrap.appendChild(cards);
  screen.appendChild(wrap);
  setTimeout(() => Speech.mizo(got ? `إنت بقيت شاطر فى ${got} حاجات!` : "يلا نتعلّم ونملا الأوضة دى!"), 250);
  return screen;
}
