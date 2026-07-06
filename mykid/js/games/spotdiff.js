// ===== لعبة "اكتشف المختلف": جِد العنصر المختلف بين المتشابهات =====
// تنمّي الانتباه البصري والتمييز عند الطفل. ميزو المستكشف (بعدسته المكبّرة)
// يبحث *مع* الطفل فيزيد التشويق — أجمل من مجرّد صورتين ثابتتين.
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, diffCount } from "./common.js";
import { glyphMarkup } from "./glyph.js";
import { createCharacter } from "./character.js";

const ROUNDS = 6;
const PROMPTS = [
  "دوّر على المختلف يا بطل! 🔎",
  "فين العنصر المختلف؟ ركّز كويس!",
  "عينك حلوة! لاقي المختلف 👀",
  "مين اللي مش زيّ الباقي؟",
];
const pick = (a) => a[(Math.random() * a.length) | 0];

export function renderSpotDiff({ regionId, regionIndex, datasetKey, title, bg }) {
  const ds = getDataset(datasetKey || "animals");
  let round = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#ffe0b3,#ffb38a)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🔎 اكتشف المختلف", back));

  // ميزو المستكشف + فقاعة الحوار
  const teacher = document.createElement("div");
  teacher.className = "lesson-teacher";
  teacher.innerHTML = `<div class="miz-slot"></div><div class="teacher-bubble"></div>`;
  screen.appendChild(teacher);
  const mizo = createCharacter();
  teacher.querySelector(".miz-slot").appendChild(mizo.el);
  const bubble = teacher.querySelector(".teacher-bubble");

  const grid = document.createElement("div");
  grid.className = "spot-grid";
  screen.appendChild(grid);

  const say = (t, ms) => { mizo.startTalking(ms || t.length * 90 + 900); Speech.mizo(t); };

  function render() {
    grid.innerHTML = "";
    mizo.setMood("explore"); // وضعية البحث بالعدسة المكبّرة
    const n = diffCount(4, 6); // الصغار ٤ عناصر، الكبار ٦ (أصعب)
    const [base, odd] = shuffle(ds.items).slice(0, 2);
    const oddPos = (Math.random() * n) | 0;
    const prompt = pick(PROMPTS);
    bubble.textContent = prompt;
    setTimeout(() => say(prompt), 150);

    let solved = false, wrong = 0;
    for (let i = 0; i < n; i++) {
      const b = document.createElement("button");
      b.className = "choice spot-cell";
      b.innerHTML = glyphMarkup(i === oddPos ? odd : base, "spot-glyph");
      b.addEventListener("click", () => {
        if (solved) return;
        if (i === oddPos) {
          solved = true;
          b.classList.add("correct");
          Sfx.correct();
          mizo.setMood("cheer", 1500);
          awardStars(1);
          say("برافو! دي المختلفة 👏", 1400);
          round++;
          if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1200);
          else setTimeout(render, 1300);
        } else {
          Sfx.wrong();
          b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
          // تلميح لطيف بعد محاولتين: ميزو يأشّر للمختلف (وضعية point)
          if (++wrong >= 2 && !solved) {
            mizo.setMood("point", 1600);
            grid.children[oddPos].classList.add("reveal-hint");
            say("بصّ هنا... دي المختلفة!", 1500);
          }
        }
      });
      grid.appendChild(b);
    }
  }

  setTimeout(render, 0);
  return screen;
}
