// ===== لعبة الوعي الصوتي: بأي حرف تبدأ الكلمة؟ =====
// تُعرض صورة وكلمتها، ويختار الطفل الحرف الأول من بين ثلاثة.
// أساس مهمّ في تعلّم القراءة (ربط الصوت بالحرف). تعمل للعربية والإنجليزية.
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, mizoBuddy } from "./common.js";

const ROUNDS = 8;

export function renderPhonics({ regionId, regionIndex, datasetKey, lang, title, bg }) {
  const ds = getDataset(datasetKey);
  const speakLang = lang || ds.lang || "ar-EG";
  const isAr = speakLang.startsWith("ar");
  const rounds = shuffle(ds.items).slice(0, ROUNDS);
  let round = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#bfe3ff,#7aa8f0)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🔤 بأي حرف تبدأ؟", back));

  const hint = document.createElement("p");
  hint.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(16px,4.4vw,22px);margin:10px";
  hint.textContent = isAr ? "بأي حرفٍ تبدأ هذه الكلمة؟ 🔤" : "Which letter does it start with?";
  screen.appendChild(hint);

  const pic = document.createElement("div");
  pic.style.cssText = "text-align:center;font-size:clamp(80px,24vw,150px);line-height:1;margin:4px";
  screen.appendChild(pic);

  const word = document.createElement("p");
  word.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(24px,7vw,36px);margin:6px";
  screen.appendChild(word);

  const buddy = mizoBuddy();
  screen.appendChild(buddy.el);

  const row = document.createElement("div");
  row.className = "choice-row";
  screen.appendChild(row);

  function render() {
    const target = rounds[round];
    pic.textContent = target.emoji || "❓";
    word.textContent = target.word;
    row.innerHTML = "";
    // النطق: الكلمة ثم حرفها الأول
    Speech.sequence([
      { text: target.word, lang: speakLang },
      { text: isAr ? `تبدأ بحرف ${target.name}` : `starts with ${target.name}`, lang: speakLang },
    ]);

    // الخيارات: الحرف الصحيح + حرفان مختلفان
    const others = shuffle(ds.items.filter((x) => x.char !== target.char)).slice(0, 2);
    shuffle([target, ...others]).forEach((opt) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.style.fontWeight = "800";
      b.textContent = opt.char;
      b.addEventListener("click", () => {
        if (opt.char === target.char) {
          b.classList.add("correct");
          Sfx.correct();
          buddy.win();
          Speech.say(target.name, { lang: speakLang });
          awardStars(1);
          setTimeout(nextRound, 1100);
        } else {
          b.classList.add("wrong");
          Sfx.wrong();
          buddy.lose();
          setTimeout(() => b.classList.remove("wrong"), 500);
        }
      });
      row.appendChild(b);
    });
  }

  function nextRound() {
    round++;
    if (round >= rounds.length) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    else render();
  }

  setTimeout(render, 0);
  return screen;
}
