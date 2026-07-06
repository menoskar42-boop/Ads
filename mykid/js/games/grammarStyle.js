// ===== لعبة "نوع الأسلوب" (الأساليب اللغوية) =====
// قواعد متقدّمة (للأكبر من ٦): يقرأ الطفل جملة ويحدّد أسلوبها:
// تعجب / نداء / أمر / استفهام / نفي. ميزو يشرح علامة كل أسلوب.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, diffCount, revealAnswer } from "./common.js";
import { createCharacter } from "./character.js";

const ITEMS = [
  { text: "ما أجملَ السماء!", type: "تعجب", why: "علامته «ما أجمل…!»" },
  { text: "ما أحلى الربيع!", type: "تعجب", why: "علامته «ما أحلى…!»" },
  { text: "يا أحمد، تعال", type: "نداء", why: "علامته حرف النداء «يا»" },
  { text: "يا أمي، أنا جاهز", type: "نداء", why: "علامته حرف النداء «يا»" },
  { text: "اكتب الدرس", type: "أمر", why: "بيطلب نعمل حاجة" },
  { text: "اغسل يديك", type: "أمر", why: "بيطلب نعمل حاجة" },
  { text: "أين الكتاب؟", type: "استفهام", why: "بيسأل، وآخره علامة استفهام؟" },
  { text: "متى نلعب؟", type: "استفهام", why: "بيسأل، وآخره علامة استفهام؟" },
  { text: "لا أحب الكذب", type: "نفي", why: "علامته أداة النفي «لا»" },
  { text: "ما نسيتُ واجبي", type: "نفي", why: "علامته أداة النفي «ما»" },
];
const POOL = ["تعجب", "نداء", "أمر", "استفهام", "نفي"];
const ROUNDS = 6;
const pick = (a) => a[(Math.random() * a.length) | 0];

export function renderStyle({ regionId, regionIndex, title, bg }) {
  let round = 0;
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#d9f2ff,#aee3ff)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🗣️ نوع الأسلوب", back));

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
    const others = shuffle(POOL.filter((p) => p !== item.type)).slice(0, diffCount(1, 2));
    const choices = shuffle([item.type, ...others]);

    const card = document.createElement("div");
    card.className = "gp-card";
    card.innerHTML = `<div class="gp-sentence">${item.text}</div>`;
    stage.appendChild(card);

    const q = "الجملة دي أسلوب إيه؟";
    bubble.textContent = q;
    setTimeout(() => say(q + " " + item.text), 150);

    const row = document.createElement("div");
    row.className = "choice-row";
    let solved = false, wrong = 0, correctBtn = null;
    choices.forEach((c) => {
      const b = document.createElement("button");
      b.className = "candy-btn gp-opt";
      b.textContent = c;
      if (c === item.type) correctBtn = b;
      b.addEventListener("click", () => {
        if (solved) return;
        if (c === item.type) {
          solved = true;
          Sfx.correct(); b.classList.add("correct");
          mizo.setMood("cheer", 1600);
          awardStars(1);
          say(`صحّ! دي جملة ${item.type} — ${item.why}`, 2100);
          round++;
          if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1700);
          else setTimeout(render, 2000);
        } else {
          Sfx.wrong(); b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
          if (++wrong >= 2) {
            solved = true;
            revealAnswer(correctBtn);
            say(`شوف... دي ${item.type}، ${item.why}`, 2000);
            setTimeout(render, 2300);
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
