const bookNameToCSV: Record<string, string> = {
  "التكوين": "تكوين",
  "الخروج": "خروج",
  "اللاويين": "لاويين",
  "العدد": "عدد",
  "التثنية": "تثنية",
  "يشوع": "يشوع",
  "القضاة": "قضاة",
  "راعوث": "راعوث",
  "صموئيل الأول": "صموئيل أول",
  "صموئيل الثاني": "صموئيل ثاني",
  "الملوك الأول": "ملوك أول",
  "الملوك الثاني": "ملوك ثاني",
  "أخبار الأيام الأول": "أخبار أيام أول",
  "أخبار الأيام الثاني": "أخبار أيام ثاني",
  "عزرا": "عزرا",
  "نحميا": "نحميا",
  "أستير": "أستير",
  "أيوب": "أيوب",
  "المزامير": "مزامير",
  "الأمثال": "أمثال",
  "الجامعة": "جامعة",
  "نشيد الأنشاد": "نشيد الأنشاد",
  "إشعياء": "إشعياء",
  "إرميا": "إرميا",
  "مراثي إرميا": "مراثي إرميا",
  "حزقيال": "حزقيال",
  "دانيال": "دانيال",
  "هوشع": "هوشع",
  "يوئيل": "يوئيل",
  "عاموس": "عاموس",
  "عوبديا": "عوبديا",
  "يونان": "يونان",
  "ميخا": "ميخا",
  "ناحوم": "ناحوم",
  "حبقوق": "حبقوق",
  "صفنيا": "صفنيا",
  "حجي": "حجي",
  "زكريا": "زكريا",
  "ملاخي": "ملاخي",
  "متى": "متى",
  "مرقس": "مرقس",
  "لوقا": "لوقا",
  "يوحنا": "يوحنا",
  "أعمال الرسل": "أعمال الرسل",
  "رومية": "رومية",
  "كورنثوس الأولى": "كورنثوس أولى",
  "كورنثوس الثانية": "كورنثوس ثانية",
  "غلاطية": "غلاطية",
  "أفسس": "أفسس",
  "فيلبي": "فيلبي",
  "كولوسي": "كولوسي",
  "تسالونيكي الأولى": "تسالونيكي أولى",
  "تسالونيكي الثانية": "تسالونيكي ثانية",
  "تيموثاوس الأولى": "تيموثاوس أولى",
  "تيموثاوس الثانية": "تيموثاوس ثانية",
  "تيطس": "تيطس",
  "فليمون": "فليمون",
  "العبرانيين": "عبرانيين",
  "يعقوب": "يعقوب",
  "بطرس الأولى": "بطرس أولى",
  "بطرس الثانية": "بطرس ثانية",
  "يوحنا الأولى": "يوحنا أولى",
  "يوحنا الثانية": "يوحنا ثانية",
  "يوحنا الثالثة": "يوحنا ثالثة",
  "يهوذا": "يهوذا",
  "رؤيا يوحنا": "رؤيا",
  "طوبيا": "طوبيا",
  "يهوديت": "يهوديت",
  "الحكمة": "حكمة سليمان",
  "حكمة سليمان": "حكمة سليمان",
  "يشوع بن سيراخ": "يشوع بن سيراخ",
  "باروخ": "باروخ",
  "المكابيين الأول": "المكابيين الأول",
  "المكابيين الثاني": "المكابيين الثاني",
};

export function getCSVFileName(bookName: string): string | null {
  if (bookNameToCSV[bookName]) return bookNameToCSV[bookName];

  for (const [dbName, csvName] of Object.entries(bookNameToCSV)) {
    if (bookName.includes(csvName) || csvName.includes(bookName)) {
      return csvName;
    }
  }

  return null;
}

export async function fetchBookIntro(bookName: string): Promise<string | null> {
  try {
    const csvName = getCSVFileName(bookName);
    if (!csvName) return null;

    const response = await fetch(`/api/tafsir/book-intro/${encodeURIComponent(csvName)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.tafsir || null;
  } catch (e) {
    console.log("Book intro fetch error:", e);
    return null;
  }
}

/** ليه مفيش تفسير: السفر كله مش متحمّل، ولا السفر موجود بس الإصحاح ده ناقص. */
export type TafsirMissingReason = 'book-missing' | 'chapter-missing' | null;

let lastChapterReason: TafsirMissingReason = null;

/** سبب آخر محاولة فاشلة لجلب تفسير إصحاح — تقراه الواجهة بعد ما ترجع null. */
export function getLastChapterTafsirReason(): TafsirMissingReason {
  return lastChapterReason;
}

export async function fetchChapterTafsir(bookName: string, chapter: number): Promise<string | null> {
  lastChapterReason = null;
  try {
    const csvName = getCSVFileName(bookName);
    if (!csvName) { lastChapterReason = 'book-missing'; return null; }

    const response = await fetch(`/api/tafsir/chapter/${encodeURIComponent(csvName)}/${chapter}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.tafsir) lastChapterReason = (data.reason as TafsirMissingReason) ?? null;
    return data.tafsir || null;
  } catch (e) {
    console.log("Chapter tafsir fetch error:", e);
    return null;
  }
}

/** 'verse' = تفسير الآية نفسها · 'chapter' = تفسير الإصحاح كبديل. */
export type TafsirScope = 'verse' | 'chapter' | null;

let lastVerseScope: TafsirScope = null;

/** نطاق آخر تفسير آية اترجّع — الواجهة بتقراه عشان توضّح إنه تفسير الإصحاح. */
export function getLastVerseTafsirScope(): TafsirScope {
  return lastVerseScope;
}

export async function fetchVerseTafsir(bookName: string, chapter: number, verse: number): Promise<string | null> {
  lastVerseScope = null;
  try {
    const csvName = getCSVFileName(bookName);
    if (!csvName) return null;

    const response = await fetch(`/api/tafsir/verse/${encodeURIComponent(csvName)}/${chapter}/${verse}`);
    if (!response.ok) return null;
    const data = await response.json();
    lastVerseScope = (data.scope as TafsirScope) ?? null;
    return data.tafsir || null;
  } catch (e) {
    console.log("Verse tafsir fetch error:", e);
    return null;
  }
}

export async function fetchTafsir(bookName: string, chapter: number, verse: number): Promise<string | null> {
  return fetchChapterTafsir(bookName, chapter);
}
