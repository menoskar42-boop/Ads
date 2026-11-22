// ===== كرت إنجاز ميزو القابل للمشاركة (بلا أي بيانات شخصية) =====
// يرسم بطاقة على Canvas: ميزو + عدد النجوم + عبارة، ويتيح الحفظ/المشاركة.
// آمن للأطفال: لا اسم ولا بيانات — فقط إنجاز عام مع ميزو.
import { Router } from "../core/router.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { gameTopbar } from "../games/common.js";
import { pick, MIZO_CATCH } from "../data/mizo.js";

export function renderShareCard() {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffe9b0,#ffd0e0)";
  screen.appendChild(gameTopbar("📤 شارك إنجازك", () => Router.go("home")));

  const wrap = document.createElement("div");
  wrap.style.cssText = "max-width:520px;margin:0 auto;padding:14px 16px 40px;text-align:center";
  screen.appendChild(wrap);

  const canvas = document.createElement("canvas");
  canvas.width = 600; canvas.height = 380;
  canvas.style.cssText = "width:100%;max-width:480px;border-radius:18px;box-shadow:var(--shadow-card)";
  wrap.appendChild(canvas);

  const phrase = pick(MIZO_CATCH);
  const stars = Store.stars;
  const level = Store.friendLevel;

  function draw() {
    try {
      const ctx = canvas.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 0, 380);
      g.addColorStop(0, "#7c5fe6"); g.addColorStop(1, "#ff6fb5");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 600, 380);
      ctx.fillStyle = "#fff"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("عالم الاستكشاف السحري", 300, 56);
      ctx.font = "120px sans-serif";
      ctx.fillText("🧒", 300, 190);
      ctx.font = "bold 34px sans-serif";
      ctx.fillText(phrase, 300, 250);
      ctx.font = "bold 30px sans-serif";
      ctx.fillText(`⭐ ${stars}    💛 صداقة ${level}`, 300, 312);
      ctx.font = "20px sans-serif";
      ctx.fillText("أنجزتُ هذا مع صديقي ميزو!", 300, 352);
    } catch (e) {}
  }

  const msg = document.createElement("p");
  msg.style.cssText = "font-weight:800;color:#5b3fb5;margin:14px 0;font-size:clamp(15px,4.2vw,19px)";
  msg.textContent = "بطاقة إنجازك جاهزة — بلا أي بيانات شخصية 🛡️";
  wrap.appendChild(msg);

  const ctrl = document.createElement("div");
  ctrl.className = "lesson-controls";
  const shareBtn = document.createElement("button");
  shareBtn.className = "candy-btn";
  shareBtn.style.background = "linear-gradient(180deg,#34d399,#10b981)";
  shareBtn.textContent = "📤 مشاركة / حفظ";
  shareBtn.addEventListener("click", () => {
    Sfx.tap();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "mizo-achievement.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: "إنجازي مع ميزو" }).catch(() => {});
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "mizo-achievement.png"; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    });
  });
  ctrl.appendChild(shareBtn);
  wrap.appendChild(ctrl);

  setTimeout(draw, 60);
  return screen;
}
