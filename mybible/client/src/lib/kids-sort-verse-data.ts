export interface SortVerse {
  id: string;
  words: string[]; // الترتيب الصحيح
  reference: string;
  emoji: string;
}

// آيات قصيرة ومعروفة — من 5 إلى 9 كلمات — مناسبة للأطفال.
export const sortVerses: SortVerse[] = [
  {
    id: "sv01",
    words: ["اللهُ", "محبةٌ", "والذي", "يثبت", "في", "المحبة", "يثبت", "في", "الله"],
    reference: "يوحنا الأولى ٤: ١٦",
    emoji: "❤️",
  },
  {
    id: "sv02",
    words: ["افرحوا", "في", "الرب", "كل", "حين", "وأقول", "أيضاً", "افرحوا"],
    reference: "فيلبي ٤: ٤",
    emoji: "😊",
  },
  {
    id: "sv03",
    words: ["كونوا", "لطفاء", "بعضكم", "نحو", "بعض", "رحيمين", "متسامحين"],
    reference: "أفسس ٤: ٣٢",
    emoji: "🤝",
  },
  {
    id: "sv04",
    words: ["الرب", "راعيَّ", "فلا", "يعوزني", "شيء"],
    reference: "مزمور ٢٣: ١",
    emoji: "🐑",
  },
  {
    id: "sv05",
    words: ["ثق", "بالرب", "من", "كل", "قلبك", "ولا", "تستند", "إلى", "فهمك"],
    reference: "أمثال ٣: ٥",
    emoji: "🙏",
  },
  {
    id: "sv06",
    words: ["أنا", "هو", "الطريق", "والحق", "والحياة"],
    reference: "يوحنا ١٤: ٦",
    emoji: "✨",
  },
  {
    id: "sv07",
    words: ["صلّوا", "بلا", "انقطاع"],
    reference: "تسالونيكي الأولى ٥: ١٧",
    emoji: "🙌",
  },
  {
    id: "sv08",
    words: ["سراجٌ", "لرجلي", "كلامُك", "ونورٌ", "لسبيلي"],
    reference: "مزمور ١١٩: ١٠٥",
    emoji: "💡",
  },
  {
    id: "sv09",
    words: ["أكرم", "أباك", "وأمك", "لكي", "تطول", "أيامك"],
    reference: "خروج ٢٠: ١٢",
    emoji: "👨‍👩‍👧",
  },
  {
    id: "sv10",
    words: ["هكذا", "أحب", "الله", "العالم", "حتى", "وهب", "ابنه", "الوحيد"],
    reference: "يوحنا ٣: ١٦",
    emoji: "🌍",
  },
];

/** يُرجع نسخة مخلوطة من الكلمات (Fisher-Yates) */
export function shuffleWords(words: string[]): string[] {
  const arr = [...words];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
