// ── مناسبة اليوم الليتورجية (Occasion) ─────────────────────────────────────
// تحديد المناسبة القبطية لليوم (تلقائياً من التاريخ) لقيادة المردات والألحان
// والقراءات في لوحة التحكم وشاشة العرض. تُعاد المناسبة كوسم موحّد OccasionTag.

import { gregorianToCoptic } from './synaxarium-content';

export type OccasionTag =
  | 'ordinary'      // يوم عادي (أسبوع/أحد بلا عيد)
  | 'kiahk'         // شهر كيهك — استعداد الميلاد
  | 'nativity'      // عيد الميلاد المجيد
  | 'circumcision'  // عيد الختان
  | 'epiphany'      // عيد الغطاس
  | 'presentation'  // عيد دخول السيد إلى الهيكل
  | 'great-lent'    // الصوم الكبير المقدس
  | 'lazarus-palm'  // سبت لعازر / أحد الشعانين
  | 'holy-week'     // أسبوع الآلام (البصخة)
  | 'resurrection'  // عيد القيامة المجيد + أسبوع الفرح
  | 'pentecostal'   // الخماسين المقدسة (ما بين القيامة والعنصرة)
  | 'ascension'     // عيد الصعود
  | 'pentecost'     // عيد العنصرة (حلول الروح القدس)
  | 'apostles-fast' // صوم الرسل
  | 'apostles-feast'// عيد الرسل
  | 'virgin-fast'   // صوم العذراء
  | 'virgin-feast'  // أعياد العذراء
  | 'cross';        // عيد الصليب

export const OCCASION_LABELS: Record<OccasionTag, string> = {
  'ordinary':       'يوم عادي',
  'kiahk':          'شهر كيهك',
  'nativity':       'عيد الميلاد المجيد',
  'circumcision':   'عيد الختان',
  'epiphany':       'عيد الغطاس',
  'presentation':   'عيد دخول الهيكل',
  'great-lent':     'الصوم الكبير',
  'lazarus-palm':   'أحد الشعانين',
  'holy-week':      'أسبوع الآلام (البصخة)',
  'resurrection':   'عيد القيامة المجيد',
  'pentecostal':    'الخماسين المقدسة',
  'ascension':      'عيد الصعود',
  'pentecost':      'عيد العنصرة',
  'apostles-fast':  'صوم الرسل',
  'apostles-feast': 'عيد الرسل',
  'virgin-fast':    'صوم العذراء',
  'virgin-feast':   'عيد العذراء',
  'cross':          'عيد الصليب',
};

// ترتيب العرض في قائمة الاختيار اليدوي
export const OCCASION_ORDER: OccasionTag[] = [
  'ordinary', 'kiahk', 'nativity', 'circumcision', 'epiphany', 'presentation',
  'great-lent', 'lazarus-palm', 'holy-week', 'resurrection', 'pentecostal',
  'ascension', 'pentecost', 'apostles-fast', 'apostles-feast',
  'virgin-fast', 'virgin-feast', 'cross',
];

// ── حساب الفصح القبطي (أرثوذكسي) — Meeus/Jones/Butcher + تحويل يوليانى→ميلادى
// مطابق للمنطق الموجود في server/routes.ts
export function calculateCopticEaster(year: number): Date {
  const a = year % 4, b = year % 7, c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const julian = new Date(year, month - 1, day);
  julian.setDate(julian.getDate() + 13); // التقويم اليوليانى → الميلادى
  return julian;
}

function daysFromEaster(date: Date): number {
  const easter = calculateCopticEaster(date.getFullYear());
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((d0 - easter.getTime()) / 86400000);
}

// ── كشف المناسبة تلقائياً من التاريخ الميلادي ──────────────────────────────
// الأعياد المتنقلة (المرتبطة بالفصح) لها الأولوية في نوافذها الزمنية،
// ثم الأعياد/المواسم الثابتة بالتاريخ القبطي، وإلا فيوم عادي.
export function detectOccasion(date: Date): OccasionTag {
  // ── المتنقلة (نسبةً إلى الفصح) ──
  const diff = daysFromEaster(date);
  if (diff === 0 || (diff >= 1 && diff <= 6)) return 'resurrection'; // القيامة + أسبوع الفرح
  if (diff === 39) return 'ascension';
  if (diff === 49) return 'pentecost';
  if (diff >= 7 && diff <= 48) return 'pentecostal';                 // الخماسين
  if (diff >= 50) {                                                   // ما بعد العنصرة
    const { day: cd, month: cm } = gregorianToCoptic(date);
    // صوم الرسل: من اليوم التالي للعنصرة حتى ما قبل عيد الرسل (5 أبيب)
    if (!(cm === 11 && cd >= 5)) return 'apostles-fast';
  }
  if (diff === -7 || diff === -8) return 'lazarus-palm';             // الشعانين / سبت لعازر
  if (diff >= -6 && diff <= -1) return 'holy-week';                  // البصخة
  if (diff >= -55 && diff <= -9) return 'great-lent';                // الصوم الكبير

  // ── الثابتة (التاريخ القبطي) ──
  const { day, month } = gregorianToCoptic(date);
  if (month === 4 && day === 29) return 'nativity';      // 29 كيهك
  if (month === 4) return 'kiahk';                        // باقي كيهك
  if (month === 5 && day === 6) return 'circumcision';   // 6 طوبة
  if (month === 5 && day === 11) return 'epiphany';      // 11 طوبة
  if (month === 5 && day === 21) return 'virgin-feast';  // نياحة العذراء 21 طوبة
  if (month === 6 && day === 8) return 'presentation';   // 8 أمشير
  if (month === 1 && day === 17) return 'cross';         // 17 توت
  if (month === 7 && day === 10) return 'cross';         // 10 برمهات
  if (month === 11 && day === 5) return 'apostles-feast';// 5 أبيب
  if (month === 12 && day >= 1 && day <= 15) return 'virgin-fast'; // صوم العذراء
  if (month === 12 && day === 16) return 'virgin-feast'; // صعود جسد العذراء 16 مسرى

  return 'ordinary';
}

// ── نوع الهيتينية الموسمية (حسب موسم السنة الزراعية القبطية) ────────────────
export type SeasonalLitanyType = 'water' | 'crops' | 'weather';

export const SEASONAL_LITANY_LABELS: Record<SeasonalLitanyType, string> = {
  water:   'هيتينية المياه',
  crops:   'هيتينية الزروع',
  weather: 'هيتينية الأهوية',
};

// المواسم (من المصدر الطقسي في kholagy-data.ts):
// مياه النهر: ١٢ بؤونة → ٩ بابة  (١٩ يونيو → ٢٠ أكتوبر)
// الزروع والعشب: ١٠ بابة → ١٠ طوبة  (٢١ أكتوبر → ١٩ يناير)
// أهوية السماء: ١١ طوبة → ١١ بؤونة  (٢٠ يناير → ١٨ يونيو)
// شهور القبطية: ١=توت ٢=بابة ٣=هاتور ٤=كيهك ٥=طوبة ٦=أمشير
//               ٧=برمهات ٨=برموده ٩=بشنس ١٠=بؤونة ١١=أبيب ١٢=مسرى ١٣=نسيء
export function detectSeasonalLitany(date: Date): SeasonalLitanyType {
  const { month, day } = gregorianToCoptic(date);
  if (month === 10 && day >= 12) return 'water';
  if (month === 11 || month === 12 || month === 13 || month === 1) return 'water';
  if (month === 2 && day <= 9) return 'water';
  if (month === 2 && day >= 10) return 'crops';
  if (month >= 3 && month <= 4) return 'crops';
  if (month === 5 && day <= 10) return 'crops';
  return 'weather';
}

// ── تسمية القِسمة حسب المناسبة ────────────────────────────────────────────
export function getQismaLabel(occasion: OccasionTag): string {
  switch (occasion) {
    case 'great-lent':
    case 'lazarus-palm':
    case 'holy-week':
      return 'قسمة الصوم';
    case 'resurrection':
    case 'pentecostal':
      return 'قسمة القيامة';
    case 'ascension':
      return 'قسمة الصعود';
    case 'pentecost':
      return 'قسمة العنصرة';
    case 'nativity':
    case 'circumcision':
    case 'epiphany':
    case 'presentation':
    case 'apostles-feast':
    case 'virgin-feast':
    case 'cross':
    case 'kiahk':
      return 'قسمة الأعياد';
    default:
      return 'القسمة السنوية';
  }
}
