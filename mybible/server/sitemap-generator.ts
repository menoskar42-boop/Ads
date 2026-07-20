import { storage } from "./storage";
import type { Request, Response } from "express";
import { getAllVideoSeoEntries } from "./video-seo-data";
import { agpeyaHoursFull } from "../client/src/lib/agpeya-content";
import { synaxariumMonths } from "../client/src/lib/synaxarium-content";
import { liturgies } from "../client/src/lib/liturgy-content";
import { kidsBibleVideos } from "../client/src/lib/kids-bible-videos-data";
import { videoLinks } from "../client/src/lib/video-links-data";
import { chanteVideos } from "../client/src/lib/chanted-videos-data";
import { popeShenoudaQAVideos } from "../client/src/lib/orthodox-data";

const SITE = "https://mybible.oscardevs.com";
const CACHE_TTL = 1 * 60 * 60 * 1000;

// Known emotion types (Arabic slugs)
const EMOTION_TYPES = [
  "فرح", "حزن", "قلق", "خوف", "سلام", "رجاء", "غضب", "شكر",
  "وحدة", "إيمان", "صبر", "حكمة", "محبة", "شفاء",
];

// Reading plans (string IDs matching the app — no numeric /plans/N routes)
const READING_PLANS = [
  { id: 'plan-30',  name: 'خطة ٣٠ يوم',    days: 30  },
  { id: 'plan-60',  name: 'خطة ٦٠ يوم',    days: 60  },
  { id: 'plan-90',  name: 'خطة ٩٠ يوم',    days: 90  },
  { id: 'plan-180', name: 'خطة ٦ شهور',   days: 180 },
  { id: 'plan-365', name: 'خطة سنة كاملة', days: 365 },
];

const KIDS_STORY_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ── Cache store ───────────────────────────────────────────────────────────────
const caches = new Map<string, { xml: string; ts: number }>();

function getCache(key: string): string | null {
  const c = caches.get(key);
  return c && Date.now() - c.ts < CACHE_TTL ? c.xml : null;
}
function setCache(key: string, xml: string) {
  caches.set(key, { xml, ts: Date.now() });
}

export function invalidateSitemapCache() {
  caches.clear();
}

// ── XML helpers ───────────────────────────────────────────────────────────────
function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildUrl(loc: string, changefreq: string, priority: string, lastmod: string): string {
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function wrapUrlset(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
}

function lastNDays(n: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function sendXml(res: Response, xml: string) {
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(xml);
}

// ── Sitemap Index ─────────────────────────────────────────────────────────────
export async function sitemapIndexHandler(_req: Request, res: Response) {
  const cacheKey = "index";
  const cached = getCache(cacheKey);
  if (cached) return sendXml(res, cached);

  const today = new Date().toISOString().split("T")[0];
  const sitemaps = [
    "sitemap-pages.xml",
    "sitemap-bible.xml",
    "sitemap-orthodox.xml",
    "sitemap-kholagy.xml",
    "sitemap-topics.xml",
    "sitemap-search.xml",
    "sitemap-videos.xml",
    "sitemap-churches.xml",
    "sitemap-news.xml",
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map(s => `  <sitemap>\n    <loc>${SITE}/${s}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`).join("\n")}
</sitemapindex>`;

  setCache(cacheKey, xml);
  sendXml(res, xml);
}

// ── sitemap-pages.xml: static + emotions + plans + kids + daily ───────────────
export async function sitemapPagesHandler(_req: Request, res: Response) {
  const cacheKey = "pages";
  const cached = getCache(cacheKey);
  if (cached) return sendXml(res, cached);

  try {
  const today = new Date().toISOString().split("T")[0];
  const urls: string[] = [];

  const staticPages = [
    { path: "/",         changefreq: "daily",   priority: "1.0" },
    { path: "/bible",    changefreq: "weekly",  priority: "0.9" },
    { path: "/plans",    changefreq: "weekly",  priority: "0.7" },
    { path: "/emotions", changefreq: "weekly",  priority: "0.8" },
    { path: "/kids",          changefreq: "weekly",  priority: "0.8" },
    { path: "/kids/videos",  changefreq: "weekly",  priority: "0.8" },
    { path: "/kids/hymns",   changefreq: "weekly",  priority: "0.7" },
    { path: "/kids/stories", changefreq: "weekly",  priority: "0.7" },
    { path: "/search",   changefreq: "weekly",  priority: "0.7" },
    { path: "/about",    changefreq: "monthly", priority: "0.6" },
    { path: "/contact",  changefreq: "monthly", priority: "0.5" },
    { path: "/privacy",  changefreq: "monthly", priority: "0.4" },
    { path: "/daily-verse", changefreq: "daily", priority: "0.8" },
    { path: "/orthodox", changefreq: "daily",   priority: "0.8" },
    { path: "/orthodox/agpeya", changefreq: "monthly", priority: "0.8" },
    { path: "/orthodox/synaxarium", changefreq: "daily", priority: "0.8" },
    { path: "/orthodox/kholagy", changefreq: "monthly", priority: "0.9" },
    { path: "/orthodox/deacon", changefreq: "monthly", priority: "0.7" },
    { path: "/orthodox/hymns", changefreq: "monthly", priority: "0.8" },
    { path: "/orthodox/katameros", changefreq: "weekly", priority: "0.8" },
    { path: "/orthodox/saints", changefreq: "monthly", priority: "0.7" },
    { path: "/orthodox/creed", changefreq: "monthly", priority: "0.7" },
    { path: "/orthodox/history", changefreq: "monthly", priority: "0.7" },
    { path: "/orthodox/books", changefreq: "monthly", priority: "0.7" },
    { path: "/orthodox/qa", changefreq: "monthly", priority: "0.7" },
    { path: "/orthodox/figures", changefreq: "monthly", priority: "0.7" },
    { path: "/orthodox/apocrypha", changefreq: "monthly", priority: "0.7" },
    { path: "/orthodox/tafseer", changefreq: "monthly", priority: "0.8" },
    { path: "/orthodox/maps", changefreq: "monthly", priority: "0.7" },
    { path: "/orthodox/pope-qa", changefreq: "monthly", priority: "0.7" },
    { path: "/kholagy", changefreq: "monthly", priority: "0.9" },
    { path: "/sitemap",  changefreq: "monthly", priority: "0.4" },
    { path: "/terms",    changefreq: "monthly", priority: "0.3" },
    { path: "/premium",  changefreq: "monthly", priority: "0.6" },
    { path: "/church",   changefreq: "weekly",  priority: "0.7" },
    { path: "/challenge", changefreq: "weekly", priority: "0.7" },
  ];
  for (const page of staticPages) {
    const loc = page.path === "/" ? SITE : `${SITE}${page.path}`;
    urls.push(buildUrl(loc, page.changefreq, page.priority, today));
  }

  for (const emotion of EMOTION_TYPES) {
    urls.push(buildUrl(`${SITE}/emotions/${encodeURIComponent(emotion)}`, "weekly", "0.8", today));
  }
  for (const plan of READING_PLANS) {
    urls.push(buildUrl(`${SITE}/plans?plan=${encodeURIComponent(plan.id)}`, "weekly", "0.7", today));
  }
  for (const storyId of KIDS_STORY_IDS) {
    urls.push(buildUrl(`${SITE}/kids/story/${storyId}`, "weekly", "0.7", today));
  }

  // ── Individual video pages — full VideoObject schema for Google Video Search ──
  const seenVideoIds = new Set<string>();

  // Kids Bible videos & hymns
  for (const video of kidsBibleVideos) {
    if (!seenVideoIds.has(video.youtubeId)) {
      seenVideoIds.add(video.youtubeId);
      const priority = video.category === "ترانيم للأطفال" ? "0.7" : "0.8";
      urls.push(buildUrl(`${SITE}/video/${video.youtubeId}`, "monthly", priority, today));
    }
  }

  // Bible chapter audio/video (استمع للإصحاح) — ~1000+ videos
  for (const chapters of Object.values(videoLinks)) {
    for (const youtubeId of Object.values(chapters)) {
      if (youtubeId && !seenVideoIds.has(youtubeId)) {
        seenVideoIds.add(youtubeId);
        urls.push(buildUrl(`${SITE}/video/${youtubeId}`, "monthly", "0.8", today));
      }
    }
  }

  // Chanted Bible videos (ترتيل المزامير والإصحاحات)
  for (const chapters of Object.values(chanteVideos)) {
    for (const entry of Object.values(chapters)) {
      const youtubeId = typeof entry === 'string' ? entry : entry.id;
      if (youtubeId && !seenVideoIds.has(youtubeId)) {
        seenVideoIds.add(youtubeId);
        urls.push(buildUrl(`${SITE}/video/${youtubeId}`, "monthly", "0.8", today));
      }
    }
  }

  // Pope Shenouda QA videos (تاب أسئلة البابا شنودة)
  for (const v of popeShenoudaQAVideos) {
    if (v.videoId && !seenVideoIds.has(v.videoId)) {
      seenVideoIds.add(v.videoId);
      urls.push(buildUrl(`${SITE}/video/${v.videoId}`, "monthly", "0.8", today));
    }
  }

  // Agpeya hour videos (أجبية — ساعات الصلاة السبع)
  const agpeyaHourVideos = ['GHdBAQSvJKE','S0j7u_ofox0','gLF5RdzeUiU','PaYAUeyPcxk','HLvvnxMA_JI','N6sfbh3bmMk','YHtnFevTKx0'];
  for (const youtubeId of agpeyaHourVideos) {
    if (!seenVideoIds.has(youtubeId)) {
      seenVideoIds.add(youtubeId);
      urls.push(buildUrl(`${SITE}/video/${youtubeId}`, "monthly", "0.9", today));
    }
  }

  for (const date of lastNDays(30)) {
    urls.push(buildUrl(`${SITE}/daily-verse/${date}`, "daily", "0.7", date));
  }

  // Auto-boost: high-scoring pages
  try {
    const topScores = await storage.getTopPageScores(20);
    for (const ps of topScores) {
      if (ps.score < 50) continue;
      const priority = ps.score >= 200 ? "1.0" : ps.score >= 100 ? "0.95" : "0.9";
      const pageUrl = ps.pageUrl.startsWith('/') ? ps.pageUrl : `/${ps.pageUrl}`;
      urls.push(buildUrl(`${SITE}${pageUrl}`, "daily", priority, today));
    }
  } catch (_) { /* table may not exist */ }

  const xml = wrapUrlset(urls);
  setCache(cacheKey, xml);
  sendXml(res, xml);
  } catch (err) {
    console.error("[sitemap-pages] Error:", err);
    sendXml(res, wrapUrlset([]));
  }
}

// ── sitemap-bible.xml: books + chapters ──────────────────────────────────────
export async function sitemapBibleHandler(_req: Request, res: Response) {
  const cacheKey = "bible";
  const cached = getCache(cacheKey);
  if (cached) return sendXml(res, cached);

  try {
    const books = await storage.getAllBooks();
    const today = new Date().toISOString().split("T")[0];
    const urls: string[] = [];

    for (const book of books) {
      urls.push(buildUrl(`${SITE}/bible/${encodeURIComponent(book.name)}`, "weekly", "0.9", today));
      for (let ch = 1; ch <= book.chaptersCount; ch++) {
        const encodedBook = encodeURIComponent(book.name);
        urls.push(buildUrl(`${SITE}/bible/${encodedBook}/${ch}`, "monthly", "0.8", today));
        // Sub-view URLs — only include when real content exists for Googlebot
        if (videoLinks[book.name]?.[ch] || chanteVideos[book.name]?.[ch]) {
          urls.push(buildUrl(`${SITE}/bible/${encodedBook}/${ch}/video`, "monthly", "0.8", today));
        }
        // Tafsir: include for all chapters (CSV covers most books)
        urls.push(buildUrl(`${SITE}/bible/${encodedBook}/${ch}/tafsir`, "monthly", "0.7", today));
        // Lesson (/lesson) excluded — dynamic RSS content, not pre-renderable
      }
    }

    const xml = wrapUrlset(urls);
    setCache(cacheKey, xml);
    sendXml(res, xml);
  } catch (err) {
    console.error("[sitemap-bible] Error:", err);
    sendXml(res, wrapUrlset([]));
  }
}

// ── sitemap-orthodox.xml: agpeya + synaxarium ─────────────────────────────────
export function sitemapOrthodoxHandler(_req: Request, res: Response) {
  const cacheKey = "orthodox";
  const cached = getCache(cacheKey);
  if (cached) return sendXml(res, cached);

  const today = new Date().toISOString().split("T")[0];
  const urls: string[] = [];

  for (const hour of agpeyaHoursFull) {
    urls.push(buildUrl(`${SITE}/orthodox/agpeya/${hour.id}`, "monthly", "0.7", today));
  }
  for (const month of synaxariumMonths) {
    for (const dayEntry of month.days) {
      urls.push(buildUrl(`${SITE}/orthodox/synaxarium/${month.id}/${dayEntry.day}`, "monthly", "0.7", today));
    }
  }

  const xml = wrapUrlset(urls);
  setCache(cacheKey, xml);
  sendXml(res, xml);
}

// ── sitemap-kholagy.xml: liturgy pages ───────────────────────────────────────
export function sitemapKholagyHandler(_req: Request, res: Response) {
  const cacheKey = "kholagy";
  const cached = getCache(cacheKey);
  if (cached) return sendXml(res, cached);

  const today = new Date().toISOString().split("T")[0];
  const urls: string[] = [];

  for (const liturgy of liturgies) {
    // صفحة القداس الكاملة
    urls.push(buildUrl(`${SITE}/kholagy/${liturgy.id}`, "monthly", "0.9", today));
    // صفحة كل فصل
    for (const chapter of liturgy.chapters) {
      urls.push(buildUrl(`${SITE}/kholagy/${liturgy.id}/${chapter.id}`, "monthly", "0.8", today));
    }
  }

  const xml = wrapUrlset(urls);
  setCache(cacheKey, xml);
  sendXml(res, xml);
}

// ── sitemap-topics.xml: SEO topic pages ──────────────────────────────────────
export async function sitemapTopicsHandler(_req: Request, res: Response) {
  const cacheKey = "topics";
  const cached = getCache(cacheKey);
  if (cached) return sendXml(res, cached);

  const urls: string[] = [];
  try {
    const today = new Date().toISOString().split("T")[0];
    const topics = await storage.getAllSeoTopicSlugs();
    for (const t of topics) {
      if (!t.slug) continue;
      const lastmod = t.updatedAt ? t.updatedAt.toISOString().split("T")[0] : today;
      urls.push(buildUrl(`${SITE}/topics/${encodeURIComponent(t.slug)}`, "weekly", "0.8", lastmod));
    }
  } catch (err) {
    console.error("[sitemap-topics] Error:", err);
  }

  const xml = wrapUrlset(urls);
  setCache(cacheKey, xml);
  sendXml(res, xml);
}

// ── sitemap-search.xml: top search queries as indexable /search?q= URLs ──────
export async function sitemapSearchHandler(_req: Request, res: Response) {
  try {
    const cacheKey = "search";
    const cached = getCache(cacheKey);
    if (cached) return sendXml(res, cached);

    const today = new Date().toISOString().split("T")[0];
    const urls: string[] = [];

    // Static high-value Arabic search topics
    const staticQueries = [
      "المحبة", "الصبر", "السلام", "الإيمان", "الرجاء", "الفرح",
      "الصلاة", "الغفران", "الخلاص", "الحكمة", "التعزية", "القوة",
      "الشفاء", "الأمل", "البركة", "الحياة الأبدية", "يسوع المسيح",
      "الروح القدس", "الله محبة", "لا تخف", "ثق بالرب",
    ];

    for (const q of staticQueries) {
      urls.push(buildUrl(`${SITE}/search?q=${encodeURIComponent(q)}`, "weekly", "0.6", today));
    }

    // Boost with top queries from DB (page metrics)
    try {
      const topScores = await storage.getTopPageScores(30);
      for (const ps of topScores) {
        if (!ps.pageUrl.startsWith('/search?q=')) continue;
        const raw = ps.pageUrl.replace('/search?q=', '').trim();
        if (!raw) continue;
        try {
          urls.push(buildUrl(`${SITE}/search?q=${encodeURIComponent(decodeURIComponent(raw))}`, "weekly", "0.7", today));
        } catch (_) { /* skip malformed URL */ }
      }
    } catch (_) { /* table may not exist */ }

    const xml = wrapUrlset(urls);
    setCache(cacheKey, xml);
    sendXml(res, xml);
  } catch (err) {
    // Fallback: always return a valid (possibly empty) sitemap rather than hanging
    sendXml(res, wrapUrlset([]));
  }
}

// ── sitemap-videos.xml: all video pages (Bible, Kids, Agpeya, Pope QA) ────────
export function sitemapVideosHandler(_req: Request, res: Response) {
  const cacheKey = "videos-v2";
  const cached = getCache(cacheKey);
  if (cached) return sendXml(res, cached);

  const today = new Date().toISOString().split("T")[0];
  const seen = new Set<string>();
  const urls: string[] = [];

  const add = (id: string, priority = "0.8") => {
    if (id && !seen.has(id)) { seen.add(id); urls.push(buildUrl(`${SITE}/video/${id}`, "monthly", priority, today)); }
  };

  // Video SEO entries (existing)
  for (const v of getAllVideoSeoEntries()) add(v.youtubeId);

  // Bible chapter videos (استمع للإصحاح)
  for (const chapters of Object.values(videoLinks))
    for (const id of Object.values(chapters)) add(id);

  // Chanted Bible (ترتيل)
  for (const chapters of Object.values(chanteVideos))
    for (const entry of Object.values(chapters)) add(typeof entry === 'string' ? entry : entry.id);

  // Kids videos & hymns
  for (const v of kidsBibleVideos) add(v.youtubeId, v.category === "ترانيم للأطفال" ? "0.7" : "0.8");

  // Pope Shenouda QA
  for (const v of popeShenoudaQAVideos) add(v.videoId);

  // Agpeya hours
  for (const id of ['GHdBAQSvJKE','S0j7u_ofox0','gLF5RdzeUiU','PaYAUeyPcxk','HLvvnxMA_JI','N6sfbh3bmMk','YHtnFevTKx0']) add(id, "0.9");

  const xml = wrapUrlset(urls);
  setCache(cacheKey, xml);
  sendXml(res, xml);
}

// ── sitemap-listen.xml: audio listen pages ────────────────────────────────────
export async function sitemapListenHandler(_req: Request, res: Response) {
  const cacheKey = "listen";
  const cached = getCache(cacheKey);
  if (cached) return sendXml(res, cached);

  try {
    const books = await storage.getAllBooks();
    const today = new Date().toISOString().split("T")[0];
    const urls: string[] = [];

    for (const book of books) {
      for (let ch = 1; ch <= book.chaptersCount; ch++) {
        urls.push(buildUrl(`${SITE}/listen/${encodeURIComponent(book.name)}/${ch}`, "monthly", "0.6", today));
      }
    }

    const xml = wrapUrlset(urls);
    setCache(cacheKey, xml);
    sendXml(res, xml);
  } catch (err) {
    console.error("[sitemap-listen] Error:", err);
    sendXml(res, wrapUrlset([]));
  }
}

// ── sitemap-churches.xml: approved church pages ───────────────────────────────
export async function sitemapChurchesHandler(_req: Request, res: Response) {
  const cacheKey = "churches";
  const cached = getCache(cacheKey);
  if (cached) return sendXml(res, cached);

  const today = new Date().toISOString().split("T")[0];
  const urls: string[] = [];
  try {
    const churches = await storage.getApprovedChurches();
    for (const church of churches) {
      urls.push(buildUrl(`${SITE}/church/${church.id}`, "weekly", "0.6", today));
    }
  } catch (_) { /* DB may not be ready */ }

  const xml = wrapUrlset(urls);
  setCache(cacheKey, xml);
  sendXml(res, xml);
}

// ── Legacy: /sitemap.xml now returns the index ────────────────────────────────
export const sitemapHandler = sitemapIndexHandler;

// ── robots.txt ────────────────────────────────────────────────────────────────
export async function robotsHandler(_req: Request, res: Response) {
  const txt = `User-agent: *
Allow: /
Allow: /bible
Allow: /bible/
Allow: /plans
Allow: /emotions
Allow: /emotions/
Allow: /kids
Allow: /kids/
Allow: /kids/hymns
Allow: /kids/videos
Allow: /kids/stories
Allow: /kids/story/
Allow: /search
Allow: /about
Allow: /privacy
Allow: /contact
Allow: /topics/
Allow: /video/
Allow: /daily-verse
Allow: /daily-verse/
Allow: /orthodox
Allow: /orthodox/
Allow: /orthodox/agpeya
Allow: /orthodox/agpeya/
Allow: /orthodox/synaxarium
Allow: /orthodox/synaxarium/
Allow: /orthodox/kholagy
Allow: /orthodox/deacon
Allow: /orthodox/hymns
Allow: /orthodox/katameros
Allow: /orthodox/saints
Allow: /orthodox/creed
Allow: /orthodox/history
Allow: /orthodox/books
Allow: /orthodox/qa
Allow: /orthodox/figures
Allow: /orthodox/apocrypha
Allow: /orthodox/tafseer
Allow: /orthodox/maps
Allow: /orthodox/pope-qa
Allow: /kholagy
Allow: /kholagy/
Allow: /sitemap
Allow: /terms
Allow: /premium
Allow: /church
Allow: /church/
Allow: /challenge
Allow: /llms.txt

Disallow: /api/
Disallow: /liturgy-control
Disallow: /liturgy-display
Disallow: /admin
Disallow: /highlights
Disallow: /groups
Disallow: /group/
Disallow: /church-request
Disallow: /ministry-auth
Disallow: /share/

# ── AI Training Crawlers (explicitly allowed) ──────────────────────────────
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: FacebookBot
Allow: /

User-agent: cohere-ai
Allow: /

User-agent: Diffbot
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(txt);
}

// ── llms.txt — AI model discovery file (llmstxt.org standard) ────────────────
export function llmsHandler(_req: Request, res: Response) {
  const txt = `# الكتاب المقدس رفيقي — mybible.oscardevs.com

> موقع عربي متكامل للكتاب المقدس والطقوس القبطية الأرثوذكسية. يشمل قراءة الكتاب المقدس كاملاً بالعربية، والتفسير، والصلوات، والقراءات اليومية، وصلوات القداس الإلهي القبطي بثلاثة أنواعه، والسنكسار القبطي، ومحتوى للأطفال.

## الكتاب المقدس

- [الكتاب المقدس كاملاً](${SITE}/bible): قراءة الكتاب المقدس بالعهدين القديم والجديد — 66 سفراً بالعربية
- [البحث في الكتاب المقدس](${SITE}/search): بحث نصي كامل في الكتاب المقدس بالعربية
- [آية اليوم](${SITE}/daily-verse): آية يومية مختارة من الكتاب المقدس
- [الآيات حسب المشاعر](${SITE}/emotions): آيات مناسبة لكل مشاعر وظروف الحياة (حزن، فرح، خوف، شكر...)
- [خطط القراءة](${SITE}/plans): خطط منظمة لقراءة الكتاب المقدس كاملاً أو موضوعياً
- [تفسير الكتاب المقدس](${SITE}/bible/تكوين/1/tafsir): شرح وتفسير تفصيلي لإصحاحات الكتاب المقدس

## الطقوس القبطية الأرثوذكسية

- [الأجبية — صلوات الساعات](${SITE}/orthodox/agpeya): صلوات الساعات القبطية السبع (باكر، الثالثة، السادسة، التاسعة، الغروب، النوم، نصف الليل)
- [القداس الإلهي القبطي](${SITE}/orthodox/kholagy): نص القداس الإلهي بثلاثة أنواعه — الباسيلي والغريغوري والكيرلسي — بالعربية والقبطية
- [الكطمارس — القراءات اليومية](${SITE}/orthodox/katameros): القراءات الكتابية اليومية للكنيسة القبطية (بولس، كاثوليكون، أعمال، إنجيل)
- [السنكسار القبطي](${SITE}/orthodox/synaxarium): تذكار القديسين والشهداء القبط لكل يوم من أيام السنة القبطية
- [الترانيم والألحان القبطية](${SITE}/orthodox/hymns): ألحان وترانيم الكنيسة القبطية
- [قانون الإيمان](${SITE}/orthodox/creed): قانون الإيمان النيقاوي والعقيدة القبطية الأرثوذكسية
- [الشماس والخادم](${SITE}/orthodox/deacon): دليل الشماس — ردود وأدوار خدمة القداس
- [الكتب والمراجع اللاهوتية](${SITE}/orthodox/books): كتب الكنيسة القبطية والأبوكريفا والمراجع اللاهوتية
- [أسئلة وأجوبة لاهوتية](${SITE}/orthodox/qa): إجابات على الأسئلة العقيدية والطقسية
- [شخصيات الكتاب المقدس](${SITE}/orthodox/figures): معجم شخصيات وأماكن الكتاب المقدس
- [الخرائط الكتابية](${SITE}/orthodox/maps): خرائط جغرافية لمناطق الكتاب المقدس
- [تاريخ الكنيسة القبطية](${SITE}/orthodox/history): تاريخ الكنيسة القبطية الأرثوذكسية منذ التأسيس
- [أجوبة البابا شنودة](${SITE}/orthodox/pope-qa): مقاطع فيديو لإجابات البابا شنودة الثالث

## للأطفال

- [الكتاب المقدس للأطفال](${SITE}/kids): قصص كتابية وترانيم وفيديوهات إيمانية مخصصة للأطفال
- [قصص الكتاب المقدس](${SITE}/kids/stories): قصص مصورة وملخصات لقصص الكتاب المقدس للأطفال
- [ترانيم الأطفال](${SITE}/kids/hymns): ترانيم إيمانية بالعربية للأطفال

## الكنائس والمجتمع

- [دليل الكنائس](${SITE}/church): دليل الكنائس القبطية في مصر والمهجر مع الخرائط وأوقات القداسات
- [مواضيع روحية](${SITE}/topics): مقالات ومواضيع في الإيمان المسيحي والحياة الروحية

## معلومات عن الموقع

- [عن الموقع](${SITE}/about): رسالة الموقع وفريق العمل
- [سياسة الخصوصية](${SITE}/privacy): سياسة الخصوصية وحماية البيانات
- [الشروط والأحكام](${SITE}/terms): شروط الاستخدام

## Optional

- [خريطة الموقع](${SITE}/sitemap.xml): خريطة الموقع الكاملة بتسعة ملفات XML
`;
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(txt);
}

// ── sitemap-news.xml: daily freshness signal for Google News ──────────────────
export function sitemapNewsHandler(_req: Request, res: Response) {
  const today = new Date().toISOString().split("T")[0];
  const month = today.substring(0, 7);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <url>
    <loc>${SITE}/daily-verse/${today}</loc>
    <news:news>
      <news:publication>
        <news:name>رفيقي — الكتاب المقدس</news:name>
        <news:language>ar</news:language>
      </news:publication>
      <news:publication_date>${today}</news:publication_date>
      <news:title>آية اليوم — ${today}</news:title>
    </news:news>
  </url>
  <url>
    <loc>${SITE}/orthodox/synaxarium</loc>
    <news:news>
      <news:publication>
        <news:name>رفيقي — السنكسار القبطي</news:name>
        <news:language>ar</news:language>
      </news:publication>
      <news:publication_date>${today}</news:publication_date>
      <news:title>السنكسار القبطي — ${month}</news:title>
    </news:news>
  </url>
</urlset>`;
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(xml);
}
