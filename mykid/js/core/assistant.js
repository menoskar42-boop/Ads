// ===== المساعد الصوتي: الطفل يسأل "ما هذا؟" بصوته =====
// التدفّق: تسجيل الميكروفون → STT → سؤال → إجابة قصيرة → نطق.
// يحتاج خادم OpenAI (isAIReady). إن لم يتوفّر، يُخفى الزر.
import { isAIReady, aiAsk, aiTranscribe } from "./ai.js";
import { Speech } from "./speech.js";
import { Sfx } from "./audio.js";
import { createCharacter } from "../games/character.js";
import { onSpeaking } from "./speech.js";
import { track } from "./analytics.js";

let recorder = null;
let chunks = [];
let listening = false;
let overlay = null;
let mizo = null; // شخصية ميزو داخل الزرّ العائم
let idleImg = null; // أنيميشن وقوف ميزو (٣D) — يظهر عند السكون
let speaking = false;
const INVITE = "قول يا صاحبي، عاوز إيه؟ أنا معاك";

// يُظهر أنيميشن الوقوف عند السكون، وميزو المتفاعل (نطق/إنصات/تفكير) عند النشاط
function updateMizoView() {
  const btn = document.getElementById("assistantBtn");
  if (!btn || !mizo || !idleImg) return;
  const active = speaking || btn.classList.contains("listening") || btn.classList.contains("thinking");
  mizo.el.style.display = active ? "" : "none";
  idleImg.style.display = active ? "none" : "";
}

/** هل المساعد متاح؟ (AI + دعم التسجيل) */
export function assistantAvailable() {
  return (
    isAIReady() &&
    typeof MediaRecorder !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/** يبني الزر العائم ويضيفه للصفحة (مرّة واحدة) */
export function mountAssistantButton() {
  if (!assistantAvailable()) return;
  if (document.getElementById("assistantBtn")) return;

  const btn = document.createElement("button");
  btn.id = "assistantBtn";
  btn.className = "assistant-fab";
  btn.title = "اسألني! قول عاوز إيه؟";
  mizo = createCharacter();
  btn.appendChild(mizo.el);
  // أنيميشن ٣D لميزو واقف (idle) — الحالة الافتراضية عند السكون
  idleImg = document.createElement("img");
  idleImg.className = "assistant-idle";
  idleImg.alt = "ميزو";
  idleImg.src = "/assets/mizo/mizo-idle.webp";
  btn.appendChild(idleImg);
  onSpeaking((on) => { speaking = on; updateMizoView(); });
  const badge = document.createElement("span");
  badge.className = "assistant-mic";
  badge.textContent = "🎤";
  btn.appendChild(badge);
  btn.addEventListener("click", toggleListen);
  document.body.appendChild(btn);
  mizo.setMood("wave", 2200); // تحية عند أول ظهور (مزامنة الشفاه تتم تلقائياً داخل createCharacter)
  updateMizoView();
  startIdleWatch();
}

/** تفاعل ميزو العائم (علامة OK عند الصح / تعاطف عند الخطأ) — يُستدعى من app.js */
export function reactAssistant(mood, ms) {
  if (mizo && !listening) mizo.setMood(mood, ms || 1200);
}

function setState(state, text) {
  const btn = document.getElementById("assistantBtn");
  if (btn) {
    btn.classList.toggle("listening", state === "listening");
    btn.classList.toggle("thinking", state === "thinking");
  }
  if (mizo) mizo.setMood(state === "listening" ? "listening" : state === "thinking" ? "think" : "happy");
  updateMizoView();
  showBubble(text);
}

function showBubble(text) {
  if (!text) {
    if (overlay) { overlay.remove(); overlay = null; }
    return;
  }
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "assistant-bubble";
    document.body.appendChild(overlay);
  }
  overlay.textContent = text;
}

async function toggleListen() {
  if (listening) {
    stopListening();
    return;
  }
  if (!assistantAvailable()) return;
  noteActivity();
  // ميزو يرحّب بالعامية، ثم يبدأ الاستماع بعد لحظة (تشغيل موثوق لا يعتمد على انتهاء النطق)
  if (mizo) { mizo.setMood("happy"); mizo.startTalking(1600); }
  showBubble(INVITE + " 🎤");
  Speech.mizo(INVITE);
  setTimeout(() => { if (!listening) beginRecording(); }, 1500);
}

async function beginRecording() {
  if (!assistantAvailable() || listening) return;
  try {
    // إعدادات تساعد على التقاط صوت الطفل الخافت بوضوح (تضخيم + تنقية)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    chunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      handleAudio();
    };
    recorder.start();
    listening = true;
    track("use_voice_assistant"); // استخدم المساعد الصوتي ميزو
    Sfx.pop();
    setState("listening", "أنا أسمعك دلوقتي... 🎤");
    // حدّ أقصى ٦ ثوانٍ ثم نتوقّف تلقائياً
    setTimeout(() => { if (listening) stopListening(); }, 6000);
  } catch (e) {
    setState("idle", "مقدرتش أفتح الميكروفون 🙈");
    setTimeout(() => showBubble(""), 2500);
  }
}

function stopListening() {
  if (recorder && recorder.state !== "inactive") recorder.stop();
  listening = false;
}

async function handleAudio() {
  noteActivity();
  if (!chunks.length) { setState("idle", ""); return; }
  setState("thinking", "بفكّر... 💭");
  Speech.stop();

  // الخطوة ١: تحويل الصوت إلى نص (STT)
  let question = "";
  try {
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    question = (await aiTranscribe(blob, "ar")).trim();
  } catch (e) {
    setState("idle", "مش واضح أوي، قرّب وقول تاني بصوت أعلى 🎤");
    if (mizo) mizo.startTalking(2200);
    Speech.mizo("مش واضح أوي، قرّب وقول تاني بصوت أعلى يا بطل");
    setTimeout(() => showBubble(""), 3000);
    return;
  }
  if (!question) {
    setState("idle", "مش واضح أوي، قرّب وقول تاني بصوت أعلى 😊");
    if (mizo) mizo.startTalking(2200);
    Speech.mizo("مش واضح أوي، قرّب شويّة وقول تاني بصوت أعلى يا بطل");
    setTimeout(() => showBubble(""), 3000);
    return;
  }

  // الخطوة ٢: الحصول على إجابة قصيرة (Chat)
  let answer = "";
  try {
    answer = await aiAsk(question, "ar");
  } catch (e) {
    setState("idle", "مش عارف أجاوب دلوقتي، جرّب تاني 🙏");
    if (mizo) mizo.startTalking(1800);
    Speech.mizo("مش عارف أجاوب دلوقتي، جرّب تاني");
    setTimeout(() => showBubble(""), 2600);
    return;
  }

  setState("idle", answer || "");
  Sfx.correct();
  if (mizo) mizo.startTalking((answer || "").length * 70 + 1500);
  // ميزو يجيب بصوته المصري
  Speech.mizo(answer, { onend: () => setTimeout(() => showBubble(""), 1500) });
}

// ===== تشجيع عند سكوت الطفل / عدم نشاطه =====
let idleTimer = null;
let nudges = 0;
const IDLE_MS = 40000;
const IDLE_LINES = ["يلا يا بطل نكمّل!", "إنت فين؟ تعال نلعب سوا!", "جاهز نكمّل المغامرة؟", "تعال نتعلّم حاجة حلوة!"];

function idleNudge() {
  if (document.hidden || listening) { scheduleIdle(); return; }
  if (!mizo || nudges >= 3) return; // لا نكرّر للأبد حتى يتحرّك الطفل
  nudges++;
  const line = IDLE_LINES[(Math.random() * IDLE_LINES.length) | 0];
  mizo.setMood("wave", 2000);
  mizo.startTalking(line.length * 90 + 800);
  showBubble(line);
  Speech.mizo(line);
  setTimeout(() => showBubble(""), 3200);
  scheduleIdle();
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(idleNudge, IDLE_MS);
}

function noteActivity() {
  nudges = 0;
  scheduleIdle();
}

function startIdleWatch() {
  ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, noteActivity, { passive: true })
  );
  scheduleIdle();
}
