// ===== لعبة "استكشاف": اضغط على الكائن ليتكلّم (حيوانات/أسماك/طيور/فواكه) =====
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, finishActivity } from "./common.js";
import { glyphMarkup } from "./glyph.js";
import { getActivityLessonVideos } from "../data/activityLessonVideos.js";
import { createYouTubePlayer } from "../core/youtube-player.js";

const LICENSE_URLS = {
  "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
};

export function renderExplore({ regionId, regionIndex, datasetKey, title, bg, sound, lang }) {
  const en = lang === "en"; // الإنجليزى الأول (حديقة الألوان)
  const ds = getDataset(datasetKey);
  const items = ds.items;
  const seen = new Set();
  let activeNatureSound = null;

  const stopNatureSound = () => {
    if (!activeNatureSound) return;
    activeNatureSound.pause();
    activeNatureSound.currentTime = 0;
    activeNatureSound = null;
  };

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#bff0c9,#7fd99b)";

  const back = () => {
    stopNatureSound();
    Router.go("region", { id: regionId, index: regionIndex });
  };
  screen.appendChild(gameTopbar(title || "🔍 استكشف", back));

  const hint = document.createElement("p");
  hint.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(15px,4.2vw,20px);margin:12px";
  hint.textContent = en ? "Tap each one to hear its name! 👆 · اضغط واسمع" : "اضغط على كل صديق ليتكلّم! 👆";
  screen.appendChild(hint);

  const videos = getActivityLessonVideos(datasetKey, "explore");
  if (videos.length) {
    const videoWrap = document.createElement("div");
    videoWrap.className = "explore-video-list";
    videoWrap.setAttribute("aria-label", "فيديوهات تعليمية مرتبطة بالنشاط");
    videoWrap.style.cssText = "width:calc(100% - 28px);max-width:720px;margin:12px auto 18px;display:flex;flex-direction:column;gap:14px";
    videos.forEach((video) => videoWrap.appendChild(createYouTubePlayer(video)));
    screen.appendChild(videoWrap);
  }

  const grid = document.createElement("div");
  grid.className = "regions-grid";
  const soundCredits = [];
  items.forEach((it, idx) => {
    const itemWrap = document.createElement("div");
    itemWrap.className = "region-card-wrap";
    const card = document.createElement("button");
    card.className = "region-card";
    card.style.cssText = `animation-delay:${idx * 0.03}s;background:linear-gradient(160deg,#9be15d,#00c46a)`;
    card.type = "button";
    card.innerHTML = en && it.en
      ? `${glyphMarkup(it, "region-emoji")}<span class="region-name" dir="ltr">${it.en}</span><span class="region-name-en">${it.name}</span>`
      : `${glyphMarkup(it, "region-emoji")}<span class="region-name">${it.name}</span><span class="region-name-en">${it.en}</span>`;
    card.addEventListener("click", () => {
      stopNatureSound();
      Sfx.pop();
      const seq = en ? [{ text: it.en, lang: "en-US" }, { text: it.name, lang: "ar-EG" }]
        : [{ text: it.name, lang: "ar-EG" }, { text: it.en, lang: "en-US" }];
      if (sound && it.sound) seq.push({ text: it.sound, lang: "ar-EG" });
      Speech.sequence(seq);
      card.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
        { duration: 400 }
      );
      if (!seen.has(it.emoji)) {
        seen.add(it.emoji);
        awardStars(1);
      }
    });
    itemWrap.appendChild(card);

    if (it.naturalSound?.url) {
      const sound = it.naturalSound;
      const soundButton = document.createElement("button");
      soundButton.type = "button";
      soundButton.className = "region-sound-button";
      soundButton.dataset.soundId = it.id;
      soundButton.textContent = "🔊";
      soundButton.setAttribute("aria-label", `اسمع الصوت الطبيعي: ${it.name}`);
      soundButton.addEventListener("click", (event) => {
        event.stopPropagation();
        stopNatureSound();
        if (typeof Audio === "undefined") return;

        Sfx.tap();
        const audio = new Audio(sound.url);
        activeNatureSound = audio;
        const clearActive = () => {
          if (activeNatureSound === audio) activeNatureSound = null;
        };
        audio.addEventListener("ended", clearActive, { once: true });
        audio.addEventListener("error", clearActive, { once: true });
        audio.play().catch(clearActive);
      });
      itemWrap.appendChild(soundButton);
      soundCredits.push({ name: it.name, ...sound });
    }
    grid.appendChild(itemWrap);
  });
  screen.appendChild(grid);

  if (soundCredits.length) {
    const credits = document.createElement("details");
    credits.className = "nature-sound-credits";
    const summary = document.createElement("summary");
    summary.textContent = "مصادر التسجيلات الصوتية";
    credits.appendChild(summary);
    const list = document.createElement("ul");
    soundCredits.forEach((sound) => {
      const item = document.createElement("li");
      const source = document.createElement("a");
      source.href = sound.sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = `${sound.name} — ${sound.credit}`;
      item.append(source, document.createTextNode(" · "));
      const licenseUrl = LICENSE_URLS[sound.license];
      if (licenseUrl) {
        const license = document.createElement("a");
        license.href = licenseUrl;
        license.target = "_blank";
        license.rel = "noopener noreferrer";
        license.textContent = sound.license;
        item.appendChild(license);
      } else {
        item.appendChild(document.createTextNode(sound.license));
      }
      list.appendChild(item);
    });
    credits.appendChild(list);
    screen.appendChild(credits);
  }

  const doneBtn = document.createElement("button");
  doneBtn.className = "candy-btn";
  doneBtn.style.cssText = "display:block;margin:10px auto 30px";
  doneBtn.textContent = "أنهيت ✅";
  doneBtn.addEventListener("click", () => {
    stopNatureSound();
    finishActivity({ regionId, regionIndex, stars: 5, onDone: back });
  });
  screen.appendChild(doneBtn);

  return screen;
}
