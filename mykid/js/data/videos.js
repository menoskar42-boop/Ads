// ===== فيديوهات وأغاني تعليمية (يوتيوب مُضمَّن) =====
// لا نخزّن أي ملفات فيديو/صوت — فقط روابط يوتيوب embed (بلا حقوق ملكية).
// لتبديل أي فيديو: ضع معرّف يوتيوب الجديد في youtubeId
// (الجزء بعد v= في رابط يوتيوب، مثل: youtu.be/XqZsoesa55w → XqZsoesa55w).
// cat: تصنيف للفلترة | lang: لغة الفيديو
export const VIDEOS = [
  // ===== الحروف العربية =====
  { id: "ar-alpha-1", title: "أنشودة الحروف العربية", youtubeId: "DR-cfDsHCGA", cat: "arabic", lang: "ar", emoji: "🔤" },
  { id: "ar-alpha-2", title: "تعلّم الحروف الهجائية", youtubeId: "kJtq9eEh8mU", cat: "arabic", lang: "ar", emoji: "🔤" },

  // ===== الحروف الإنجليزية =====
  { id: "en-abc-1", title: "ABC Song — أغنية الحروف", youtubeId: "75p-N9YKqNo", cat: "english", lang: "en", emoji: "🔠" },
  { id: "en-phonics", title: "Phonics Song — أصوات الحروف", youtubeId: "BELlZKpi1Zs", cat: "english", lang: "en", emoji: "🔠" },

  // ===== الأرقام =====
  { id: "ar-num", title: "أنشودة الأرقام بالعربية", youtubeId: "Vw5kP8AcF6E", cat: "numbers", lang: "ar", emoji: "🔢" },
  { id: "en-num", title: "Numbers Song 1-10", youtubeId: "DR-cfDsHCGA", cat: "numbers", lang: "en", emoji: "🔢" },

  // ===== الحيوانات =====
  { id: "ar-animals", title: "أصوات الحيوانات", youtubeId: "25_u1GzruQM", cat: "animals", lang: "ar", emoji: "🦁" },
  { id: "en-animals", title: "Animal Sounds Song", youtubeId: "M1Cuh-9Don0", cat: "animals", lang: "en", emoji: "🦁" },

  // ===== الألوان =====
  { id: "ar-colors", title: "أنشودة الألوان", youtubeId: "ybt2jhCQ3lA", cat: "colors", lang: "ar", emoji: "🎨" },
  { id: "en-colors", title: "Colors Song", youtubeId: "qhOTU8_1Af4", cat: "colors", lang: "en", emoji: "🎨" },
];

// تصنيفات للعرض في الواجهة
export const VIDEO_CATS = [
  { key: "all", label: "الكل", emoji: "🎬" },
  { key: "arabic", label: "حروف عربية", emoji: "🔤" },
  { key: "english", label: "حروف إنجليزية", emoji: "🔠" },
  { key: "numbers", label: "أرقام", emoji: "🔢" },
  { key: "animals", label: "حيوانات", emoji: "🦁" },
  { key: "colors", label: "ألوان", emoji: "🎨" },
];
