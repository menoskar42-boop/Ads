const ST_TAKLA_ORIGIN = 'https://st-takla.org';
const ST_TAKLA_USER_AGENT = 'MyBible-StTakla-Sections/1.0 (+https://mybible.oscardevs.com)';
const CACHE_TTL_MS = 15 * 60 * 1000;
const LINK_HEALTH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_HEALTH_REQUESTS_PER_RUN = 15;
const MAX_BROWSE_LINK_CHECKS_PER_RUN = 12;
const ARTICLE_MAX_LENGTH = 24000;
const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

export type StTaklaSectionKey = 'ritual' | 'bible' | 'calendar';
export type StTaklaLinkHealth = 'unchecked' | 'ok' | 'unavailable';

export interface StTaklaBrowseLink {
  id: string;
  label: string;
  url: string;
  health?: StTaklaLinkHealth;
  checkedAt?: number;
  error?: string;
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

export interface StTaklaLinkHealthSummary {
  status: 'pending' | 'ok' | 'degraded';
  lastCheckedAt: number | null;
  nextCheckAt: number | null;
  checkedLinks: number;
  unavailableLinks: number;
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
const linkHealth = new Map<string, { status: 'ok' | 'unavailable'; checkedAt: number; error?: string }>();
let healthSummary: StTaklaLinkHealthSummary = {
  status: 'pending',
  lastCheckedAt: null,
  nextCheckAt: null,
  checkedLinks: 0,
  unavailableLinks: 0,
};
let healthCursor = 0;
let healthCheckInFlight: Promise<StTaklaLinkHealthSummary> | null = null;
let healthStartupTimer: ReturnType<typeof setTimeout> | null = null;
let healthIntervalTimer: ReturnType<typeof setInterval> | null = null;

const BROWSE_CONTRACTS: Record<StTaklaSectionKey, {
  expectedCount: number;
  unit: 'حرف' | 'شهر';
}> = {
  ritual: { expectedCount: 28, unit: 'حرف' },
  bible: { expectedCount: 28, unit: 'حرف' },
  calendar: { expectedCount: 12, unit: 'شهر' },
};

/* قاموس الكتاب المقدس لوحده آلاف المقالات، وكل واحد مفتاح جديد في
 * `htmlCache`. المدخل المنتهي بيتقرا وما بيتمسحش، فالخريطة بتكبر ولا
 * بتصغر أبداً — تسريب ذاكرة على سيرفر مشترك. السقف بيرمي الأقدم. */
const MAX_HTML_CACHE_ENTRIES = 300;

function putCappedHtml(key: string, value: { expiresAt: number; html: string }): void {
  htmlCache.delete(key);
  htmlCache.set(key, value);
  while (htmlCache.size > MAX_HTML_CACHE_ENTRIES) {
    const oldest = htmlCache.keys().next();
    if (oldest.done) break;
    htmlCache.delete(oldest.value);
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
};

/** رقم الكود لحرف — و`null` لو الرقم برّه المدى بدل ما يرمي. */
function codePointToChar(code: number): string | null {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return null;
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
}

/* مرور واحد، مش سلسلة `replace`. السلسلة كان فيها مشكلتين:
 *  ١) `&amp;` بتتفك الأول، فـ`&amp;lt;` بتبقى `&lt;` وبعدين `<` —
 *     فك مزدوج بيغيّر نص المقال.
 *  ٢) `String.fromCodePoint` بترمي RangeError على كيان بايظ زي
 *     `&#xFFFFFFFF;` — وصفحة واحدة فيها كده كانت بتوقّع القسم كله. */
function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:#[xX]([0-9a-fA-F]+)|#(\d+)|([a-zA-Z][a-zA-Z0-9]*));/g,
    (whole, hex, dec, name) => {
      if (hex !== undefined) return codePointToChar(parseInt(hex, 16)) ?? whole;
      if (dec !== undefined) return codePointToChar(Number(dec)) ?? whole;
      return NAMED_ENTITIES[String(name).toLowerCase()] ?? whole;
    },
  );
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

/* `Object.hasOwn` مش `in`: الـ`in` بيمشي على سلسلة البروتوتايب، فـ
 * `'toString' in SECTION_DEFINITIONS` بترجع true. يعني
 * `/sections/toString/browse` كان بيعدّي من الحارس، وبعدين
 * `SECTION_DEFINITIONS['toString']` بترجّع دالة الأوبچكت — لا `indexUrl`
 * ولا `pathPrefix` — والنتيجة ٥٠٣ برسالة «تعذر التحميل من St-Takla»
 * بتلوم عليهم في غلطة عندنا. */
function sectionDefinition(key: string): typeof SECTION_DEFINITIONS[StTaklaSectionKey] {
  if (!isStTaklaSectionKey(key)) throw new Error('قسم St-Takla غير معروف');
  return SECTION_DEFINITIONS[key];
}

export function isStTaklaSectionKey(value: string): value is StTaklaSectionKey {
  return Object.hasOwn(SECTION_DEFINITIONS, value);
}

async function fetchHtml(
  url: string,
  definition: typeof SECTION_DEFINITIONS[StTaklaSectionKey],
  forceRefresh = false,
): Promise<string> {
  const cached = htmlCache.get(url);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.html;

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
    const finalUrl = new URL(response.url || url);
    if (
      !['st-takla.org', 'www.st-takla.org'].includes(finalUrl.hostname) ||
      !finalUrl.pathname.startsWith(definition.pathPrefix)
    ) {
      throw new Error('St-Takla أعاد توجيه الرابط خارج المسار المسموح');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const charset = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1]?.toLowerCase();
    let html: string;
    try {
      html = new TextDecoder(charset === 'windows-1256' || charset === 'cp1256' ? 'windows-1256' : 'utf-8').decode(bytes);
    } catch {
      html = new TextDecoder('utf-8').decode(bytes);
    }
    const decodedForValidation = decodeHtmlEntities(html);
    if (html.includes('\uFFFD') || !/[\u0600-\u06ff]/.test(decodedForValidation)) {
      throw new Error('St-Takla أرسل صفحة بترميز غير صالح أو بلا محتوى عربي');
    }
    putCappedHtml(url, { expiresAt: Date.now() + CACHE_TTL_MS, html });
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

function validateBrowseContract(key: StTaklaSectionKey, browse: StTaklaBrowseLink[]): void {
  const contract = BROWSE_CONTRACTS[key];
  const expectedIds = Array.from({ length: contract.expectedCount }, (_, index) =>
    key === 'calendar' ? `month-${index + 1}` : `letter-${index + 1}`,
  );
  const missing = expectedIds.filter(id => !browse.some(link => link.id === id));
  if (missing.length) {
    throw new Error(
      `St-Takla فشل تحقق فهرس ${contract.unit === 'شهر' ? 'الشهور' : 'الحروف'}: ` +
      `المداخل المفقودة (${missing.join(', ')})`,
    );
  }
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

function healthErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const status = message.match(/رجّع (\d{3})/)?.[1];
  if (status) return `المصدر رجّع حالة ${status}`;
  if (message.includes('أعاد توجيه')) return 'الرابط يحوّل خارج مسار المصدر المسموح';
  return 'تعذر الوصول إلى الرابط أو التحقق من صفحة المصدر';
}

function setLinkHealth(url: string, status: 'ok' | 'unavailable', checkedAt: number, error?: string): void {
  linkHealth.set(url, { status, checkedAt, ...(error ? { error } : {}) });
}

function decorateCatalog(catalog: StTaklaSectionCatalog): StTaklaSectionCatalog {
  const now = Date.now();
  return {
    ...catalog,
    browse: catalog.browse.map(link => {
      const state = linkHealth.get(link.url);
      if (!state || now - state.checkedAt > LINK_HEALTH_INTERVAL_MS) {
        return { ...link, health: 'unchecked' };
      }
      return {
        ...link,
        health: state.status,
        checkedAt: state.checkedAt,
        ...(state.error ? { error: state.error } : {}),
      };
    }),
  };
}

export function getStTaklaLinkHealthSummary(): StTaklaLinkHealthSummary {
  return { ...healthSummary };
}

export async function getStTaklaSectionCatalog(key: StTaklaSectionKey): Promise<StTaklaSectionCatalog> {
  const cached = catalogCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return decorateCatalog(cached.value);
  const definition = sectionDefinition(key);
  const html = await fetchHtml(definition.indexUrl, definition);
  const value: StTaklaSectionCatalog = {
    key,
    title: definition.title,
    description: definition.description,
    sourceUrl: definition.indexUrl,
    browse: parseBrowseLinks(key, html, definition),
    status: 'ok',
  };
  validateBrowseContract(key, value.browse);
  catalogCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return decorateCatalog(value);
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

export async function checkStTaklaSectionLinksNow(): Promise<StTaklaLinkHealthSummary> {
  if (healthCheckInFlight) return healthCheckInFlight;
  healthCheckInFlight = (async () => {
    const checkedAt = Date.now();
    let checkedLinks = 0;
    const candidates: Array<{ key: StTaklaSectionKey; url: string }> = [];
    const activeUrls = new Set<string>();

    await Promise.all((Object.keys(SECTION_DEFINITIONS) as StTaklaSectionKey[]).map(async key => {
      const definition = SECTION_DEFINITIONS[key];
      activeUrls.add(definition.indexUrl);
      try {
        const html = await fetchHtml(definition.indexUrl, definition, true);
        const browse = parseBrowseLinks(key, html, definition);
        validateBrowseContract(key, browse);
        setLinkHealth(definition.indexUrl, 'ok', checkedAt);
        candidates.push(...browse.map(link => ({ key, url: link.url })));
      } catch (error) {
        setLinkHealth(definition.indexUrl, 'unavailable', checkedAt, healthErrorMessage(error));
      }
      checkedLinks += 1;
    }));

    for (const url of [...linkHealth.keys()]) {
      if (!activeUrls.has(url) && !candidates.some(candidate => candidate.url === url)) {
        linkHealth.delete(url);
      }
    }

    if (candidates.length) {
      const count = Math.min(MAX_BROWSE_LINK_CHECKS_PER_RUN, MAX_HEALTH_REQUESTS_PER_RUN - 3, candidates.length);
      const start = healthCursor % candidates.length;
      const selected = Array.from({ length: count }, (_, offset) => candidates[(start + offset) % candidates.length]);
      healthCursor = (start + count) % candidates.length;

      for (let index = 0; index < selected.length; index += 1) {
        const candidate = selected[index];
        const definition = SECTION_DEFINITIONS[candidate.key];
        activeUrls.add(candidate.url);
        if (index > 0) await new Promise(resolve => setTimeout(resolve, 200));
        try {
          await fetchHtml(candidate.url, definition, true);
          setLinkHealth(candidate.url, 'ok', checkedAt);
        } catch (error) {
          setLinkHealth(candidate.url, 'unavailable', checkedAt, healthErrorMessage(error));
        }
        checkedLinks += 1;
      }
    }

    const unavailableLinks = [...linkHealth.values()].filter(item => item.status === 'unavailable').length;
    healthSummary = {
      status: unavailableLinks ? 'degraded' : 'ok',
      lastCheckedAt: checkedAt,
      nextCheckAt: checkedAt + LINK_HEALTH_INTERVAL_MS,
      checkedLinks,
      unavailableLinks,
    };
    return getStTaklaLinkHealthSummary();
  })().finally(() => {
    healthCheckInFlight = null;
  });
  return healthCheckInFlight;
}

export function startStTaklaSectionLinkHealthSchedule(): void {
  if (healthStartupTimer || healthIntervalTimer) return;
  healthStartupTimer = setTimeout(() => {
    healthStartupTimer = null;
    void checkStTaklaSectionLinksNow();
    healthIntervalTimer = setInterval(() => {
      void checkStTaklaSectionLinksNow();
    }, LINK_HEALTH_INTERVAL_MS);
    healthIntervalTimer.unref?.();
  }, 30_000);
  healthStartupTimer.unref?.();
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
  status: 'ok' | 'unavailable';
  items: StTaklaSectionItem[];
  pagination?: StTaklaPagination;
  article?: StTaklaSectionArticle;
}> {
  const catalog = await getStTaklaSectionCatalog(key);
  const browse = catalog.browse.find(item => item.id === browseId);
  if (!browse) throw new Error('عنصر التصفح غير موجود في فهرس St-Takla');
  const storedHealth = linkHealth.get(browse.url);
  if (storedHealth?.status === 'unavailable' && Date.now() - storedHealth.checkedAt <= LINK_HEALTH_INTERVAL_MS) {
    throw new Error(storedHealth.error || 'رابط St-Takla غير متاح حسب آخر فحص');
  }
  const definition = sectionDefinition(key);
  const html = await fetchHtml(browse.url, definition);
  if (key === 'calendar') {
    const content = parseArticleContent(html);
    if (!content) throw new Error('St-Takla لم يُرجع محتوى المقال');
    return {
      section: key,
      source: 'St-Takla.org',
      sourceUrl: browse.url,
      status: 'ok' as const,
      items: [],
      article: {
        section: key,
        title: parseArticleTitle(html, browse.label),
        content,
        source: 'St-Takla.org',
        sourceUrl: browse.url,
      },
    };
  }
  const normalizedQuery = query.trim().slice(0, 80).toLocaleLowerCase('ar');
  const parsedItems = parseSectionItems(key, html, sectionDefinition(key), browse.url);
  if (!parsedItems.length) {
    throw new Error('St-Takla لم يُرجع مداخل قابلة للعرض لهذا القسم');
  }
  const items = parsedItems.filter(item =>
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
    status: 'ok',
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
  const html = await fetchHtml(url, definition);
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
  linkHealth.clear();
  healthSummary = {
    status: 'pending',
    lastCheckedAt: null,
    nextCheckAt: null,
    checkedLinks: 0,
    unavailableLinks: 0,
  };
  healthCursor = 0;
}