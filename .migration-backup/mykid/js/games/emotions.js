// ===== لعبة "المشاعر": اعرف الإحساس =====
// ذكاء عاطفي (SEL): يظهر وجه بمشاعر، والطفل يختار اسم الإحساس الصحيح.
// مهارة مهمّة لكل الأطفال. وجوه SVG واضحة + ميزو يوجّه بلطف.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, diffCount, revealAnswer } from "./common.js";
import { createCharacter } from "./character.js";

// وجوه المشاعر (SVG، viewBox 0 0 100 100)
const base = (extra) => `<svg viewBox="0 0 100 100" class="emo-face" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="#ffd27f"/>
  <circle cx="30" cy="62" r="6" fill="#ff9d9d" opacity=".55"/><circle cx="70" cy="62" r="6" fill="#ff9d9d" opacity=".55"/>
  ${extra}</svg>`;
const FACES = [
  { key: "happy", name: "فرحان", svg: base(`<circle cx="36" cy="46" r="4.5" fill="#5a3a2a"/><circle cx="64" cy="46" r="4.5" fill="#5a3a2a"/><path d="M34 62 Q50 80 66 62" stroke="#7a3b2a" stroke-width="4" fill="none" stroke-linecap="round"/>`) },
  { key: "sad", name: "زعلان", svg: base(`<circle cx="36" cy="48" r="4.5" fill="#5a3a2a"/><circle cx="64" cy="48" r="4.5" fill="#5a3a2a"/><path d="M34 68 Q50 56 66 68" stroke="#7a3b2a" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M30 38 q7 -3 13 1 M57 39 q7 -4 13 -1" stroke="#7a3b2a" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="34" cy="60" rx="3" ry="5" fill="#5ec3f0"/>`) },
  { key: "scared", name: "خايف", svg: base(`<ellipse cx="36" cy="47" rx="6" ry="8" fill="#fff" stroke="#5a3a2a" stroke-width="1.5"/><circle cx="36" cy="48" r="3.5" fill="#5a3a2a"/><ellipse cx="64" cy="47" rx="6" ry="8" fill="#fff" stroke="#5a3a2a" stroke-width="1.5"/><circle cx="64" cy="48" r="3.5" fill="#5a3a2a"/><ellipse cx="50" cy="68" rx="6" ry="8" fill="#7a3b3b"/><path d="M28 34 q8 -5 15 -1 M57 33 q8 -4 15 1" stroke="#7a3b2a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`) },
  { key: "surprised", name: "متفاجئ", svg: base(`<circle cx="36" cy="47" r="6" fill="#fff" stroke="#5a3a2a" stroke-width="1.5"/><circle cx="36" cy="47" r="3.4" fill="#5a3a2a"/><circle cx="64" cy="47" r="6" fill="#fff" stroke="#5a3a2a" stroke-width="1.5"/><circle cx="64" cy="47" r="3.4" fill="#5a3a2a"/><circle cx="50" cy="68" r="8" fill="#7a3b3b"/><path d="M28 33 q8 -6 15 -2 M57 31 q8 -4 15 2" stroke="#7a3b2a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`) },
  { key: "angry", name: "غضبان", svg: base(`<circle cx="36" cy="50" r="4.5" fill="#5a3a2a"/><circle cx="64" cy="50" r="4.5" fill="#5a3a2a"/><path d="M28 40 l16 6 M72 40 l-16 6" stroke="#7a3b2a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M36 70 Q50 60 64 70" stroke="#7a3b2a" stroke-width="4" fill="none" stroke-linecap="round"/>`) },
  { key: "sleepy", name: "نعسان", svg: base(`<path d="M30 48 q6 5 12 0 M58 48 q6 5 12 0" stroke="#5a3a2a" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="50" cy="66" rx="5" ry="4" fill="#7a3b3b"/><text x="78" y="34" font-size="13" fill="#7aa7d8" font-weight="bold">z</text>`) },
];
const ROUNDS = 6;
const pick = (a) => a[(Math.random() * a.length) | 0];

export function renderEmotions({ regionId, regionIndex, title, bg }) {
  let round = 0;
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#ffe0f0,#ffb3d1)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "😊 اعرف الإحساس", back));

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
    mizo.setMood("happy");
    const answer = pick(FACES);
    const others = shuffle(FACES.filter((f) => f.key !== answer.key)).slice(0, diffCount(1, 2));
    const choices = shuffle([answer, ...others]);

    const faceBox = document.createElement("div");
    faceBox.className = "emo-stage";
    faceBox.innerHTML = answer.svg;
    stage.appendChild(faceBox);

    const q = "إيه الإحساس ده؟";
    bubble.textContent = q;
    setTimeout(() => say(q), 150);

    const row = document.createElement("div");
    row.className = "choice-row";
    let solved = false, wrong = 0, correctBtn = null;
    choices.forEach((c) => {
      const b = document.createElement("button");
      b.className = "candy-btn emo-opt";
      b.textContent = c.name;
      if (c.key === answer.key) correctBtn = b;
      b.addEventListener("click", () => {
        if (solved) return;
        if (c.key === answer.key) {
          solved = true;
          Sfx.correct(); b.classList.add("correct");
          mizo.setMood("cheer", 1500);
          awardStars(1);
          say("برافو! ده إحساس " + answer.name, 1500);
          round++;
          if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1300);
          else setTimeout(render, 1400);
        } else {
          Sfx.wrong(); b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
          if (++wrong >= 2) { solved = true; revealAnswer(correctBtn); say("شوف... ده " + answer.name, 1500); setTimeout(render, 2000); }
        }
      });
      row.appendChild(b);
    });
    stage.appendChild(row);
  }

  setTimeout(render, 0);
  return screen;
}
