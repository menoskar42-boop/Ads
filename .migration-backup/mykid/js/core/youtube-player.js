// مشغّل يوتيوب داخل التطبيق: معاينة أولاً، ثم تضمين الفيديو بعد ضغط الطفل.
import { holdSpeechWhile } from "./speech.js";
export function createYouTubePlayer({ videoId, title = "فيديو تعليمي" }, { onPlay } = {}) {
  const root = document.createElement("div");
  root.className = "kid-youtube-card";

  const frame = document.createElement("div");
  frame.className = "kid-youtube-frame";

  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "kid-youtube-preview";
  preview.setAttribute("aria-label", `تشغيل ${title}`);

  const thumbnail = document.createElement("img");
  thumbnail.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  thumbnail.alt = `معاينة ${title}`;
  thumbnail.loading = "lazy";
  thumbnail.addEventListener("error", () => thumbnail.remove(), { once: true });

  const shade = document.createElement("span");
  shade.className = "kid-youtube-shade";
  shade.setAttribute("aria-hidden", "true");

  const play = document.createElement("span");
  play.className = "kid-youtube-play";
  play.textContent = "▶";
  play.setAttribute("aria-hidden", "true");

  preview.append(thumbnail, shade, play);
  let iframe = null;
  const stop = () => {
    if (!iframe) return;
    iframe = null;
    frame.replaceChildren(preview);
  };

  preview.addEventListener("click", () => {
    // ميزو يسكت من أول ما الفيديو يشتغل، ويفضل ساكت لو وقف أو خلص، لحد ما الكارت يختفى
    holdSpeechWhile(root);
    onPlay?.(stop);
    iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    iframe.title = title;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    frame.replaceChildren(iframe);
  });
  frame.appendChild(preview);
  root.appendChild(frame);

  const caption = document.createElement("p");
  caption.className = "kid-youtube-title";
  caption.textContent = title;
  root.appendChild(caption);

  const fallback = document.createElement("a");
  fallback.className = "kid-youtube-fallback";
  fallback.href = `https://www.youtube.com/watch?v=${videoId}`;
  fallback.target = "_blank";
  fallback.rel = "noopener noreferrer";
  fallback.textContent = "صعوبة في التشغيل؟ افتح على يوتيوب";
  root.appendChild(fallback);

  return root;
}
