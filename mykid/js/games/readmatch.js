// ===== لعبة "اقرأ واختر": تظهر كلمة مكتوبة فيختار الطفل صورتها الصحيحة =====
// تدعم القراءة المبكرة وتمييز الكلمات. نطق الكلمة واضح (كما هو) لا بلهجة ميزو.
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, mizoBuddy } from "./common.js";
import { glyphMarkup } from "./glyph.js";

const ROUNDS = 6;

export function renderReadMatch({ regionId, regionIndex, datasetKey, lang, title, bg }) {
  const ds = getDataset(datasetKey);
  const speakLang = lang || ds.lang || "ar-EG";
  const pool = ds.items.filter((it) => it.name);
  const rounds = shuffle(pool).slice(0, Math.min(ROUNDS, pool.length));
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#d7f0ff,#8fb8ff)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "📖 اقرأ واختر", back));

  const buddy = mizoBuddy();
  screen.appendChild(buddy.el);

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function render() {
    const target = rounds[i];
    stage.innerHTML = "";

    const hint = document.createElement("p");
    hint.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(15px,4vw,19px);margin:2px 0 6px";
    hint.textContent = "اقرأ الكلمة واختر صورتها:";
    stage.appendChild(hint);

    const word = document.createElement("div");
    word.style.cssText = "font-size:clamp(34px,10vw,60px);font-weight:800;color:var(--c-purple);margin:6px 0 4px";
    word.textContent = target.name;
    stage.appendChild(word);

    const listen = document.createElement("button");
    listen.className = "candy-btn";
    listen.textContent = "🔊 اسمع";
    listen.addEventListener("click", () => { Sfx.tap(); Speech.say(target.name, { lang: speakLang }); });
    stage.appendChild(listen);

    // خيارات الصور: الهدف + مشتّتان
    const distractors = shuffle(pool.filter((x) => x !== target)).slice(0, 2);
    const opts = shuffle([target, ...distractors]);

    const row = document.createElement("div");
    row.className = "choice-row";
    row.style.marginTop = "14px";
    opts.forEach((it) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = glyphMarkup(it);
      b.addEventListener("click", () => {
        if (it === target) {
          Sfx.correct();
          b.classList.add("correct");
          buddy.win();
          Speech.say(target.name, { lang: speakLang });
          awardStars(1);
          i++;
          if (i >= rounds.length) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 800);
          else setTimeout(render, 800);
        } else {
          Sfx.wrong();
          buddy.lose();
          b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
        }
      });
      row.appendChild(b);
    });
    stage.appendChild(row);

    setTimeout(() => Speech.say(target.name, { lang: speakLang }), 250);
  }

  setTimeout(render, 100);
  return screen;
}
