// ===== لعبة "ده ولا دي؟" (المذكر والمؤنث: هذا / هذه) =====
// أساس نحوي مهم: الطفل يشوف الصورة والكلمة، ويختار "هذا" للمذكّر أو "هذه" للمؤنّث.
// ميزو يعلّم القاعدة البسيطة بلطف: التاء المربوطة (ة) في الآخر غالبًا علامة مؤنّث.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, revealAnswer } from "./common.js";
import { createCharacter } from "./character.js";

// أشياء مألوفة للطفل، نصفها مذكّر ونصفها مؤنّث (أغلب المؤنّث بتاء مربوطة واضحة)
const ITEMS = [
  { emoji: "✏️", word: "قلم", g: "m" },
  { emoji: "📕", word: "كتاب", g: "m" },
  { emoji: "🦁", word: "أسد", g: "m" },
  { emoji: "🌙", word: "قمر", g: "m" },
  { emoji: "🏠", word: "بيت", g: "m" },
  { emoji: "🐘", word: "فيل", g: "m" },
  { emoji: "🐴", word: "حصان", g: "m" },
  { emoji: "🚪", word: "باب", g: "m" },
  { emoji: "🌹", word: "وردة", g: "f" },
  { emoji: "🍎", word: "تفاحة", g: "f" },
  { emoji: "⚽", word: "كرة", g: "f" },
  { emoji: "🚗", word: "سيارة", g: "f" },
  { emoji: "🌳", word: "شجرة", g: "f" },
  { emoji: "🦆", word: "بطة", g: "f" },
  { emoji: "🐟", word: "سمكة", g: "f" },
  { emoji: "🐝", word: "نحلة", g: "f" },
];
const ROUNDS = 6;
const pick = (a) => a[(Math.random() * a.length) | 0];

export function renderGenderPick({ regionId, regionIndex, title, bg }) {
  let round = 0;
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#d7e9ff,#bcd6ff)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "👈 ده ولا دي؟", back));

  const teacher = document.createElement("div");
  teacher.className = "lesson-teacher";
  teacher.innerHTML = `<div class="miz-slot"></div><div class="teacher-bubble"></div>`;
  screen.appendChild(teacher);
  const mizo = createCharacter();
  teacher.querySelector(".miz-slot").appendChild(mizo.el);
  const bubble = teacher.querySelector(".teacher-bubble");

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);
  const say = (t, ms) => { mizo.startTalking(ms || t.length * 90 + 900); Speech.mizo(t); };

  let intro = true;
  function render() {
    stage.innerHTML = "";
    mizo.setMood("teach");
    const item = pick(ITEMS);

    const card = document.createElement("div");
    card.className = "gp-card";
    card.innerHTML = `<div class="gp-emoji">${item.emoji}</div>
      <div class="gp-word">…… <b>${item.word}</b></div>`;
    stage.appendChild(card);

    const q = "نقول «هذا» ولا «هذه»؟";
    bubble.textContent = q;
    const lead = intro
      ? "لو آخر الكلمة فيه تاء مربوطة (ة) بنقول «هذه»، وغير كده بنقول «هذا». " + q
      : q;
    intro = false;
    setTimeout(() => say(lead), 150);

    const opts = [
      { label: "هذا", g: "m" },
      { label: "هذه", g: "f" },
    ];
    const row = document.createElement("div");
    row.className = "choice-row";
    let solved = false, wrong = 0, correctBtn = null;
    shuffle(opts).forEach((o) => {
      const b = document.createElement("button");
      b.className = "candy-btn gp-opt";
      b.textContent = o.label;
      if (o.g === item.g) correctBtn = b;
      b.addEventListener("click", () => {
        if (solved) return;
        if (o.g === item.g) {
          solved = true;
          Sfx.correct(); b.classList.add("correct");
          mizo.setMood("cheer", 1600);
          awardStars(1);
          const why = item.g === "f"
            ? `صحّ! بنقول «هذه ${item.word}» — شُفت التاء المربوطة في الآخر؟ دي علامة المؤنّث`
            : `صحّ! بنقول «هذا ${item.word}» 👍`;
          say(why, 2000);
          round++;
          if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1700);
          else setTimeout(render, 1900);
        } else {
          Sfx.wrong(); b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
          if (++wrong >= 2) {
            solved = true;
            revealAnswer(correctBtn);
            say(`شوف... بنقول «${item.g === "f" ? "هذه" : "هذا"} ${item.word}»`, 1900);
            setTimeout(render, 2200);
          }
        }
      });
      row.appendChild(b);
    });
    stage.appendChild(row);
  }

  setTimeout(render, 0);
  return screen;
}
