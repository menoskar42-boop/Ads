// ===== شاشة القصص التفاعلية: مشهد تلو الآخر مع نطق =====
import { getStory } from "../data/stories.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Confetti } from "../core/confetti.js";
import { gameTopbar, finishActivity } from "../games/common.js";
import { sceneBackdrop, sceneProps } from "../games/storyart.js";
import { sceneArtSvg } from "../games/storychars.js";
import { createCharacter } from "../games/character.js";
import { storyTone } from "../data/mizo.js";

// مزاج المشهد → تعبير وجه ميزو السارد
const MOOD_MIZO = { calm: "happy", happy: "cheer", excited: "surprised", scared: "think", sad: "sad", wonder: "surprised" };
// خلفية افتراضية حسب منطقة القصة (تُستخدم إن لم يحدّد المشهد خلفيته)
const REGION_BG = {
  animals: "forest", fish: "sea", birds: "sky", fruits: "farm", numbers: "night",
  colors: "meadow", shapes: "meadow", values: "home", family: "home", jobs: "street",
  transport: "street", weather: "sky",
};

export function renderStory({ regionId, regionIndex, storyId }) {
  const story = getStory(storyId);
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffe6c2,#ff9a8b)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(`${story.emoji} ${story.title}`, back));

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function speakScene(sc) {
    // ميزو يسرد بنبرة تتفاعل مع مزاج المشهد (سارد قصص محترف يغيّر نبرته)
    Speech.say(sc.text, { lang: "ar-EG", instructions: storyTone(sc.mood), rate: 0.98 });
  }

  function render() {
    const sc = story.scenes[i];
    stage.innerHTML = "";

    // عدّاد المشاهد
    const dots = document.createElement("div");
    dots.className = "progress-dots";
    for (let k = 0; k < story.scenes.length; k++) {
      const d = document.createElement("span");
      d.className = "dot" + (k <= i ? " active" : "");
      dots.appendChild(d);
    }
    stage.appendChild(dots);

    // مشهد مصوّر: خلفية SVG متحرّكة + بطل + فقاعة حوار + ميزو السارد
    const scene = document.createElement("div");
    scene.className = "story-scene";
    const artEmoji = sc.art || sc.emoji || "";
    const mainSvg = sceneArtSvg(artEmoji) || `<span class="story-emoji">${artEmoji}</span>`;
    const withSvg = sc.with ? sceneArtSvg(sc.with) : null; // شخصية ثانية تتفاعل في المشهد
    const artHtml = withSvg
      ? `<div class="story-art duo" title="اقرأ لي"><div class="actor">${withSvg}</div><div class="actor">${mainSvg}</div></div>`
      : `<div class="story-art" title="اقرأ لي">${mainSvg}</div>`;
    const propsHtml = sc.props ? `<div class="story-props">${sceneProps(sc.props)}</div>` : "";
    scene.innerHTML = `
      <div class="story-bg">${sceneBackdrop(sc.bg || REGION_BG[story.region] || "sky")}</div>
      ${artHtml}
      ${propsHtml}`;
    const bubble = document.createElement("div");
    bubble.className = "story-bubble";
    bubble.textContent = sc.text;
    scene.appendChild(bubble);
    scene.querySelector(".story-art").addEventListener("click", () => { Sfx.pop(); speakScene(sc); });
    stage.appendChild(scene);
    // ميزو السارد أسفل المشهد (لا يغطّي النص) — تعبيره يتغيّر حسب مزاج المشهد
    const narrator = createCharacter();
    narrator.el.classList.add("story-narrator");
    narrator.setMood(MOOD_MIZO[sc.mood] || "happy");
    stage.appendChild(narrator.el);

    const nav = document.createElement("div");
    nav.style.cssText = "display:flex;gap:12px;justify-content:center;margin-top:16px";
    const repeat = document.createElement("button");
    repeat.className = "candy-btn";
    repeat.style.background = "linear-gradient(180deg,#34d399,#16a34a)";
    repeat.textContent = "🔊 اقرأ لي";
    repeat.addEventListener("click", () => { Sfx.tap(); speakScene(sc); });
    nav.appendChild(repeat);

    if (i < story.scenes.length - 1) {
      const next = document.createElement("button");
      next.className = "candy-btn";
      next.textContent = "التالي ›";
      next.addEventListener("click", () => { Sfx.whoosh(); i++; render(); });
      nav.appendChild(next);
    } else {
      const done = document.createElement("button");
      done.className = "candy-btn";
      done.textContent = "النهاية 🎉";
      done.addEventListener("click", () => {
        Confetti.burst();
        finishActivity({ regionId, regionIndex, stars: 5, onDone: back });
      });
      nav.appendChild(done);
    }
    stage.appendChild(nav);

    speakScene(sc);
  }

  setTimeout(render, 0);
  return screen;
}
