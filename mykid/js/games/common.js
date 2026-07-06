// ===== أدوات مشتركة بين الألعاب =====
import { Store } from "../core/storage.js";
import { Sfx } from "../core/audio.js";
import { Speech } from "../core/speech.js";
import { Confetti } from "../core/confetti.js";
import { createCharacter } from "./character.js";
import { MIZO_CATCH, pick } from "../data/mizo.js";
import { track } from "../core/analytics.js";
import {
  awardStars,
  updateStarCounter,
  grantRandomCollectible,
  showRewardPopup,
} from "../core/rewards.js";

/**
 * رفيق ميزو الصغير داخل اللعبة: يفرح عند النجاح ويتعاطف بلطف عند الخطأ.
 * append(el.el) في أي مكان بالشاشة، ثم نادِ buddy.win() / buddy.lose().
 */
export function mizoBuddy() {
  const mizo = createCharacter();
  mizo.el.classList.add("miz-buddy");
  let busy = 0;
  return {
    el: mizo.el,
    win(say) {
      if (say) Speech.mizo(pick(MIZO_CATCH));
      // أنيميشن ٣D (تصفيق أو إبهام) يظهر فوق الرفيق لحظة الإجابة الصحيحة
      const clip = document.createElement("img");
      clip.className = "buddy-clap";
      clip.alt = "ميزو";
      clip.src = "/assets/mizo/" + (Math.random() < 0.5 ? "mizo-clap" : "mizo-praise") + ".webp";
      mizo.el.appendChild(clip);
      setTimeout(() => clip.remove(), 1900);
    },
    lose() {
      mizo.setMood("sad", 900);
      setTimeout(() => mizo.setMood("happy"), 950);
    },
    cheerBig() {
      mizo.setMood("proud", 1600);
      clearTimeout(busy);
    },
  };
}

/** عبارة المثال بلغة العنصر: "أَلِف مثل أرنب" أو "A for Apple" */
export function examplePhrase(item, lang) {
  return lang && lang.startsWith("en")
    ? `${item.name} for ${item.word}`
    : `${item.name} مثل ${item.word}`;
}

/** خلط مصفوفة (نسخة جديدة) */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** قيمة تتغيّر حسب فئة عمر الطفل: الصغار (٣-٤) أسهل، الكبار (٥-٦) والافتراضي أصعب.
 *  مثال: diffCount(1, 2) → مشتّت واحد للصغار (خياران) ومشتّتان للكبار (٣ خيارات). */
export function diffCount(small, big) {
  return Store.ageBand === "small" ? small : big;
}

/** لحظة تعليمية: بعد محاولات خاطئة نُبرز الإجابة الصحيحة بصرياً (نبضة خضراء)
 *  كي يتعلّم الطفل المفهوم الصحيح بدل التخمين، ثم تكمل اللعبة على نجاح. */
export function revealAnswer(correctBtn) {
  if (correctBtn) correctBtn.classList.add("reveal-hint");
}

/** شريط علوي موحّد للألعاب */
export function gameTopbar(title, onBack) {
  const bar = document.createElement("div");
  bar.className = "topbar";
  bar.innerHTML = `
    <button class="icon-btn" title="رجوع">⟵</button>
    <h2>${title}</h2>
    <span class="star-counter" id="starCounter">⭐ <span>${Store.stars}</span></span>
  `;
  bar.querySelector(".icon-btn").addEventListener("click", () => {
    Sfx.tap();
    onBack();
  });
  setTimeout(() => updateStarCounter(), 0);
  return bar;
}

/** نقاط التقدّم */
export function progressDots(total, activeIndex) {
  const wrap = document.createElement("div");
  wrap.className = "progress-dots";
  for (let i = 0; i < total; i++) {
    const d = document.createElement("span");
    d.className = "dot" + (i <= activeIndex ? " active" : "");
    wrap.appendChild(d);
  }
  return wrap;
}

/** لوحة تشجيع سريعة */
export function showCheer(emoji, text, onClose) {
  Sfx.win();
  const overlay = document.createElement("div");
  overlay.className = "cheer";
  // تنويع: ميزو يحتفل بالقفز والقصاصات أو بالتصفيق (أنيميشن ٣D من فيديو AI)
  const clip = Math.random() < 0.5 ? "mizo-celebrate" : "mizo-clap";
  overlay.innerHTML = `
    <div class="cheer-card">
      <img class="cheer-anim" src="/assets/mizo/${clip}.webp" alt="ميزو" />
      <div class="cheer-text">${text}</div>
    </div>`;
  document.body.appendChild(overlay);
  // ميزو يحتفل (أنيميشن ٣D من فيديو AI) وينطق عبارة التشجيع
  if (text) Speech.mizo(text);
  setTimeout(() => {
    overlay.remove();
    if (onClose) onClose();
  }, 1800);
}

/** إنهاء نشاط: منح نجوم، تحديث تقدّم المنطقة، احتمال مكافأة، ثم رجوع */
export function finishActivity({ regionId, regionIndex, stars = 5, onDone }) {
  // إن أُطلق النشاط من "رحلة اليوم" نعلّم خطوته كمكتملة
  if (Store.activeStep != null) {
    Store.markDailyStep(Store.activeStep);
    Store.activeStep = null;
  }
  Store.addFriendship(1); // تنمو صداقة ميزو مع كل نشاط
  Store.logActivity(stars); // سجلّ النشاط اليومي (للوحة ولي الأمر)
  const wasCompleted = Store.regionProgress(regionId).completed;
  track("complete_activity", { region_id: regionId, stars, first_time: !wasCompleted }); // أكمل نشاط
  awardStars(stars);
  Confetti.burst();
  Store.setRegionStars(regionId, (Store.regionProgress(regionId).stars || 0) + stars);
  Store.markRegionDone(regionId);
  if (regionIndex != null) Store.unlockNext(regionIndex);

  // مكافأة جديدة بنسبة جيّدة لإبقاء الحماس
  const reward = Math.random() < 0.7 ? grantRandomCollectible() : null;

  const done = () => {
    Speech.mizo("برافو! خلّصت المهمة يا بطل");
    if (onDone) onDone();
  };

  // شهادة إنجاز عند إكمال المنطقة لأول مرة
  const finish = () => {
    if (!wasCompleted) showCertificate(regionId, done);
    else done();
  };

  showCheer("🏆", pick(MIZO_CATCH), () => {
    if (reward) showRewardPopup(reward, finish);
    else finish();
  });
}

/** شهادة إنجاز قابلة للحفظ عند إكمال قسم لأول مرة */
export function showCertificate(regionId, onClose) {
  const name = Store.childName || "البطل الصغير";
  const overlay = document.createElement("div");
  overlay.className = "cheer";
  overlay.innerHTML = `
    <div class="certificate">
      <div class="cert-ribbon">🏅 شهادة إنجاز</div>
      <p class="cert-line">تُمنح هذه الشهادة إلى</p>
      <p class="cert-name">${name}</p>
      <p class="cert-line">لإكماله بنجاح وتميّز 🌟</p>
      <img src="/assets/mizo/mizo-trophy.png" alt="ميزو" width="150" height="auto"
        class="cert-seal" style="height:auto;object-fit:contain" />
      <p class="cert-foot">عالم الاستكشاف السحري</p>
      <button class="candy-btn" id="certOk">رائع! 🎉</button>
    </div>`;
  document.body.appendChild(overlay);
  Sfx.win();
  Confetti.stars();
  Speech.ar(`مبروك يا ${name}، حصلت على شهادة إنجاز`);
  overlay.querySelector("#certOk").addEventListener("click", () => {
    overlay.remove();
    if (onClose) onClose();
  });
}
