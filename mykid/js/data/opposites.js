// ===== بيانات الأضداد (أزواج متقابلة) =====
// a: الطرف الأول | b: الطرف المقابل  (كل طرف: {name, en, emoji})
export const OPPOSITES = [
  { a: { name: "كبير", en: "Big", emoji: "🐘" }, b: { name: "صغير", en: "Small", emoji: "🐜" } },
  { a: { name: "حار", en: "Hot", emoji: "🔥" }, b: { name: "بارد", en: "Cold", emoji: "❄️" } },
  { a: { name: "سعيد", en: "Happy", emoji: "😄" }, b: { name: "حزين", en: "Sad", emoji: "😢" } },
  { a: { name: "طويل", en: "Tall", emoji: "🦒" }, b: { name: "قصير", en: "Short", emoji: "🐢" } },
  { a: { name: "سريع", en: "Fast", emoji: "🐆" }, b: { name: "بطيء", en: "Slow", emoji: "🐌" } },
  { a: { name: "نهار", en: "Day", emoji: "☀️" }, b: { name: "ليل", en: "Night", emoji: "🌙" } },
  { a: { name: "مفتوح", en: "Open", emoji: "🔓" }, b: { name: "مغلق", en: "Closed", emoji: "🔒" } },
  { a: { name: "نظيف", en: "Clean", emoji: "✨" }, b: { name: "متّسخ", en: "Dirty", emoji: "🦠" } },
  { a: { name: "ممتلئ", en: "Full", emoji: "🍶" }, b: { name: "فارغ", en: "Empty", emoji: "🫙" } },
  { a: { name: "فوق", en: "Up", emoji: "⬆️" }, b: { name: "تحت", en: "Down", emoji: "⬇️" } },
];

// قائمة مسطّحة لكل الأطراف (لاستخدامها في الاستكشاف وإيجاد العنصر)
export const OPPOSITES_FLAT = OPPOSITES.flatMap((p) => [p.a, p.b]);
