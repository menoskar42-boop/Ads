// ===== لعبة "ميزو بيسأل" (أدوات الاستفهام) =====
// يتعلّم الطفل وظيفة كل أداة سؤال: نسأل عن المكان بـ«فين»، عن الشخص بـ«مين»…
// ميزو يوجّه بلطف ويقول القاعدة، مع تلميح بصري لكل نوع.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, diffCount, revealAnswer } from "./common.js";
import { createCharacter } from "./character.js";

// أدوات السؤال بالعامية المصرية + وظيفة كل واحدة وتلميح بصري
const CATS = [
  { hint: "📍", label: "المكان", word: "فين" },
  { hint: "🧑", label: "الشخص", word: "مين" },
  { hint: "⏰", label: "الوقت", word: "إمتى" },
  { hint: "🔢", label: "العدد", word: "كام" },
  { hint: "🎒", label: "الحاجة", word: "إيه" },
];
const ROUNDS = 6;
const pick = (a) => a[(Math.random() * a.length) | 0];

export function renderAskWord({ regionId, regionIndex, title, bg }) {
  let round = 0;
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#d6f5e3,#a8e6cf)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "❓ ميزو بيسأل", back));

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

  function render() {
    stage.innerHTML = "";
    mizo.setMood("teach");
    const answer = pick(CATS);
    const others = shuffle(CATS.filter((c) => c.word !== answer.word)).slice(0, diffCount(1, 2));
    const choices = shuffle([answer, ...others]);

    const card = document.createElement("div");
    card.className = "gp-card";
    card.innerHTML = `<div class="gp-emoji">${answer.hint}</div>
      <div class="gp-word">بنسأل عن <b>${answer.label}</b> بأنهي كلمة؟</div>`;
    stage.appendChild(card);

    const q = `نسأل عن ${answer.label} بإيه؟`;
    bubble.textContent = q;
    setTimeout(() => say(q), 150);

    const row = document.createElement("div");
    row.className = "choice-row";
    let solved = false, wrong = 0, correctBtn = null;
    choices.forEach((c) => {
      const b = document.createElement("button");
      b.className = "candy-btn gp-opt";
      b.textContent = c.word;
      if (c.word === answer.word) correctBtn = b;
      b.addEventListener("click", () => {
        if (solved) return;
        if (c.word === answer.word) {
          solved = true;
          Sfx.correct(); b.classList.add("correct");
          mizo.setMood("cheer", 1600);
          awardStars(1);
          say(`صحّ! بنسأل عن ${answer.label} بـ «${answer.word}»`, 1900);
          round++;
          if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1700);
          else setTimeout(render, 1900);
        } else {
          Sfx.wrong(); b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
          if (++wrong >= 2) {
            solved = true;
            revealAnswer(correctBtn);
            say(`شوف... نسأل عن ${answer.label} بـ «${answer.word}»`, 1900);
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
