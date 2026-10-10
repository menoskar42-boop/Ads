// ===== مسكة القلم + وضع «القلم بس» =====
//
// المالك ٢٠٢٦-١٠-١٠: الكتابة بالقلم (استايلس) «علشان يبقى زى مسكة القلم للطفل».
//   • كارت «إزاى تمسك القلم» — مرة كل يوم أول ما يفتح الكتابة، ويتفتح تانى من زرار ✋.
//     الطريقة: «امسك واقلب» (pinch & flip) — القلم على الترابيزة، امسكه بصباعين قريب من
//     السن، اقلبه لفوق، والوسطى تسنده من تحت (مسكة الصباعين التلاتة).
//   • وضع «القلم بس» (من صفحة ولى الأمر): الصباع مابيكتبش خالص — بيشتغل مع القلم
//     الذكى بس (Apple Pencil وأقلام أندرويد اللى بتبعت pointerType = pen). القلم أبو
//     سنّ مطاط الشاشة بتقراه صباع، فمع الوضع ده مش هيكتب — وبنقول كده بوضوح.
import { Store } from "../core/storage.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { femAdapt } from "../data/mizo.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);

let openCard = null;
const waiters = [];

/** يشغّل cb بعد ما كارت المسكة يتقفل (أو على طول لو مش مفتوح). */
export function whenGripClosed(cb) {
  if (openCard) waiters.push(cb);
  else cb();
}

/** القلم بزاوية: سنّه تحت على الشمال، والصوابع التلاتة عليه (رسم توضيحى). */
const GRIP_SVG = `<svg viewBox="0 0 260 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="القلم ممسوك بالإبهام والسبابة والوسطى بتسنده">
  <g transform="translate(46 138) rotate(-31)">
    <polygon points="0,0 9,-4 9,4" fill="#3f3f46"/>
    <polygon points="9,-4 28,-10 28,10 9,4" fill="#f5d0a9"/>
    <rect x="28" y="-10" width="150" height="20" rx="3" fill="#fbbf24"/>
    <rect x="28" y="-2" width="150" height="4" fill="#f59e0b" opacity=".55"/>
    <rect x="178" y="-10" width="8" height="20" fill="#a1a1aa"/>
    <rect x="186" y="-10" width="16" height="20" rx="5" fill="#f9a8d4"/>
    <ellipse cx="46" cy="-15" rx="15" ry="8" fill="#60a5fa" stroke="#1d4ed8" stroke-width="2"/>
    <ellipse cx="40" cy="14" rx="14" ry="8" fill="#4ade80" stroke="#15803d" stroke-width="2"/>
    <ellipse cx="64" cy="17" rx="13" ry="7" fill="#c4b5fd" stroke="#6d28d9" stroke-width="2"/>
  </g>
  <g stroke-width="1.5" fill="none">
    <line x1="92" y1="70" x2="72" y2="92" stroke="#1d4ed8"/>
    <line x1="64" y1="150" x2="74" y2="128" stroke="#15803d"/>
    <line x1="160" y1="124" x2="104" y2="118" stroke="#6d28d9"/>
  </g>
  <g font-family="inherit" font-size="15" font-weight="800" text-anchor="middle">
    <text x="104" y="62" fill="#1d4ed8">السبابة فوق</text>
    <text x="64" y="166" fill="#15803d">الإبهام على الجنب</text>
    <text x="205" y="129" fill="#6d28d9">الوسطى تسنده</text>
  </g>
</svg>`;

/** كارت «إزاى تمسك القلم». `force` = من زرار ✋ (مش مرة اليوم). */
export function showGripCard({ force = false } = {}) {
  if (openCard) return;
  if (!force && !Store.takeGripTipForToday()) return;
  const card = document.createElement("div");
  card.className = "grip-overlay";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "إزاى تمسك القلم");
  card.innerHTML = `<div class="grip-card">
    <div class="grip-title">✋ ${fem("إزاى تمسك القلم")}</div>
    ${GRIP_SVG}
    <ol class="grip-steps">
      <li>${fem("حط القلم على الترابيزة وسنّه ناحيتك")}</li>
      <li>${fem("امسكه بالإبهام والسبابة قريب من السن")}</li>
      <li>${fem("اقلبه لفوق، والصباع الوسطانى يسنده من تحت")}</li>
    </ol>
    <p class="grip-note">${fem("اسند كفّك على الشاشة عادى، زى الكراسة")}</p>
    <button class="candy-btn grip-go" type="button">${fem("يلا نكتب")} ✍️</button>
  </div>`;
  document.body.appendChild(card);
  openCard = card;
  Speech.ar(fem("امسك القلم بصباعين، والصباع الوسطانى يسنده من تحت"));
  const go = card.querySelector(".grip-go");
  go.focus();
  go.addEventListener("click", () => {
    Sfx.tap();
    card.remove();
    openCard = null;
    waiters.splice(0).forEach((f) => { try { f(); } catch (e) {} });
  });
}

/** زرار ✋ صغير يفتح الكارت تانى (بيتحط مع أدوات لوحة الكتابة). */
export function gripButton() {
  const b = document.createElement("button");
  b.className = "candy-btn";
  b.type = "button";
  b.textContent = "✋ مسكة القلم";
  b.addEventListener("click", () => { Sfx.tap(); showGripCard({ force: true }); });
  return b;
}

/**
 * إعدادات اللوحة الخاصة بالقلم — نفسها فى «ارسم الحرف» و«اكتب اسمك».
 * `say(text)` بيعرض جملة ميزو وينطقها.
 */
export function penBoardOptions(say) {
  const { penOnly } = Store.writeSettings;
  let blocked = 0;
  let lastSaid = 0;
  let warned = false;
  return {
    penOnly,
    onPenSeen: () => { if (!Store.writeSettings.penSeen) Store.setWriteSetting("penSeen", true); },
    onTouchBlocked: () => {
      blocked++;
      const now = Date.now();
      // الجهاز عمره ما قرا قلم ذكى وجرّب ٣ مرات: غالباً قلم سنّ مطاط — نقول لولى الأمر
      // يقفل الوضع (مرة واحدة، ومن غير ما الفاصل الزمنى يبلعها)
      if (blocked >= 3 && !warned && !Store.writeSettings.penSeen) {
        warned = true;
        lastSaid = now;
        say("وضع «القلم بس» شغّال، والقلم ده الشاشة بتقراه صباع — اقفله من صفحة ولى الأمر");
        return;
      }
      if (now - lastSaid < 4000) return;
      lastSaid = now;
      say(fem("اكتب بالقلم ✏️"));
    },
  };
}
