// ===== المعلّم الافتراضي: درس تفاعلي لشرح الحرف/الرقم =====
// شخصية ودودة تشرح، وسبّورة بخطّ أساس يُكتب عليها الحرف بالحركة،
// مع نطق بصوتنا المخزَّن، وأزرار تشغيل/سابق/تالي + "اكتبه بنفسك".
// يضيف مشغّل الفيديو المرتبط بكل رقم أو حرف إنجليزي عند توفر رابط موثّق.
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { gameTopbar, finishActivity, glyphChooser } from "./common.js";
import { createCharacter, MIZO_INTRO, MIZO_HELLO, MIZO_PRAISE } from "./character.js";
import { Store } from "../core/storage.js";
import { adaptDisplay, femAdapt } from "../data/mizo.js";
import { getNumberLessonVideo } from "../data/numberLessonVideos.js";
import { getEnglishLetterLessonVideo } from "../data/englishLetterLessonVideos.js";
import { createYouTubePlayer } from "../core/youtube-player.js";
import { bothCases } from "../data/englishLetters.js";
import { strokeAnimSvg } from "./strokeAnim.js";
import { bothCasesSay, CHOOSER_TITLES } from "../data/writingPhrases.js";

export function renderLesson({ regionId, regionIndex, datasetKey, lang, title, startChar, motivate, includeZero = false, choose = false }) {
  const ds = getDataset(datasetKey);
  const speakLang = lang || ds.lang || "ar-EG";
  const isAr = speakLang.startsWith("ar");
  const isEnglishNumber = datasetKey === "englishNumbers";
  const noun = ds.glyphKind === "number" ? (isEnglishNumber ? "number" : "رقم") : "حرف";
  const zeroItem = isEnglishNumber
    ? { value: 0, char: "0", name: "zero", enName: "zero" }
    : { value: 0, arDigit: "٠", arName: "صفر", enName: "zero" };
  const items = includeZero && ds.glyphKind === "number" ? [zeroItem, ...ds.items] : ds.items;

  const glyphOf = (it) => it.char || it.arDigit || it.name;
  const labelOf = (it) => it.name || it.arName || "";
  // الإنجليزى بيظهر كابيتال وصغير مع بعض «Aa» — المفتاح (الفيديو، «اكتبه») فاضل الكابيتال
  const shownOf = (it) => (it.lower ? bothCases(it) : glyphOf(it));

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
      ${choose ? `<button class="candy-btn" id="lsChoose" style="background:linear-gradient(180deg,#fbbf24,#f59e0b)">🔤 ${ds.glyphKind === "number" ? "كل الأرقام" : "كل الحروف"}</button>` : ""}
      <button class="candy-btn" id="lsPrev" style="background:linear-gradient(180deg,#9aa7ff,#6b7cff)">⏮️ السابق</button>
      <button class="candy-btn" id="lsNext">التالي ⏭️</button>
    </div>`;
  screen.appendChild(wrap);

  const glyphEl = wrap.querySelector(".lesson-glyph");
  const penEl = wrap.querySelector(".lesson-pen");
  const bubble = wrap.querySelector(".teacher-bubble");
  const itemPicker = ds.glyphKind === "number" || ds.glyphKind === "letter"
    ? document.createElement("section")
    : null;
  if (itemPicker) {
    itemPicker.className = "lesson-item-picker";
    itemPicker.setAttribute("aria-label", ds.glyphKind === "number" ? "اختار الرقم مباشرة" : "اختار الحرف مباشرة");
    itemPicker.dir = datasetKey === "english" || datasetKey === "englishNumbers" ? "ltr" : "rtl";
    const pickerLabel = document.createElement("div");
    pickerLabel.className = "lesson-item-picker-label";
    pickerLabel.textContent = ds.glyphKind === "number" ? "اختار الرقم مباشرة" : "اختار الحرف مباشرة";
    itemPicker.appendChild(pickerLabel);

    const grid = document.createElement("div");
    grid.className = "lesson-item-picker-grid";
    items.forEach((item, itemIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lesson-item-picker-button";
      button.dataset.lessonIndex = String(itemIndex);
      button.textContent = shownOf(item);
      button.setAttribute("aria-label", `${ds.glyphKind === "number" ? "الرقم" : "الحرف"} ${glyphOf(item)}`);
      button.setAttribute("aria-pressed", itemIndex === idx ? "true" : "false");
      button.addEventListener("click", () => {
        idx = itemIndex;
        render();
      });
      grid.appendChild(button);
    });
    itemPicker.appendChild(grid);
  }
  const lessonVideo = ds.glyphKind === "number" || datasetKey === "english" ? document.createElement("div") : null;
  if (itemPicker) wrap.appendChild(itemPicker);
  if (lessonVideo) {
    lessonVideo.className = "lesson-video";
    lessonVideo.setAttribute("aria-label", ds.glyphKind === "number" ? "فيديو تعليمي للرقم الحالي" : "فيديو تعليمي للحرف الحالي");
    wrap.appendChild(lessonVideo);
  }

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
    const description = isEnglishNumber
      ? `This is number ${label}`
      : `هذا ${noun} ${label}`;
    parts.push({ text: description, lang: speakLang });
    const twoCases = it.lower && it.lower !== it.char;
    if (twoCases) parts.push({ text: bothCasesSay(it.char, it.lower), lang: "en-US" });
    if (it.word) {
      parts.push({ text: isAr ? `${label} مثل ${it.word}` : `${label} for ${it.word}`, lang: speakLang });
    }
    parts.push({ text: label, lang: speakLang });

    // النصّ المكتوب يطابق المنطوق (نفس جُمَل الترحيب والشرح)
    bubble.innerHTML = isEnglishNumber
      ? `${greetHtml}This is number <b>${label}</b>`
      // greetHtml فى الفرعين — من غيره ترحيب ميزو كان بيتنطق ومايظهرش فى الفقاعة (٢٠٢٦-١٠-١٠)
      : greetHtml + (it.word
      ? `هذا ${noun} «${label}» ${it.emoji || ""}<br>${twoCases ? `كابيتال <b>${it.char}</b> · صغير <b>${it.lower}</b><br>` : ""}${isAr ? `${label} مثل ${it.word}` : `${label} for ${it.word}`}`
      : `هذا ${noun} «${label}»`);

    speak(parts);
  }

  function animateWrite() {
    // الحرف بيتكتب خط خط بترتيبه واتجاهه (strokeAnim.js) — الكابيتال وبعده الصغير.
    // الحرف المكتوب (lesson-glyph) فاضل للقراية وللحروف اللى مالهاش خطوط.
    const it = items[idx];
    const svg = strokeAnimSvg(it.lower && it.lower !== it.char ? [it.char, it.lower] : [glyphOf(it)]);
    const board = wrap.querySelector(".lesson-board");
    board.querySelector(".lesson-strokes")?.remove();
    board.classList.toggle("has-strokes", !!svg);
    if (svg) {
      board.insertAdjacentHTML("afterbegin", svg);
      return;
    }
    // احتياطى: كشف الحرف من أعلى لأسفل + قلم يتحرّك
    glyphEl.classList.remove("writing");
    penEl.style.animation = "none";
    void glyphEl.offsetWidth; // إجبار إعادة التدفّق
    glyphEl.classList.add("writing");
    penEl.style.animation = "";
  }

  function renderLessonVideo(it) {
    if (!lessonVideo) return;
    lessonVideo.replaceChildren();

    const video = ds.glyphKind === "number"
      ? getNumberLessonVideo(it.value)
      : datasetKey === "english"
        ? getEnglishLetterLessonVideo(glyphOf(it))
        : null;
    if (!video) return;
    lessonVideo.appendChild(createYouTubePlayer(video));
  }

  function render() {
    const it = items[idx];
    glyphEl.textContent = shownOf(it);
    glyphEl.classList.toggle("two-case", !!it.lower);
    animateWrite();
    Sfx.pop();
    wrap.querySelector("#lsPrev").disabled = idx === 0;
    if (itemPicker) {
      itemPicker.querySelectorAll(".lesson-item-picker-button").forEach((button) => {
        const selected = Number(button.dataset.lessonIndex) === idx;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    }
    renderLessonVideo(it);

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
    Router.go("trace", { regionId, regionIndex, datasetKey, lang, focus: glyphOf(items[idx]), returnLesson: true, lessonTitle: title, includeZero });
  });
  wrap.querySelector("#lsPrev").addEventListener("click", () => {
    if (idx > 0) { idx--; render(); }
  });
  wrap.querySelector("#lsNext").addEventListener("click", () => {
    Sfx.tap();
    if (idx >= items.length - 1) finishActivity({ regionId, regionIndex, stars: 5, onDone: back });
    else { idx++; render(); }
  });

  /**
   * «اختار الأول»: الدخول من قايمة المنطقة بيفتح على كل الحروف/الأرقام، والطفل (أو
   * ولى الأمر) يلمس اللى عايزه — بدل ما الدرس يبدأ من A/أ/١ ويقعد يضغط «التالي».
   * المالك ٢٠٢٦-١٠-١٠: «بدخل على معلّم الحروف بلاقى حرف A مباشرة… عاوز أختار الحرف».
   * الرجوع من «اكتبه» (startChar) بيرجع على نفس الحرف من غير الشاشة دى.
   */
  const isNum = ds.glyphKind === "number";
  let started = false;
  const chooser = choose ? glyphChooser({
    items,
    shownOf,
    ariaOf: (it) => `${isNum ? "الرقم" : "الحرف"} ${glyphOf(it)}`,
    title: isNum ? CHOOSER_TITLES[1] : CHOOSER_TITLES[0],
    dir: datasetKey === "english" || isEnglishNumber ? "ltr" : "rtl",
    onPick: openAt,
  }) : null;
  if (chooser) screen.insertBefore(chooser.el, wrap);
  function showChooser() {
    Speech.stop();
    wrap.classList.add("hidden");
    chooser.show(started ? idx : -1);
  }
  function openAt(i) {
    idx = i;
    started = true;
    chooser.hide();
    wrap.classList.remove("hidden");
    render();
  }
  if (choose) wrap.querySelector("#lsChoose").addEventListener("click", () => { Sfx.tap(); showChooser(); });

  setTimeout(choose && !startChar ? showChooser : render, 30);
  return screen;
}
