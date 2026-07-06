// ===== آداب وسلوك: مواقف يومية يختار فيها الطفل التصرّف الصحيح =====
// عامّة ومهذّبة (شكر، اعتذار، نظافة، ترتيب، مساعدة، استئذان).
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity } from "./common.js";
import { createCharacter } from "./character.js";
import { adaptDisplay } from "../data/mizo.js";
import { Store } from "../core/storage.js";

const SITUATIONS = [
  { emoji: "🎁", q: "أعطاك صديقك هديّة، ماذا تقول؟", options: [{ t: "شُكراً لك", ok: true }, { t: "لا شيء", ok: false }] },
  { emoji: "🙏", q: "تريد قلمَ زميلك، ماذا تقول؟", options: [{ t: "من فضلك", ok: true }, { t: "آخذه بلا إذن", ok: false }] },
  { emoji: "😟", q: "أخطأتَ في حقّ أخيك، ماذا تقول؟", options: [{ t: "أنا آسف", ok: true }, { t: "لا أهتمّ", ok: false }] },
  { emoji: "🧼", q: "قبل أن تأكل، ماذا تفعل؟", options: [{ t: "أغسل يديّ", ok: true }, { t: "ألعب بالطين", ok: false }] },
  { emoji: "🧸", q: "انتهيتَ من اللعب، ماذا تفعل بالألعاب؟", options: [{ t: "أرتّبها", ok: true }, { t: "أتركها مبعثرة", ok: false }] },
  { emoji: "🧓", q: "ركبتَ الحافلة ووجدتَ جدّاً واقفاً، ماذا تفعل؟", options: [{ t: "أعطيه مكاني", ok: true }, { t: "أبقى جالساً", ok: false }] },
  { emoji: "😢", q: "صديقك حزين، ماذا تفعل؟", options: [{ t: "أواسيه وأساعده", ok: true }, { t: "أضحك عليه", ok: false }] },
  { emoji: "🤧", q: "أردتَ أن تعطس، ماذا تفعل؟", options: [{ t: "أغطّي فمي", ok: true }, { t: "أعطس على الناس", ok: false }] },
];
const ROUNDS = 6;

export function renderManners({ regionId, regionIndex, title }) {
  const rounds = shuffle(SITUATIONS).slice(0, ROUNDS);
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffe6f0,#ffb3c8)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🤝 آداب وسلوك", back));

  const wrap = document.createElement("div");
  wrap.className = "lesson";
  screen.appendChild(wrap);

  const pic = document.createElement("div");
  pic.style.cssText = "font-size:clamp(64px,18vw,110px);text-align:center";
  wrap.appendChild(pic);

  const teacher = document.createElement("div");
  teacher.className = "lesson-teacher";
  teacher.innerHTML = `<div class="miz-slot"></div><div class="teacher-bubble"></div>`;
  wrap.appendChild(teacher);
  const mizo = createCharacter();
  teacher.querySelector(".miz-slot").appendChild(mizo.el);
  const bubble = teacher.querySelector(".teacher-bubble");

  const row = document.createElement("div");
  row.style.cssText = "display:flex;flex-direction:column;gap:12px;align-items:center;margin:14px 12px";
  wrap.appendChild(row);

  function say(text, ms) { mizo.startTalking(ms || text.length * 85 + 1400); Speech.mizo(text); }
  const disp = (t) => adaptDisplay(t, Store.childGender, Store.childName);

  function render() {
    const s = rounds[i];
    pic.textContent = s.emoji;
    bubble.textContent = disp(s.q);
    mizo.setMood("happy");
    row.innerHTML = "";
    setTimeout(() => say(s.q), 150);
    shuffle(s.options).forEach((opt) => {
      const b = document.createElement("button");
      b.className = "candy-btn";
      b.style.cssText = "min-width:min(80vw,320px);font-size:clamp(16px,4.6vw,21px)";
      if (!opt.ok) b.style.background = "linear-gradient(180deg,#9aa7ff,#6b7cff)";
      b.textContent = opt.t;
      b.addEventListener("click", () => {
        if (opt.ok) {
          Sfx.correct();
          mizo.setMood("cheer", 1600);
          bubble.textContent = disp(`أحسنت! نقول: ${opt.t}`);
          say(`أحسنت! نقول: ${opt.t}`, 1900);
          awardStars(1);
          i++;
          if (i >= rounds.length) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1200);
          else setTimeout(render, 1400);
        } else {
          Sfx.wrong();
          b.classList.add("wrong");
          say("يلا نفكّر تاني", 1400);
          setTimeout(() => b.classList.remove("wrong"), 500);
        }
      });
      row.appendChild(b);
    });
  }

  setTimeout(render, 150);
  return screen;
}
