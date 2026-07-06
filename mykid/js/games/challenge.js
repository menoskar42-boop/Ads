// ===== تحدّي ميزو: اختبار سريع ممتع من عدّة أقسام (مراجعة بمتعة المنافسة) =====
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, showCheer, diffCount } from "./common.js";
import { glyphMarkup } from "./glyph.js";
import { pick, MIZO_PRAISE, MIZO_ENCOURAGE, MIZO_CATCH } from "../data/mizo.js";

const DS_KEYS = ["animals", "fruits", "colors", "shapes", "birds", "food", "transport", "insects"];
const ROUNDS = 8;

export function renderChallenge() {
  // نبني أسئلة من أقسام متنوّعة (لكل سؤال: عنصر هدف + بدائل من نفس القسم)
  const questions = [];
  const keys = shuffle(DS_KEYS);
  for (const k of keys) {
    if (questions.length >= ROUNDS) break;
    const ds = getDataset(k);
    if (!ds || !ds.items) continue;
    const pool = ds.items.filter((it) => it.name);
    if (pool.length < 3) continue;
    const picks = shuffle(pool).slice(0, 2); // سؤالان كحدّ أقصى لكل قسم للتنوّع
    picks.forEach((target) => {
      if (questions.length >= ROUNDS) return;
      const distractors = shuffle(pool.filter((x) => x !== target)).slice(0, diffCount(1, 2));
      questions.push({ target, options: shuffle([target, ...distractors]), lang: ds.lang || "ar-EG" });
    });
  }

  let i = 0, score = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#a1ffce,#faffd1)";
  screen.appendChild(gameTopbar("🏆 تحدّي ميزو", () => Router.go("funHub")));

  const bar = document.createElement("p");
  bar.style.cssText = "text-align:center;font-weight:800;color:#2a7;font-size:clamp(15px,4vw,19px);margin:8px";
  screen.appendChild(bar);

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function render() {
    const q = questions[i];
    bar.textContent = `سؤال ${i + 1} من ${questions.length}  ·  ⭐ ${score}`;
    stage.innerHTML = "";

    const ask = document.createElement("p");
    ask.style.cssText = "font-weight:800;color:#2a7;font-size:clamp(18px,5vw,24px)";
    ask.textContent = "ما اسم هذا؟";
    stage.appendChild(ask);

    const pic = document.createElement("div");
    pic.style.cssText = "font-size:clamp(60px,18vw,110px);margin:6px";
    pic.innerHTML = glyphMarkup(q.target);
    stage.appendChild(pic);
    Speech.say(q.target.name, { lang: q.lang });

    const row = document.createElement("div");
    row.className = "choice-row";
    q.options.forEach((opt) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.style.cssText = "flex-direction:row;font-size:clamp(16px,4.6vw,22px);font-weight:800";
      b.textContent = opt.name;
      b.addEventListener("click", () => {
        if (b.dataset.done) return;
        if (opt === q.target) {
          b.dataset.done = "1";
          Sfx.correct();
          b.classList.add("correct");
          score++;
          next();
        } else {
          Sfx.wrong();
          b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
        }
      });
      row.appendChild(b);
    });
    stage.appendChild(row);
  }

  function next() {
    i++;
    if (i < questions.length) setTimeout(render, 700);
    else setTimeout(finish, 700);
  }

  function finish() {
    awardStars(score);
    const perfect = score === questions.length;
    const line = perfect ? `${pick(MIZO_CATCH)} كل الإجابات صح!` : score >= questions.length / 2 ? pick(MIZO_PRAISE) : pick(MIZO_ENCOURAGE);
    showCheer("🏆", `${line} نتيجتك ${score}/${questions.length}`, () => Router.go("funHub"));
  }

  if (!questions.length) {
    stage.innerHTML = `<p style="text-align:center;font-weight:800;color:#2a7">جهّز التحدّي قريبًا!</p>`;
  } else {
    setTimeout(render, 150);
  }
  return screen;
}
