// ===== شهادة الحرف: الدرجة اللى بتظهر للطفل فى آخر صفحة الحرف (المالك ٢٠٢٦-١٠-١٦) =====
// النجوم والدرجة من ١٠٠ وتلات شرايط (الكتابة · الألعاب · أنشطة الكتاب)، وميزو بيقول كلمة حلوة.
// التفاصيل كلها لولى الأمر فى الإعدادات (screens/parent.js).
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { femAdapt } from "../data/mizo.js";
import { GRADE_SAY } from "../data/writingPhrases.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);

export function showLetterGrade({ glyph, name, grade, onClose, noun = "حرف" }) {
  const g = grade;
  const bar = (icon, label, v) => v == null ? "" : `
    <div class="lgc-row"><span class="lgc-lbl">${icon} ${label}</span>
      <span class="lgc-bar"><i style="width:${v}%"></i></span><b class="lgc-v">${v}</b></div>`;
  const overlay = document.createElement("div");
  overlay.className = "cheer lgc";
  overlay.innerHTML = `
    <div class="lgc-card lgc-t-${g.tone}" role="dialog" aria-label="شهادة ${noun} ${name}">
      <div class="lgc-ribbon">🏅 شهادة ${noun === "رقم" ? "الرقم" : "الحرف"}</div>
      <div class="lgc-glyph" dir="auto">${glyph}</div>
      <div class="lgc-stars" aria-label="${g.stars} نجوم">${"⭐".repeat(g.stars)}${"☆".repeat(3 - g.stars)}</div>
      <div class="lgc-total"><b>${g.total}</b><span>من ١٠٠</span></div>
      <div class="lgc-label">${g.label}</div>
      ${bar("✏️", "الكتابة", g.writing)}${bar("🎲", "الألعاب", g.games)}${bar("📕", "أنشطة الكتاب", g.acts)}
      <button class="candy-btn lgc-ok" type="button">يلا نكمّل 🎉</button>
    </div>`;
  document.body.appendChild(overlay);
  Sfx.win();
  Speech.ar(fem(GRADE_SAY[g.tone](name, noun)));
  let closed = false;
  overlay.querySelector(".lgc-ok").addEventListener("click", () => {
    if (closed) return;
    closed = true;
    Sfx.tap();
    overlay.remove();
    if (onClose) onClose();
  });
}
