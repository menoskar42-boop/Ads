// ===== النطق الهجين: OpenAI TTS أولاً ثم Web Speech كبديل =====
import { isAIReady, aiSpeak, aiStop, aiPrepareTTS } from "./ai.js";
import { MIZO, femAdapt } from "../data/mizo.js";
import { Store } from "./storage.js";
import { playChildName } from "./nameclip.js";

let voices = [];
let enabled = "speechSynthesis" in window;
let useAI = false; // يُضبط من checkAI() عبر setAISpeech()
let speakSeq = 0; // رمز تسلسل النطق لمنع تداخل OpenAI مع Web Speech
let aiHealthy = false; // يصبح true بعد أوّل نطق AI ناجح (يعمل + فيه رصيد) → نُخفي Web Speech

// مستمعو حالة النطق (يتكلّم/توقّف) — لمزامنة شفاه ميزو لحظياً مع أيّ صوت
let speakingCbs = [];
export function onSpeaking(cb) {
  speakingCbs.push(cb);
  return () => { speakingCbs = speakingCbs.filter((x) => x !== cb); };
}
function emitSpeaking(on) {
  for (const cb of speakingCbs) { try { cb(on); } catch (e) {} }
}

// صوت ميزو الثابت لكل لغة (من ملف الهوية المركزي) — كي لا يتغيّر "صديق الطفل"
const AI_VOICE = MIZO.voice;

// وعد جاهزية النطق: يُحَلّ بعد أن يقرّر app.js نتيجة فحص الـ AI
let _resolveReady;
const _readyPromise = new Promise((r) => { _resolveReady = r; });

/** تفعيل/تعطيل النطق بالـ AI (يستدعيه app.js بعد فحص الخادم) */
export function setAISpeech(on) {
  useAI = Boolean(on);
  if (_resolveReady) { _resolveReady(); _resolveReady = null; }
}

/** يُرجع وعداً يُحَلّ عندما يُعرَف هل سنستخدم AI أم Web Speech (لتفادي سباق النطق) */
export function whenSpeechReady() {
  return _readyPromise;
}

function refreshVoices() {
  if (!enabled) return;
  voices = window.speechSynthesis.getVoices() || [];
}

if (enabled) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

function pickVoice(lang) {
  if (!voices.length) refreshVoices();
  const prefix = lang.slice(0, 2).toLowerCase();
  // أفضلية لصوت يطابق اللغة بالكامل ثم بالبادئة
  return (
    voices.find((v) => v.lang && v.lang.toLowerCase() === lang.toLowerCase()) ||
    voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(prefix)) ||
    null
  );
}

export const Speech = {
  get available() {
    return enabled;
  },

  /**
   * نطق نص بلغة معيّنة.
   * @param {string} text
   * @param {object} opts  { lang:'ar-EG'|'en-US', rate, pitch, onend }
   */
  say(text, opts = {}) {
    if (!text) {
      if (opts.onend) setTimeout(opts.onend, 300);
      return;
    }
    const lang = opts.lang || "ar-EG";
    const myId = ++speakSeq; // رمز تسلسل: أيّ نطق جديد يُلغي ما قبله

    // المسار المفضّل: OpenAI TTS. وإن تعثّر/تأخّر أكثر من المهلة → Web Speech
    // (مع إلغاء طلب الـ AI المعلّق أولاً كي لا يتداخل صوتان معاً).
    if (useAI && isAIReady()) {
      if (enabled) { try { window.speechSynthesis.cancel(); } catch (e) {} }
      const voice = AI_VOICE[lang.slice(0, 2)] || undefined;
      const ctrl = "AbortController" in window ? new AbortController() : null;
      let started = false, settled = false;
      // البديل (Web Speech) يُستخدم فقط إن لم يُثبت الـ AI أنه يعمل (مثلاً لا رصيد).
      // ما دام الـ AI اشتغل بنجاح مرّة (aiHealthy) نبقى على صوت OpenAI فقط ولا نُظهر Web Speech.
      const fallback = () => {
        if (settled) return;
        settled = true;
        aiHealthy = false; // فشل توليد الصوت: لم يعد الـ AI سليماً (مثلاً نفاد الرصيد/الحصة)
        // نضمن دائماً سماع الطفل لصوت ميزو عبر Web Speech، ما لم يُلغَ هذا النطق بنطقٍ أحدث.
        if (myId === speakSeq) this._webSpeak(text, opts);
        else if (opts.onend) opts.onend();
      };
      // مهلة: إن لم يبدأ صوت الـ AI خلال ١٠ ثوانٍ نُلغيه (وننتقل للبديل فقط إن لم يكن الـ AI سليماً)
      const timer = setTimeout(() => {
        if (!started && !settled) { try { ctrl && ctrl.abort(); } catch (e) {} fallback(); }
      }, 10000);
      aiSpeak(text, {
        voice,
        instructions: opts.instructions,
        preparedUrl: opts.preparedUrl, // صوت محضَّر مسبقاً (يُلغي زمن التحميل)
        signal: ctrl ? ctrl.signal : undefined,
        onStart: () => { started = true; aiHealthy = true; clearTimeout(timer); emitSpeaking(true); },
      }).then(
        () => { clearTimeout(timer); emitSpeaking(false); if (!settled) { settled = true; if (myId === speakSeq && opts.onend) opts.onend(); } },
        // فشل: إن لم يبدأ صوت بعد → Web Speech؛ وإن كان قد بدأ ثم تعثّر → لا نخلط
        () => { clearTimeout(timer); if (started) { emitSpeaking(false); if (!settled) { settled = true; if (opts.onend) opts.onend(); } } else fallback(); }
      );
      return;
    }
    // لا يوجد AI: نستخدم Web Speech كبديل وحيد
    this._webSpeak(text, opts);
  },

  /**
   * نطق ميزو الشخصي: لهجة مصرية حيوية وسريعة قليلاً تجذب الأطفال.
   * (نطق الحروف والقواعد يبقى عبر say/ar بالفصحى البسيطة كما هو.)
   */
  mizo(text, opts = {}) {
    // صيغة جنس الطفل (افتراضي ولد) — الحروف/القواعد تبقى عبر say/ar بلا تغيير
    let t = text;
    try { if (Store.childGender === "girl") t = femAdapt(text); } catch (e) {}
    const mizoOpts = { ...opts, lang: "ar-EG", instructions: MIZO.toneInstructions, rate: opts.rate ?? 1.05 };
    let name = "";
    try { name = Store.childName; } catch (e) {}
    if (name) {
      if (useAI && isAIReady()) {
        // نحضّر صوت الجملة بالتوازي مع نطق اسم الطفل لإخفاء زمن التحميل (تقليل الفجوة)
        let prep = null;
        try { prep = aiPrepareTTS(t, { voice: AI_VOICE.ar, instructions: mizoOpts.instructions }); } catch (e) {}
        playChildName().then(() => {
          if (prep) {
            prep.then((url) => this.say(t, { ...mizoOpts, preparedUrl: url }))
                .catch(() => this.say(t, mizoOpts)); // فشل التحضير → المسار العادي
          } else {
            this.say(t, mizoOpts);
          }
        });
        return;
      }
      // Web Speech المجاني: الاسم inline بلا أي تكلفة
      this.say("يا " + name + "، " + t, mizoOpts);
      return;
    }
    this.say(t, mizoOpts);
  },

  // النطق عبر متصفح الجهاز (Web Speech) — البديل الدائم
  _webSpeak(text, opts = {}) {
    if (!enabled) {
      if (opts.onend) setTimeout(opts.onend, 300);
      return;
    }
    const lang = opts.lang || "ar-EG";
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = lang;
      u.rate = opts.rate ?? 0.85; // أبطأ قليلاً للأطفال
      u.pitch = opts.pitch ?? 1.15; // نبرة ودودة
      const v = pickVoice(lang);
      if (v) u.voice = v;
      u.onstart = () => emitSpeaking(true);
      u.onend = () => { emitSpeaking(false); if (opts.onend) opts.onend(); };
      window.speechSynthesis.speak(u);
    } catch (e) {
      if (opts.onend) setTimeout(opts.onend, 300);
    }
  },

  ar(text, opts = {}) {
    this.say(text, { ...opts, lang: "ar-EG" });
  },

  en(text, opts = {}) {
    this.say(text, { ...opts, lang: "en-US" });
  },

  /** نطق متسلسل: عناصر بالشكل {text, lang} */
  sequence(items, gap = 350) {
    let i = 0;
    const next = () => {
      if (i >= items.length) return;
      const item = items[i++];
      this.say(item.text, {
        lang: item.lang || "ar-EG",
        rate: item.rate,
        pitch: item.pitch,
        onend: () => setTimeout(next, gap),
      });
    };
    next();
  },

  stop() {
    aiStop();
    if (enabled) window.speechSynthesis.cancel();
  },
};
