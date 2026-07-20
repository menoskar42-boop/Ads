const fs = require('fs');
const path = require('path');

// Book name mappings from MD format to database format
const BOOK_NAME_MAP = {
  'التكوين': 'التكوين',
  'الخروج': 'الخروج',
  'اللاويين': 'اللاويين',
  'العدد': 'العدد',
  'التثنية': 'التثنية',
  'يشوع': 'يشوع',
  'القضاة': 'القضاة',
  'راعوث': 'راعوث',
  'صموئيل الأول': 'صموئيل الأول',
  'صموئيل الثاني': 'صموئيل الثاني',
  'الملوك الأول': 'الملوك الأول',
  'الملوك الثاني': 'الملوك الثاني',
  'أخبار الأيام الأول': 'أخبار الأيام الأول',
  'أخبار الأيام الثاني': 'أخبار الأيام الثاني',
  'عزرا': 'عزرا',
  'نحميا': 'نحميا',
  'أستير': 'أستير',
  'أيوب': 'أيوب',
  'المزامير': 'المزامير',
  'مزمور': 'المزامير',
  'الأمثال': 'الأمثال',
  'الجامعة': 'الجامعة',
  'نشيد الأنشاد': 'نشيد الأنشاد',
  'إشعياء': 'إشعياء',
  'إرميا': 'إرميا',
  'مراثي إرميا': 'مراثي إرميا',
  'حزقيال': 'حزقيال',
  'دانيال': 'دانيال',
  'هوشع': 'هوشع',
  'يوئيل': 'يوئيل',
  'عاموس': 'عاموس',
  'عوبديا': 'عوبديا',
  'يونان': 'يونان',
  'ميخا': 'ميخا',
  'ناحوم': 'ناحوم',
  'حبقوق': 'حبقوق',
  'صفنيا': 'صفنيا',
  'حجي': 'حجي',
  'زكريا': 'زكريا',
  'ملاخي': 'ملاخي',
  'متى': 'متى',
  'مرقس': 'مرقس',
  'لوقا': 'لوقا',
  'يوحنا': 'يوحنا',
  'أعمال الرسل': 'أعمال الرسل',
  'رومية': 'رومية',
  'كورنثوس الأولى': 'كورنثوس الأولى',
  'كورنثوس الثانية': 'كورنثوس الثانية',
  'غلاطية': 'غلاطية',
  'أفسس': 'أفسس',
  'فيلبي': 'فيلبي',
  'كولوسي': 'كولوسي',
  'تسالونيكي الأولى': 'تسالونيكي الأولى',
  'تسالونيكي الثانية': 'تسالونيكي الثانية',
  'تيموثاوس الأولى': 'تيموثاوس الأولى',
  'تيموثاوس الثانية': 'تيموثاوس الثانية',
  'تيطس': 'تيطس',
  'فليمون': 'فليمون',
  'العبرانيين': 'العبرانيين',
  'يعقوب': 'يعقوب',
  'بطرس الأولى': 'بطرس الأولى',
  'بطرس الثانية': 'بطرس الثانية',
  'يوحنا الأولى': 'يوحنا الأولى',
  'يوحنا الثانية': 'يوحنا الثانية',
  'يوحنا الثالثة': 'يوحنا الثالثة',
  'يهوذا': 'يهوذا',
  'رؤيا يوحنا': 'رؤيا يوحنا',
  'الرؤيا': 'رؤيا يوحنا'
};

function parseMarkdownPlan(content) {
  const days = [];
  let currentDay = null;
  let currentReadings = [];
  
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for day header (## اليوم X or ### اليوم X)
    const dayMatch = trimmed.match(/^#{2,3}\s*اليوم\s*(\d+)/);
    if (dayMatch) {
      // Save previous day
      if (currentDay !== null && currentReadings.length > 0) {
        days.push({ dayNumber: currentDay, readings: currentReadings });
      }
      currentDay = parseInt(dayMatch[1]);
      currentReadings = [];
      continue;
    }
    
    // Check for reading line (- Book Chapter or - Book إصحاح X)
    if (trimmed.startsWith('-')) {
      const readingText = trimmed.substring(1).trim();
      
      // Format 1: "التكوين 1" or "التكوين إصحاح 1"
      // Format 2: "التكوين | الإصحاح 1"
      
      let book = null;
      let chapter = null;
      
      // Try format with pipe
      if (readingText.includes('|')) {
        const parts = readingText.split('|').map(p => p.trim());
        book = parts[0];
        const chapterMatch = parts[1].match(/(\d+)/);
        if (chapterMatch) {
          chapter = parseInt(chapterMatch[1]);
        }
      } else {
        // Format: "Book Chapter" or "Book إصحاح Chapter"
        const chapterMatch = readingText.match(/^(.+?)\s+(?:إصحاح\s+)?(\d+)$/);
        if (chapterMatch) {
          book = chapterMatch[1].trim();
          chapter = parseInt(chapterMatch[2]);
        }
      }
      
      if (book && chapter) {
        const bookDbName = BOOK_NAME_MAP[book] || book;
        currentReadings.push({
          book: book,
          bookDbName: bookDbName,
          chapter: chapter
        });
      }
    }
  }
  
  // Save last day
  if (currentDay !== null && currentReadings.length > 0) {
    days.push({ dayNumber: currentDay, readings: currentReadings });
  }
  
  return days;
}

const planConfigs = [
  {
    file: 'attached_assets/reading_plan_30_days_full_1768848420356.md',
    id: 'plan-30',
    name: 'خطة ٣٠ يوم',
    daysTotal: 30,
    description: 'اقرأ الكتاب المقدس كاملاً في 30 يوم'
  },
  {
    file: 'attached_assets/reading_plan_60_days_full_1768848420356.md',
    id: 'plan-60',
    name: 'خطة ٦٠ يوم',
    daysTotal: 60,
    description: 'اقرأ الكتاب المقدس كاملاً في 60 يوم'
  },
  {
    file: 'attached_assets/reading_plan_90_days_full_1768848420355.md',
    id: 'plan-90',
    name: 'خطة ٩٠ يوم',
    daysTotal: 90,
    description: 'اقرأ الكتاب المقدس كاملاً في 90 يوم'
  },
  {
    file: 'attached_assets/reading_plan_365_varied_1768848420356.md',
    id: 'plan-365',
    name: 'خطة السنة',
    daysTotal: 365,
    description: 'اقرأ الكتاب المقدس كاملاً في سنة'
  },
  {
    file: 'attached_assets/reading_plan_2_years_1768848420356.md',
    id: 'plan-730',
    name: 'خطة سنتين',
    daysTotal: 730,
    description: 'اقرأ الكتاب المقدس كاملاً في سنتين - إصحاحين يومياً'
  }
];

const plans = [];

for (const config of planConfigs) {
  console.log(`Processing ${config.file}...`);
  try {
    const content = fs.readFileSync(config.file, 'utf-8');
    const days = parseMarkdownPlan(content);
    console.log(`  Found ${days.length} days`);
    
    plans.push({
      id: config.id,
      name: config.name,
      daysTotal: config.daysTotal,
      description: config.description,
      days: days
    });
  } catch (err) {
    console.error(`  Error: ${err.message}`);
  }
}

// Generate the TypeScript file
const output = `export interface DayReading {
  book: string;
  bookDbName: string;
  chapter: number;
}

export interface PlanDay {
  dayNumber: number;
  readings: DayReading[];
}

export interface StaticReadingPlan {
  id: string;
  name: string;
  daysTotal: number;
  description: string;
  days: PlanDay[];
}

export const staticReadingPlans: StaticReadingPlan[] = ${JSON.stringify(plans)};

export function getPlanById(planId: string): StaticReadingPlan | undefined {
  return staticReadingPlans.find(p => p.id === planId);
}

export function getDayReadings(planId: string, dayNumber: number): DayReading[] | undefined {
  const plan = getPlanById(planId);
  if (!plan) return undefined;
  const day = plan.days.find(d => d.dayNumber === dayNumber);
  return day?.readings;
}
`;

fs.writeFileSync('client/src/lib/reading-plans-data.ts', output);
console.log('\\nGenerated client/src/lib/reading-plans-data.ts');
console.log(`Total plans: ${plans.length}`);
plans.forEach(p => console.log(`  - ${p.name}: ${p.days.length} days`));
