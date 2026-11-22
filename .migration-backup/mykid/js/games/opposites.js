// ===== لعبة الأضداد: يظهر شيء ويختار الطفل ضدّه =====
import { OPPOSITES } from "../data/opposites.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, progressDots, shuffle, finishActivity, diffCount, revealAnswer } from "./common.js";

export function renderOppositesMatch({ regionId, regionIndex }) {
  const rounds = shuffle(OPPOSITES);
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#5fd5d6,#4a2a8a)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar("↔️ طابق الضدّ", back));

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function render() {
    const pair = rounds[i];
    // اختر طرفاً عشوائياً كسؤال، والآخر هو الإجابة الصحيحة
    const ask = Math.random() < 0.5 ? pair.a : pair.b;
    const answer = ask === pair.a ? pair.b : pair.a;

    // مشتّتات: أطراف من أزواج أخرى
    const others = shuffle(OPPOSITES.filter((p) => p !== pair))
      .slice(0, diffCount(1, 2))
      .map((p) => (Math.random() < 0.5 ? p.a : p.b));
    const choices = shuffle([answer, ...others]);

    stage.innerHTML = "";
    stage.appendChild(progressDots(rounds.length, i - 1));

    const q = document.createElement("p");
    q.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(17px,4.6vw,22px)";
    q.textContent = `ما ضدّ "${ask.name}"؟`;
    stage.appendChild(q);

    const big = document.createElement("div");
    big.className = "hero-emoji";
    big.textContent = ask.emoji;
    big.style.cursor = "pointer";
    big.addEventListener("click", () => { Sfx.pop(); Speech.ar(ask.name); });
    stage.appendChild(big);

    Speech.ar(`ما ضدّ ${ask.name}؟`);

    const row = document.createElement("div");
    row.className = "choice-row";
    let wrong = 0, correctBtn = null, solved = false;
    const advance = () => {
      i++;
      if (i >= rounds.length) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 7, onDone: back }), 900);
      else setTimeout(render, 1000);
    };
    choices.forEach((c) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<div>${c.emoji}</div><div style="font-size:.34em;font-weight:800;color:var(--c-ink)">${c.name}</div>`;
      if (c === answer) correctBtn = b;
      b.addEventListener("click", () => {
        if (solved) return;
        if (c === answer) {
          solved = true;
          Sfx.correct();
          b.classList.add("correct");
          awardStars(1);
          Speech.ar(`${ask.name} ضدّ ${answer.name}`);
          advance();
        } else {
          Sfx.wrong();
          b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
          // لحظة تعليمية: بعد محاولتين نُبرز الإجابة وننطقها
          if (++wrong >= 2) {
            solved = true;
            revealAnswer(correctBtn);
            Speech.mizo("شوف، ضدّ " + ask.name + " هو " + answer.name);
            setTimeout(advance, 2000);
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
