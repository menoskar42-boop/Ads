/**
 * Synaxarium Service — proxies the Arabic daily pages from copticchurch.net.
 *
 * The index page is useful for discovering today's links, while the
 * month/day page contains the actual Arabic accounts. Both responses are
 * cached briefly on the server and every returned entry keeps its source URL.
 */

const SYNAXARIUM_INDEX_URL = 'https://www.copticchurch.net/synaxarium';
const SYNAXARIUM_BASE_URL = 'https://www.copticchurch.net/synaxarium';
const CACHE_TTL = 6 * 60 * 60 * 1000;

export interface SynaxariumEntry {
  id: string;
  title: string;
  description: string;
  url: string;
  anchor: string;
}

export interface TodaySynaxarium {
  copticDate: string;
  entries: SynaxariumEntry[];
  fetchedAt: number;
  source: 'copticchurch.net';
  sourceUrl: string;
  month?: number;
  day?: number;
}

const indexCache: { expiresAt: number; value: TodaySynaxarium } = {
  expiresAt: 0,
  value: {
    copticDate: '',
    entries: [],
    fetchedAt: 0,
    source: 'copticchurch.net',
    sourceUrl: SYNAXARIUM_INDEX_URL,
  },
};
const dayCache = new Map<string, { expiresAt: number; value: TodaySynaxarium }>();

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
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function pageUrl(month: number, day: number): string {
  return `${SYNAXARIUM_BASE_URL}/${month}_${day}.html?lang=ar`;
}

function parseCopticDate(text: string): string {
  const cleaned = text
    .replace(/^\s*السنكسار\s*/i, '')
    .replace(/^\s*اليوم\s*/i, '')
    .replace(/\\-/g, '-')
    .trim();
  return cleaned || text.trim();
}

function parseEntryHeading(text: string): { id: string; title: string } | null {
  const match = text.trim().match(/^(\d+)\s*[.)\-]\s*(.+)$/);
  if (!match) return null;
  return { id: match[1], title: match[2].trim() };
}

export function parseSynaxariumDay(
  html: string,
  sourceUrl: string,
  month: number,
  day: number,
): TodaySynaxarium {
  const headingMatches = [...html.matchAll(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1\s*>/gi)]
    .map((match) => {
      const parsed = parseEntryHeading(htmlToText(match[3]));
      return parsed
        ? { ...parsed, start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }
        : null;
    })
    .filter((heading): heading is { id: string; title: string; start: number; end: number } => heading !== null);

  const entries = headingMatches.map((heading, index) => {
    const nextStart = headingMatches[index + 1]?.start ?? html.length;
    const footerStart = html.search(/<footer\b/i);
    const contentEnd = footerStart >= heading.end
      ? Math.min(nextStart, footerStart)
      : nextStart;
    const description = htmlToText(html.slice(heading.end, contentEnd));
    const anchor = heading.id;
    return {
      id: `${month}-${day}-${anchor}`,
      title: heading.title,
      description,
      url: `${sourceUrl}#${anchor}`,
      anchor,
    };
  }).filter((entry) => entry.description.length > 0);

  const titleMatch = html.match(/<h[1-6]\b[^>]*>([\s\S]*?السنكسار[\s\S]*?)<\/h[1-6]\s*>/i);
  const title = titleMatch ? htmlToText(titleMatch[1]) : `السنكسار ${month}_${day}`;

  if (!entries.length) {
    throw new Error('لم يُعثر على مدخلات سنكسار في صفحة المصدر');
  }

  return {
    copticDate: parseCopticDate(title),
    entries,
    fetchedAt: Date.now(),
    source: 'copticchurch.net',
    sourceUrl,
    month,
    day,
  };
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyBible/1.0)',
        'Accept-Language': 'ar,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSynaxariumDay(month: number, day: number): Promise<TodaySynaxarium> {
  if (!Number.isInteger(month) || month < 1 || month > 13) {
    throw new Error('شهر قبطي غير صالح');
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('يوم قبطي غير صالح');
  }

  const key = `${month}-${day}`;
  const cached = dayCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const sourceUrl = pageUrl(month, day);
  const value = parseSynaxariumDay(await fetchHtml(sourceUrl), sourceUrl, month, day);
  dayCache.set(key, { expiresAt: Date.now() + CACHE_TTL, value });
  return value;
}

export function parseTodaySynaxariumTarget(html: string): { month: number; day: number } {
  // الفهرس يستخدم روابط نسبية، وقد يضيف anchor للقصة الأولى؛ لا نعتمد على
  // نص العنوان أو على كون الرابط مطلقاً حتى لا يعود اليوم بلا قصص.
  const match = html.match(
    /href=["'](?:https?:\/\/www\.copticchurch\.net)?\/synaxarium\/(\d+)_(\d+)\.html\?lang=ar(?:#[^"']*)?["']/i,
  );
  if (!match) throw new Error('لم يُعثر على رابط سنكسار اليوم في صفحة المصدر');
  return { month: Number(match[1]), day: Number(match[2]) };
}

export async function fetchTodaySynaxarium(): Promise<TodaySynaxarium> {
  if (indexCache.expiresAt > Date.now()) return indexCache.value;

  const html = await fetchHtml(SYNAXARIUM_INDEX_URL);
  const { month, day } = parseTodaySynaxariumTarget(html);
  const value = await fetchSynaxariumDay(month, day);
  indexCache.value = value;
  indexCache.expiresAt = Date.now() + CACHE_TTL;
  return value;
}

export function clearSynaxariumCache(): void {
  dayCache.clear();
  indexCache.expiresAt = 0;
}
