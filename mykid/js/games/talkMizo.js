// ===== تحدّث مع ميزو: نشاط نطق بالميكروفون (تشجيعي، بلا عقاب) =====
// يطلب ميزو من الطفل تكرار كلمة، يسجّل صوته، ويعطي تغذية راجعة لطيفة.
// عند توفّر الذكاء الاصطناعي يستخدم النسخ الصوتي؛ وإلا "اسمع وكرّر" فقط.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { isAIReady, aiTranscribe } from "../core/ai.js";
import { gameTopbar, shuffle, finishActivity } from "./common.js";
import { createCharacter, MIZO_PRAISE } from "./character.js";

const ITEMS = [
  { text: "قِطّة", emoji: "🐱" },
  { text: "شَمس", emoji: "☀️" },
  { text: "تُفّاحة", emoji: "🍎" },
  { text: "سَيّارة", emoji: "🚗" },
  { text: "قَمَر", emoji: "🌙" },
  { text: "وَردة", emoji: "🌹" },
];
const ROUNDS = 5;
const pick = (a) => a[(Math.random() * a.length) | 0];
const norm = (s) =>
  (s || "").replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/[ةه]/g, "ه").replace(/\s+/g, "");

export function renderTalkMizo({ regionId, regionIndex, title }) {
  const rounds = shuffle(ITEMS).slice(0, ROUNDS);
  let i = 0, attempts = 0, listening = false, recorder = null, chunks = [];
  const aiOn = isAIReady();

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#e7f0ff,#bcd2ff)";
  const back = () => Router.go(regionId ? "region" : "home", regionId ? { id: regionId, index: regionIndex } : {});
  screen.appendChild(gameTopbar(title || "🎤 تحدّث مع ميزو", back));

  const wrap = document.createElement("div");
  wrap.className = "lesson";
  screen.appendChild(wrap);

  const pic = document.createElement("div");
  pic.style.cssText = "font-size:clamp(70px,20vw,120px);text-align:center";
  wrap.appendChild(pic);

  const teacher = document.createElement("div");
  teacher.className = "lesson-teacher";
  teacher.innerHTML = `<div class="miz-slot"></div><div class="teacher-bubble"></div>`;
  wrap.appendChild(teacher);
  const mizo = createCharacter();
  teacher.querySelector(".miz-slot").appendChild(mizo.el);
  const bubble = teacher.querySelector(".teacher-bubble");

  const ctrl = document.createElement("div");
  ctrl.className = "lesson-controls";
  wrap.appendChild(ctrl);
  const hearBtn = document.createElement("button");
  hearBtn.className = "candy-btn";
  hearBtn.textContent = "🔊 اسمع";
  const micBtn = document.createElement("button");
  micBtn.className = "candy-btn";
  micBtn.style.background = "linear-gradient(180deg,#34d399,#10b981)";
  micBtn.textContent = aiOn ? "🎤 اضغط وكرّر" : "➡️ التالي";
  ctrl.append(hearBtn, micBtn);

  function say(text, ms) { mizo.startTalking(ms || text.length * 90 + 1400); Speech.ar(text); }

  function render() {
    const it = rounds[i];
    attempts = 0;
    pic.textContent = it.emoji;
    bubble.innerHTML = `كرّر بعدي: <b>${it.text}</b>`;
    mizo.setMood("happy");
    setTimeout(() => say(`قل: ${it.text}`), 200);
  }

  function nextRound() {
    i++;
    if (i >= rounds.length) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    else render();
  }

  function succeed() {
    mizo.setMood("proud", 1800);
    Sfx.correct();
    const praise = pick(MIZO_PRAISE);
    bubble.textContent = praise;
    say(praise, 1600);
    awardStars(1);
    setTimeout(nextRound, 1500);
  }
  function encourage() {
    const it = rounds[i];
    mizo.setMood("sad", 1600);
    Sfx.pop();
    const msg = "محاولة جميلة! لنسمعها معاً";
    bubble.textContent = msg;
    say(`${msg}. ${it.text}`, 2200);
    setTimeout(nextRound, 2400); // لا نُحبط الطفل: ننتقل بإيجابية
  }

  hearBtn.addEventListener("click", () => { Sfx.tap(); say(rounds[i].text, 1600); });

  micBtn.addEventListener("click", async () => {
    if (!aiOn) { Sfx.tap(); nextRound(); return; }
    if (listening) { stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); handle(); };
      recorder.start();
      listening = true;
      mizo.setMood("listening");
      micBtn.textContent = "⏺️ أستمع... (اضغط للإنهاء)";
      bubble.textContent = "أنا أستمع إليك 🎤";
      Sfx.pop();
      setTimeout(() => { if (listening) stop(); }, 3500);
    } catch (e) {
      bubble.textContent = "لم أستطع فتح الميكروفون 🙈";
    }
  });

  function stop() {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    listening = false;
    micBtn.textContent = "🎤 اضغط وكرّر";
  }

  async function handle() {
    const it = rounds[i];
    if (!chunks.length) { encourage(); return; }
    bubble.textContent = "أفكّر... 💭";
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const said = norm(await aiTranscribe(blob, "ar"));
      const target = norm(it.text);
      attempts++;
      const ok = said && (said.includes(target) || target.includes(said) || said === target);
      if (ok) succeed();
      else if (attempts >= 2) encourage();
      else { Sfx.tap(); bubble.textContent = "حاول مرّة أخرى، أنت تتحسّن! 😊"; say("حاول مرّة أخرى، أنت تتحسّن", 1800); }
    } catch (e) {
      encourage();
    }
  }

  setTimeout(render, 150);
  return screen;
}
