// ===== لعبة "واحد ولا كتير؟" (المفرد والجمع) =====
// مفهوم نحوي أساسي ومحسوس: الطفل يشوف شيئًا واحدًا أو أشياء كثيرة،
// ويختار «واحد» (مفرد) أو «كتير» (جمع). ميزو يعلّم ويقول صيغة الجمع.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, revealAnswer } from "./common.js";
import { createCharacter } from "./character.js";

// كلمات مألوفة بصيغتها المفردة والجمع
const ITEMS = [
  { emoji: "✏️", one: "قلم", many: "أقلام" },
  { emoji: "📕", one: "كتاب", many: "كُتُب" },
  { emoji: "🍎", one: "تفاحة", many: "تفّاح" },
  { emoji: "🌹", one: "وردة", many: "ورود" },
  { emoji: "⭐", one: "نجمة", many: "نجوم" },
  { emoji: "🐦", one: "عصفور", many: "عصافير" },
  { emoji: "🐟", one: "سمكة", many: "سمك" },
  { emoji: "🚗", one: "عربية", many: "عربيات" },
  { emoji: "🎈", one: "بالونة", many: "بالونات" },
  { emoji: "🦋", one: "فراشة", many: "فراشات" },
];
const ROUNDS = 6;
const pick = (a) => a[(Math.random() * a.length) | 0];

export function renderNumberPick({ regionId, regionIndex, title, bg }) {
  let round = 0;
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#ffe9c7,#ffd29b)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🔢 واحد ولا كتير؟", back));

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
    const isMany = Math.random() < 0.5;
    const count = isMany ? 3 + ((Math.random() * 2) | 0) : 1; // 3 أو 4 للجمع، 1 للمفرد

    const card = document.createElement("div");
    card.className = "gp-card";
    card.innerHTML = `<div class="gn-row">${Array.from({ length: count }, () => `<span>${item.emoji}</span>`).join("")}</div>`;
    stage.appendChild(card);

    const q = "ده واحد ولا كتير؟";
    bubble.textContent = q;
    const lead = intro ? "لما يبقى شيء واحد بنقول «مفرد»، ولما يبقوا كتير بنقول «جمع». " + q : q;
    intro = false;
    setTimeout(() => say(lead), 150);

    const opts = [
      { label: "واحد", many: false },
      { label: "كتير", many: true },
    ];
    const row = document.createElement("div");
    row.className = "choice-row";
    let solved = false, wrong = 0, correctBtn = null;
    shuffle(opts).forEach((o) => {
      const b = document.createElement("button");
      b.className = "candy-btn gp-opt";
      b.textContent = o.label;
      if (o.many === isMany) correctBtn = b;
      b.addEventListener("click", () => {
        if (solved) return;
        if (o.many === isMany) {
          solved = true;
          Sfx.correct(); b.classList.add("correct");
          mizo.setMood("cheer", 1600);
          awardStars(1);
          const why = isMany
            ? `صحّ! دول ${item.many} كتير — دي جمع`
            : `صحّ! ده ${item.one} واحد — ده مفرد`;
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
            say(isMany ? `شوف... دول كتير، ${item.many}` : `شوف... ده ${item.one} واحد بس`, 1900);
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
