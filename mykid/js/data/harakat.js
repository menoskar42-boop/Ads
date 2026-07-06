// ===== الحروف العربية بالحركات (فتحة / ضمة / كسرة) =====
// لكل حرف نولّد ثلاث بطاقات حركة مع النطق المناسب.
import { ARABIC_LETTERS } from "./arabicLetters.js";

// الحركات الثلاث الأساسية المناسبة للأطفال الصغار
export const HARAKAT = [
  { mark: "َ", name: "فَتْحَة", suffix: "َ", sound: "a" }, // فتحة
  { mark: "ُ", name: "ضَمَّة", suffix: "ُ", sound: "u" }, // ضمة
  { mark: "ِ", name: "كَسْرَة", suffix: "ِ", sound: "i" }, // كسرة
];

// النطق التقريبي للمقطع: حرف + حركة (للـ Web Speech بالعربية)
// مثال: ب + فتحة → "بَ"، نكتبها كمقطع منطوق.
function syllableSpeech(letterChar, harakaSound) {
  // نستخدم الحرف نفسه مع الحركة كنص منطوق؛ معظم محرّكات النطق تقرؤها صحيحة
  const base = letterChar;
  const map = {
    a: base + "َ",
    u: base + "ُ",
    i: base + "ِ",
  };
  return map[harakaSound] || base;
}

/** يبني عناصر الحركات: لكل حرف ٣ بطاقات (فتحة/ضمة/كسرة) */
export function buildHarakatItems() {
  const items = [];
  ARABIC_LETTERS.forEach((L) => {
    HARAKAT.forEach((H) => {
      items.push({
        char: L.char + H.suffix, // الحرف بالحركة للعرض
        baseChar: L.char,
        name: `${L.name} ${H.name}`, // مثلاً: "باء فتحة"
        speak: syllableSpeech(L.char, H.sound), // المقطع المنطوق
        word: L.word,
        emoji: L.emoji,
        haraka: H.name,
      });
    });
  });
  return items;
}

// مجموعة جاهزة (٢٨ × ٣ = ٨٤ بطاقة)
export const HARAKAT_ITEMS = buildHarakatItems();
