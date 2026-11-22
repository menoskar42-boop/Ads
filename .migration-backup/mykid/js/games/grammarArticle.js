// ===== English grammar: "a or an?" (الأدوات a/an) =====
// قواعد متقدّمة (للأكبر من ٦): الطفل يختار a أو an قبل الكلمة.
// ميزو يشرح بالعامية: لو الكلمة بتبدأ بصوت متحرك (a,e,i,o,u) بنقول an.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity } from "./common.js";
import { createCharacter } from "./character.js";

// an قبل صوت متحرك (a,e,i,o,u) — a قبل غيره
const WORDS = [
  { emoji: "🍎", word: "apple", art: "an" },
  { emoji: "🥚", word: "egg", art: "an" },
  { emoji: "🍊", word: "orange", art: "an" },
  { emoji: "☂️", word: "umbrella", art: "an" },
  { emoji: "🐘", word: "elephant", art: "an" },
  { emoji: "📕", word: "book", art: "a" },
  { emoji: "🐱", word: "cat", art: "a" },
  { emoji: "🐶", word: "dog", art: "a" },
  { emoji: "⚽", word: "ball", art: "a" },
  { emoji: "🌳", word: "tree", art: "a" },
  { emoji: "☀️", word: "sun", art: "a" },
  { emoji: "🏠", word: "house", art: "a" },
];
const ROUNDS = 6;
const pick = (a) => a[(Math.random() * a.length) | 0];

export function renderArticle({ regionId, regionIndex, title, bg }) {
  let round = 0;
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#bfe3ff,#7aa8f0)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🔤 a or an?", back));

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
    const item = pick(WORDS);

    const card = document.createElement("div");
    card.className = "gp-card";
    card.innerHTML = `<div class="gp-emoji">${item.emoji}</div>
      <div class="gp-word">…… <b>${item.word}</b></div>`;
    stage.appendChild(card);

    const q = "نقول a ولا an؟";
    bubble.textContent = q;
    const lead = intro
      ? "لو الكلمة بتبدأ بصوت متحرك (a,e,i,o,u) بنقول an، وغير كده بنقول a. " + q
      : q;
    intro = false;
    setTimeout(() => say(lead), 150);

    const row = document.createElement("div");
    row.className = "choice-row";
    let solved = false, wrong = 0, correctBtn = null;
    shuffle(["a", "an"]).forEach((art) => {
      const b = document.createElement("button");
      b.className = "candy-btn gp-opt";
      b.textContent = art;
      if (art === item.art) correctBtn = b;
      b.addEventListener("click", () => {
        if (solved) return;
        if (art === item.art) {
          solved = true;
          Sfx.correct(); b.classList.add("correct");
          mizo.setMood("cheer", 1600);
          awardStars(1);
          setTimeout(() => Speech.say(`${item.art} ${item.word}`, { lang: "en-US" }), 100);
          say(`صحّ! بنقول «${item.art} ${item.word}»`, 1700);
          round++;
          if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1700);
          else setTimeout(render, 2000);
        } else {
          Sfx.wrong(); b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
          if (++wrong >= 2) {
            solved = true;
            revealOK(correctBtn);
            say(`شوف... الصح «${item.art} ${item.word}»`, 1700);
            setTimeout(render, 2100);
          }
        }
      });
      row.appendChild(b);
    });
    stage.appendChild(row);
  }

  function revealOK(btn) { if (btn) btn.classList.add("correct"); }

  setTimeout(render, 0);
  return screen;
}
