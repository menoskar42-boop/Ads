interface DailyReading {
  bookName: string;
  chapter: number;
  label: string;
  type: 'old' | 'new' | 'psalm';
}

interface DailyReadings {
  date: string;
  readings: DailyReading[];
}

const OT_BOOKS: [string, number][] = [
  ["التكوين", 50], ["الخروج", 40], ["اللاويين", 27], ["العدد", 36],
  ["التثنية", 34], ["يشوع", 24], ["القضاة", 21], ["راعوث", 4],
  ["صموئيل الأول", 31], ["صموئيل الثاني", 24], ["الملوك الأول", 22],
  ["الملوك الثاني", 25], ["أخبار الأيام الأول", 29], ["أخبار الأيام الثاني", 36],
  ["عزرا", 10], ["نحميا", 13], ["أستير", 10], ["أيوب", 42],
  ["الجامعة", 12], ["نشيد الأنشاد", 8], ["إشعياء", 66], ["إرميا", 52],
  ["مراثي إرميا", 5], ["حزقيال", 48], ["دانيال", 12], ["هوشع", 14],
  ["يوئيل", 3], ["عاموس", 9], ["عوبديا", 1], ["يونان", 4],
  ["ميخا", 7], ["ناحوم", 3], ["حبقوق", 3], ["صفنيا", 3],
  ["حجي", 2], ["زكريا", 14], ["ملاخي", 4],
];

const NT_BOOKS: [string, number][] = [
  ["متى", 28], ["مرقس", 16], ["لوقا", 24], ["يوحنا", 21],
  ["أعمال الرسل", 28], ["رومية", 16], ["كورنثوس الأولى", 16],
  ["كورنثوس الثانية", 13], ["غلاطية", 6], ["أفسس", 6], ["فيلبي", 4],
  ["كولوسي", 4], ["تسالونيكي الأولى", 5], ["تسالونيكي الثانية", 3],
  ["تيموثاوس الأولى", 6], ["تيموثاوس الثانية", 4], ["تيطس", 3],
  ["فليمون", 1], ["العبرانيين", 13], ["يعقوب", 5], ["بطرس الأولى", 5],
  ["بطرس الثانية", 3], ["يوحنا الأولى", 5], ["يوحنا الثانية", 1],
  ["يوحنا الثالثة", 1], ["يهوذا", 1], ["رؤيا يوحنا", 22],
];

const PSALM_PROVERBS: [string, number][] = [
  ["المزامير", 150], ["الأمثال", 31],
];

function buildFlatChapterList(books: [string, number][]): [string, number][] {
  const result: [string, number][] = [];
  for (const [name, count] of books) {
    for (let ch = 1; ch <= count; ch++) {
      result.push([name, ch]);
    }
  }
  return result;
}

const otChapters = buildFlatChapterList(OT_BOOKS);
const ntChapters = buildFlatChapterList(NT_BOOKS);
const psalmChapters = buildFlatChapterList(PSALM_PROVERBS);

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function getTodayDateStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function generateReadingsForDay(dayOfYear: number): DailyReading[] {
  const dayIndex = dayOfYear - 1;

  const otIdx = dayIndex % otChapters.length;
  const [otBook, otCh] = otChapters[otIdx];

  const ntIdx = dayIndex % ntChapters.length;
  const [ntBook, ntCh] = ntChapters[ntIdx];

  const psIdx = dayIndex % psalmChapters.length;
  const [psBook, psCh] = psalmChapters[psIdx];

  return [
    {
      bookName: otBook,
      chapter: otCh,
      label: `${otBook} الإصحاح ${otCh}`,
      type: 'old',
    },
    {
      bookName: ntBook,
      chapter: ntCh,
      label: `${ntBook} الإصحاح ${ntCh}`,
      type: 'new',
    },
    {
      bookName: psBook,
      chapter: psCh,
      label: psBook === "المزامير" ? `مزمور ${psCh}` : `${psBook} ${psCh}`,
      type: 'psalm',
    },
  ];
}

const STORAGE_KEY = 'dailyReadings';

export function getTodayReadings(): DailyReadings {
  const todayStr = getTodayDateStr();

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: DailyReadings = JSON.parse(stored);
      if (parsed.date === todayStr && parsed.readings?.length === 3) {
        return parsed;
      }
    }
  } catch {}

  const dayOfYear = getDayOfYear();
  const readings = generateReadingsForDay(dayOfYear);
  const result: DailyReadings = { date: todayStr, readings };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {}

  return result;
}

export type { DailyReading, DailyReadings };
