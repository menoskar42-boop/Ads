// ===== لعبة الأنماط: ما الذي يأتي بعد؟ =====
// تظهر سلسلة متكرّرة (🔴🔵🔴🔵…) والعنصر التالي مخفيّ، يختاره الطفل.
// تنمّي التفكير المنطقي والملاحظة. تعمل مع أي مجموعة إيموجي.
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity } from "./common.js";
import { glyphMarkup } from "./glyph.js";

const ROUNDS = 6;
// وحدات نمطية بسيطة مناسبة للأطفال
const UNITS = [
  [0, 1],          // أ ب أ ب
  [0, 0, 1],       // أ أ ب
  [0, 1, 1],       // أ ب ب
  [0, 1, 2],       // أ ب ج
];

export function renderPattern({ regionId, regionIndex, datasetKey, title, bg }) {
  const ds = getDataset(datasetKey);
  let round = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#d7c3ff,#9a7cf0)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🧠 ما التالي؟", back));

  const hint = document.createElement("p");
  hint.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(16px,4.4vw,22px);margin:12px";
  hint.textContent = "ما الذي يأتي بعد؟ 🤔";
  screen.appendChild(hint);

  const strip = document.createElement("div");
  strip.style.cssText = "display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;margin:18px 12px;font-size:clamp(40px,12vw,68px)";
  screen.appendChild(strip);

  const row = document.createElement("div");
  row.className = "choice-row";
  screen.appendChild(row);

  function render() {
    strip.innerHTML = "";
    row.innerHTML = "";
    const unit = UNITS[(Math.random() * UNITS.length) | 0];
    const distinct = (Math.max(...unit) + 1);
    const symbols = shuffle(ds.items).slice(0, distinct);
    // نكرّر الوحدة مرّتين ثم نُكمل جزءاً من الثالثة ونخفي العنصر التالي
    const seqIdx = [...unit, ...unit, ...unit];
    const visible = 2 * unit.length + ((Math.random() * (unit.length - 1)) | 0); // نُظهر بعد دورتين
    const answerItem = symbols[seqIdx[visible]];

    for (let i = 0; i < visible; i++) {
      const span = document.createElement("span");
      span.innerHTML = glyphMarkup(symbols[seqIdx[i]], "pat-glyph");
      span.style.animation = "pop-in .25s ease both";
      span.style.animationDelay = `${i * 0.06}s`;
      strip.appendChild(span);
    }
    const q = document.createElement("span");
    q.textContent = "❓";
    q.style.filter = "drop-shadow(0 4px 6px rgba(0,0,0,.25))";
    strip.appendChild(q);

    // الخيارات = الرموز المستخدمة (مخلوطة)
    shuffle(symbols).forEach((item) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = glyphMarkup(item, "pat-glyph");
      b.addEventListener("click", () => {
        if (item === answerItem) {
          b.classList.add("correct");
          Sfx.correct();
          Speech.ar(item.name);
          q.textContent = "";
          q.innerHTML = glyphMarkup(item, "pat-glyph");
          awardStars(1);
          setTimeout(nextRound, 1100);
        } else {
          b.classList.add("wrong");
          Sfx.wrong();
          setTimeout(() => b.classList.remove("wrong"), 500);
        }
      });
      row.appendChild(b);
    });
    Speech.ar("ما الذي يأتي بعد؟");
  }

  function nextRound() {
    round++;
    if (round >= ROUNDS) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    else render();
  }

  setTimeout(render, 0);
  return screen;
}
