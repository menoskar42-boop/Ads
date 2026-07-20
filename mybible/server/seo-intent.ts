/**
 * SEO Intent Engine — Phase 1
 * Maps Arabic queries to intent clusters using pure keyword rules.
 * Zero AI calls, zero external deps.
 */

export type IntentCluster =
  | 'emotional'
  | 'theological'
  | 'daily'
  | 'topical'
  | 'historical'
  | 'general';

export interface IntentResult {
  intent: IntentCluster;
  keywords: string[];
  topics: string[];
  relatedPaths: string[];
}

function normalizeAr(s: string): string {
  return s
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/[يى]/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

const EMOTIONAL_KEYWORDS: Record<string, string[]> = {
  سلام:    ['سلام', 'طمانينه', 'هدوء', 'سكينه', 'راحه'],
  خوف:     ['خوف', 'قلق', 'رهبه', 'فزع', 'ارتياب'],
  حزن:     ['حزن', 'بكاء', 'كابه', 'حسره', 'اسي'],
  فرح:     ['فرح', 'سرور', 'بهجه', 'سعاده', 'ابتهاج'],
  امل:     ['امل', 'رجاء', 'انتظار', 'توقع', 'ثقه'],
  وحده:    ['وحده', 'عزله', 'غربه', 'وحيد', 'مهجور'],
  حب:      ['محبه', 'حب', 'عشق', 'وداد', 'موده'],
  ضيق:     ['ضيق', 'كرب', 'ضغط', 'تعب', 'ضيقه'],
  شفاء:    ['شفاء', 'شفي', 'علاج', 'مرض', 'عافيه'],
  غضب:     ['غضب', 'سخط', 'حنق', 'غيظ', 'ثوره'],
};

const THEOLOGICAL_KEYWORDS: string[] = [
  'تفسير', 'شرح', 'معني', 'ماذا يقصد', 'ماذا تعني', 'فهم',
  'عقيده', 'لاهوت', 'خلاص', 'نجاه', 'توبه', 'مغفره',
  'قيامه', 'صلب', 'فداء', 'تجسد', 'روح قدس',
];

const DAILY_KEYWORDS: string[] = [
  'صباح', 'مساء', 'يومي', 'يوم', 'صباحي', 'مسائي',
  'صلاه', 'دعاء', 'تامل', 'قراءه اليوم', 'اليوم',
  'مدح', 'تسبيح', 'تشكر', 'شكر',
];

const TOPICAL_KEYWORDS: Record<string, string[]> = {
  زواج:    ['زواج', 'خطبه', 'عرس', 'زوج', 'زوجه'],
  اسره:    ['اسره', 'عايله', 'اطفال', 'ابناء', 'والدين'],
  عمل:     ['عمل', 'مهنه', 'وظيفه', 'نجاح', 'مال', 'رزق'],
  صبر:     ['صبر', 'تحمل', 'ثبات', 'مثابره', 'احتمال'],
  حكمه:    ['حكمه', 'فطنه', 'ذكاء', 'بصيره', 'فهم', 'معرفه'],
  ايمان:   ['ايمان', 'يقين', 'ثقه', 'توكل', 'ايمن'],
  عدل:     ['عداله', 'انصاف', 'حق', 'ظلم', 'قسط'],
  موت:     ['موت', 'وفاه', 'رحيل', 'فراق', 'حداد', 'فقدان'],
  حياه:    ['حياه', 'ابديه', 'خلود', 'عيش', 'وجود'],
  صلاه:    ['صلاه', 'دعاء', 'تضرع', 'ابتهال'],
};

const HISTORICAL_KEYWORDS: string[] = [
  'داود', 'سليمان', 'ابراهيم', 'موسي', 'يسوع', 'بولس', 'بطرس',
  'يعقوب', 'يوحنا', 'ايوب', 'يوسف', 'يشوع', 'تكوين', 'خروج',
  'مزمور', 'امثال', 'انجيل', 'رساله',
];

const RELATED_PATHS: Record<string, string[]> = {
  سلام:   ['/emotions', '/search?q=السلام', '/search?q=الراحة'],
  خوف:    ['/emotions', '/search?q=الخوف', '/search?q=القلق'],
  حزن:    ['/emotions', '/search?q=الحزن', '/search?q=التعزية'],
  فرح:    ['/emotions', '/search?q=الفرح', '/search?q=الابتهاج'],
  امل:    ['/emotions', '/search?q=الأمل', '/search?q=الرجاء'],
  وحده:   ['/emotions', '/search?q=الوحدة'],
  حب:     ['/search?q=المحبة', '/search?q=الحب'],
  شفاء:   ['/search?q=الشفاء', '/emotions'],
  صلاه:   ['/plans', '/search?q=الصلاة'],
  ايمان:  ['/plans', '/search?q=الإيمان'],
  زواج:   ['/search?q=الزواج'],
  صبر:    ['/search?q=الصبر', '/emotions'],
  حكمه:   ['/search?q=الحكمة', '/plans'],
  موت:    ['/emotions', '/search?q=الحياة الأبدية'],
};

export function detectIntent(query: string): IntentResult {
  const norm = normalizeAr(query);
  const tokens = norm.split(/\s+/);

  const matchedEmotional: string[] = [];
  const matchedTopical: string[] = [];
  const allKeywords: string[] = [];
  const relatedPaths = new Set<string>();

  for (const [topic, kws] of Object.entries(EMOTIONAL_KEYWORDS)) {
    if (kws.some(kw => tokens.some(t => t.includes(kw) || kw.includes(t)))) {
      matchedEmotional.push(topic);
      allKeywords.push(...kws.slice(0, 3));
      (RELATED_PATHS[topic] || []).forEach(p => relatedPaths.add(p));
    }
  }

  for (const [topic, kws] of Object.entries(TOPICAL_KEYWORDS)) {
    if (kws.some(kw => tokens.some(t => t.includes(kw) || kw.includes(t)))) {
      matchedTopical.push(topic);
      allKeywords.push(...kws.slice(0, 2));
      (RELATED_PATHS[topic] || []).forEach(p => relatedPaths.add(p));
    }
  }

  const isTheological = THEOLOGICAL_KEYWORDS.some(kw =>
    tokens.some(t => t.includes(kw) || kw.includes(t))
  );
  const isDaily = DAILY_KEYWORDS.some(kw =>
    tokens.some(t => t.includes(kw) || kw.includes(t))
  );
  const isHistorical = HISTORICAL_KEYWORDS.some(kw =>
    tokens.some(t => t.includes(kw) || kw.includes(t))
  );

  let intent: IntentCluster = 'general';
  if (matchedEmotional.length > 0) intent = 'emotional';
  else if (isTheological) intent = 'theological';
  else if (isDaily) intent = 'daily';
  else if (matchedTopical.length > 0) intent = 'topical';
  else if (isHistorical) intent = 'historical';

  if (relatedPaths.size === 0) {
    relatedPaths.add('/search');
    relatedPaths.add('/plans');
    relatedPaths.add('/emotions');
  }

  return {
    intent,
    keywords: [...new Set(allKeywords)].slice(0, 8),
    topics: [...matchedEmotional, ...matchedTopical].slice(0, 5),
    relatedPaths: Array.from(relatedPaths).slice(0, 5),
  };
}
