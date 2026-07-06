// ===== المعلّم الافتراضي: درس تفاعلي لشرح الحرف/الرقم =====
// شخصية ودودة تشرح، وسبّورة بخطّ أساس يُكتب عليها الحرف بالحركة،
// مع نطق بصوتنا المخزَّن، وأزرار تشغيل/سابق/تالي + "اكتبه بنفسك".
// يحاكي فيديوهات تعليم الحروف لكن بشكل تفاعلي ومجاني وبلا فيديو.
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { gameTopbar, finishActivity } from "./common.js";
import { createCharacter, MIZO_INTRO, MIZO_HELLO, MIZO_PRAISE } from "./character.js";
import { Store } from "../core/storage.js";
import { adaptDisplay, femAdapt } from "../data/mizo.js";

export function renderLesson({ regionId, regionIndex, datasetKey, lang, title, startChar, motivate }) {
  const ds = getDataset(datasetKey);
  const speakLang = lang || ds.lang || "ar-EG";
  const isAr = speakLang.startsWith("ar");
  const noun = ds.glyphKind === "number" ? "رقم" : "حرف";
  const items = ds.items;

  const glyphOf = (it) => it.char || it.arDigit || it.name;
  const labelOf = (it) => it.name || it.arName || "";

  // عند العودة من "اكتبه" نبدأ عند نفس الحرف الذي كتبه الطفل
  let idx = 0;
  if (startChar) {
    const fi = items.findIndex((it) => glyphOf(it) === startChar);
    if (fi >= 0) idx = fi;
  }
  let motivateOnce = !!motivate;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#e7f0ff,#bcd2ff)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🧑‍🏫 معلّم الحروف", back));

  const wrap = document.createElement("div");
  wrap.className = "lesson";
  wrap.innerHTML = `
    <div class="lesson-board">
      <div class="lesson-glyph"></div>
      <div class="lesson-baseline"></div>
      <span class="lesson-pen">🖊️</span>
    </div>
    <div class="lesson-teacher">
      <div class="miz-slot"></div>
      <div class="teacher-bubble"></div>
    </div>
    <div class="lesson-controls">
      <button class="candy-btn" id="lsPlay">🔊 اسمع</button>
      <button class="candy-btn" id="lsWrite" style="background:linear-gradient(180deg,#34d399,#10b981)">✍️ اكتبه</button>
      <button class="candy-btn" id="lsPrev" style="background:linear-gradient(180deg,#9aa7ff,#6b7cff)">⏮️ السابق</button>
      <button class="candy-btn" id="lsNext">التالي ⏭️</button>
    </div>`;
  screen.appendChild(wrap);

  const glyphEl = wrap.querySelector(".lesson-glyph");
  const penEl = wrap.querySelector(".lesson-pen");
  const bubble = wrap.querySelector(".teacher-bubble");

  // ميزو: شخصية الطفل المعلّم الناطقة
  const mizo = createCharacter();
  wrap.querySelector(".miz-slot").appendChild(mizo.el);
  let greeted = false;
  const pick = (a) => a[(Math.random() * a.length) | 0];

  // ينطق قائمة الجُمَل ويحرّك فم ميزو طوال مدّتها التقريبية
  function speak(parts) {
    const chars = parts.reduce((n, p) => n + (p.text ? p.text.length : 0), 0);
    mizo.startTalking(Math.min(9000, chars * 80 + 1600));
    Speech.sequence(parts);
  }

  function narrate(it) {
    const label = labelOf(it);
    const parts = [];
    let greetHtml = "";
    // صيغة جنس الطفل (ولد افتراضياً) على كلام ميزو المصري — للنطق والعرض معاً
    const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
    if (!greeted) {
      greeted = true;
      // «صديقك الجديد» مرّة واحدة فقط في حياة الطفل؛ بعدها ترحيب العودة
      if (!Store.metMizo) {
        Store.markMetMizo();
        mizo.setMood("wave", 2800);
        MIZO_INTRO.forEach((t) => parts.push({ text: fem(t), lang: "ar-EG" }));
      } else {
        mizo.setMood("wave", 2200);
        parts.push({ text: fem(pick(MIZO_HELLO)), lang: "ar-EG" });
      }
      greetHtml = parts.map((p) => p.text.replace(/ميزو/g, "<b>ميزو</b>")).join("<br>") + "<br>";
    } else if (Math.random() < 0.5) {
      mizo.setMood("cheer", 1900);
      const pr = fem(pick(MIZO_PRAISE));
      parts.push({ text: pr, lang: "ar-EG" });
      greetHtml = pr.replace(/ميزو/g, "<b>ميزو</b>") + "<br>";
    }
    parts.push({ text: `هذا ${noun} ${label}`, lang: speakLang });
    if (it.word) {
      parts.push({ text: isAr ? `${label} مثل ${it.word}` : `${label} for ${it.word}`, lang: speakLang });
    }
    parts.push({ text: label, lang: speakLang });

    // النصّ المكتوب يطابق المنطوق (نفس جُمَل الترحيب والشرح)
    bubble.innerHTML = greetHtml + (it.word
      ? `هذا ${noun} «${label}» ${it.emoji || ""}<br>${isAr ? `${label} مثل ${it.word}` : `${label} for ${it.word}`}`
      : `هذا ${noun} «${label}»`);

    speak(parts);
  }

  function animateWrite() {
    // إعادة تشغيل حركة "الكتابة" (كشف الحرف من أعلى لأسفل + قلم يتحرّك)
    glyphEl.classList.remove("writing");
    penEl.style.animation = "none";
    void glyphEl.offsetWidth; // إجبار إعادة التدفّق
    glyphEl.classList.add("writing");
    penEl.style.animation = "";
  }

  function render() {
    const it = items[idx];
    glyphEl.textContent = glyphOf(it);
    animateWrite();
    Sfx.pop();
    wrap.querySelector("#lsPrev").disabled = idx === 0;

    // عند العودة من "اكتبه": رسالة تحفيز من ميزو بالعامية بدل إعادة الشرح
    if (motivateOnce) {
      motivateOnce = false;
      greeted = true;
      const praise = "برافو! كتبت الحرف صح يا بطل، يلا نكمّل!";
      // النصّ المعروض يطابق المنطوق (تأنيث حسب الجنس + مناداة بالاسم)
      bubble.textContent = adaptDisplay(praise, Store.childGender, Store.childName);
      mizo.setMood("cheer", 1900);
      mizo.startTalking(praise.length * 90 + 1000);
      Speech.mizo(praise);
      return;
    }

    // narrate يضبط الفقاعة والنطق معاً (نفس الجُمَل) — والترحيب مرّة واحدة فقط
    narrate(it);
  }

  wrap.querySelector("#lsPlay").addEventListener("click", () => { animateWrite(); narrate(items[idx]); });
  wrap.querySelector("#lsWrite").addEventListener("click", () => {
    Sfx.tap();
    // نكتب الحرف الحالي فقط ثم نعود للدرس برسالة تحفيز من ميزو
    Router.go("trace", { regionId, regionIndex, datasetKey, lang, focus: glyphOf(items[idx]), returnLesson: true, lessonTitle: title });
  });
  wrap.querySelector("#lsPrev").addEventListener("click", () => {
    if (idx > 0) { idx--; render(); }
  });
  wrap.querySelector("#lsNext").addEventListener("click", () => {
    Sfx.tap();
    if (idx >= items.length - 1) finishActivity({ regionId, regionIndex, stars: 5, onDone: back });
    else { idx++; render(); }
  });

  setTimeout(render, 30);
  return screen;
}
