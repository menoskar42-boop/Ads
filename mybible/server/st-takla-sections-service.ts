const ST_TAKLA_ORIGIN = 'https://st-takla.org';
const ST_TAKLA_USER_AGENT = 'MyBible-StTakla-Sections/1.0 (+https://st-takla.org/)';
const CACHE_TTL_MS = 15 * 60 * 1000;
const ARTICLE_MAX_LENGTH = 24000;
const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

export type StTaklaSectionKey = 'ritual' | 'bible' | 'calendar';

export interface StTaklaBrowseLink {
  id: string;
  label: string;
  url: string;
}

export interface StTaklaSectionCatalog {
  key: StTaklaSectionKey;
  title: string;
  description: string;
  sourceUrl: string;
  browse: StTaklaBrowseLink[];
  status: 'ok' | 'unavailable';
  error?: string;
}

export interface StTaklaSectionItem {
  id: string;
  title: string;
  url: string;
}

export interface StTaklaPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface StTaklaSectionArticle {
  section: StTaklaSectionKey;
  title: string;
  content: string;
  source: 'St-Takla.org';
  sourceUrl: string;
}

const SECTION_DEFINITIONS: Record<StTaklaSectionKey, {
  title: string;
  description: string;
  indexUrl: string;
  pathPrefix: string;
}> = {
  ritual: {
    title: 'قاموس المصطلحات الكنسية',
    description: 'معاني الكلمات الطقسية والمصطلحات المتداولة في الكنيسة القبطية الأرثوذكسية.',
    indexUrl: `${ST_TAKLA_ORIGIN}/Coptic-Faith-Creed-Dogma/Coptic-Rite-n-Ritual-Taks-Al-Kanisa/Dictionary-of-Coptic-Ritual-Terms/Coptic-Church-Rituals-Lexicon__00-index.html`,
    pathPrefix: '/Coptic-Faith-Creed-Dogma/Coptic-Rite-n-Ritual-Taks-Al-Kanisa/Dictionary-of-Coptic-Ritual-Terms/',
  },
  bible: {
    title: 'قاموس الكتاب المقدس',
    description: 'دائرة معارف لأسماء وشخصيات وأماكن ومصطلحات الكتاب المقدس.',
    indexUrl: `${ST_TAKLA_ORIGIN}/Full-Free-Coptic-Books/FreeCopticBooks-002-Holy-Arabic-Bible-Dictionary/Kamous-Al-Engeel-index.html`,
    pathPrefix: '/Full-Free-Coptic-Books/FreeCopticBooks-002-Holy-Arabic-Bible-Dictionary/',
  },
  calendar: {
    title: 'النتيجة القبطية الشهرية',
    description: 'الأعياد والأصوام والمناسبات والأحداث اليومية في التقويم القبطي.',
    indexUrl: `${ST_TAKLA_ORIGIN}/Feastes-&-Special-Events/00-St-Takla.org_Orthodox-Monthly-Coptic-Calendar/00-Al-Natiga-Al-Keptia-Current-Year-index.html`,
    pathPrefix: '/Feastes-&-Special-Events/00-St-Takla.org_Orthodox-Monthly-Coptic-Calendar/',
  },
};

const htmlCache = new Map<string, { expiresAt: number; html: string }>();
const catalogCache = new Map<StTaklaSectionKey, { expiresAt: number; value: StTaklaSectionCatalog }>();

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
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeText(value: string): string {
  return htmlToText(value).replace(/\s+/g, ' ').trim();
}

function absoluteStTaklaUrl(
  href: string,
  definition: typeof SECTION_DEFINITIONS[StTaklaSectionKey],
  baseUrl = definition.indexUrl,
): string {
  const url = new URL(decodeHtmlEntities(href), baseUrl);
  if (url.hostname !== 'st-takla.org' && url.hostname !== 'www.st-takla.org') {
    throw new Error('رابط St-Takla غير مسموح به');
  }
  if (!url.pathname.startsWith(definition.pathPrefix)) {
    throw new Error('رابط القسم خارج مسار St-Takla المسموح');
  }
  return url.toString();
}

function sectionDefinition(key: string): typeof SECTION_DEFINITIONS[StTaklaSectionKey] {
  if (!(key in SECTION_DEFINITIONS)) throw new Error('قسم St-Takla غير معروف');
  return SECTION_DEFINITIONS[key as StTaklaSectionKey];
}

export function isStTaklaSectionKey(value: string): value is StTaklaSectionKey {
  return value in SECTION_DEFINITIONS;
}

async function fetchHtml(url: string): Promise<string> {
  const cached = htmlCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.html;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': ST_TAKLA_USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ar,en;q=0.8',
      },
    });
    if (!response.ok) throw new Error(`St-Takla رجّع ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const charset = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1]?.toLowerCase();
    let html: string;
    try {
      html = new TextDecoder(charset === 'windows-1256' || charset === 'cp1256' ? 'windows-1256' : 'utf-8').decode(bytes);
    } catch {
      html = new TextDecoder('utf-8').decode(bytes);
    }
    htmlCache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, html });
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

function extractAnchors(html: string): Array<{ href: string; text: string }> {
  const anchors: Array<{ href: string; text: string }> = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const text = normalizeText(match[2]);
    if (text) anchors.push({ href, text });
  }
  return anchors;
}

function uniqueLinks(links: StTaklaBrowseLink[]): StTaklaBrowseLink[] {
  return [...new Map(links.map(link => [link.url, link])).values()];
}

function withoutHash(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString();
}

function parseBrowseLinks(key: StTaklaSectionKey, html: string, definition: typeof SECTION_DEFINITIONS[StTaklaSectionKey]): StTaklaBrowseLink[] {
  const links: StTaklaBrowseLink[] = [];
  for (const anchor of extractAnchors(html)) {
    const rawHref = anchor.href.trim();
    if (!rawHref || rawHref.startsWith('#') || /^javascript:/i.test(rawHref)) continue;
    let url: string;
    try {
      url = absoluteStTaklaUrl(rawHref, definition);
    } catch {
      continue;
    }
    const path = new URL(url).pathname;
    if (key === 'ritual' && /Coptic-Church-Rituals-Lexicon__\d+-.+\.html$/i.test(path) && !path.includes('__00-index')) {
      links.push({ id: `letter-${links.length + 1}`, label: anchor.text.trim(), url });
    } else if (key === 'bible' && /\d{2}_[A-Z]+\/[^/]+_WORD\.html$/i.test(path)) {
      links.push({ id: `letter-${links.length + 1}`, label: anchor.text.trim(), url });
    } else if (key === 'calendar' && /\/\d{2}-.+\.html$/i.test(path) && !path.includes('00-Al-Natiga')) {
      const fileName = path.split('/').pop() ?? '';
      const month = fileName.match(/^(\d{2})-/)?.[1] ?? String(links.length + 1);
      links.push({ id: `month-${Number(month)}`, label: anchor.text.replace(/\s+/g, ' ').trim(), url });
    }
  }
  return uniqueLinks(links).map((link, index) => ({ ...link, id: key === 'calendar' ? link.id : `letter-${index + 1}` }));
}

function parseSectionItems(
  key: StTaklaSectionKey,
  html: string,
  definition: typeof SECTION_DEFINITIONS[StTaklaSectionKey],
  currentUrl: string,
): StTaklaSectionItem[] {
  if (key === 'calendar') return [];
  const items: StTaklaSectionItem[] = [];
  const currentPage = withoutHash(currentUrl);
  for (const anchor of extractAnchors(html)) {
    let url: string;
    try {
      url = absoluteStTaklaUrl(anchor.href, definition, currentUrl);
    } catch {
      continue;
    }
    const path = new URL(url).pathname;
    const isItem = key === 'ritual'
      ? path.endsWith('.html') && !path.includes('Lexicon__') && !path.includes('Orthodox-Rites')
      : /\d{2}_[A-Z]+\/[^/]+\.html$/i.test(path);
    if (!isItem || withoutHash(url) === currentPage || withoutHash(url) === withoutHash(definition.indexUrl) || !anchor.text || anchor.text.length > 120) continue;
    items.push({ id: url, title: anchor.text, url });
  }
  return [...new Map(items.map(item => [item.url, item])).values()];
}

function parseArticleTitle(html: string, fallback: string): string {
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1];
  const headingText = normalizeText(heading || '');
  if (headingText) return headingText;
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const normalized = normalizeText(title || '').replace(/\s*[|｜-]\s*St-Takla\.org.*$/i, '').trim();
  if (normalized && !/^St-Takla\.org$/i.test(normalized)) return normalized;
  return fallback;
}

function parseArticleContent(html: string): string {
  const bodyTextStart = html.search(/<div\b[^>]*\bid\s*=\s*["']bodytext["']/i);
  const contentHtml = bodyTextStart >= 0 ? html.slice(bodyTextStart) : html;
  const paragraphs = [...contentHtml.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)]
    .map(match => normalizeText(match[2]))
    .filter(text => text.length >= 12)
    .filter(text => !/^St-Takla\.org/.test(text))
    .filter(text => !/^(صورة في موقع الأنبا تكلا|St-Takla\.org Image)/.test(text))
    .filter(text => !/^(اذهب|اضغط هنا|شارك|تابعنا|فهرس)/.test(text));
  const content = [...new Set(paragraphs)].join('\n\n').trim();
  return content.slice(0, ARTICLE_MAX_LENGTH);
}

export async function getStTaklaSectionCatalog(key: StTaklaSectionKey): Promise<StTaklaSectionCatalog> {
  const cached = catalogCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const definition = sectionDefinition(key);
  const html = await fetchHtml(definition.indexUrl);
  const value: StTaklaSectionCatalog = {
    key,
    title: definition.title,
    description: definition.description,
    sourceUrl: definition.indexUrl,
    browse: parseBrowseLinks(key, html, definition),
    status: 'ok',
  };
  if (!value.browse.length) throw new Error(`St-Takla لم يُرجع فهرسًا لقسم ${key}`);
  catalogCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export async function getStTaklaSectionCatalogs(): Promise<StTaklaSectionCatalog[]> {
  const keys = Object.keys(SECTION_DEFINITIONS) as StTaklaSectionKey[];
  return Promise.all(keys.map(async key => {
    try {
      return await getStTaklaSectionCatalog(key);
    } catch (error: any) {
      const definition = SECTION_DEFINITIONS[key];
      return {
        key,
        title: definition.title,
        description: definition.description,
        sourceUrl: definition.indexUrl,
        browse: [],
        status: 'unavailable' as const,
        error: error?.message || 'تعذر تحميل فهرس St-Takla',
      };
    }
  }));
}

export async function getStTaklaSectionBrowse(
  key: StTaklaSectionKey,
  browseId: string,
  query = '',
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<{
  section: StTaklaSectionKey;
  source: 'St-Takla.org';
  sourceUrl: string;
  items: StTaklaSectionItem[];
  pagination?: StTaklaPagination;
  article?: StTaklaSectionArticle;
}> {
  const catalog = await getStTaklaSectionCatalog(key);
  const browse = catalog.browse.find(item => item.id === browseId);
  if (!browse) throw new Error('عنصر التصفح غير موجود في فهرس St-Takla');
  const html = await fetchHtml(browse.url);
  if (key === 'calendar') {
    return {
      section: key,
      source: 'St-Takla.org',
      sourceUrl: browse.url,
      items: [],
      article: {
        section: key,
        title: parseArticleTitle(html, browse.label),
        content: parseArticleContent(html),
        source: 'St-Takla.org',
        sourceUrl: browse.url,
      },
    };
  }
  const normalizedQuery = query.trim().slice(0, 80).toLocaleLowerCase('ar');
  const items = parseSectionItems(key, html, sectionDefinition(key), browse.url).filter(item =>
    !normalizedQuery || item.title.toLocaleLowerCase('ar').includes(normalizedQuery),
  );
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(pageSize) || DEFAULT_PAGE_SIZE)));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.min(totalPages, Math.max(1, Math.floor(Number(page) || 1)));
  const start = (safePage - 1) * safePageSize;
  return {
    section: key,
    source: 'St-Takla.org',
    sourceUrl: browse.url,
    items: items.slice(start, start + safePageSize),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      totalItems,
      totalPages,
    },
  };
}

export async function getStTaklaSectionArticle(
  key: StTaklaSectionKey,
  sourceUrl: string,
): Promise<StTaklaSectionArticle> {
  const definition = sectionDefinition(key);
  const url = absoluteStTaklaUrl(sourceUrl, definition);
  const html = await fetchHtml(url);
  const content = parseArticleContent(html);
  if (!content) throw new Error('لم يُعثر على محتوى قابل للعرض في صفحة St-Takla');
  return {
    section: key,
    title: parseArticleTitle(html, 'مقال من St-Takla'),
    content,
    source: 'St-Takla.org',
    sourceUrl: url,
  };
}

export function clearStTaklaSectionsCache(): void {
  htmlCache.clear();
  catalogCache.clear();
}