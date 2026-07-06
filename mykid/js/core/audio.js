// ===== المؤثرات الصوتية (مولّدة عبر Web Audio API) =====
let ctx = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  // بعض المتصفحات تعلّق السياق حتى أول تفاعل
  if (ctx && ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, start, dur, type = "sine", gainVal = 0.18) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gainVal, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function slide(f1, f2, start, dur, type = "sine", gainVal = 0.16) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f1, t0);
  osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gainVal, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// خطّافات تفاعل ميزو عند الصح/الخطأ (يضبطها app.js)
let onWrong = null, onCorrect = null;
export function setOnWrong(fn) { onWrong = fn; }
export function setOnCorrect(fn) { onCorrect = fn; }

export const Sfx = {
  // يجب استدعاؤه بعد أول لمسة لفتح السياق الصوتي
  unlock() {
    ac();
  },

  tap() {
    tone(520, 0, 0.08, "triangle", 0.12);
  },

  correct() {
    tone(660, 0, 0.12, "triangle");
    tone(880, 0.1, 0.16, "triangle");
    if (onCorrect) { try { onCorrect(); } catch (e) {} } // ميزو يعمل علامة OK عند الصح
  },

  wrong() {
    tone(200, 0, 0.18, "sawtooth", 0.12);
    if (onWrong) { try { onWrong(); } catch (e) {} } // تشجيع ميزو عند أي خطأ
  },

  // لحن النجاح/المكافأة
  win() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => tone(f, i * 0.12, 0.18, "triangle", 0.2));
  },

  star() {
    slide(900, 1500, 0, 0.25, "triangle", 0.16);
  },

  pop() {
    tone(420, 0, 0.06, "sine", 0.14);
  },

  whoosh() {
    slide(700, 200, 0, 0.25, "sine", 0.1);
  },

  bubble() {
    slide(300, 700, 0, 0.18, "sine", 0.12);
  },

  unlockReward() {
    const notes = [392, 523, 659, 784, 1046];
    notes.forEach((f, i) => tone(f, i * 0.1, 0.2, "triangle", 0.18));
  },
};
