// ===== مقطع نطق اسم الطفل (الجزء الوحيد المتغيّر) =====
// كل الجُمَل الثابتة صوتها ملفات دائمة على الخادم (tts-prebuilt). الاسم بس هو
// اللي بيتغيّر: أوّل ما يتكتب، الخادم يولّده مرّة ويحفظه في كاش القرص عنده
// (مشترك بين كل الأجهزة، جوّه موقعنا — مش كاش متصفّح). هنا بنحتفظ بيه في ذاكرة
// الجلسة بس (Map) عشان ما نطلبوش تاني نفس الجلسة، بدون أي تخزين في المتصفّح.
import { Store } from "./storage.js";
import { isAIReady } from "./ai.js";
import { MIZO } from "../data/mizo.js";

let nameAudio = null;
const sessionClips = new Map(); // name -> dataUrl (ذاكرة الجلسة فقط، بلا localStorage)

async function fetchNameClip(name) {
  const r = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "يا " + name,
      voice: MIZO.voice.ar,
      instructions: MIZO.toneInstructions,
    }),
  });
  if (!r.ok) throw new Error("name tts " + r.status);
  const blob = await r.blob();
  return await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result); // data URL (base64)
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

/**
 * يشغّل مقطع اسم الطفل (من ذاكرة الجلسة أو يولّده مرّة على الخادم عند توفّر الـ AI).
 * يُرجع Promise بقيمة true إن نُطِق الاسم فعلاً، وإلا false.
 */
export async function playChildName() {
  const name = Store.childName;
  if (!name) return false;

  let dataUrl = sessionClips.get(name) || null;

  if (!dataUrl) {
    if (!isAIReady()) return false; // بلا AI: يُنطق الاسم inline داخل speech (Web Speech)
    try {
      // الخادم يخدم الاسم من كاش قرصه لو اتولّد قبل كده (بلا AI)، وإلا يولّده مرّة.
      dataUrl = await fetchNameClip(name);
      sessionClips.set(name, dataUrl); // ذاكرة الجلسة فقط — مفيش تخزين في المتصفّح
    } catch (e) {
      return false;
    }
  }

  return await new Promise((resolve) => {
    try {
      if (!nameAudio) nameAudio = new Audio();
      nameAudio.src = dataUrl;
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      // نُنهي الانتظار قبل نهاية المقطع بقليل كي تبدأ الجملة فوراً بلا فجوة محسوسة
      nameAudio.ontimeupdate = () => {
        const d = nameAudio.duration;
        if (d && isFinite(d) && d - nameAudio.currentTime <= 0.12) finish(true);
      };
      nameAudio.onended = () => finish(true);
      nameAudio.onerror = () => finish(false);
      const p = nameAudio.play();
      if (p && p.catch) p.catch(() => finish(false));
    } catch (e) {
      resolve(false);
    }
  });
}
