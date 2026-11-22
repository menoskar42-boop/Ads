// ===== شاشة الأغاني والفيديوهات التعليمية (يوتيوب مُضمَّن) =====
// تعرض شبكة بطاقات؛ عند الضغط يُفتح مشغّل يوتيوب آمن داخل التطبيق.
// لا تشغيل تلقائي؛ نستخدم youtube-nocookie لتقليل التتبّع.
import { VIDEOS, VIDEO_CATS } from "../data/videos.js";
import { Router } from "../core/router.js";
import { Sfx } from "../core/audio.js";
import { Speech } from "../core/speech.js";

export function renderVideos() {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffe0f0,#c8a8ff)";

  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-btn" id="backBtn" title="رجوع">🏠</button>
    <h2>🎵 أغاني وفيديو</h2>
    <span style="width:48px"></span>`;
  screen.appendChild(topbar);

  // شريط التصنيفات
  const cats = document.createElement("div");
  cats.className = "video-cats";
  let activeCat = "all";
  VIDEO_CATS.forEach((c) => {
    const b = document.createElement("button");
    b.className = "video-cat" + (c.key === "all" ? " active" : "");
    b.textContent = `${c.emoji} ${c.label}`;
    b.addEventListener("click", () => {
      Sfx.tap();
      activeCat = c.key;
      cats.querySelectorAll(".video-cat").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      renderGrid();
    });
    cats.appendChild(b);
  });
  screen.appendChild(cats);

  // المشغّل (مخفي حتى الاختيار)
  const player = document.createElement("div");
  player.className = "video-player hidden";
  screen.appendChild(player);

  const grid = document.createElement("div");
  grid.className = "video-grid";
  screen.appendChild(grid);

  function openVideo(v) {
    Sfx.whoosh();
    Speech.stop();
    player.classList.remove("hidden");
    player.innerHTML = `
      <div class="video-frame">
        <iframe
          src="https://www.youtube-nocookie.com/embed/${v.youtubeId}?rel=0&modestbranding=1&playsinline=1"
          title="${v.title}"
          frameborder="0"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen></iframe>
      </div>
      <div class="video-now">▶ ${v.title}</div>`;
    player.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderGrid() {
    grid.innerHTML = "";
    const list = VIDEOS.filter((v) => activeCat === "all" || v.cat === activeCat);
    list.forEach((v, i) => {
      const card = document.createElement("button");
      card.className = "video-card";
      card.style.animationDelay = `${i * 0.04}s`;
      card.innerHTML = `
        <span class="video-thumb">${v.emoji}<span class="video-play">▶</span></span>
        <span class="video-title">${v.title}</span>`;
      card.addEventListener("click", () => openVideo(v));
      grid.appendChild(card);
    });
  }

  setTimeout(() => {
    screen.querySelector("#backBtn").addEventListener("click", () => {
      Sfx.tap();
      Router.go("home");
    });
    renderGrid();
    Speech.mizo("اختار أغنية أو فيديو تتعلّم وتستمتع");
  }, 0);

  return screen;
}
