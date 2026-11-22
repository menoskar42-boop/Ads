// ===== لعبة "تعرّف": يتعلّم الحرف ثم يضغط على الكلمة المثال =====
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, progressDots, shuffle, finishActivity, examplePhrase, diffCount, revealAnswer } from "./common.js";

export function renderLearn({ regionId, regionIndex, datasetKey, lang }) {
  const ds = getDataset(datasetKey);
  const speakLang = lang || ds.lang;
  const items = ds.items;
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffd6a5,#ff9a8b)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar("🎓 تعرّف على الحروف", back));

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function speakLetter(it) {
    Speech.sequence([
      { text: it.name, lang: speakLang },
      { text: examplePhrase(it, speakLang), lang: speakLang },
    ]);
  }

  function render() {
    const it = items[i];
    stage.innerHTML = "";

    stage.appendChild(progressDots(items.length, i - 1));

    const glyph = document.createElement("div");
    glyph.className = "hero-glyph";
    glyph.textContent = it.char;
    glyph.style.cursor = "pointer";
    glyph.addEventListener("click", () => { Sfx.pop(); speakLetter(it); });
    glyph.style.animation = "pop-in .4s ease, wobble 2.5s ease-in-out infinite 0.4s";
    stage.appendChild(glyph);

    const ask = document.createElement("p");
    ask.style.cssText = "font-size:clamp(18px,5vw,24px);font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.15)";
    ask.textContent = `اضغط على: ${it.word} ${it.emoji}`;
    stage.appendChild(ask);

    // خيارات: المثال الصحيح + اثنان مشتّتان
    const distractors = shuffle(items.filter((x) => x.emoji !== it.emoji)).slice(0, diffCount(1, 2));
    const choices = shuffle([it, ...distractors]);

    const row = document.createElement("div");
    row.className = "choice-row";
    let wrong = 0, correctBtn = null, solved = false;
    choices.forEach((c) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = c.emoji;
      if (c === it) correctBtn = b;
      b.addEventListener("click", () => {
        if (solved) return;
        if (c === it) {
          solved = true;
          Sfx.correct();
          b.classList.add("correct");
          awardStars(1);
          Speech.say(c.word, { lang: speakLang });
          setTimeout(next, 900);
        } else {
          Sfx.wrong();
          b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 500);
          // لحظة تعليمية: بعد محاولتين نُبرز الإجابة وننطقها ليتعلّم الطفل
          if (++wrong >= 2) {
            solved = true;
            revealAnswer(correctBtn);
            Speech.mizo("شوف يا بطل، دي " + it.word);
            setTimeout(() => { Speech.say(it.word, { lang: speakLang }); }, 1100);
            setTimeout(next, 2100);
          }
        }
      });
      row.appendChild(b);
    });
    stage.appendChild(row);

    // أزرار مساعدة
    const tools = document.createElement("div");
    tools.style.cssText = "margin-top:18px;display:flex;gap:12px";
    const repeat = document.createElement("button");
    repeat.className = "candy-btn";
    repeat.textContent = "🔊 كرّر";
    repeat.addEventListener("click", () => { Sfx.tap(); speakLetter(it); });
    tools.appendChild(repeat);
    stage.appendChild(tools);

    speakLetter(it);
  }

  function next() {
    i++;
    if (i >= items.length) {
      finishActivity({ regionId, regionIndex, stars: 5, onDone: back });
    } else {
      render();
    }
  }

  setTimeout(render, 0);
  return screen;
}
