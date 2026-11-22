// ===== لعبة "الاسم الموصول" (الذي/التي/الذين/اللاتي) =====
// قواعد متقدّمة (للأكبر من ٦): يكمّل الطفل الجملة بالاسم الموصول المناسب
// حسب نوع الاسم (مذكّر/مؤنّث، مفرد/جمع). ميزو يشرح ويفرح.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, diffCount, revealAnswer } from "./common.js";
import { createCharacter } from "./character.js";

// جمل: لكلٍّ الاسم الموصول الصحيح + سبب مبسّط
const ITEMS = [
  { emoji: "👦", subj: "الولد", rest: "يلعب", rel: "الذي" },
  { emoji: "👧", subj: "البنت", rest: "ترسم", rel: "التي" },
  { emoji: "👨‍👩‍👧‍👦", subj: "الأولاد", rest: "يلعبون", rel: "الذين" },
  { emoji: "👭", subj: "البنات", rest: "يقرأن", rel: "اللاتي" },
  { emoji: "🐱", subj: "القطة", rest: "تنام", rel: "التي" },
  { emoji: "🦁", subj: "الأسد", rest: "يزأر", rel: "الذي" },
];
const POOL = ["الذي", "التي", "الذين", "اللاتي"];
const ROUNDS = 6;
const pick = (a) => a[(Math.random() * a.length) | 0];

export function renderRelative({ regionId, regionIndex, title, bg }) {
  let round = 0;
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#ffe0ec,#ffc2d6)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🔗 الاسم الموصول", back));

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
    const item = pick(ITEMS);
    const others = shuffle(POOL.filter((p) => p !== item.rel)).slice(0, diffCount(1, 2));
    const choices = shuffle([item.rel, ...others]);

    const card = document.createElement("div");
    card.className = "gp-card";
    card.innerHTML = `<div class="gp-emoji">${item.emoji}</div>
      <div class="gp-word">${item.subj} <b>……</b> ${item.rest}</div>`;
    stage.appendChild(card);

    const q = "نكمّل بأنهي اسم موصول؟";
    bubble.textContent = q;
    setTimeout(() => say(q), 150);

    const row = document.createElement("div");
    row.className = "choice-row";
    let solved = false, wrong = 0, correctBtn = null;
    choices.forEach((c) => {
      const b = document.createElement("button");
      b.className = "candy-btn gp-opt";
      b.textContent = c;
      if (c === item.rel) correctBtn = b;
      b.addEventListener("click", () => {
        if (solved) return;
        if (c === item.rel) {
          solved = true;
          Sfx.correct(); b.classList.add("correct");
          mizo.setMood("cheer", 1600);
          awardStars(1);
          say(`صحّ! بنقول «${item.subj} ${item.rel} ${item.rest}»`, 1900);
          round++;
          if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1700);
          else setTimeout(render, 1900);
        } else {
          Sfx.wrong(); b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
          if (++wrong >= 2) {
            solved = true;
            revealAnswer(correctBtn);
            say(`شوف... الصح «${item.rel}»`, 1700);
            setTimeout(render, 2100);
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
