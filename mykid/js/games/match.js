// ===== ألعاب المطابقة العامة: الظل، الصوت، وإيجاد العنصر =====
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, diffCount } from "./common.js";
import { glyphMarkup, glyphEmoji } from "./glyph.js";

const ROUNDS = 5;

function frame(title, bg, regionId, regionIndex) {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#cdeffd,#8fd0f0)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title, back));
  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);
  return { screen, stage, back };
}

/** يبني صفّ خيارات ويُعيد العنصر المختار للمعالجة */
function choicesRow(pool, target, onPick) {
  const row = document.createElement("div");
  row.className = "choice-row";
  pool.forEach((c) => {
    const b = document.createElement("button");
    b.className = "choice choice-img";
    b.innerHTML = glyphMarkup(c);
    b.addEventListener("click", () => onPick(c, b, target));
    row.appendChild(b);
  });
  return row;
}

function runRounds({ stage, items, regionId, regionIndex, back, stars, setup }) {
  let round = 0;
  function render() {
    const target = shuffle(items)[0];
    const others = shuffle(items.filter((x) => x.emoji !== target.emoji)).slice(0, diffCount(1, 2));
    const pool = shuffle([target, ...others]);
    stage.innerHTML = "";
    setup(stage, target, pool, onPick);
  }
  function onPick(c, b, target) {
    if (c.emoji === target.emoji) {
      Sfx.correct();
      b.classList.add("correct");
      awardStars(1);
      Speech.ar(target.name);
      round++;
      if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars, onDone: back }), 700);
      else setTimeout(render, 800);
    } else {
      Sfx.wrong();
      b.classList.add("wrong");
      setTimeout(() => b.classList.remove("wrong"), 450);
    }
  }
  render();
}

// ===== مطابقة الظل =====
export function renderShadowMatch({ regionId, regionIndex, datasetKey, title, bg }) {
  const items = getDataset(datasetKey).items;
  const { screen, stage, back } = frame(title || "🌑 طابق الظل", bg, regionId, regionIndex);
  runRounds({
    stage, items, regionId, regionIndex, back, stars: 7,
    setup(stage, target, pool, onPick) {
      const ask = document.createElement("p");
      ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(17px,4.6vw,22px)";
      ask.textContent = "أيّ حيوان يطابق هذا الظل؟";
      stage.appendChild(ask);

      const shadow = document.createElement("div");
      shadow.className = "shadow-glyph";
      // الظل يُبنى من الإيموجي دائماً (silhouette): الصور الفوتوغرافية تُسوَّد كمربّع.
      shadow.innerHTML = glyphEmoji(target);
      shadow.style.cssText = "font-size:clamp(110px,32vw,200px);filter:brightness(0);opacity:.85";
      stage.appendChild(shadow);

      stage.appendChild(choicesRow(pool, target, onPick));
      Speech.mizo("أنهي حيوان زيّ الضلّ ده؟");
    },
  });
  return screen;
}

// ===== أصوات الحيوانات / "من يفعل هذا؟" للمهن =====
export function renderSoundMatch({ regionId, regionIndex, datasetKey, title, bg, prompt }) {
  const items = getDataset(datasetKey).items;
  const { screen, stage, back } = frame(title || "🔊 أصوات الحيوانات", bg, regionId, regionIndex);
  const question = prompt || "من صاحب هذا الصوت؟ 🔊";
  runRounds({
    stage, items, regionId, regionIndex, back, stars: 7,
    setup(stage, target, pool, onPick) {
      const ask = document.createElement("p");
      ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(17px,4.6vw,22px)";
      ask.textContent = question;
      stage.appendChild(ask);

      const sayBtn = document.createElement("button");
      sayBtn.className = "candy-btn";
      sayBtn.style.fontSize = "clamp(20px,6vw,30px)";
      sayBtn.textContent = "🔊 استمع";
      const speak = () => Speech.ar(target.sound || target.name);
      sayBtn.addEventListener("click", () => { Sfx.tap(); speak(); });
      stage.appendChild(sayBtn);

      stage.appendChild(choicesRow(pool, target, onPick));
      setTimeout(speak, 300);
    },
  });
  return screen;
}

// ===== إيجاد العنصر المطلوب =====
export function renderFindIt({ regionId, regionIndex, datasetKey, title, bg, verb }) {
  const items = getDataset(datasetKey).items;
  const { screen, stage, back } = frame(title || "🔎 جِد المطلوب", bg, regionId, regionIndex);
  const action = verb || "اضغط على";
  let round = 0;

  function render() {
    const target = shuffle(items)[0];
    const others = shuffle(items.filter((x) => x.emoji !== target.emoji)).slice(0, diffCount(3, 5));
    const pool = shuffle([target, ...others]);
    stage.innerHTML = "";

    const ask = document.createElement("p");
    ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(18px,5vw,24px)";
    ask.textContent = `${action} ${target.name}`;
    stage.appendChild(ask);
    Speech.mizo(`${action} ${target.name}`);

    const row = document.createElement("div");
    row.className = "choice-row";
    pool.forEach((c) => {
      const b = document.createElement("button");
      b.className = "choice choice-img";
      b.innerHTML = glyphMarkup(c);
      b.addEventListener("click", () => {
        if (c.emoji === target.emoji) {
          Sfx.correct();
          b.classList.add("correct");
          awardStars(1);
          Speech.ar(target.name);
          round++;
          if (round >= 6) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 7, onDone: back }), 700);
          else setTimeout(render, 800);
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

  render();
  return screen;
}
