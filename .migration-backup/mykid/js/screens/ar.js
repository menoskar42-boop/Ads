// ===== الواقع المعزّز (AR): حيوان يظهر "داخل الغرفة" عبر الكاميرا =====
// نهج خفيف بلا مكتبات: بثّ الكاميرا الخلفية + طبقة حيوان متحرك فوقها.
// يعمل على المتصفحات التي تدعم getUserMedia (HTTPS أو localhost).
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { createCharacter } from "../games/character.js";
import { pick, MIZO_CATCH } from "../data/mizo.js";

// حيوانات بأجسام كاملة (تبدو واقفة في الغرفة وتقفز بوضوح) — خاصّة بالـ AR
// أول عنصر = ميزو نفسه يزور غرفة الطفل!
const AR_ANIMALS = [
  { name: "ميزو", en: "Mizo", emoji: "🧒", isMizo: true },
  { name: "أسد", en: "Lion", emoji: "🦁", body: "🦁", sound: "زئير الأسد: زئييير" },
  { name: "نمر", en: "Tiger", emoji: "🐅", body: "🐅", sound: "النمر يزمجر" },
  { name: "فيل", en: "Elephant", emoji: "🐘", body: "🐘", sound: "الفيل: بريم بريم" },
  { name: "زرافة", en: "Giraffe", emoji: "🦒", body: "🦒", sound: "الزرافة طويلة جداً" },
  { name: "قرد", en: "Monkey", emoji: "🐒", body: "🐒", sound: "القرد: أوه أوه آه آه" },
  { name: "حصان", en: "Horse", emoji: "🐎", body: "🐎", sound: "الحصان: هي هي" },
  { name: "كلب", en: "Dog", emoji: "🐕", body: "🐕", sound: "الكلب: هو هو" },
  { name: "قطة", en: "Cat", emoji: "🐈", body: "🐈", sound: "القطة: مياو" },
  { name: "أرنب", en: "Rabbit", emoji: "🐇", body: "🐇", sound: "الأرنب يقفز قفزات" },
  { name: "دب", en: "Bear", emoji: "🐻", body: "🐻", sound: "الدب: هدير" },
  { name: "ديناصور", en: "Dinosaur", emoji: "🦕", body: "🦕", sound: "الديناصور كبير جداً" },
  { name: "بطريق", en: "Penguin", emoji: "🐧", body: "🐧", sound: "البطريق يمشي يتمايل" },
];

export function renderAR() {
  const screen = document.createElement("div");
  screen.className = "region-screen ar-screen";

  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-btn" id="backBtn" title="رجوع">🏠</button>
    <h2>📸 الواقع المعزّز</h2>
    <span style="width:48px"></span>`;
  screen.appendChild(topbar);

  const stage = document.createElement("div");
  stage.className = "ar-stage";
  screen.appendChild(stage);

  const video = document.createElement("video");
  video.className = "ar-video";
  video.setAttribute("playsinline", "");
  video.muted = true;
  stage.appendChild(video);

  // الحيوان المعزّز
  const creature = document.createElement("div");
  creature.className = "ar-creature";
  stage.appendChild(creature);

  // فقاعة الكلام فوق الحيوان
  const bubble = document.createElement("div");
  bubble.className = "ar-bubble hidden";
  stage.appendChild(bubble);

  // تلميح للطفل
  const hint = document.createElement("div");
  hint.className = "ar-hint";
  hint.textContent = "اضغط على الحيوان ليقفز ويتكلّم! 👆";
  stage.appendChild(hint);

  // شريط اختيار الحيوان
  const picker = document.createElement("div");
  picker.className = "ar-picker";
  screen.appendChild(picker);

  let stream = null;
  let current = AR_ANIMALS[0];
  let mizoChar = null;

  function speakCreature(a) {
    bubble.classList.remove("hidden");
    bubble.textContent = `أنا ${a.name}!`;
    Speech.sequence([
      { text: `أنا ${a.name}`, lang: "ar-EG" },
      { text: a.en, lang: "en-US" },
      { text: a.sound, lang: "ar-EG" },
    ]);
  }

  function hop() {
    creature.classList.remove("hop");
    void creature.offsetWidth; // إعادة تشغيل الحركة
    creature.classList.add("hop");
  }

  function mizoSay(line) {
    bubble.classList.remove("hidden");
    bubble.textContent = line;
    if (mizoChar) mizoChar.startTalking(line.length * 90 + 800);
    Speech.mizo(line);
  }

  function setCreature(a) {
    current = a;
    if (a.isMizo) {
      creature.textContent = "";
      if (!mizoChar) mizoChar = createCharacter();
      if (mizoChar.el.parentNode !== creature) creature.appendChild(mizoChar.el);
      hop();
      Sfx.pop();
      mizoChar.setMood("wave", 1800);
      mizoSay("أهلاً! أنا ميزو، جيت أزورك في أوضتك!");
    } else {
      if (mizoChar && mizoChar.el.parentNode === creature) creature.removeChild(mizoChar.el);
      creature.textContent = a.body;
      hop();
      Sfx.pop();
      speakCreature(a);
    }
    // تمييز الزرّ المختار
    picker.querySelectorAll(".ar-pick").forEach((b) => b.classList.toggle("active", b.dataset.name === a.name));
  }

  function buildPicker() {
    AR_ANIMALS.forEach((a) => {
      const b = document.createElement("button");
      b.className = "ar-pick";
      b.dataset.name = a.name;
      b.textContent = a.emoji;
      b.addEventListener("click", () => setCreature(a));
      picker.appendChild(b);
    });
  }

  creature.addEventListener("click", () => {
    Sfx.pop();
    hop();
    if (current.isMizo) {
      if (mizoChar) mizoChar.setMood("cheer", 1400);
      mizoSay(pick(MIZO_CATCH));
    } else {
      speakCreature(current);
    }
  });

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      setCreature(current);
      Speech.ar("وجّه الكاميرا حولك، وانظر من جاء لزيارتك!");
    } catch (e) {
      showNoCam();
    }
  }

  function showNoCam() {
    stage.classList.add("ar-nocam");
    const msg = document.createElement("div");
    msg.className = "ar-nocam-msg";
    msg.innerHTML =
      "📷<br>لم نتمكّن من فتح الكاميرا.<br>" +
      "<span style='font-size:.8em'>يمكنك مع ذلك اللعب مع الحيوان!</span>";
    stage.appendChild(msg);
    setCreature(current);
  }

  function cleanup() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  setTimeout(() => {
    buildPicker();
    screen.querySelector("#backBtn").addEventListener("click", () => {
      Sfx.tap();
      cleanup();
      Router.go("home");
    });
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) startCamera();
    else showNoCam();
  }, 0);

  // تنظيف عند مغادرة الشاشة (يلاحظ الموجّه إزالة العقدة)
  const observer = new MutationObserver(() => {
    if (!screen.isConnected) {
      cleanup();
      observer.disconnect();
    }
  });
  observer.observe(document.getElementById("app"), { childList: true });

  return screen;
}

