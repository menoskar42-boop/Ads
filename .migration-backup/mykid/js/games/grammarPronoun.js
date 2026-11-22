// ===== لعبة "الضمير الصح" (الضمائر) — عربي/إنجليزي =====
// قواعد متقدّمة (للأكبر من ٦): الطفل يشوف من نتكلّم عنه ويختار الضمير الصحيح.
// ميزو يشرح بالعامية ويفرح. تدعم العربية (هو/هي/هم/هنّ) والإنجليزية (he/she/they/it).
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, diffCount, revealAnswer } from "./common.js";
import { createCharacter } from "./character.js";

const SETS = {
  ar: [
    { emoji: "👦", label: "ولد واحد", pr: "هو" },
    { emoji: "👧", label: "بنت واحدة", pr: "هي" },
    { emoji: "👨‍👩‍👧‍👦", label: "ناس كتير", pr: "هم" },
    { emoji: "👭", label: "بنات", pr: "هنّ" },
  ],
  en: [
    { emoji: "👦", label: "a boy", pr: "he" },
    { emoji: "👧", label: "a girl", pr: "she" },
    { emoji: "👨‍👩‍👧‍👦", label: "people", pr: "they" },
    { emoji: "🐱", label: "a thing / animal", pr: "it" },
  ],
};
const ROUNDS = 6;
const pick = (a) => a[(Math.random() * a.length) | 0];

export function renderPronoun({ regionId, regionIndex, title, bg, lang }) {
  const isEn = lang === "en-US" || lang === "en";
  const set = isEn ? SETS.en : SETS.ar;
  let round = 0;
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#e7d8ff,#c9b3ff)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || (isEn ? "🧑 Pick the pronoun" : "🧑 الضمير الصح"), back));

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
    const answer = pick(set);
    const others = shuffle(set.filter((s) => s.pr !== answer.pr)).slice(0, diffCount(1, 2));
    const choices = shuffle([answer, ...others]);

    const card = document.createElement("div");
    card.className = "gp-card";
    card.innerHTML = `<div class="gp-emoji">${answer.emoji}</div>
      <div class="gp-word">${answer.label}</div>`;
    stage.appendChild(card);

    const q = isEn ? "نختار أنهي ضمير؟ (he/she/they/it)" : "نختار أنهي ضمير؟";
    bubble.textContent = q;
    setTimeout(() => say(q), 150);

    const row = document.createElement("div");
    row.className = "choice-row";
    let solved = false, wrong = 0, correctBtn = null;
    choices.forEach((c) => {
      const b = document.createElement("button");
      b.className = "candy-btn gp-opt";
      b.textContent = c.pr;
      if (c.pr === answer.pr) correctBtn = b;
      b.addEventListener("click", () => {
        if (solved) return;
        if (c.pr === answer.pr) {
          solved = true;
          Sfx.correct(); b.classList.add("correct");
          mizo.setMood("cheer", 1600);
          awardStars(1);
          say(`صحّ! ${answer.label} بنقول لها «${answer.pr}»`, 1800);
          round++;
          if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1700);
          else setTimeout(render, 1900);
        } else {
          Sfx.wrong(); b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
          if (++wrong >= 2) {
            solved = true;
            revealAnswer(correctBtn);
            say(`شوف... الصح هو «${answer.pr}»`, 1700);
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
