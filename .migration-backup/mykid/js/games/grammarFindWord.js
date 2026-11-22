// ===== لعبة "دوّر على الكلمة" (الكلمة جوّه الجملة) =====
// مهارة قراءة في سياق: الطفل يضغط على الكلمة المطلوبة داخل جملة مكتوبة
// (حرف الجر أو الفعل). ميزو يقول المطلوب ويشرح بلطف. (للفئة الأكبر ٥–٦)
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity } from "./common.js";
import { createCharacter } from "./character.js";

// جمل قصيرة مألوفة، لكل جملة الكلمة المطلوبة (target) ونوعها
const CATS = {
  prep: { ask: "حرف الجر", hint: "حرف الجر بيقول مكان الحاجة، زي: في، على، من، إلى" },
  verb: { ask: "الفعل", hint: "الفعل هو الكلمة اللي بتقول العمل اللي بيحصل" },
};
const SENTENCES = [
  { cat: "prep", words: ["الكتاب", "في", "الحقيبة"], target: 1 },
  { cat: "prep", words: ["القطة", "على", "الكرسي"], target: 1 },
  { cat: "prep", words: ["خرج", "الولد", "من", "البيت"], target: 2 },
  { cat: "prep", words: ["ذهبت", "إلى", "المدرسة"], target: 1 },
  { cat: "prep", words: ["العصفور", "على", "الشجرة"], target: 1 },
  { cat: "verb", words: ["الولد", "يلعب", "بالكرة"], target: 1 },
  { cat: "verb", words: ["البنت", "ترسم", "لوحة"], target: 1 },
  { cat: "verb", words: ["العصفور", "يطير", "عاليًا"], target: 1 },
  { cat: "verb", words: ["الأم", "تطبخ", "الطعام"], target: 1 },
  { cat: "verb", words: ["الكلب", "يجري", "بسرعة"], target: 1 },
];
const ROUNDS = 6;

export function renderFindWord({ regionId, regionIndex, title, bg }) {
  let round = 0;
  const pool = shuffle(SENTENCES.slice());
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#fff0d6,#ffd8a8)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🔎 دوّر على الكلمة", back));

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
    const sc = pool[round % pool.length];
    const cat = CATS[sc.cat];

    const sent = document.createElement("div");
    sent.className = "fw-sentence";
    const chips = [];
    let solved = false, wrong = 0;
    sc.words.forEach((w, i) => {
      const chip = document.createElement("button");
      chip.className = "fw-word";
      chip.textContent = w;
      chip.addEventListener("click", () => {
        if (solved) return;
        if (i === sc.target) {
          solved = true;
          Sfx.correct(); chip.classList.add("correct");
          mizo.setMood("cheer", 1600);
          awardStars(1);
          say(`صحّ! «${w}» ${sc.cat === "prep" ? "ده حرف جر" : "ده الفعل"}`, 1700);
          round++;
          if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1700);
          else setTimeout(render, 1900);
        } else {
          Sfx.wrong(); chip.classList.add("wrong");
          setTimeout(() => chip.classList.remove("wrong"), 450);
          if (++wrong >= 2) {
            solved = true;
            chips[sc.target].classList.add("correct");
            say(`شوف... «${sc.words[sc.target]}» هي ${cat.ask}`, 1900);
            setTimeout(render, 2200);
          }
        }
      });
      chips.push(chip);
      sent.appendChild(chip);
    });

    const q = `دوّر على ${cat.ask} في الجملة`;
    bubble.textContent = q;
    setTimeout(() => say(round === 0 ? cat.hint + ". " + q : q), 150);

    stage.appendChild(sent);
  }

  setTimeout(render, 0);
  return screen;
}
