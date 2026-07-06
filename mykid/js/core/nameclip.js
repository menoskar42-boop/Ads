// ===== مقطع نطق اسم الطفل (يُولّد مرّة ويُخزَّن في localStorage) =====
// يحافظ على توفير الـ AI: اسم كل طفل يُنطق بمجرّد كتابته مرّة، ويُخزَّن كملف صوتي
// (data URL) في localStorage، ثم يُستدعى محلياً بلا أي طلب AI لاحق.
import { Store } from "./storage.js";
import { isAIReady } from "./ai.js";
import { MIZO } from "../data/mizo.js";

let nameAudio = null;

// v2: بلا فاصلة في آخر النص لتقليل الصمت الزائد آخر المقطع (تقليل الفجوة)
const lsKey = (name) => "mizoNameClip:v2:" + name;

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
 * يشغّل مقطع اسم الطفل (من localStorage أو يولّده مرّة عند توفّر الـ AI).
 * يُرجع Promise بقيمة true إن نُطِق الاسم فعلاً، وإلا false.
 */
export async function playChildName() {
  const name = Store.childName;
  if (!name) return false;

  let dataUrl = null;
  try { dataUrl = localStorage.getItem(lsKey(name)); } catch (e) {}

  if (!dataUrl) {
    if (!isAIReady()) return false; // بلا AI: يُنطق الاسم inline داخل speech (Web Speech)
    try {
      dataUrl = await fetchNameClip(name);
      try { localStorage.setItem(lsKey(name), dataUrl); } catch (e) {}
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
