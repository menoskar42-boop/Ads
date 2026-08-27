const STTAKLA_KATAMEROS_URL = 'https://st-takla.org/zJ/index.php/ar-readings-katamares';
const STTAKLA_KATAMEROS_INDEX =
  'https://st-takla.org/zJ/index.php/ar-readings-katamares?view=reading-arabic&sm=3-8&c=&iday=&imonth=&iyear=&dbl=ar';
const STTAKLA_UA = 'MyBible-Katameros/1.0 (+https://st-takla.org/)';
const CACHE_TTL_MS = 5 * 60 * 1000;

type ReadingSection =
  | 'vespers'
  | 'prophecy'
  | 'matins'
  | 'pauline'
  | 'catholic'
  | 'praxis'
  | 'gospel'
  | 'synaxarium';

export interface KatamerosVerse {
  chapter: number;
  verse: number;
  text: string;
}

export interface KatamerosReading {
  id: string;
  section: ReadingSection;
  label: string;
  reference: string;
  sourceUrl: string;
  verses: KatamerosVerse[];
  status: 'ok' | 'unavailable';
  error?: string;
}

export interface KatamerosDay {
  date: string;
  sourcePageUrl: string;
  sourceIndexUrl: string;
  title: string;
  readings: KatamerosReading[];
}

const dayCache = new Map<string, { expiresAt: number; value: KatamerosDay }>();
const pageCache = new Map<string, { expiresAt: number; html: string }>();

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeDigits(value: string): number {
  return Number(value.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))));
}

function parseDate(value: string): { key: string; year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('التاريخ لازم يكون بصيغة YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('التاريخ غير صالح');
  }
  return { key: value, year, month, day };
}

async function fetchHtml(url: string): Promise<string> {
  const cached = pageCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.html;
  const response = await fetch(url, {
    headers: {
      'user-agent': STTAKLA_UA,
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) throw new Error(`St-Takla رجّع ${response.status}`);
  const html = await response.text();
  pageCache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, html });
  return html;
}

function absoluteUrl(href: string): string {
  const url = new URL(decodeHtmlEntities(href), STTAKLA_KATAMEROS_URL);
  if (url.hostname !== 'st-takla.org' && url.hostname !== 'www.st-takla.org') {
    throw new Error('رابط القراءة خارج نطاق St-Takla');
  }
  return url.toString();
}

const SECTION_LABELS: Array<{ section: ReadingSection; aliases: string[] }> = [
  { section: 'vespers', aliases: ['العشية'] },
  { section: 'prophecy', aliases: ['النبوة'] },
  { section: 'matins', aliases: ['باكر'] },
  { section: 'pauline', aliases: ['البولس'] },
  { section: 'catholic', aliases: ['الكاثوليكون'] },
  { section: 'praxis', aliases: ['الإبركسيس', 'الابركسيس'] },
  { section: 'gospel', aliases: ['الإنجيل', 'الانجيل'] },
  { section: 'synaxarium', aliases: ['السنكسار'] },
];

function sectionForHeading(text: string): ReadingSection | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return SECTION_LABELS.find(({ aliases }) => aliases.some((alias) => normalized === alias))?.section ?? null;
}

function parseDayLinks(html: string): { title: string; sourceUrl: string; readings: Omit<KatamerosReading, 'verses' | 'status' | 'error'>[] } {
  const sourceUrl = STTAKLA_KATAMEROS_URL;
  const headingMatch = html.match(/<p\b[^>]*>\s*([\s\S]*?)\s*<\/p>/gi)?.find((tag) => {
    const text = htmlToText(tag);
    return text.includes('من الأسبوع') || text.includes('قراءات');
  });
  const title = headingMatch ? htmlToText(headingMatch) : 'قراءات اليوم من St-Takla';
  const readings: Omit<KatamerosReading, 'verses' | 'status' | 'error'>[] = [];
  let currentSection: ReadingSection | null = null;
  const tokenPattern = /<(p|a)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

  for (const match of html.matchAll(tokenPattern)) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const inner = match[3];
    if (tag === 'p') {
      const heading = sectionForHeading(htmlToText(inner));
      if (heading) currentSection = heading;
      continue;
    }
    if (!currentSection) continue;
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch || !hrefMatch[1].includes('view=today_bible')) continue;
    const reference = htmlToText(inner).replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!reference) continue;
    readings.push({
      id: `${currentSection}-${readings.length + 1}`,
      section: currentSection,
      label: SECTION_LABELS.find((entry) => entry.section === currentSection)?.aliases[0] ?? currentSection,
      reference,
      sourceUrl: absoluteUrl(hrefMatch[1]),
    });
  }
  return { title, sourceUrl, readings };
}

function parseReadingVerses(html: string): KatamerosVerse[] {
  const verses: KatamerosVerse[] = [];
  const versePattern = /<sup\b[^>]*>\s*([0-9٠-٩]+)\s*<\/sup>/gi;

  for (const match of html.matchAll(versePattern)) {
    const position = match.index ?? 0;
    const afterSup = html.slice(position + match[0].length);
    const cellMatch = afterSup.match(/^\s*<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/i);
    if (!cellMatch) continue;
    const text = htmlToText(cellMatch[1]);
    if (!text) continue;

    const beforeText = htmlToText(html.slice(0, position));
    const chapterMatches = [...beforeText.matchAll(/الفصل\s+([0-9٠-٩]+)/g)];
    const chapter = chapterMatches.length
      ? normalizeDigits(chapterMatches[chapterMatches.length - 1][1])
      : 1;
    const verse = normalizeDigits(match[1]);
    if (chapter > 0 && verse > 0) verses.push({ chapter, verse, text });
  }
  return verses;
}

async function fetchReading(reading: Omit<KatamerosReading, 'verses' | 'status' | 'error'>): Promise<KatamerosReading> {
  try {
    const html = await fetchHtml(reading.sourceUrl);
    const verses = parseReadingVerses(html);
    if (!verses.length) {
      return { ...reading, verses: [], status: 'unavailable', error: 'لم يُعثر على آيات في صفحة St-Takla' };
    }
    return { ...reading, verses, status: 'ok' };
  } catch (error: any) {
    return {
      ...reading,
      verses: [],
      status: 'unavailable',
      error: error?.message || 'تعذر تحميل القراءة من St-Takla',
    };
  }
}

export async function getStTaklaKatamerosDay(dateValue: string): Promise<KatamerosDay> {
  const date = parseDate(dateValue);
  const cached = dayCache.get(date.key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const query = new URLSearchParams({
    view: 'today-arabic',
    dbl: 'ar',
    iday: String(date.day).padStart(2, '0'),
    imonth: String(date.month).padStart(2, '0'),
    iyear: String(date.year),
  });
  const sourcePageUrl = `${STTAKLA_KATAMEROS_URL}?${query.toString()}`;
  const dayHtml = await fetchHtml(sourcePageUrl);
  const parsed = parseDayLinks(dayHtml);
  const readings = await Promise.all(parsed.readings.map(fetchReading));
  const value: KatamerosDay = {
    date: date.key,
    sourcePageUrl,
    sourceIndexUrl: STTAKLA_KATAMEROS_INDEX,
    title: parsed.title,
    readings,
  };
  dayCache.set(date.key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}