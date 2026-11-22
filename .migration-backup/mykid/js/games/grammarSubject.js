// ===== لعبة "مين الفاعل؟" (أركان الجملة) =====
// قواعد متقدّمة (للأكبر من ٦): الطفل يضغط على الركن المطلوب داخل الجملة:
// الفاعل (جملة فعلية) أو المبتدأ والخبر (جملة اسمية). ميزو يشرح بلطف.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity } from "./common.js";
import { createCharacter } from "./character.js";

const CATS = {
  فاعل: { ask: "الفاعل", hint: "الفاعل هو اللي عمل الفعل" },
  مبتدأ: { ask: "المبتدأ", hint: "المبتدأ هو اللي بنبدأ بيه الجملة الاسمية" },
  خبر: { ask: "الخبر", hint: "الخبر بيكمّل معنى المبتدأ" },
};
const SENTENCES = [
  { cat: "فاعل", words: ["لعب", "الولدُ", "بالكورة"], target: 1 },
  { cat: "فاعل", words: ["كتبت", "البنتُ", "الدرسَ"], target: 1 },
  { cat: "فاعل", words: ["طار", "العصفورُ", "عاليًا"], target: 1 },
  { cat: "مبتدأ", words: ["القمرُ", "منيرٌ"], target: 0 },
  { cat: "مبتدأ", words: ["الوردةُ", "جميلةٌ"], target: 0 },
  { cat: "خبر", words: ["الجوُّ", "جميلٌ"], target: 1 },
  { cat: "خبر", words: ["الكتابُ", "مفيدٌ"], target: 1 },
];
const ROUNDS = 6;

export function renderSubject({ regionId, regionIndex, title, bg }) {
  let round = 0;
  const pool = shuffle(SENTENCES.slice());
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#e6ffd6,#bff09a)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🎯 مين الفاعل؟", back));

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
          say(`صحّ! «${w}» هو ${cat.ask}`, 1700);
          round++;
          if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1700);
          else setTimeout(render, 1900);
        } else {
          Sfx.wrong(); chip.classList.add("wrong");
          setTimeout(() => chip.classList.remove("wrong"), 450);
          if (++wrong >= 2) {
            solved = true;
            chips[sc.target].classList.add("correct");
            say(`شوف... «${sc.words[sc.target]}» هو ${cat.ask}`, 1900);
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
