// حساب القراءات التلقائية اليومية للجروب

// الترتيب يتبع السبعينية (الكنيسة القبطية الأرثوذكسية): الأسفار القانونية الثانية
// مُدمجة في مواضعها التقليدية بين أسفار العهد القديم.
export const OT_BOOKS: [string, number][] = [
  ["التكوين", 50], ["الخروج", 40], ["اللاويين", 27], ["العدد", 36],
  ["التثنية", 34], ["يشوع", 24], ["القضاة", 21], ["راعوث", 4],
  ["صموئيل الأول", 31], ["صموئيل الثاني", 24], ["الملوك الأول", 22],
  ["الملوك الثاني", 25], ["أخبار الأيام الأول", 29], ["أخبار الأيام الثاني", 36],
  ["عزرا", 10], ["نحميا", 13],
  // ── أسفار تاريخية قانونية ثانية ──
  ["طوبيا", 14], ["يهوديت", 16], ["أستير", 10],
  ["المكابيين الأول", 16], ["المكابيين الثاني", 15], ["المكابيين الثالث", 7],
  // ── أسفار حكمية وشعرية ──
  ["أيوب", 42], ["المزامير", 150], ["المزمور 151", 1], ["صلاة منسى", 1],
  ["الأمثال", 31], ["الجامعة", 12], ["نشيد الأنشاد", 8],
  ["حكمة سليمان", 19], ["يشوع بن سيراخ", 51],
  // ── أسفار نبوية ──
  ["إشعياء", 66], ["إرميا", 52], ["مراثي إرميا", 5], ["باروخ", 6], ["حزقيال", 48],
  ["دانيال", 12], ["هوشع", 14], ["يوئيل", 3], ["عاموس", 9],
  ["عوبديا", 1], ["يونان", 4], ["ميخا", 7], ["ناحوم", 3],
  ["حبقوق", 3], ["صفنيا", 3], ["حجي", 2], ["زكريا", 14], ["ملاخي", 4],
];

// أسماء الأسفار القانونية الثانية — محتواها مخزّن في apocrypha-content.ts وليس في
// جدول الكتب الأساسي، لذا يحتاج القارئ لتحميلها من هناك.
export const DEUTEROCANONICAL_BOOKS = new Set<string>([
  "طوبيا", "يهوديت", "المكابيين الأول", "المكابيين الثاني", "المكابيين الثالث",
  "المزمور 151", "صلاة منسى", "حكمة سليمان", "يشوع بن سيراخ", "باروخ",
]);

export const NT_BOOKS: [string, number][] = [
  ["متى", 28], ["مرقس", 16], ["لوقا", 24], ["يوحنا", 21],
  ["أعمال الرسل", 28], ["رومية", 16], ["كورنثوس الأولى", 16],
  ["كورنثوس الثانية", 13], ["غلاطية", 6], ["أفسس", 6], ["فيلبي", 4],
  ["كولوسي", 4], ["تسالونيكي الأولى", 5], ["تسالونيكي الثانية", 3],
  ["تيموثاوس الأولى", 6], ["تيموثاوس الثانية", 4], ["تيطس", 3],
  ["فليمون", 1], ["العبرانيين", 13], ["يعقوب", 5], ["بطرس الأولى", 5],
  ["بطرس الثانية", 3], ["يوحنا الأولى", 5], ["يوحنا الثانية", 1],
  ["يوحنا الثالثة", 1], ["يهوذا", 1], ["رؤيا يوحنا", 22],
];

export interface FlatChapter { book: string; chapter: number; bookIndex: number; }

function buildFlat(books: [string, number][]): FlatChapter[] {
  const result: FlatChapter[] = [];
  for (let bi = 0; bi < books.length; bi++) {
    const [name, count] = books[bi];
    for (let ch = 1; ch <= count; ch++) result.push({ book: name, chapter: ch, bookIndex: bi });
  }
  return result;
}

export const OT_FLAT = buildFlat(OT_BOOKS);
export const NT_FLAT = buildFlat(NT_BOOKS);

export interface AutoReadingConfig {
  enabled: boolean;
  otChaptersPerDay: number;
  ntChaptersPerDay: number;
  baseDate: string;      // YYYY-MM-DD
  otStartIndex: number;  // index in OT_FLAT
  ntStartIndex: number;  // index in NT_FLAT
}

export interface DayAutoReading {
  ot: FlatChapter[];
  nt: FlatChapter[];
}

export function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000;
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

export function getAutoReadingForDate(config: AutoReadingConfig, dateStr: string): DayAutoReading {
  const elapsed = Math.max(0, daysBetween(config.baseDate, dateStr));
  const otOffset = (config.otStartIndex + elapsed * config.otChaptersPerDay) % OT_FLAT.length;
  const ntOffset = (config.ntStartIndex + elapsed * config.ntChaptersPerDay) % NT_FLAT.length;

  const ot: FlatChapter[] = [];
  for (let i = 0; i < config.otChaptersPerDay; i++) {
    ot.push(OT_FLAT[(otOffset + i) % OT_FLAT.length]);
  }
  const nt: FlatChapter[] = [];
  for (let i = 0; i < config.ntChaptersPerDay; i++) {
    nt.push(NT_FLAT[(ntOffset + i) % NT_FLAT.length]);
  }
  return { ot, nt };
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** يحوّل اسم الكتاب + رقم الإصحاح إلى index في القائمة المسطّحة */
export function findFlatIndex(flat: FlatChapter[], bookName: string, chapter: number): number {
  const idx = flat.findIndex(f => f.book === bookName && f.chapter === chapter);
  return idx >= 0 ? idx : 0;
}
