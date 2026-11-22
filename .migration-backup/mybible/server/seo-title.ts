/**
 * Smart Title Optimizer — Phase 6
 * Generates intent-aware, keyword-rich titles for better CTR.
 */

import { detectIntent, type IntentCluster } from './seo-intent';

const SITE_SUFFIX = 'الكتاب المقدس رفيقي';

const INTENT_TITLE_TEMPLATES: Record<IntentCluster, (kw: string) => string> = {
  emotional:   (kw) => `آيات عن ${kw} والتعزية الروحية من الكتاب المقدس`,
  theological: (kw) => `تفسير مفهوم ${kw} في الكتاب المقدس`,
  daily:       (kw) => `آيات يومية عن ${kw} | القراءة اليومية`,
  topical:     (kw) => `آيات الكتاب المقدس عن ${kw} | بحث شامل`,
  historical:  (kw) => `دراسة ${kw} في الكتاب المقدس | شرح وتفسير`,
  general:     (kw) => `آيات الكتاب المقدس عن ${kw}`,
};

const WELL_KNOWN_TITLES: Record<string, string> = {
  سلام:    'آيات عن السلام والطمأنينة من الكتاب المقدس | سلام الله',
  خوف:     'آيات تشجيعية لمواجهة الخوف والقلق من الكتاب المقدس',
  حزن:     'آيات التعزية والأمل عند الحزن من الكتاب المقدس',
  فرح:     'آيات الفرح والابتهاج في الكتاب المقدس | كيف تجد الفرح الحقيقي',
  امل:     'آيات الأمل والرجاء من الكتاب المقدس | لا تيأس',
  محبه:    'آيات المحبة في الكتاب المقدس | الله محبة',
  صلاه:    'آيات الصلاة والدعاء من الكتاب المقدس',
  ايمان:   'آيات الإيمان واليقين من الكتاب المقدس',
  حكمه:    'آيات الحكمة من الكتاب المقدس | حكمة الله',
  صبر:     'آيات الصبر والثبات من الكتاب المقدس',
  شفاء:    'آيات الشفاء والبركة من الكتاب المقدس',
  خلاص:    'آيات الخلاص والفداء من الكتاب المقدس',
  توبه:    'آيات التوبة والغفران من الكتاب المقدس',
  قوه:     'آيات القوة والشجاعة من الكتاب المقدس',
  نعمه:    'آيات النعمة والبركة من الكتاب المقدس',
};

function normalizeAr(s: string): string {
  return s
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/[يى]/g, 'ي')
    .trim();
}

export function generateSearchTitle(query: string): string {
  if (!query || !query.trim()) return `البحث في الكتاب المقدس | ${SITE_SUFFIX}`;

  const norm = normalizeAr(query.trim());

  // Check well-known titles first
  for (const [key, title] of Object.entries(WELL_KNOWN_TITLES)) {
    if (norm.includes(key) || key.includes(norm)) return title;
  }

  const { intent } = detectIntent(query);
  const template = INTENT_TITLE_TEMPLATES[intent];
  const displayQuery = query.trim();

  return `${template(displayQuery)} | ${SITE_SUFFIX}`;
}

const FAMOUS_PSALMS: Record<number, string> = {
  1:   'مزمور 1 — طريق البار',
  23:  'مزمور 23 — الرب راعيَّ فلا يعوزني شيء',
  51:  'مزمور 51 — صلاة التوبة والاعتراف',
  91:  'مزمور 91 — الساكن في ستر العلي',
  103: 'مزمور 103 — باركي يا نفسي الرب',
  121: 'مزمور 121 — رافع عينيَّ إلى الجبال',
  150: 'مزمور 150 — سبّحوا الله في قدسه',
};

// Famous chapters across key books — keyed by `${book} ${chapter}`.
// Titles verified ≤70 chars including the site suffix.
const FAMOUS_CHAPTERS: Record<string, string> = {
  'يوحنا 1':   'يوحنا 1 — في البدء كان الكلمة',
  'يوحنا 3':   'يوحنا 3 — حديث المسيح مع نيقوديموس',
  'يوحنا 10':  'يوحنا 10 — الراعي الصالح',
  'يوحنا 14':  'يوحنا 14 — الطريق والحق والحياة',
  'يوحنا 15':  'يوحنا 15 — الكرمة الحقيقية',
  'يوحنا 17':  'يوحنا 17 — الصلاة الشفاعية',
  'متى 5':     'متى 5 — الموعظة على الجبل والتطويبات',
  'متى 6':     'متى 6 — الصلاة الربانية',
  'متى 13':    'متى 13 — أمثال الملكوت',
  'متى 28':    'متى 28 — القيامة والإرسالية',
  'مرقس 16':   'مرقس 16 — القيامة والصعود',
  'لوقا 2':    'لوقا 2 — ميلاد يسوع في بيت لحم',
  'لوقا 10':   'لوقا 10 — مثل السامري الصالح',
  'لوقا 15':   'لوقا 15 — مثل الابن الضال',
  'التكوين 1': 'التكوين 1 — خلق السموات والأرض',
  'التكوين 3': 'التكوين 3 — السقوط والخطية الأولى',
  'الخروج 14': 'الخروج 14 — عبور البحر الأحمر',
  'الخروج 20': 'الخروج 20 — الوصايا العشر',
  'الأمثال 31':'الأمثال 31 — المرأة الفاضلة',
  'إشعياء 7':  'إشعياء 7 — نبوة عمانوئيل',
  'إشعياء 53': 'إشعياء 53 — العبد المتألم',
  'رومية 8':   'رومية 8 — محبة الله الثابتة',
  'رومية 12':  'رومية 12 — تقديم الأجساد ذبيحة حية',
  'أعمال الرسل 2': 'أعمال 2 — حلول الروح القدس يوم الخمسين',
  'أيوب 1':    'أيوب 1 — تجربة أيوب البار',
};

export function generateBibleChapterTitle(bookName: string, chapter: number, verseCount: number): string {
  if (bookName === 'المزامير' && FAMOUS_PSALMS[chapter]) {
    return `${FAMOUS_PSALMS[chapter]} - ${SITE_SUFFIX}`;
  }
  const famous = FAMOUS_CHAPTERS[`${bookName} ${chapter}`];
  if (famous) {
    return `${famous} - ${SITE_SUFFIX}`;
  }
  const fullTitle = `تفسير ${bookName} الإصحاح ${chapter} | قراءة ${verseCount} آية كاملة - ${SITE_SUFFIX}`;
  if (fullTitle.length <= 70) return fullTitle;
  const shortTitle = `تفسير ${bookName} ${chapter} | الكتاب المقدس رفيقي`;
  return shortTitle.length <= 70 ? shortTitle : `${bookName} ${chapter} | الكتاب المقدس رفيقي`;
}

export function generateBibleBookTitle(bookName: string, chaptersCount: number): string {
  return `تفسير ${bookName} كامل | ${chaptersCount} إصحاحاً - ${SITE_SUFFIX}`;
}

export function generateEmotionTitle(emotion: string): string {
  return `آيات عن ${emotion} | التغذية الروحية - ${SITE_SUFFIX}`;
}

export function generateFAQSchema(query: string, verses: Array<{ bookName: string; chapter: number; verse: number; text: string }>) {
  if (verses.length === 0) return null;

  const displayQuery = query.trim();
  const { intent } = detectIntent(query);

  const qaPairs = [
    {
      q: `ما هي أهم آيات الكتاب المقدس عن ${displayQuery}؟`,
      a: verses.slice(0, 3)
        .map(v => `${v.bookName} ${v.chapter}:${v.verse} — "${v.text.substring(0, 100)}"`)
        .join(' | '),
    },
    {
      q: `أين أجد آيات عن ${displayQuery} في الكتاب المقدس؟`,
      a: `يمكنك إيجاد آيات عن ${displayQuery} في كل من: ${verses.slice(0, 5).map(v => `${v.bookName} ${v.chapter}:${v.verse}`).join('، ')}.`,
    },
  ];

  if (intent === 'emotional') {
    qaPairs.push({
      q: `كيف يساعدني الكتاب المقدس عند ${displayQuery}؟`,
      a: `الكتاب المقدس يقدم كثيراً من آيات التعزية والأمل عند ${displayQuery}. يقول الرب في ${verses[0]?.bookName || 'الكتاب المقدس'}: "${(verses[0]?.text || '').substring(0, 120)}"`,
    });
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qaPairs.map(pair => ({
      '@type': 'Question',
      name: pair.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: pair.a,
      },
    })),
  };
}
