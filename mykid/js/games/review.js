// ===== لعبة "المراجعة الذكية": تكرار متباعد للحروف/الأرقام =====
// تختبر التعرّف السريع على ما رآه الطفل سابقاً (seen) — يرسّخ الحفظ.
// إن لم يرَ شيئاً بعد، نراجع من كل المجموعة.
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, progressDots, shuffle, finishActivity } from "./common.js";

const ROUNDS = 6;

function itemKey(it) {
  return it.char ?? (it.value != null ? String(it.value) : it.name);
}
function glyph(it) {
  return it.char || it.arDigit || it.emoji || it.name;
}
function speakItem(it, lang) {
  if (it.char) Speech.say(it.name, { lang });
  else if (it.arDigit) Speech.say(it.arName, { lang: "ar-EG" });
  else Speech.say(it.name, { lang: "ar-EG" });
}

export function renderReview({ regionId, regionIndex, datasetKey, lang, title }) {
  const ds = getDataset(datasetKey);
  const speakLang = lang || ds.lang;
  const items = ds.items;

  // اختيار متباعد: نفضّل ما رآه الطفل سابقاً، ونقدّم الأضعف إتقاناً أولاً
  const seenKeys = Store.seenKeys(datasetKey);
  let pool = items.filter((it) => seenKeys.includes(itemKey(it)));
  if (pool.length < 4) pool = items.slice();
  const scored = pool
    .map((it) => ({ it, lvl: Store.getMastery(datasetKey, itemKey(it)) }))
    .sort((a, b) => a.lvl - b.lvl || Math.random() - 0.5);
  const rounds = shuffle(scored.slice(0, ROUNDS).map((s) => s.it));
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#c2f0ff,#7c9cff)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🧠 المراجعة الذكية", back));

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function render() {
    const target = rounds[i];
    stage.innerHTML = "";
    stage.appendChild(progressDots(rounds.length, i - 1));

    const ask = document.createElement("p");
    ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(17px,4.6vw,22px)";
    ask.textContent = "اسمع واختر الصحيح 🔊";
    stage.appendChild(ask);

    const listen = document.createElement("button");
    listen.className = "candy-btn";
    listen.style.fontSize = "clamp(20px,6vw,28px)";
    listen.textContent = "🔊 اسمع";
    listen.addEventListener("click", () => { Sfx.tap(); speakItem(target, speakLang); });
    stage.appendChild(listen);

    const distractors = shuffle(items.filter((x) => itemKey(x) !== itemKey(target))).slice(0, 2);
    const choices = shuffle([target, ...distractors]);
    const row = document.createElement("div");
    row.className = "choice-row";
    choices.forEach((c) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<span style="font-weight:800">${glyph(c)}</span>`;
      b.addEventListener("click", () => {
        if (itemKey(c) === itemKey(target)) {
          Sfx.correct();
          b.classList.add("correct");
          Store.recordReview(datasetKey, itemKey(target), true); // إتقان +
          awardStars(1);
          speakItem(target, speakLang);
          i++;
          if (i >= rounds.length) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 7, onDone: back }), 900);
          else setTimeout(render, 1000);
        } else {
          Sfx.wrong();
          b.classList.add("wrong");
          Store.recordReview(datasetKey, itemKey(target), false); // إتقان −
          setTimeout(() => b.classList.remove("wrong"), 450);
        }
      });
      row.appendChild(b);
    });
    stage.appendChild(row);

    setTimeout(() => speakItem(target, speakLang), 300);
  }

  setTimeout(render, 0);
  return screen;
}
