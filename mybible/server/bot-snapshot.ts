import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { generateFAQSchema, generateBibleChapterTitle, generateBibleBookTitle } from "./seo-title";
import { getInternalLinks, buildInternalLinksHtml } from "./internal-links";
import { extractKeywords } from "./seo-topics";
import { liturgies } from "../client/src/lib/liturgy-content";
import { getVideoSeoById } from "./video-seo-data";
import { agpeyaHoursFull, commonOpeningPrayers } from "../client/src/lib/agpeya-content";
import { synaxariumMonths, getMonthById, getDayEntries, entryTypeIcon } from "../client/src/lib/synaxarium-content";
import { kidsHymnsPlaylist, kidsBibleVideos } from "../client/src/lib/kids-bible-videos-data";
import { buildChapterOgUrl, buildBookOgUrl, buildOrthodoxOgUrl } from "./og-image";
import { getChapterTafsir, getBookIntro } from "./tafsir-service";
import { videoLinks } from "../client/src/lib/video-links-data";
import { chanteVideos } from "../client/src/lib/chanted-videos-data";

const BOT_UA_PATTERN = /Googlebot|Googlebot-Image|Googlebot-Video|Google-InspectionTool|bingbot|BingPreview|GPTBot|ClaudeBot|PerplexityBot|Applebot|DuckDuckBot|YandexBot|Baiduspider|Slurp|facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|AdsBot-Google|Mediapartners-Google|APIs-Google/i;

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SITE = "https://mybible.oscardevs.com";
const OG_IMAGE = `${SITE}/opengraph.jpg`;
const MAX_CACHE = 400;
const snapshotCache = new Map<string, { html: string; ts: number; noindex?: boolean }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function evictOldest() {
  if (snapshotCache.size <= MAX_CACHE) return;
  let oldestKey = "";
  let oldestTs = Infinity;
  for (const [k, v] of snapshotCache) {
    if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; }
  }
  if (oldestKey) snapshotCache.delete(oldestKey);
}

function isBot(ua: string): boolean {
  return BOT_UA_PATTERN.test(ua);
}

function buildFaqSchema(faqs: { q: string; a: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a }
    }))
  };
}

function wrapHtml(title: string, description: string, canonical: string, bodyContent: string, schemaJson: object | object[], ogImage?: string, noindex?: boolean, ogType?: string): string {
  const today = new Date().toISOString().split('T')[0];
  const rawSchemas = Array.isArray(schemaJson) ? schemaJson : [schemaJson];
  const schemas = rawSchemas.map((s: Record<string, unknown>) =>
    s["dateModified"] === undefined ? { ...s, dateModified: today } : s
  );
  const schemaScripts = schemas
    .map(s => `<script type="application/ld+json">\n${JSON.stringify(s)}\n</script>`)
    .join('\n');
  const img = ogImage || OG_IMAGE;
  const resolvedOgType = ogType || (canonical === SITE || canonical === `${SITE}/` ? 'website' : 'article');
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="dns-prefetch" href="https://www.youtube.com">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="${resolvedOgType}">
<meta property="og:site_name" content="الكتاب المقدس رفيقي">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ar_AR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${img}">
<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}">
${schemaScripts}
</head>
<body style="font-family:'Noto Naskh Arabic',serif;max-width:800px;margin:0 auto;padding:20px;direction:rtl;text-align:right;background:#faf8f5;color:#2c1810">
<header>
<nav><a href="/">الرئيسية</a> | <a href="/bible">الكتاب المقدس</a> | <a href="/plans">خطط القراءة</a> | <a href="/emotions">المشاعر</a> | <a href="/kids">الأطفال</a> | <a href="/family">العائلة</a> | <a href="/orthodox">أرثوذوكسيات</a> | <a href="/service">الخدمة</a> | <a href="/search">البحث</a></nav>
</header>
<main>
${bodyContent}
</main>
<footer>
<p>&copy; الكتاب المقدس رفيقي - <a href="${SITE}">mybible.oscardevs.com</a></p>
<p><a href="mailto:Contact@oscardevs.com">Contact@oscardevs.com</a></p>
</footer>
</body>
</html>`;
}

function buildChapterSnapshot(bookName: string, chapter: number, verses: Array<{ verse: number; text: string }>, allBooks: Array<{ name: string; chaptersCount: number }>): string {
  const title = generateBibleChapterTitle(bookName, chapter, verses.length);
  const description = `اقرأ ${bookName} الإصحاح ${chapter} كامل (${verses.length} آية) مع إمكانية الاستماع والمشاركة. الكتاب المقدس باللغة العربية.`;
  const canonical = `${SITE}/bible/${encodeURIComponent(bookName)}/${chapter}`;

  const versesHtml = verses.map(v =>
    `<p><strong>${v.verse}</strong> ${esc(v.text)}</p>`
  ).join("\n");

  const relatedLinks: string[] = [];
  const currentBook = allBooks.find(b => b.name === bookName);
  if (currentBook) {
    if (chapter > 1)
      relatedLinks.push(`<a href="/bible/${encodeURIComponent(bookName)}/${chapter - 1}">تفسير ${esc(bookName)} ${chapter - 1}</a>`);
    if (chapter < currentBook.chaptersCount)
      relatedLinks.push(`<a href="/bible/${encodeURIComponent(bookName)}/${chapter + 1}">تفسير ${esc(bookName)} ${chapter + 1}</a>`);
  }
  relatedLinks.push(`<a href="/bible/${encodeURIComponent(bookName)}">تفسير ${esc(bookName)} كامل</a>`);
  const bookIdx = allBooks.findIndex(b => b.name === bookName);
  if (bookIdx > 0)
    relatedLinks.push(`<a href="/bible/${encodeURIComponent(allBooks[bookIdx - 1].name)}">تفسير ${esc(allBooks[bookIdx - 1].name)}</a>`);
  if (bookIdx < allBooks.length - 1)
    relatedLinks.push(`<a href="/bible/${encodeURIComponent(allBooks[bookIdx + 1].name)}">تفسير ${esc(allBooks[bookIdx + 1].name)}</a>`);

  // Contextual internal links for SEO
  const seoLinks = getInternalLinks(`${bookName} ${chapter}`, 4);
  const seoLinksHtml = buildInternalLinksHtml(seoLinks);

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "description": description,
    "url": canonical,
    "inLanguage": "ar",
    "isPartOf": {
      "@type": "Book",
      "name": bookName,
      "inLanguage": "ar",
      "about": "الكتاب المقدس"
    },
    "publisher": {
      "@type": "Organization",
      "name": "الكتاب المقدس رفيقي",
      "url": SITE
    }
  };

  // BreadcrumbList schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": SITE },
      { "@type": "ListItem", "position": 2, "name": "الكتاب المقدس", "item": `${SITE}/bible` },
      { "@type": "ListItem", "position": 3, "name": bookName, "item": `${SITE}/bible/${encodeURIComponent(bookName)}` },
      { "@type": "ListItem", "position": 4, "name": `الإصحاح ${chapter}`, "item": canonical }
    ]
  };

  // FAQ schema — uses first 3 verses as answers
  const faqVerses = verses.slice(0, 3).map(v => ({
    bookName,
    chapter,
    verse: v.verse,
    text: v.text,
  }));
  const faqSchema = generateFAQSchema(bookName, faqVerses);
  const schemas: object[] = [webPageSchema, breadcrumbSchema];
  if (faqSchema) schemas.push(faqSchema);

  const body = `<h1>تفسير ${esc(bookName)} الإصحاح ${chapter}</h1>
<section>
<p><em>${esc(description)}</em></p>
</section>
<article>
${versesHtml}
</article>
${relatedLinks.length > 0 ? `<nav><h2>أصحاحات ذات صلة</h2><ul>${relatedLinks.map(l => `<li>${l}</li>`).join("")}</ul></nav>` : ""}
<nav aria-label="مواضيع ذات صلة"><h2>مواضيع ذات صلة</h2><p>${seoLinksHtml}</p></nav>`;

  return wrapHtml(title, description, canonical, body, schemas, buildChapterOgUrl(bookName, chapter));
}

// book name → CSV name mapping (mirrors tafsir-csv-service on the client)
const bookNameToCSV: Record<string, string> = {
  "التكوين": "تكوين", "الخروج": "خروج", "اللاويين": "لاويين", "العدد": "عدد",
  "التثنية": "تثنية", "يشوع": "يشوع", "القضاة": "قضاة", "راعوث": "راعوث",
  "صموئيل الأول": "صموئيل أول", "صموئيل الثاني": "صموئيل ثاني",
  "الملوك الأول": "ملوك أول", "الملوك الثاني": "ملوك ثاني",
  "أخبار الأيام الأول": "أخبار أيام أول", "أخبار الأيام الثاني": "أخبار أيام ثاني",
  "عزرا": "عزرا", "نحميا": "نحميا", "أستير": "أستير", "أيوب": "أيوب",
  "المزامير": "مزامير", "الأمثال": "أمثال", "الجامعة": "جامعة",
  "نشيد الأنشاد": "نشيد الأنشاد", "إشعياء": "إشعياء", "إرميا": "إرميا",
  "مراثي إرميا": "مراثي إرميا", "حزقيال": "حزقيال", "دانيال": "دانيال",
  "هوشع": "هوشع", "يوئيل": "يوئيل", "عاموس": "عاموس", "عوبديا": "عوبديا",
  "يونان": "يونان", "ميخا": "ميخا", "ناحوم": "ناحوم", "حبقوق": "حبقوق",
  "صفنيا": "صفنيا", "حجي": "حجي", "زكريا": "زكريا", "ملاخي": "ملاخي",
  "متى": "متى", "مرقس": "مرقس", "لوقا": "لوقا", "يوحنا": "يوحنا",
  "أعمال الرسل": "أعمال الرسل", "رومية": "رومية",
  "كورنثوس الأولى": "كورنثوس أولى", "كورنثوس الثانية": "كورنثوس ثانية",
  "غلاطية": "غلاطية", "أفسس": "أفسس", "فيلبي": "فيلبي", "كولوسي": "كولوسي",
  "تسالونيكي الأولى": "تسالونيكي أولى", "تسالونيكي الثانية": "تسالونيكي ثانية",
  "تيموثاوس الأولى": "تيموثاوس أولى", "تيموثاوس الثانية": "تيموثاوس ثانية",
  "تيطس": "تيطس", "فليمون": "فليمون", "العبرانيين": "عبرانيين",
  "يعقوب": "يعقوب", "بطرس الأولى": "بطرس أولى", "بطرس الثانية": "بطرس ثانية",
  "يوحنا الأولى": "يوحنا أولى", "يوحنا الثانية": "يوحنا ثانية",
  "يوحنا الثالثة": "يوحنا ثالثة", "يهوذا": "يهوذا", "رؤيا يوحنا": "رؤيا",
};

function getCSVName(bookName: string): string | null {
  if (bookNameToCSV[bookName]) return bookNameToCSV[bookName];
  for (const [db, csv] of Object.entries(bookNameToCSV)) {
    if (bookName.includes(csv) || csv.includes(bookName)) return csv;
  }
  return null;
}

function buildTafsirSnapshot(
  bookName: string,
  chapter: number,
  tafsirText: string | null,
  bookIntro: string | null,
  allBooks: Array<{ name: string; chaptersCount: number }>
): string {
  const canonical = `${SITE}/bible/${encodeURIComponent(bookName)}/${chapter}/tafsir`;
  const currentBook = allBooks.find(b => b.name === bookName);
  const chaptersCount = currentBook?.chaptersCount ?? 1;

  const title = `تفسير ${bookName} ${chapter} — القمص تادرس يعقوب ملطي | رفيقي`;
  const rawDescription = tafsirText
    ? `تفسير ${bookName} الإصحاح ${chapter} للقمص تادرس يعقوب ملطي: ${tafsirText.trim()}`
    : `تفسير ${bookName} الإصحاح ${chapter} من الكتاب المقدس بالعربية، للقمص تادرس يعقوب ملطي — شرح وافٍ لكل آية مع السياق اللاهوتي.`;
  // Clamp to 160 chars (Bing/Google meta-description limit) regardless of book name length
  const description = rawDescription.length > 160
    ? `${rawDescription.slice(0, 157).trim()}...`
    : rawDescription;

  const seoLinks = getInternalLinks(`تفسير ${bookName}`, 4);
  const seoLinksHtml = buildInternalLinksHtml(seoLinks);

  const navLinks: string[] = [];
  if (chapter > 1)
    navLinks.push(`<a href="/bible/${encodeURIComponent(bookName)}/${chapter - 1}/tafsir">تفسير ${esc(bookName)} ${chapter - 1}</a>`);
  if (chapter < chaptersCount)
    navLinks.push(`<a href="/bible/${encodeURIComponent(bookName)}/${chapter + 1}/tafsir">تفسير ${esc(bookName)} ${chapter + 1}</a>`);
  navLinks.push(`<a href="/bible/${encodeURIComponent(bookName)}/${chapter}">قراءة آيات ${esc(bookName)} ${chapter}</a>`);
  navLinks.push(`<a href="/bible/${encodeURIComponent(bookName)}">سفر ${esc(bookName)} كامل</a>`);

  const schema: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": title,
      "description": description,
      "url": canonical,
      "inLanguage": "ar",
      "articleSection": "تفسير الكتاب المقدس",
      "author": { "@type": "Person", "name": "القمص تادرس يعقوب ملطي" },
      "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE },
      "about": { "@type": "Book", "name": bookName, "inLanguage": "ar" }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": SITE },
        { "@type": "ListItem", "position": 2, "name": "الكتاب المقدس", "item": `${SITE}/bible` },
        { "@type": "ListItem", "position": 3, "name": bookName, "item": `${SITE}/bible/${encodeURIComponent(bookName)}` },
        { "@type": "ListItem", "position": 4, "name": `الإصحاح ${chapter}`, "item": `${SITE}/bible/${encodeURIComponent(bookName)}/${chapter}` },
        { "@type": "ListItem", "position": 5, "name": "التفسير", "item": canonical }
      ]
    }
  ];
  const tafsirFaq = buildFaqSchema([
    { q: `من صاحب تفسير ${bookName}؟`, a: `تفسير ${bookName} المعروض هنا هو للقمص تادرس يعقوب ملطي، أحد أشهر مفسري الكتاب المقدس في الكنيسة القبطية الأرثوذكسية.` },
    { q: `أين أقرأ تفسير الكتاب المقدس بالعربية كاملاً؟`, a: `يوفر موقع الكتاب المقدس رفيقي تفسير القمص تادرس يعقوب ملطي لأسفار الكتاب المقدس إصحاحاً بإصحاح بالعربية مجاناً.` },
  ]);
  if (tafsirFaq) schema.push(tafsirFaq);

  const introSection = bookIntro
    ? `<section>\n<h2>مقدمة عن سفر ${esc(bookName)}</h2>\n<p>${esc(bookIntro.slice(0, 500))}...</p>\n</section>`
    : "";

  const tafsirSection = tafsirText
    ? `<article>\n<h2>تفسير ${esc(bookName)} الإصحاح ${chapter} — للقمص تادرس يعقوب ملطي</h2>\n<p>${esc(tafsirText)}</p>\n</article>`
    : `<article>\n<h2>تفسير ${esc(bookName)} الإصحاح ${chapter}</h2>\n<p>يتضمن هذا الإصحاح ${chapter === 1 ? "افتتاحية" : "تكملة"} أحداث سفر ${esc(bookName)}. اقرأ الآيات للتأمل الروحي.</p>\n</article>`;

  const body = `<h1>${esc(title)}</h1>
<p><em>تفسير الكتاب المقدس بالعربية للقمص تادرس يعقوب ملطي.</em></p>
${introSection}
${tafsirSection}
${navLinks.length > 0 ? `<nav><h2>إصحاحات ذات صلة</h2><ul>${navLinks.map(l => `<li>${l}</li>`).join("")}</ul></nav>` : ""}
<nav aria-label="مواضيع ذات صلة"><h2>مواضيع ذات صلة</h2><p>${seoLinksHtml}</p></nav>`;

  return wrapHtml(title, description, canonical, body, schema, buildChapterOgUrl(bookName, chapter));
}

function buildVideoSnapshot(
  bookName: string,
  chapter: number,
  videoId: string,
  chanteVideoId: string | null,
  allBooks: Array<{ name: string; chaptersCount: number }>
): string {
  const canonical = `${SITE}/bible/${encodeURIComponent(bookName)}/${chapter}/video`;
  const currentBook = allBooks.find(b => b.name === bookName);
  const chaptersCount = currentBook?.chaptersCount ?? 1;

  const title = `استمع لإصحاح ${bookName} ${chapter} | الكتاب المقدس صوتياً`;
  const description = `استمع لـ ${bookName} الإصحاح ${chapter} من الكتاب المقدس بالعربية صوتياً عبر يوتيوب.${chanteVideoId ? " متاح أيضاً نسخة الترتيل." : ""}`;

  const seoLinks = getInternalLinks(`${bookName} ${chapter} صوت`, 3);
  const seoLinksHtml = buildInternalLinksHtml(seoLinks);

  const navLinks: string[] = [];
  if (chapter > 1)
    navLinks.push(`<a href="/bible/${encodeURIComponent(bookName)}/${chapter - 1}/video">استمع لـ${esc(bookName)} ${chapter - 1}</a>`);
  if (chapter < chaptersCount)
    navLinks.push(`<a href="/bible/${encodeURIComponent(bookName)}/${chapter + 1}/video">استمع لـ${esc(bookName)} ${chapter + 1}</a>`);
  navLinks.push(`<a href="/bible/${encodeURIComponent(bookName)}/${chapter}">قراءة آيات ${esc(bookName)} ${chapter}</a>`);
  navLinks.push(`<a href="/bible/${encodeURIComponent(bookName)}/${chapter}/tafsir">تفسير ${esc(bookName)} ${chapter}</a>`);

  const videos: object[] = [
    {
      "@type": "VideoObject",
      "name": `${bookName} الإصحاح ${chapter} — استماع صوتي`,
      "description": `${bookName} الإصحاح ${chapter} من الكتاب المقدس بالعربية`,
      "thumbnailUrl": `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      "embedUrl": `https://www.youtube.com/embed/${videoId}`,
      "url": `https://www.youtube.com/watch?v=${videoId}`,
      "inLanguage": "ar",
      "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
    }
  ];
  if (chanteVideoId) {
    videos.push({
      "@type": "VideoObject",
      "name": `${bookName} الإصحاح ${chapter} — ترتيل`,
      "description": `${bookName} الإصحاح ${chapter} مرتلاً`,
      "thumbnailUrl": `https://img.youtube.com/vi/${chanteVideoId}/hqdefault.jpg`,
      "embedUrl": `https://www.youtube.com/embed/${chanteVideoId}`,
      "url": `https://www.youtube.com/watch?v=${chanteVideoId}`,
      "inLanguage": "ar",
      "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
    });
  }

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": title,
      "description": description,
      "url": canonical,
      "numberOfItems": videos.length,
      "itemListElement": videos.map((v, i) => ({ "@type": "ListItem", "position": i + 1, "item": v }))
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": SITE },
        { "@type": "ListItem", "position": 2, "name": "الكتاب المقدس", "item": `${SITE}/bible` },
        { "@type": "ListItem", "position": 3, "name": bookName, "item": `${SITE}/bible/${encodeURIComponent(bookName)}` },
        { "@type": "ListItem", "position": 4, "name": `الإصحاح ${chapter}`, "item": `${SITE}/bible/${encodeURIComponent(bookName)}/${chapter}` },
        { "@type": "ListItem", "position": 5, "name": "استماع", "item": canonical }
      ]
    }
  ];

  const videoCards: string[] = [
    `<article>\n<h2>استماع: ${esc(bookName)} الإصحاح ${chapter}</h2>\n<p><a href="https://www.youtube.com/watch?v=${videoId}">${esc(bookName)} ${chapter} — يوتيوب</a></p>\n<img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="${esc(bookName)} ${chapter}" loading="lazy" />\n</article>`
  ];
  if (chanteVideoId) {
    videoCards.push(`<article>\n<h2>ترتيل: ${esc(bookName)} الإصحاح ${chapter}</h2>\n<p><a href="https://www.youtube.com/watch?v=${chanteVideoId}">${esc(bookName)} ${chapter} مرتلاً — يوتيوب</a></p>\n<img src="https://img.youtube.com/vi/${chanteVideoId}/hqdefault.jpg" alt="${esc(bookName)} ${chapter} ترتيل" loading="lazy" />\n</article>`);
  }

  const body = `<h1>${esc(title)}</h1>
<section><p><em>${esc(description)}</em></p></section>
${videoCards.join("\n")}
${navLinks.length > 0 ? `<nav><h2>إصحاحات ذات صلة</h2><ul>${navLinks.map(l => `<li>${l}</li>`).join("")}</ul></nav>` : ""}
<nav aria-label="مواضيع ذات صلة"><h2>مواضيع ذات صلة</h2><p>${seoLinksHtml}</p></nav>`;

  return wrapHtml(title, description, canonical, body, schema, buildChapterOgUrl(bookName, chapter));
}

// Per-book SEO overrides for high-value books (keyword research driven).
interface BookSeoOverride {
  title: string;
  description: string;
  h1: string;
  chaptersHeading: string;
  chapterLabels?: Record<number, string>;
  featured?: { ch: number; label: string }[];
  faq?: { q: string; a: string }[];
  schemaName?: string;
}

const BOOK_SEO_OVERRIDES: Record<string, BookSeoOverride> = {
  'المزامير': {
    title: 'مزامير داود كاملة — 150 مزموراً للتأمل | الكتاب المقدس رفيقي',
    description: 'اقرأ مزامير داود كاملة بالعربية: 150 مزموراً تشمل مزمور 23 الرب راعيَّ، مزمور 91 في حماية الله، مزمور 51 التوبة، ومزمور 103. تسابيح وصلوات من الكتاب المقدس.',
    h1: 'مزامير داود كاملة — 150 مزموراً',
    chaptersHeading: 'جميع المزامير',
    schemaName: 'مزامير داود',
    chapterLabels: {
      1: 'مزمور 1 — طريق البار والأشرار',
      23: 'مزمور 23 — الرب راعيَّ',
      46: 'مزمور 46 — الله ملجأنا',
      51: 'مزمور 51 — الاعتراف والتوبة',
      91: 'مزمور 91 — في حماية الله',
      103: 'مزمور 103 — باركي يا نفسي الرب',
      121: 'مزمور 121 — المعونة من الرب',
      150: 'مزمور 150 — تسبيح الختام',
    },
    featured: [
      { ch: 23, label: 'مزمور 23 — الرب راعيَّ فلا يعوزني شيء' },
      { ch: 91, label: 'مزمور 91 — الساكن في ستر العلي' },
      { ch: 51, label: 'مزمور 51 — توبة داود واعترافه' },
      { ch: 103, label: 'مزمور 103 — باركي يا نفسي الرب' },
      { ch: 121, label: 'مزمور 121 — رافع عينيَّ إلى الجبال' },
    ],
    faq: [
      { q: 'كم عدد مزامير داود في الكتاب المقدس؟', a: 'يتكون سفر المزامير من 150 مزموراً، معظمها منسوب إلى داود النبي. تغطي موضوعات التسبيح والصلاة والاعتراف والتوبة والثقة بالله.' },
      { q: 'ما هو مزمور 23؟', a: 'مزمور 23 "الرب راعيَّ فلا يعوزني شيء" هو أشهر المزامير وأكثرها تلاوةً. يصف ثقة المؤمن بالله الراعي الصالح الذي يرشد ويحمي ويُعزّي.' },
      { q: 'ما هو مزمور 91؟', a: 'مزمور 91 "الساكن في ستر العلي" يتحدث عن حماية الله الإلهية لمن يثق به، ويُتلى كثيراً في أوقات الخوف والضيقة.' },
    ],
  },
  'التكوين': {
    title: 'سفر التكوين كاملاً بالعربية — 50 إصحاحاً مع التفسير | رفيقي',
    description: 'اقرأ سفر التكوين كاملاً بالعربية: 50 إصحاحاً يشمل الخليقة، آدم وحواء، نوح والطوفان، وإبراهيم. أول أسفار الكتاب المقدس والعهد القديم مع التفسير.',
    h1: 'سفر التكوين — أول أسفار الكتاب المقدس',
    chaptersHeading: 'إصحاحات سفر التكوين',
    schemaName: 'سفر التكوين',
    chapterLabels: {
      1: 'التكوين 1 — خلق السموات والأرض',
      2: 'التكوين 2 — آدم وحواء وجنة عدن',
      3: 'التكوين 3 — السقوط والخطية الأولى',
      6: 'التكوين 6 — نوح والفلك',
      12: 'التكوين 12 — دعوة إبراهيم',
      22: 'التكوين 22 — تقدمة إسحق',
    },
    featured: [
      { ch: 1, label: 'التكوين 1 — خلق السموات والأرض' },
      { ch: 3, label: 'التكوين 3 — السقوط والخطية الأولى' },
      { ch: 6, label: 'التكوين 6 — نوح والفلك والطوفان' },
      { ch: 12, label: 'التكوين 12 — دعوة إبراهيم أبي الآباء' },
    ],
    faq: [
      { q: 'ما موضوع سفر التكوين؟', a: 'سفر التكوين هو أول أسفار الكتاب المقدس، ويتناول خلق العالم والإنسان، السقوط، الطوفان، ودعوة الآباء إبراهيم وإسحق ويعقوب.' },
      { q: 'من كتب سفر التكوين؟', a: 'يُنسب سفر التكوين تقليدياً إلى موسى النبي، وهو أول الأسفار الخمسة (التوراة / البنتاتيك).' },
      { q: 'كم عدد إصحاحات سفر التكوين؟', a: 'يتكون سفر التكوين من 50 إصحاحاً.' },
    ],
  },
  'الخروج': {
    title: 'سفر الخروج كاملاً بالعربية — 40 إصحاحاً مع التفسير | رفيقي',
    description: 'اقرأ سفر الخروج كاملاً بالعربية: 40 إصحاحاً يشمل موسى، الخروج من مصر، عبور البحر الأحمر، والوصايا العشر. من العهد القديم مع التفسير.',
    h1: 'سفر الخروج — خروج بني إسرائيل من مصر',
    chaptersHeading: 'إصحاحات سفر الخروج',
    schemaName: 'سفر الخروج',
    chapterLabels: {
      3: 'الخروج 3 — العليقة المشتعلة ودعوة موسى',
      12: 'الخروج 12 — الفصح وعيد الفطير',
      14: 'الخروج 14 — عبور البحر الأحمر',
      20: 'الخروج 20 — الوصايا العشر',
    },
    featured: [
      { ch: 3, label: 'الخروج 3 — العليقة المشتعلة ودعوة موسى' },
      { ch: 14, label: 'الخروج 14 — عبور البحر الأحمر' },
      { ch: 20, label: 'الخروج 20 — الوصايا العشر' },
    ],
    faq: [
      { q: 'ما موضوع سفر الخروج؟', a: 'يتناول سفر الخروج تحرير بني إسرائيل من العبودية في مصر بقيادة موسى، عبور البحر الأحمر، واستلام الشريعة والوصايا العشر في سيناء.' },
      { q: 'ما هي الوصايا العشر؟', a: 'الوصايا العشر (الخروج 20) هي الشريعة التي أعطاها الله لموسى على جبل سيناء، وتشمل واجبات الإنسان نحو الله ونحو القريب.' },
      { q: 'كم عدد إصحاحات سفر الخروج؟', a: 'يتكون سفر الخروج من 40 إصحاحاً.' },
    ],
  },
  'الأمثال': {
    title: 'سفر الأمثال كاملاً بالعربية — 31 إصحاحاً من حكمة سليمان | رفيقي',
    description: 'اقرأ سفر الأمثال كاملاً بالعربية: 31 إصحاحاً من حكمة سليمان عن الحياة والسلوك والخوف من الرب. من أسفار الحكمة في العهد القديم مع التفسير.',
    h1: 'سفر الأمثال — حكمة سليمان',
    chaptersHeading: 'إصحاحات سفر الأمثال',
    schemaName: 'سفر الأمثال',
    chapterLabels: {
      1: 'الأمثال 1 — رأس الحكمة مخافة الرب',
      3: 'الأمثال 3 — توكل على الرب بكل قلبك',
      31: 'الأمثال 31 — المرأة الفاضلة',
    },
    featured: [
      { ch: 1, label: 'الأمثال 1 — "رأس الحكمة مخافة الرب"' },
      { ch: 3, label: 'الأمثال 3 — "توكل على الرب بكل قلبك"' },
      { ch: 31, label: 'الأمثال 31 — المرأة الفاضلة' },
    ],
    faq: [
      { q: 'من كتب سفر الأمثال؟', a: 'يُنسب سفر الأمثال أساساً إلى سليمان الحكيم، ويضم مجموعة من الأقوال الحكيمة عن السلوك القويم والخوف من الرب.' },
      { q: 'ما موضوع سفر الأمثال؟', a: 'يقدّم سفر الأمثال حكمة عملية للحياة اليومية: الأمانة، الاجتهاد، ضبط اللسان، اختيار الأصدقاء، ومخافة الرب أساس كل حكمة.' },
      { q: 'كم عدد إصحاحات سفر الأمثال؟', a: 'يتكون سفر الأمثال من 31 إصحاحاً.' },
    ],
  },
  'إشعياء': {
    title: 'سفر إشعياء كاملاً بالعربية — 66 إصحاحاً مع التفسير | رفيقي',
    description: 'اقرأ سفر إشعياء كاملاً بالعربية: 66 إصحاحاً من نبوات إشعياء عن المسيح المخلّص والعزاء والخلاص. من أسفار الأنبياء في العهد القديم مع التفسير.',
    h1: 'سفر إشعياء — النبي إشعياء',
    chaptersHeading: 'إصحاحات سفر إشعياء',
    schemaName: 'سفر إشعياء',
    chapterLabels: {
      6: 'إشعياء 6 — رؤيا إشعياء ودعوته',
      7: 'إشعياء 7 — نبوة عمانوئيل',
      40: 'إشعياء 40 — "عزّوا عزّوا شعبي"',
      53: 'إشعياء 53 — العبد المتألم (نبوة الصليب)',
    },
    featured: [
      { ch: 7, label: 'إشعياء 7 — نبوة ميلاد عمانوئيل من عذراء' },
      { ch: 40, label: 'إشعياء 40 — "عزّوا عزّوا شعبي"' },
      { ch: 53, label: 'إشعياء 53 — العبد المتألم ونبوة الصليب' },
    ],
    faq: [
      { q: 'ما موضوع سفر إشعياء؟', a: 'يتناول سفر إشعياء نبوات عن دينونة الله وخلاصه، وأبرزها النبوات المسيانية عن المسيح المخلّص، خاصة نبوة العذراء (ص7) والعبد المتألم (ص53).' },
      { q: 'ما هي نبوة إشعياء 53؟', a: 'إشعياء 53 نبوة عن "العبد المتألم" الذي يحمل خطايا كثيرين، ويراها المسيحيون نبوة واضحة عن آلام المسيح وصلبه وفدائه للبشرية.' },
      { q: 'كم عدد إصحاحات سفر إشعياء؟', a: 'يتكون سفر إشعياء من 66 إصحاحاً.' },
    ],
  },
  'أعمال الرسل': {
    title: 'سفر أعمال الرسل كاملاً بالعربية — 28 إصحاحاً | رفيقي',
    description: 'اقرأ سفر أعمال الرسل كاملاً بالعربية: 28 إصحاحاً عن بداية الكنيسة، حلول الروح القدس يوم الخمسين، وكرازة بطرس وبولس. من العهد الجديد مع التفسير.',
    h1: 'سفر أعمال الرسل — بداية الكنيسة',
    chaptersHeading: 'إصحاحات سفر أعمال الرسل',
    schemaName: 'سفر أعمال الرسل',
    chapterLabels: {
      1: 'أعمال 1 — صعود المسيح والوعد بالروح',
      2: 'أعمال 2 — حلول الروح القدس يوم الخمسين',
      9: 'أعمال 9 — اهتداء شاول (بولس)',
    },
    featured: [
      { ch: 2, label: 'أعمال 2 — حلول الروح القدس يوم الخمسين' },
      { ch: 9, label: 'أعمال 9 — اهتداء شاول الطرسوسي (بولس)' },
    ],
    faq: [
      { q: 'من كتب سفر أعمال الرسل؟', a: 'كتب سفر أعمال الرسل البشير لوقا، استكمالاً لإنجيله، ويؤرّخ لبدايات الكنيسة المسيحية وانتشار الإنجيل بعد صعود المسيح.' },
      { q: 'ما موضوع سفر أعمال الرسل؟', a: 'يروي السفر تأسيس الكنيسة بحلول الروح القدس يوم الخمسين، وكرازة الرسل خاصة بطرس وبولس، وانتشار المسيحية من أورشليم إلى روما.' },
      { q: 'كم عدد إصحاحات سفر أعمال الرسل؟', a: 'يتكون سفر أعمال الرسل من 28 إصحاحاً.' },
    ],
  },
  'رومية': {
    title: 'رسالة رومية كاملة بالعربية — 16 إصحاحاً مع التفسير | رفيقي',
    description: 'اقرأ رسالة بولس الرسول إلى أهل رومية كاملة بالعربية: 16 إصحاحاً عن التبرير بالإيمان والخلاص والحياة في الروح. من العهد الجديد مع التفسير.',
    h1: 'رسالة رومية — رسالة بولس الرسول',
    chaptersHeading: 'إصحاحات رسالة رومية',
    schemaName: 'رسالة رومية',
    chapterLabels: {
      3: 'رومية 3 — الجميع أخطأوا',
      5: 'رومية 5 — التبرير بالإيمان والسلام مع الله',
      8: 'رومية 8 — لا شيء يفصلنا عن محبة الله',
      12: 'رومية 12 — تقديم الأجساد ذبيحة حية',
    },
    featured: [
      { ch: 8, label: 'رومية 8 — "لا شيء يفصلنا عن محبة الله"' },
      { ch: 5, label: 'رومية 5 — التبرير بالإيمان والسلام مع الله' },
      { ch: 12, label: 'رومية 12 — تقديم الأجساد ذبيحة حية' },
    ],
    faq: [
      { q: 'من كتب رسالة رومية؟', a: 'كتب رسالة رومية بولس الرسول إلى كنيسة روما، وهي أطول رسائله وأكثرها تنظيماً لاهوتياً حول الخلاص.' },
      { q: 'ما موضوع رسالة رومية؟', a: 'تتناول رسالة رومية جوهر الإنجيل: خطية البشر جميعاً، التبرير بالإيمان بالمسيح، الحياة الجديدة في الروح القدس، ومحبة الله الثابتة.' },
      { q: 'كم عدد إصحاحات رسالة رومية؟', a: 'تتكون رسالة رومية من 16 إصحاحاً.' },
    ],
  },
  'متى': {
    title: 'إنجيل متى كامل بالعربية — 28 إصحاحاً مع التفسير | رفيقي',
    description: 'اقرأ إنجيل متى كاملاً بالعربية: 28 إصحاحاً يشمل الموعظة على الجبل، الصلاة الربانية، والتطويبات. أول أناجيل العهد الجديد مع التفسير بالعربية.',
    h1: 'إنجيل متى — البشير متى',
    chaptersHeading: 'إصحاحات إنجيل متى',
    schemaName: 'إنجيل متى',
    chapterLabels: {
      1: 'متى 1 — ميلاد يسوع المسيح',
      5: 'متى 5 — الموعظة على الجبل والتطويبات',
      6: 'متى 6 — الصلاة الربانية "أبانا الذي في السموات"',
      13: 'متى 13 — أمثال الملكوت',
      28: 'متى 28 — القيامة والإرسالية',
    },
    featured: [
      { ch: 5, label: 'متى 5 — الموعظة على الجبل والتطويبات' },
      { ch: 6, label: 'متى 6 — الصلاة الربانية "أبانا الذي في السموات"' },
      { ch: 13, label: 'متى 13 — أمثال ملكوت السموات' },
      { ch: 28, label: 'متى 28 — قيامة المسيح والإرسالية العظمى' },
    ],
    faq: [
      { q: 'من كتب إنجيل متى؟', a: 'كتب إنجيل متى البشير متى (لاوي العشار)، أحد تلاميذ المسيح الاثني عشر. هو أول أناجيل العهد الجديد.' },
      { q: 'ما هي الموعظة على الجبل؟', a: 'الموعظة على الجبل (متى 5-7) هي أشهر مواعظ المسيح، وتضم التطويبات والصلاة الربانية وتعاليم عن الحياة المسيحية.' },
      { q: 'كم عدد إصحاحات إنجيل متى؟', a: 'يتكون إنجيل متى من 28 إصحاحاً.' },
    ],
  },
  'مرقس': {
    title: 'إنجيل مرقس كامل بالعربية — 16 إصحاحاً مع التفسير | رفيقي',
    description: 'اقرأ إنجيل مرقس كاملاً بالعربية: 16 إصحاحاً، أقصر الأناجيل وأسرعها سرداً لأعمال المسيح ومعجزاته وآلامه وقيامته. من العهد الجديد مع التفسير.',
    h1: 'إنجيل مرقس — البشير مرقس',
    chaptersHeading: 'إصحاحات إنجيل مرقس',
    schemaName: 'إنجيل مرقس',
    chapterLabels: {
      1: 'مرقس 1 — بداية إنجيل يسوع المسيح',
      4: 'مرقس 4 — مثل الزارع وتهدئة العاصفة',
      16: 'مرقس 16 — القيامة والصعود',
    },
    featured: [
      { ch: 1, label: 'مرقس 1 — بداية إنجيل يسوع المسيح' },
      { ch: 4, label: 'مرقس 4 — مثل الزارع وتهدئة العاصفة' },
      { ch: 16, label: 'مرقس 16 — قيامة المسيح وصعوده' },
    ],
    faq: [
      { q: 'من كتب إنجيل مرقس؟', a: 'كتب إنجيل مرقس البشير مرقس الرسول، كاروز الديار المصرية ومؤسس الكنيسة القبطية. هو أقصر الأناجيل الأربعة.' },
      { q: 'بماذا يتميز إنجيل مرقس؟', a: 'إنجيل مرقس هو أقصر الأناجيل وأسرعها سرداً، ويركز على أعمال المسيح ومعجزاته أكثر من تعاليمه المطوّلة.' },
      { q: 'كم عدد إصحاحات إنجيل مرقس؟', a: 'يتكون إنجيل مرقس من 16 إصحاحاً.' },
    ],
  },
  'لوقا': {
    title: 'إنجيل لوقا كامل بالعربية — 24 إصحاحاً مع التفسير | رفيقي',
    description: 'اقرأ إنجيل لوقا كاملاً بالعربية: 24 إصحاحاً يشمل ميلاد المسيح، مثل الابن الضال، والسامري الصالح. إنجيل الرحمة من العهد الجديد مع التفسير.',
    h1: 'إنجيل لوقا — البشير لوقا',
    chaptersHeading: 'إصحاحات إنجيل لوقا',
    schemaName: 'إنجيل لوقا',
    chapterLabels: {
      1: 'لوقا 1 — البشارة بميلاد المسيح',
      2: 'لوقا 2 — ميلاد يسوع في بيت لحم',
      10: 'لوقا 10 — مثل السامري الصالح',
      15: 'لوقا 15 — مثل الابن الضال',
      24: 'لوقا 24 — القيامة وتلميذا عمواس',
    },
    featured: [
      { ch: 2, label: 'لوقا 2 — ميلاد يسوع في بيت لحم' },
      { ch: 10, label: 'لوقا 10 — مثل السامري الصالح' },
      { ch: 15, label: 'لوقا 15 — مثل الابن الضال' },
      { ch: 24, label: 'لوقا 24 — القيامة وتلميذا عمواس' },
    ],
    faq: [
      { q: 'من كتب إنجيل لوقا؟', a: 'كتب إنجيل لوقا البشير لوقا الطبيب، رفيق بولس الرسول. كتب أيضاً سفر أعمال الرسل. يُعرف إنجيله بإنجيل الرحمة.' },
      { q: 'ما أشهر أمثال إنجيل لوقا؟', a: 'ينفرد إنجيل لوقا بأمثال شهيرة مثل الابن الضال، السامري الصالح، والغني ولعازر — تبرز رحمة الله ومحبته للخطاة.' },
      { q: 'كم عدد إصحاحات إنجيل لوقا؟', a: 'يتكون إنجيل لوقا من 24 إصحاحاً.' },
    ],
  },
  'أيوب': {
    title: 'سفر أيوب كاملاً بالعربية — 42 إصحاحاً عن الألم والصبر | رفيقي',
    description: 'اقرأ سفر أيوب كاملاً بالعربية: 42 إصحاحاً عن سر الألم والصبر والثقة بالله رغم المعاناة. من أسفار الحكمة في العهد القديم مع التفسير.',
    h1: 'سفر أيوب — صبر أيوب البار',
    chaptersHeading: 'إصحاحات سفر أيوب',
    schemaName: 'سفر أيوب',
    chapterLabels: {
      1: 'أيوب 1 — تجربة أيوب البار',
      38: 'أيوب 38 — جواب الرب من العاصفة',
      42: 'أيوب 42 — توبة أيوب ورد كرامته',
    },
    featured: [
      { ch: 1, label: 'أيوب 1 — تجربة أيوب وثباته في الإيمان' },
      { ch: 38, label: 'أيوب 38 — جواب الرب من العاصفة' },
      { ch: 42, label: 'أيوب 42 — رد الرب كرامة أيوب' },
    ],
    faq: [
      { q: 'ما موضوع سفر أيوب؟', a: 'يتناول سفر أيوب سر الألم والمعاناة في حياة الإنسان البار، ويُظهر كيف حافظ أيوب على إيمانه وثقته بالله رغم فقدانه كل شيء.' },
      { q: 'من هو أيوب؟', a: 'أيوب رجل بار من أرض عوص، اشتهر بصبره وثباته في الإيمان رغم التجارب الشديدة. سفره من أسفار الحكمة في العهد القديم.' },
      { q: 'كم عدد إصحاحات سفر أيوب؟', a: 'يتكون سفر أيوب من 42 إصحاحاً.' },
    ],
  },
  'يوحنا': {
    title: 'إنجيل يوحنا كامل بالعربية — 21 إصحاحاً مع التفسير | رفيقي',
    description: 'اقرأ إنجيل يوحنا كاملاً بالعربية: 21 إصحاحاً يبدأ بـ"في البدء كان الكلمة". يشمل حديث نيقوديموس، الكرمة الحقيقية، وقيامة لعازر. من العهد الجديد مع التفسير.',
    h1: 'إنجيل يوحنا — البشير يوحنا اللاهوتي',
    chaptersHeading: 'إصحاحات إنجيل يوحنا',
    schemaName: 'إنجيل يوحنا',
    chapterLabels: {
      1: 'يوحنا 1 — في البدء كان الكلمة',
      3: 'يوحنا 3 — حديث المسيح مع نيقوديموس',
      6: 'يوحنا 6 — أنا هو خبز الحياة',
      10: 'يوحنا 10 — أنا هو الراعي الصالح',
      11: 'يوحنا 11 — إقامة لعازر',
      14: 'يوحنا 14 — أنا هو الطريق والحق والحياة',
      15: 'يوحنا 15 — أنا هو الكرمة الحقيقية',
      17: 'يوحنا 17 — الصلاة الشفاعية',
    },
    featured: [
      { ch: 1, label: 'يوحنا 1 — "في البدء كان الكلمة"' },
      { ch: 3, label: 'يوحنا 3 — حديث المسيح مع نيقوديموس (المولد الثاني)' },
      { ch: 14, label: 'يوحنا 14 — "أنا هو الطريق والحق والحياة"' },
      { ch: 15, label: 'يوحنا 15 — "أنا هو الكرمة الحقيقية"' },
      { ch: 17, label: 'يوحنا 17 — الصلاة الشفاعية للمسيح' },
    ],
    faq: [
      { q: 'من كتب إنجيل يوحنا؟', a: 'كتب إنجيل يوحنا البشير يوحنا الحبيب، أحد تلاميذ المسيح الاثني عشر، ويُعرف بيوحنا اللاهوتي. هو الإنجيل الرابع في العهد الجديد.' },
      { q: 'بماذا يتميز إنجيل يوحنا؟', a: 'يتميز إنجيل يوحنا بعمقه اللاهوتي وتركيزه على لاهوت المسيح، ويبدأ بـ"في البدء كان الكلمة". يحوي عبارات "أنا هو" السبع الشهيرة.' },
      { q: 'كم عدد إصحاحات إنجيل يوحنا؟', a: 'يتكون إنجيل يوحنا من 21 إصحاحاً.' },
    ],
  },
  'رؤيا يوحنا': {
    title: 'سفر الرؤيا كاملاً بالعربية — رؤيا يوحنا اللاهوتي | رفيقي',
    description: 'اقرأ سفر الرؤيا (رؤيا يوحنا اللاهوتي) كاملاً بالعربية: 22 إصحاحاً عن نهاية الزمان، الكنائس السبع، الدينونة، وأورشليم الجديدة. آخر أسفار العهد الجديد مع تفسير.',
    h1: 'سفر الرؤيا — رؤيا يوحنا اللاهوتي',
    chaptersHeading: 'إصحاحات سفر الرؤيا',
    schemaName: 'سفر الرؤيا',
    chapterLabels: {
      1: 'الرؤيا 1 — رؤيا ابن الإنسان',
      2: 'الرؤيا 2 — رسائل الكنائس السبع',
      3: 'الرؤيا 3 — رسائل ساردس وفيلادلفيا ولاودكية',
      4: 'الرؤيا 4 — العرش في السماء',
      12: 'الرؤيا 12 — المرأة والتنين',
      20: 'الرؤيا 20 — الملك الألفي والدينونة',
      21: 'الرؤيا 21 — أورشليم الجديدة',
      22: 'الرؤيا 22 — نهر ماء الحياة',
    },
    featured: [
      { ch: 1, label: 'الرؤيا 1 — رؤيا ابن الإنسان بين المنائر' },
      { ch: 2, label: 'الرؤيا 2 — رسائل الكنائس السبع' },
      { ch: 12, label: 'الرؤيا 12 — المرأة المتسربلة بالشمس والتنين' },
      { ch: 21, label: 'الرؤيا 21 — السماء الجديدة وأورشليم الجديدة' },
      { ch: 22, label: 'الرؤيا 22 — "أنا آتي سريعاً"' },
    ],
    faq: [
      { q: 'من كتب سفر الرؤيا؟', a: 'كتب سفر الرؤيا يوحنا الرسول (يوحنا اللاهوتي) في جزيرة بطمس نحو نهاية القرن الأول الميلادي، وهو آخر أسفار العهد الجديد والكتاب المقدس.' },
      { q: 'ما موضوع سفر الرؤيا؟', a: 'يتناول سفر الرؤيا الأحداث الأخيرة ونهاية الزمان: رسائل الكنائس السبع، الدينونة، انتصار المسيح على الشر، وأورشليم الجديدة (السماء الجديدة والأرض الجديدة).' },
      { q: 'كم عدد إصحاحات سفر الرؤيا؟', a: 'يتكون سفر الرؤيا من 22 إصحاحاً.' },
    ],
  },
};

interface HourSeoOverride {
  title: string;       // ≤70 chars
  description: string; // ≤160 chars
  faq: { q: string; a: string }[];
}

const HOUR_SEO_OVERRIDES: Record<string, HourSeoOverride> = {
  prime: {
    title: 'صلاة باكر من الأجبية القبطية | قيامة المسيح ونور النهار',
    description: 'صلاة باكر: أولى ساعات الأجبية القبطية. تُذكّر بقيامة المسيح في الصباح الباكر. مزامير: 1، 2، 3، 4، 5. إنجيل: يوحنا 1: 1-17.',
    faq: [
      { q: 'ما هي صلاة باكر في الأجبية القبطية؟', a: 'صلاة باكر هي أولى الساعات السبع في الأجبية القبطية، تُقام عند الفجر وتُذكّر بقيامة السيد المسيح في الصباح الباكر ونور اليوم الجديد.' },
      { q: 'ما هي مزامير صلاة باكر؟', a: 'تشمل صلاة باكر مزامير: 1، 2، 3، 4، 5، 6، 8، 11، 12، 14، 15، 18، 24، 26، 62، 66، 69، 112، 142، مع إنجيل يوحنا 1: 1-17.' },
    ],
  },
  terce: {
    title: 'صلاة الساعة الثالثة — حلول الروح القدس | الأجبية القبطية',
    description: 'صلاة الساعة الثالثة من الأجبية القبطية تُحيي ذكرى حلول الروح القدس على الرسل يوم الخمسين. مزامير: 19، 22، 23. إنجيل: يوحنا 14.',
    faq: [
      { q: 'ما هي صلاة الساعة الثالثة في الأجبية القبطية؟', a: 'صلاة الساعة الثالثة هي إحدى ساعات الأجبية السبع، تُقام في الساعة التاسعة صباحاً، وتُحيي ذكرى حلول الروح القدس على الرسل يوم الخمسين المقدس.' },
      { q: 'ما هي مزامير صلاة الساعة الثالثة؟', a: 'تشمل صلاة الساعة الثالثة مزامير: 19، 22، 23، 25، 28، 29، 33، 40، 42، 44، 45، 46، مع إنجيل يوحنا 14: 26-15: 3.' },
      { q: 'لماذا تُقام صلاة الساعة الثالثة؟', a: 'تُقام صلاة الساعة الثالثة إحياءً لذكرى نزول الروح القدس على الرسل في غرفة العلّية يوم الخمسين، وهي الساعة التي سار فيها المسيح أيضاً نحو القلجثة.' },
    ],
  },
  sext: {
    title: 'صلاة الساعة السادسة — صلب المسيح وفداء العالم | الأجبية',
    description: 'صلاة الساعة السادسة من الأجبية القبطية تُذكّر بصلب المسيح وظلمة نصف النهار. مزامير: 53، 56، 60. إنجيل: متى 5.',
    faq: [
      { q: 'ما هي صلاة الساعة السادسة في الأجبية القبطية؟', a: 'صلاة الساعة السادسة تُقام عند الظهيرة وتُذكّر بصلب السيد المسيح في الساعة السادسة وظلمة نصف النهار التي خيّمت على الأرض ثلاث ساعات.' },
      { q: 'ما هي مزامير صلاة الساعة السادسة؟', a: 'تشمل مزامير: 53، 56، 60، 62، 66، 69، 83، 84، 85، 86، 90، 92، مع إنجيل متى 5: 1-16.' },
    ],
  },
  none: {
    title: 'صلاة الساعة التاسعة — وفاة المسيح وتسليم الروح | الأجبية',
    description: 'صلاة الساعة التاسعة من الأجبية القبطية تُحيي ذكرى وفاة المسيح وتسليمه الروح للآب. مزامير: 95، 96، 97. إنجيل: لوقا 9.',
    faq: [
      { q: 'ما هي صلاة الساعة التاسعة في الأجبية القبطية؟', a: 'صلاة الساعة التاسعة تُقام في الساعة الثالثة مساءً وتُحيي ذكرى وفاة السيد المسيح على الصليب وتسليمه الروح للآب الحي.' },
      { q: 'ما هي مزامير صلاة الساعة التاسعة؟', a: 'تشمل مزامير: 95، 96، 97، 98، 99، 100، 109، 110، 111، 112، 114، 115، مع إنجيل لوقا 9: 10-17.' },
    ],
  },
  vespers: {
    title: 'صلاة الغروب من الأجبية القبطية | شكر الله على نعم اليوم',
    description: 'صلاة الغروب من الأجبية القبطية تُذكّر بنزول المسيح من الصليب ودفنه وتشكر الله على نعم اليوم. مزامير: 116، 117. إنجيل: لوقا 4.',
    faq: [
      { q: 'ما هي صلاة الغروب في الأجبية القبطية؟', a: 'صلاة الغروب تُقام عند غروب الشمس وتُذكّر بنزول السيد المسيح من الصليب ودفنه، كما تشكر الله على نعم اليوم الذي انقضى.' },
      { q: 'ما هي مزامير صلاة الغروب؟', a: 'تشمل مزامير: 116، 117، 119، 120، 121، 122، 123، 124، 125، 126، 127، 128، مع إنجيل لوقا 4: 38-41.' },
    ],
  },
  compline: {
    title: 'صلاة النوم من الأجبية القبطية | توديع اليوم وتسليم النفس',
    description: 'صلاة النوم من الأجبية القبطية نختم بها يومنا ونسلّم أنفسنا لله. النوم صورة للموت. مزامير: 129، 130، 131. إنجيل: لوقا 2: 25-32.',
    faq: [
      { q: 'ما هي صلاة النوم في الأجبية القبطية؟', a: 'صلاة النوم تُقام قبل النوم لتوديع اليوم وتسليم النفس لله. النوم في المفهوم القبطي صورة للموت، فيُودَّع فيها اليوم بالحمد والشكر والتوبة.' },
      { q: 'ما هي مزامير صلاة النوم؟', a: 'تشمل مزامير: 129، 130، 131، 132، 133، 136، 137، 140، 141، 145، 146، 147، مع إنجيل لوقا 2: 25-32.' },
    ],
  },
  midnight: {
    title: 'صلاة نصف الليل من الأجبية القبطية | انتظار مجيء العريس',
    description: 'صلاة نصف الليل من الأجبية القبطية تُذكّر بمجيء العريس وانتظار قيامة المسيح. مزامير: 3، 6، 12. إنجيل: متى 25: 1-13.',
    faq: [
      { q: 'ما هي صلاة نصف الليل في الأجبية القبطية؟', a: 'صلاة نصف الليل تُقام في منتصف الليل وتُذكّر بمجيء العريس في نصف الليل وانتظار قيامة المسيح المجيدة. يقوم لها القديسون ورهبان الكنيسة القبطية منذ القدم.' },
      { q: 'ما هي مزامير صلاة نصف الليل؟', a: 'تشمل مزامير: 3، 6، 12، 69، 85، 90، 116، 117، 118، مع إنجيل متى 25: 1-13 (مثل العذارى العشر).' },
    ],
  },
};

function buildBookSnapshot(bookName: string, chaptersCount: number, allBooks: Array<{ name: string; chaptersCount: number }>): string {
  const ov = BOOK_SEO_OVERRIDES[bookName];
  const title = ov ? ov.title : generateBibleBookTitle(bookName, chaptersCount);
  const description = ov ? ov.description : `تفسير ${bookName} كامل مع مقدمة عن السفر، قراءة مباشرة، واستماع صوتي لكل إصحاح. يحتوي على ${chaptersCount} إصحاح.`;
  const canonical = `${SITE}/bible/${encodeURIComponent(bookName)}`;

  const chapterLinks = [];
  for (let ch = 1; ch <= chaptersCount; ch++) {
    const label = ov?.chapterLabels?.[ch] || `تفسير ${bookName} الإصحاح ${ch}`;
    chapterLinks.push(`<li><a href="/bible/${encodeURIComponent(bookName)}/${ch}">${esc(label)}</a></li>`);
  }

  const adjacentLinks: string[] = [];
  const bookIdx = allBooks.findIndex(b => b.name === bookName);
  if (bookIdx > 0)
    adjacentLinks.push(`<a href="/bible/${encodeURIComponent(allBooks[bookIdx - 1].name)}">تفسير ${esc(allBooks[bookIdx - 1].name)} كامل</a>`);
  if (bookIdx < allBooks.length - 1)
    adjacentLinks.push(`<a href="/bible/${encodeURIComponent(allBooks[bookIdx + 1].name)}">تفسير ${esc(allBooks[bookIdx + 1].name)} كامل</a>`);

  const schemaArr: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "Book",
      "name": ov?.schemaName || bookName,
      "inLanguage": "ar",
      "about": "الكتاب المقدس",
      "numberOfPages": chaptersCount,
      "url": canonical,
      "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": SITE },
        { "@type": "ListItem", "position": 2, "name": "الكتاب المقدس", "item": `${SITE}/bible` },
        { "@type": "ListItem", "position": 3, "name": bookName, "item": canonical }
      ]
    }
  ];
  if (ov?.faq) {
    const faqSchema = buildFaqSchema(ov.faq);
    if (faqSchema) schemaArr.push(faqSchema);
  }

  const featuredHtml = ov?.featured ? `
<section>
<h2>أشهر الإصحاحات</h2>
<ul>
${ov.featured.map(f => `<li><a href="/bible/${encodeURIComponent(bookName)}/${f.ch}">${esc(f.label)}</a></li>`).join('\n')}
</ul>
</section>` : '';

  const body = `<h1>${ov ? esc(ov.h1) : `تفسير ${esc(bookName)} كامل`}</h1>
<section>
<p><em>${esc(description)}</em></p>
</section>
${featuredHtml}
<nav>
<h2>${ov ? esc(ov.chaptersHeading) : 'الإصحاحات'}</h2>
<ul>${chapterLinks.join("\n")}</ul>
</nav>
${adjacentLinks.length > 0 ? `<nav><h2>أسفار ذات صلة</h2><ul>${adjacentLinks.map(l => `<li>${l}</li>`).join("")}</ul></nav>` : ""}`;

  return wrapHtml(title, description, canonical, body, schemaArr, buildBookOgUrl(bookName, chaptersCount));
}

function buildStaticPageSnapshot(path: string, noindex?: boolean): string | null {
  const pages: Record<string, { title: string; desc: string; schema: object | object[] }> = {
    "/": {
      title: "الكتاب المقدس رفيقي | قراءة يومية، تفسير، خطط روحية",
      desc: "موقع الكتاب المقدس العربي للقراءة اليومية مع التفسير، خطط القراءة، آيات حسب المشاعر، وقسم قصص الأطفال. رفيقك الروحي اليومي.",
      schema: [
        { "@context": "https://schema.org", "@type": "WebApplication", "name": "الكتاب المقدس رفيقي", "alternateName": "Coptic Arabic Bible — Rafiki", "applicationCategory": "ReligiousApplication", "operatingSystem": "Web", "inLanguage": "ar", "url": SITE },
        { "@context": "https://schema.org", "@type": "WebSite", "name": "الكتاب المقدس رفيقي", "alternateName": "Coptic Arabic Bible", "url": SITE, "potentialAction": { "@type": "SearchAction", "target": { "@type": "EntryPoint", "urlTemplate": `${SITE}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" } }
      ]
    },
    "/bible": {
      title: "الكتاب المقدس كاملاً بالعربية | العهد القديم والجديد مع التفسير",
      desc: "اقرأ الكتاب المقدس كاملاً باللغة العربية مع تفسير لكل آية. 66 سفراً من العهد القديم والجديد.",
      schema: [
        { "@context": "https://schema.org", "@type": "Book", "name": "الكتاب المقدس", "alternateName": "Coptic Bible (Arabic)", "inLanguage": "ar", "bookFormat": "https://schema.org/EBook", "numberOfPages": 1189, "genre": "Religious text", "author": { "@type": "Organization", "name": "الكنيسة القبطية الأرثوذكسية" }, "publisher": { "@type": "Organization", "name": "رفيقي", "url": "https://mybible.oscardevs.com" } },
        buildFaqSchema([
          { q: "كم عدد أسفار الكتاب المقدس؟", a: "يتكون الكتاب المقدس من 66 سفراً: 39 سفراً في العهد القديم و27 سفراً في العهد الجديد. تضيف الكنيسة القبطية الأرثوذكسية 7 أسفار ديوتيروكانونية." },
          { q: "ما هي الترجمة العربية المعتمدة للكتاب المقدس؟", a: "تعتمد الكنيسة القبطية الأرثوذكسية الترجمة العربية الكاثوليكية المشتركة وكذلك ترجمة فانديك الكلاسيكية." },
          { q: "كيف أقرأ الكتاب المقدس يومياً؟", a: "يمكنك متابعة خطط القراءة اليومية على منصة رفيقي: 30، 60، 90، 180، أو 365 يوماً لقراءة الكتاب المقدس كاملاً." },
          { q: "ما الفرق بين العهد القديم والجديد؟", a: "العهد القديم يتناول تاريخ شعب إسرائيل والنبوءات، أما العهد الجديد فيتحدث عن حياة يسوع المسيح وتعاليمه ورسائل الرسل." }
        ])
      ]
    },
    "/plans": {
      title: "خطط قراءة الكتاب المقدس | من 30 يوم إلى سنة كاملة",
      desc: "خطط قراءة منظمة للكتاب المقدس: 30، 60، 90، 180، و365 يوم. ابدأ رحلتك الروحية اليوم واقرأ الكتاب المقدس كاملاً.",
      schema: [
        { "@context": "https://schema.org", "@type": "HowTo", "name": "كيف تقرأ الكتاب المقدس كاملاً", "inLanguage": "ar",
          "step": [
            { "@type": "HowToStep", "name": "اختر خطة قراءة", "text": "حدد المدة الزمنية المناسبة: 30 أو 60 أو 90 أو 180 أو 365 يوم" },
            { "@type": "HowToStep", "name": "اقرأ يومياً", "text": "التزم بقراءة الإصحاحات المقررة يومياً وفق الخطة التي اخترتها" },
            { "@type": "HowToStep", "name": "تابع تقدمك", "text": "تتبع تقدمك في القراءة وشاهد نسبة اكتمالك للكتاب المقدس" }
          ]
        },
        buildFaqSchema([
          { q: "كم يستغرق قراءة الكتاب المقدس كاملاً؟", a: "يمكن قراءة الكتاب المقدس كاملاً في سنة إذا قرأت 3-4 إصحاحات يومياً. منصة رفيقي توفر خططاً من 30 يوم حتى 365 يوم (سنة كاملة) حسب سرعتك." },
          { q: "من أين أبدأ قراءة الكتاب المقدس؟", a: "يُنصح المبتدئون بالبدء بإنجيل يوحنا، ثم العهد الجديد كاملاً، ثم العودة للعهد القديم. أو يمكن البدء من سفر التكوين بالترتيب." }
        ])
      ]
    },
    "/emotions": {
      title: "آيات حسب المشاعر | التغذية الروحية | الكتاب المقدس رفيقي",
      desc: "اعثر على آيات الكتاب المقدس المناسبة لمشاعرك: الفرح، الحزن، القلق، الخوف، الأمل، والمزيد.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "التغذية الروحية من الكتاب المقدس", "description": "آيات الكتاب المقدس مصنفة حسب المشاعر والاحتياجات الروحية", "inLanguage": "ar", "url": `${SITE}/emotions`, "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE } }
    },
    "/kids": {
      title: "قصص الكتاب المقدس للأطفال | فيديوهات وقصص مسيحية",
      desc: "قصص الكتاب المقدس المصورة للأطفال مع فيديوهات تعليمية. محتوى آمن ومناسب للأعمار الصغيرة.",
      schema: { "@context": "https://schema.org", "@type": "CollectionPage", "name": "قصص الكتاب المقدس للأطفال", "inLanguage": "ar" }
    },
    "/kids/hymns": {
      title: "ترانيم الأطفال المسيحية | أكبر مكتبة ترانيم قبطية للأطفال | رفيقي",
      desc: `أكبر مكتبة ترانيم أطفال مسيحية قبطية بالعربية — ${kidsHymnsPlaylist.length} ترنيمة من TaranemToon والحياة الأفضل وكوجي TV. ترانيم تسبيح، ترانيم العذراء، ترانيم النيروز، ترانيم القيامة.`,
      schema: {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "ترانيم الأطفال المسيحية القبطية",
        "description": `مكتبة ${kidsHymnsPlaylist.length} ترنيمة أطفال مسيحية بالعربية`,
        "inLanguage": "ar",
        "numberOfItems": kidsHymnsPlaylist.length,
        "itemListElement": kidsHymnsPlaylist.slice(0, 50).map((h, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "item": {
            "@type": "VideoObject",
            "name": h.title,
            "description": h.keywords.join(", "),
            "thumbnailUrl": `https://img.youtube.com/vi/${h.youtubeId}/hqdefault.jpg`,
            "embedUrl": `https://www.youtube.com/embed/${h.youtubeId}`,
            "url": `${SITE}/video/${h.youtubeId}`,
            "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
          }
        }))
      }
    },
    "/kids/videos": {
      title: "قصص الكتاب المقدس للأطفال بالفيديو | العهد القديم والجديد | رفيقي",
      desc: "قصص العهدين القديم والجديد بالفيديو للأطفال — آدم وحواء، نوح، يوسف، داود وجليات، ميلاد يسوع، القيامة. فيديوهات كارتون تعليمية آمنة للأطفال المسيحيين.",
      schema: {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "قصص الكتاب المقدس للأطفال بالفيديو",
        "description": "قصص الكتاب المقدس بالفيديو للأطفال من العهدين القديم والجديد",
        "inLanguage": "ar",
        "numberOfItems": kidsBibleVideos.filter(v => v.category !== "ترانيم للأطفال").length,
        "itemListElement": kidsBibleVideos.filter(v => v.category !== "ترانيم للأطفال").slice(0, 40).map((v, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "item": {
            "@type": "VideoObject",
            "name": v.title,
            "description": `${v.category} — ${v.keywords.join(", ")}`,
            "thumbnailUrl": `https://img.youtube.com/vi/${v.youtubeId}/hqdefault.jpg`,
            "embedUrl": `https://www.youtube.com/embed/${v.youtubeId}`,
            "url": `${SITE}/video/${v.youtubeId}`,
            "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
          }
        }))
      }
    },
    "/kids/stories": {
      title: "قصص مصورة للأطفال من الكتاب المقدس | رفيقي",
      desc: "قصص مصورة تفاعلية من الكتاب المقدس للأطفال مع صور ملونة وصوت — قصة موسى، يوسف، داود، يونان، ميلاد يسوع وغيرها.",
      schema: { "@context": "https://schema.org", "@type": "CollectionPage", "name": "قصص مصورة للأطفال من الكتاب المقدس", "description": "قصص مصورة تفاعلية من الكتاب المقدس للأطفال", "inLanguage": "ar", "url": `${SITE}/kids/stories` }
    },
    "/family": {
      title: "ركن العائلة المسيحية | تربية روحية، مشورة، صلوات عائلية | رفيقي",
      desc: "ركن العائلة المسيحية في رفيقي: تربية الأطفال على القيم المسيحية، صلوات عائلية يومية، مشورة كنسية للوالدين، فيديوهات تعليمية للآباء والأمهات، ونصائح لبناء بيت مسيحي مقدّس.",
      schema: [
        { "@context": "https://schema.org", "@type": "CollectionPage", "name": "ركن العائلة المسيحية", "inLanguage": "ar", "url": `${SITE}/family`,
          "about": { "@type": "Thing", "name": "التربية المسيحية للعائلة" } },
        buildFaqSchema([
          { q: "كيف أربي أطفالي روحياً في البيت المسيحي؟", a: "ابدأ بالصلاة العائلية اليومية، اقرأ معهم قصص الكتاب المقدس بأسلوب مبسط، اصطحبهم للقداس وألحان الكنيسة، وكن قدوة في حياتك الروحية. ركن العائلة في رفيقي يوفر مواد منظمة لكل عمر." },
          { q: "ما هي الصلوات العائلية المناسبة؟", a: "صلاة الصباح والمساء من الأجبية مبسطة، صلاة الطعام، صلاة قبل النوم، وقراءة فصل من إنجيل يوحنا أو المزامير معاً." }
        ])
      ]
    },
    "/service": {
      title: "قسم الخدمة | إعداد العظات ودروس مدارس الأحد بالذكاء الاصطناعي | رفيقي",
      desc: "أداة متكاملة للآباء الكهنة وخدام مدارس الأحد: بحث موضوعي ذكي في آيات الكتاب المقدس، تفاسير آبائية، ومولِّد هيكل عظة أو درس مدرسة أحد بالذكاء الاصطناعي مع مساحة عمل لتجميع المسودة.",
      schema: [
        { "@context": "https://schema.org", "@type": "WebApplication", "name": "قسم الخدمة — رفيقي", "applicationCategory": "ReligiousApplication", "operatingSystem": "Web", "inLanguage": "ar", "url": `${SITE}/service` },
        buildFaqSchema([
          { q: "كيف يساعدني قسم الخدمة في إعداد عظة الأحد؟", a: "اختر تبويب 'للكهنة'، أدخل موضوع العظة والجمهور المستهدف، يقترح لك الذكاء الاصطناعي هيكلاً متكاملاً (مقدمة، نقاط، تطبيق، خاتمة). ثم ابحث عن آيات الموضوع، أضفها للمسودة، واطلع على تفاسير الآباء قبل الطباعة." },
          { q: "هل يصلح لخدام مدارس الأحد؟", a: "نعم، تبويب 'للخدام' مُعد خصيصاً لإعداد درس مدرسة الأحد: مقدمة، نقاط مبسطة للأطفال، نشاط تطبيقي، وصلاة ختامية." },
          { q: "هل المحتوى المُولَّد بديل عن الإرشاد الكنسي؟", a: "لا، المحتوى مساعد للتحضير فقط وليس بديلاً عن الإرشاد الكنسي والدراسة اللاهوتية المعمّقة." }
        ])
      ]
    },
    "/highlights": {
      title: "آياتي المظللة | حفظ وتنظيم آيات الكتاب المقدس المفضلة | رفيقي",
      desc: "احفظ آياتك المفضلة من الكتاب المقدس بألوان تظليل مختلفة، نظّمها حسب الموضوع، وراجعها متى أردت. مكتبتك الشخصية من كلمة الله.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "آياتي المظللة", "inLanguage": "ar" }
    },
    "/search": {
      title: "البحث في الكتاب المقدس | بحث ذكي في أكثر من 31,000 آية",
      desc: "ابحث في نصوص الكتاب المقدس كاملة. بحث ذكي في أكثر من 31,000 آية باللغة العربية.",
      schema: [
        { "@context": "https://schema.org", "@type": "WebPage", "name": "البحث في الكتاب المقدس", "inLanguage": "ar" },
        { "@context": "https://schema.org", "@type": "WebSite", "name": "الكتاب المقدس رفيقي", "url": SITE,
          "potentialAction": { "@type": "SearchAction", "target": { "@type": "EntryPoint", "urlTemplate": `${SITE}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" }
        }
      ]
    },
    "/about": {
      title: "عن الموقع | الكتاب المقدس رفيقي",
      desc: "تعرف على موقع الكتاب المقدس رفيقي - رفيقك الروحي اليومي للقراءة والتأمل في كلمة الله.",
      schema: { "@context": "https://schema.org", "@type": "AboutPage", "name": "عن الكتاب المقدس رفيقي", "inLanguage": "ar" }
    },
    "/contact": {
      title: "اتصل بنا | الكتاب المقدس رفيقي",
      desc: "تواصل معنا عبر البريد الإلكتروني Contact@oscardevs.com أو من خلال نموذج الاتصال.",
      schema: { "@context": "https://schema.org", "@type": "ContactPage", "name": "اتصل بنا", "inLanguage": "ar" }
    },
    "/privacy": {
      title: "سياسة الخصوصية | الكتاب المقدس رفيقي",
      desc: "سياسة الخصوصية لموقع الكتاب المقدس رفيقي. تعرّف على كيفية حماية بياناتك.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "سياسة الخصوصية", "inLanguage": "ar" }
    },
    "/orthodox": {
      title: "أرثوذوكسيات | أجبية وسنكسار وخولاجي وألحان قبطية",
      desc: "سنكسار اليوم، كتاب الأجبية، الخولاجي المقدس، ألحان قبطية، القطمارس، مردات الشماس، وسير القديسين والشهداء الأقباط.",
      schema: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "أرثوذوكسيات — الكتاب المقدس رفيقي",
        "description": "سنكسار اليوم، كتاب الأجبية، الخولاجي المقدس، كتب الألحان القبطية والإبصلمودية، القطمارس، مردات الشماس، وسير القديسين والشهداء الأقباط الأرثوذكس.",
        "inLanguage": "ar",
        "about": { "@type": "Thing", "name": "الكنيسة القبطية الأرثوذكسية" },
        "keywords": "الأجبية القبطية، خولاجي مقدس، قداس باسيليوس، قداس غريغوريوس، قداس كيرلس، الإبصلمودية، تسبحة قبطية، القطمارس، مردات الشماس، كيرياليسون، سير القديسين الأقباط، شهداء ليبيا",
        "url": "https://mybible.oscardevs.com/orthodox"
      }
    },
    "/orthodox/kholagy": {
      title: "الخولاجي المقدس | قداس باسيليوس وغريغوريوس وكيرلس | أرثوذوكسيات",
      desc: "اقرأ نصوص القداسات القبطية الأرثوذكسية الثلاثة: قداس القديس باسيليوس وغريغوريوس وكيرلس بالعربية والقبطية.",
      schema: [
        { "@context": "https://schema.org", "@type": "CollectionPage", "name": "الخولاجي المقدس", "inLanguage": "ar", "url": `${SITE}/orthodox/kholagy` },
        buildFaqSchema([
          { q: "ما هو الخولاجي المقدس؟", a: "الخولاجي المقدس هو كتاب القداسات الليتورجية في الكنيسة القبطية الأرثوذكسية، ويتضمن نصوص ثلاث قداسات: قداس القديس باسيليوس الكبير، وقداس القديس غريغوريوس اللاهوتي، وقداس القديس كيرلس." },
          { q: "كم عدد القداسات في الكنيسة القبطية الأرثوذكسية؟", a: "تحتفل الكنيسة القبطية الأرثوذكسية بثلاث قداسات: قداس القديس باسيليوس (الأكثر استخداماً)، قداس القديس غريغوريوس (في الأعياد الكبرى)، وقداس القديس كيرلس (قداس مارك)." },
          { q: "ما الفرق بين قداس باسيليوس وقداس غريغوريوس؟", a: "قداس باسيليوس هو القداس الاعتيادي ويُقام أسبوعياً. أما قداس غريغوريوس فيُقام في الأعياد الكبرى كالميلاد والقيامة وله طابع احتفالي وصلواته أكثر تفصيلاً." },
          { q: "هل يمكن قراءة الخولاجي بالعربية والقبطية معاً؟", a: "نعم، منصة رفيقي تعرض نصوص الخولاجي بالعربية والقبطية جنباً إلى جنب في نظام عرض ثنائي اللغة مخصص لقداسات الكنيسة." }
        ])
      ]
    },
    "/orthodox/deacon": {
      title: "مردات الشماس | كيرياليسون، مرد الاعتراف، مردات القداس | أرثوذوكسيات",
      desc: "مردات الشماس الكاملة في الكنيسة القبطية الأرثوذكسية: كيرياليسون، مرد الاعتراف، مردات رفع البخور، ومردات القداس الإلهي بالعربي والقبطي.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "مردات الشماس القبطية", "inLanguage": "ar" }
    },
    "/orthodox/hymns": {
      title: "الألحان القبطية والإبصلمودية | تسبحة قبطية كاملة | أرثوذوكسيات",
      desc: "كتب الألحان القبطية والإبصلمودية الكاملة: ألحان القداس، ألحان الأسبوع، تسبحة نصف الليل، إبصلمودية كيهك، وألحان الأعياد القبطية الكبرى.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "الألحان القبطية والإبصلمودية", "inLanguage": "ar" }
    },
    "/orthodox/katameros": {
      title: "القطمارس | القراءات الليتورجية اليومية | أرثوذوكسيات قبطية",
      desc: "القطمارس القبطي الكامل: القراءات الليتورجية اليومية للقداس، البولس، الكاثوليكون، الإبركسيس، المزامير، والإنجيل لكل أيام السنة القبطية.",
      schema: [
        { "@context": "https://schema.org", "@type": "WebPage", "name": "القطمارس القبطي", "inLanguage": "ar" },
        buildFaqSchema([
          { q: "ما هو القطمارس؟", a: "القطمارس (أو الكتاب المقدس المرتَّب) هو الكتاب الليتورجي القبطي الذي يحتوي على القراءات اليومية المقررة للقداس الإلهي: رسالة بولس، الكاثوليكون، الإبركسيس، المزامير، والإنجيل لكل يوم في السنة القبطية." },
          { q: "كيف يختلف القطمارس عن الكتاب المقدس العادي؟", a: "القطمارس يرتب نفس نصوص الكتاب المقدس وفق التقويم القبطي الليتورجي، حيث تُقرأ أجزاء محددة في أيام وأعياد بعينها طوال السنة." }
        ])
      ]
    },
    "/orthodox/saints": {
      title: "سير القديسين والشهداء الأقباط | فيديوهات وقصص | أرثوذوكسيات",
      desc: "سير القديسين والشهداء الأقباط الأرثوذكس: قصص الآباء الرسوليين، الشهداء، النساك، البطاركة، الرهبان والقديسين العظام في الكنيسة القبطية.",
      schema: { "@context": "https://schema.org", "@type": "CollectionPage", "name": "سير القديسين الأقباط", "inLanguage": "ar" }
    },
    "/orthodox/creed": {
      title: "العقيدة القبطية الأرثوذكسية | قانون الإيمان النيقاوي | أرثوذوكسيات",
      desc: "العقيدة القبطية الأرثوذكسية الكاملة: قانون الإيمان النيقاوي، الأسرار السبعة، التعاليم اللاهوتية الجوهرية للكنيسة القبطية الأرثوذكسية.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "العقيدة القبطية الأرثوذكسية", "inLanguage": "ar" }
    },
    "/orthodox/history": {
      title: "تاريخ الكنيسة القبطية | البطاركة والمجامع المسكونية",
      desc: "تاريخ الكنيسة القبطية الأرثوذكسية: قائمة البطاركة، المجامع المسكونية الثلاثة الأولى، تأسيس الكرازة المرقسية، وأهم محطات تاريخ الأقباط.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "تاريخ الكنيسة القبطية", "inLanguage": "ar" }
    },
    "/orthodox/books": {
      title: "كتب الآباء القبطية الأرثوذكسية | مكتبة لاهوتية | أرثوذوكسيات",
      desc: "مكتبة الكتب القبطية الأرثوذكسية: كتب الآباء، كتب اللاهوت، كتب الروحانيات، كتب البابا شنوده الثالث وكبار آباء الكنيسة القبطية.",
      schema: { "@context": "https://schema.org", "@type": "CollectionPage", "name": "مكتبة الكتب القبطية", "inLanguage": "ar" }
    },
    "/orthodox/qa": {
      title: "أسئلة وأجوبة لاهوتية قبطية | أرثوذوكسيات",
      desc: "أسئلة وأجوبة لاهوتية شاملة في العقيدة القبطية الأرثوذكسية، الإيمان، الطقوس، الأسرار، والحياة الروحية المسيحية.",
      schema: { "@context": "https://schema.org", "@type": "FAQPage", "name": "أسئلة وأجوبة لاهوتية قبطية", "inLanguage": "ar" }
    },
    "/orthodox/figures": {
      title: "شخصيات الكنيسة القبطية الأرثوذكسية | آباء وقديسون | أرثوذوكسيات",
      desc: "شخصيات الكنيسة القبطية الأرثوذكسية: البطاركة، الأساقفة، الآباء، الرهبان، ورجال الفكر القبطي عبر العصور.",
      schema: { "@context": "https://schema.org", "@type": "CollectionPage", "name": "شخصيات الكنيسة القبطية", "inLanguage": "ar" }
    },
    "/orthodox/apocrypha": {
      title: "الأسفار القانونية الثانية (الإبوكريفا) | أرثوذوكسيات قبطية",
      desc: "الأسفار القانونية الثانية المعتمدة في الكنيسة القبطية الأرثوذكسية: طوبيا، يهوديت، الحكمة، يشوع بن سيراخ، باروخ، المكابيين وغيرها.",
      schema: { "@context": "https://schema.org", "@type": "CollectionPage", "name": "الأسفار القانونية الثانية", "inLanguage": "ar" }
    },
    "/orthodox/tafseer": {
      title: "تفاسير الآباء الأقباط | تفسير آبائي للكتاب المقدس | أرثوذوكسيات",
      desc: "تفاسير الآباء الأقباط للكتاب المقدس: تفسير القديس يوحنا ذهبي الفم، أوريجانوس، كيرلس الإسكندري، أثناسيوس، وأنبا شنوده الثالث.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "تفاسير الآباء الأقباط", "inLanguage": "ar" }
    },
    "/orthodox/maps": {
      title: "خرائط الكتاب المقدس | جغرافيا الأرض المقدسة | أرثوذوكسيات",
      desc: "خرائط الكتاب المقدس التفاعلية: مواقع الأحداث في العهد القديم والجديد، رحلات الآباء، وأسفار الرسول بولس، وجغرافيا الأرض المقدسة.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "خرائط الكتاب المقدس", "inLanguage": "ar" }
    },
    "/orthodox/pope-qa": {
      title: "أسئلة وأجوبة قداسة البابا شنودة الثالث | أرثوذوكسيات",
      desc: "مجموعة شاملة من أسئلة وأجوبة قداسة البابا شنودة الثالث في العقيدة، الإيمان، الحياة الروحية، الزواج، والقضايا اللاهوتية المعاصرة.",
      schema: { "@context": "https://schema.org", "@type": "FAQPage", "name": "أسئلة البابا شنودة الثالث", "inLanguage": "ar" }
    },
    "/sitemap": {
      title: "خريطة الموقع | الكتاب المقدس رفيقي",
      desc: "خريطة كاملة لجميع صفحات رفيقي: الكتاب المقدس، الخولاجي، الأجبية، السنكسار، القطمارس، الألحان القبطية، وأكثر.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "خريطة الموقع", "inLanguage": "ar" }
    },
    "/terms": {
      title: "شروط وأحكام الاستخدام | رفيقي",
      desc: "اقرأ شروط وأحكام استخدام منصة رفيقي للكتاب المقدس، وسياسة الخصوصية والحقوق والمسؤوليات.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "شروط الاستخدام", "inLanguage": "ar" }
    },
    "/premium": {
      title: "اشتراك بريميوم | رفيقي - الكتاب المقدس",
      desc: "احصل على ميزات متقدمة: تحليل المشاعر، البحث الذكي بالمعنى، اقتراحات آيات مخصصة، وروابط عظات يوتيوب — اشترك الآن.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "اشتراك بريميوم رفيقي", "inLanguage": "ar" }
    },
    "/church": {
      title: "الكنائس القبطية الأرثوذكسية | رفيقي",
      desc: "دليل الكنائس القبطية الأرثوذكسية — ابحث عن كنيستك، تواصل مع مجتمعك، واكتشف الكنائس القريبة منك.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "دليل الكنائس القبطية", "inLanguage": "ar" }
    },
    "/challenge": {
      title: "تحدي القراءة المقدسة | رفيقي",
      desc: "شارك في تحديات قراءة الكتاب المقدس، نافس أصدقاءك، واحرز إنجازات روحية مميزة.",
      schema: { "@context": "https://schema.org", "@type": "WebPage", "name": "تحدي القراءة المقدسة", "inLanguage": "ar" }
    }
  };

  const page = pages[path];
  if (!page) return null;

  const canonical = `${SITE}${path === '/' ? '' : path}`;

  const richBodies: Record<string, string> = {
    "/": `<h1>الكتاب المقدس رفيقي — رفيقك الروحي اليومي</h1>
<p>${page.desc}</p>
<p lang="en" dir="ltr" style="font-size:0.85em;color:#666">Coptic Arabic Bible — Read, search, and explore the Holy Bible in Arabic with Coptic Orthodox resources. Free daily reading plans, verse search, and the Agpeya (Coptic prayer book).</p>
<nav><ul>
<li><a href="${SITE}/bible">قراءة الكتاب المقدس كاملاً — العهد القديم والجديد</a></li>
<li><a href="${SITE}/plans">خطط قراءة الكتاب المقدس اليومية</a></li>
<li><a href="${SITE}/emotions">آيات حسب مشاعرك: فرح، حزن، قلق، خوف، أمل</a></li>
<li><a href="${SITE}/kids">قصص الكتاب المقدس للأطفال</a></li>
<li><a href="${SITE}/orthodox">الأرثوذوكسيات: أجبية، سنكسار، خولاجي، ألحان</a></li>
<li><a href="${SITE}/daily-verse">آية اليوم من الكتاب المقدس</a></li>
<li><a href="${SITE}/family">ركن العائلة المسيحية — تربية وصلوات ومشورة</a></li>
<li><a href="${SITE}/service">قسم الخدمة — للكهنة وخدام مدارس الأحد</a></li>
<li><a href="${SITE}/highlights">آياتي المظللة — مكتبتي الشخصية</a></li>
<li><a href="${SITE}/search">البحث في الكتاب المقدس</a></li>
</ul></nav>`,

    "/kids/hymns": `<h1>ترانيم الأطفال المسيحية القبطية — ${kidsHymnsPlaylist.length} ترنيمة</h1>
<p>أكبر مكتبة ترانيم أطفال مسيحية قبطية بالعربية على الإنترنت. تضم ترانيم من قنوات TaranemToon والحياة الأفضل وكوجي TV.</p>
<h2>تصنيفات الترانيم</h2>
<ul>
<li>ترانيم التسبيح والعبادة</li>
<li>ترانيم العذراء مريم</li>
<li>ترانيم النيروز (رأس السنة القبطية)</li>
<li>ترانيم القيامة والفصح</li>
<li>صوم الرسل وترانيم الصوم</li>
<li>قصص الأنبياء بالترانيم (نوح، يونان، داود، موسى)</li>
<li>ترانيم عن الشهداء والقديسين</li>
<li>سلوكيات وقيم مسيحية</li>
</ul>
<h2>أبرز ترانيم الأطفال</h2>
<ul>
${kidsHymnsPlaylist.slice(0, 30).map(h => `<li><a href="${SITE}/video/${h.youtubeId}">${esc(h.title)}</a></li>`).join("\n")}
</ul>
<h2>جميع الترانيم (${kidsHymnsPlaylist.length} ترنيمة)</h2>
<ul>
${kidsHymnsPlaylist.slice(30).map(h => `<li><a href="${SITE}/video/${h.youtubeId}">${esc(h.title)}</a></li>`).join("\n")}
</ul>
<p><a href="${SITE}/kids/videos">قصص الكتاب المقدس بالفيديو</a> | <a href="${SITE}/kids/stories">قصص مصورة للأطفال</a> | <a href="${SITE}/kids">قسم الأطفال</a></p>`,

    "/kids/videos": `<h1>قصص الكتاب المقدس للأطفال بالفيديو</h1>
<p>مجموعة متكاملة من قصص الكتاب المقدس بالفيديو للأطفال — العهد القديم والجديد بأسلوب كارتون جذاب.</p>
<h2>قصص العهد القديم</h2>
<ul>
${kidsBibleVideos.filter(v => v.category === "قصص العهد القديم").map(v => `<li><a href="${SITE}/video/${v.youtubeId}">${esc(v.title)}</a></li>`).join("\n")}
</ul>
<h2>سلسلة حكايات دانيال النبي</h2>
<ul>
${kidsBibleVideos.filter(v => v.category === "سلسلة حكايات دانيال النبي").map(v => `<li><a href="${SITE}/video/${v.youtubeId}">${esc(v.title)}</a></li>`).join("\n")}
</ul>
<h2>حكايات من العهد الجديد وأمثال السيد المسيح</h2>
<ul>
${kidsBibleVideos.filter(v => v.category === "حكايات من العهد الجديد وأمثال السيد المسيح").map(v => `<li><a href="${SITE}/video/${v.youtubeId}">${esc(v.title)}</a></li>`).join("\n")}
</ul>
<h2>سلسلة آحاد الصوم الكبير</h2>
<ul>
${kidsBibleVideos.filter(v => v.category === "سلسلة آحاد الصوم الكبير").map(v => `<li><a href="${SITE}/video/${v.youtubeId}">${esc(v.title)}</a></li>`).join("\n")}
</ul>
<h2>قصص العذراء والقديسين</h2>
<ul>
${kidsBibleVideos.filter(v => v.category === "قصص العذراء والقديسين").map(v => `<li><a href="${SITE}/video/${v.youtubeId}">${esc(v.title)}</a></li>`).join("\n")}
</ul>
<h2>قصص وأناشيد متنوعة</h2>
<ul>
${kidsBibleVideos.filter(v => v.category === "قصص وأناشيد متنوعة").map(v => `<li><a href="${SITE}/video/${v.youtubeId}">${esc(v.title)}</a></li>`).join("\n")}
</ul>
<p><a href="${SITE}/kids/hymns">ترانيم الأطفال</a> | <a href="${SITE}/kids/stories">قصص مصورة</a> | <a href="${SITE}/kids">قسم الأطفال</a></p>`,

    "/kids/stories": `<h1>قصص مصورة للأطفال من الكتاب المقدس</h1>
<p>قصص مصورة تفاعلية من الكتاب المقدس للأطفال مع صور ملونة وإمكانية الاستماع للقصة بصوت بشري.</p>
<h2>القصص المتاحة</h2>
<ul>
<li><a href="${SITE}/kids/story/1">قصة النبي موسى وعبور البحر الأحمر</a></li>
<li><a href="${SITE}/kids/story/2">قصة يوسف وإخوته</a></li>
<li><a href="${SITE}/kids/story/3">قصة داوود وجالوت</a></li>
<li><a href="${SITE}/kids/story/4">ميلاد السيد المسيح</a></li>
<li><a href="${SITE}/kids/story/5">قصة نوح والفلك</a></li>
<li><a href="${SITE}/kids/story/6">قصة إبراهيم أبو الآباء</a></li>
<li><a href="${SITE}/kids/story/7">قصة يونان النبي والحوت</a></li>
<li><a href="${SITE}/kids/story/8">قصة دانيال في جب الأسود</a></li>
</ul>
<p><a href="${SITE}/kids/hymns">ترانيم الأطفال</a> | <a href="${SITE}/kids/videos">قصص بالفيديو</a> | <a href="${SITE}/kids">قسم الأطفال</a></p>`,

    "/kids": `<h1>قصص الكتاب المقدس للأطفال</h1>
<p>${page.desc}</p>
<p>يتضمن قسم الأطفال في رفيقي مجموعة من القصص المصورة المستوحاة من الكتاب المقدس، تُقدَّم بأسلوب مبسط ومناسب للأطفال المسيحيين. تشمل قصصاً عن النبي موسى، والنبي يوسف، وداوود وجالوت، وولادة السيد المسيح، والمجوس، وإيليا النبي، وغيرها.</p>
<h2>اكتشف قصص الكتاب المقدس للأطفال</h2>
<ul>
<li><a href="${SITE}/kids/stories">جميع القصص المصورة للأطفال</a></li>
<li><a href="${SITE}/kids/story/1">قصة النبي موسى وعبور البحر الأحمر</a></li>
<li><a href="${SITE}/kids/story/2">قصة النبي يوسف وإخوته</a></li>
<li><a href="${SITE}/kids/story/3">قصة داوود وجالوت</a></li>
<li><a href="${SITE}/kids/story/4">ميلاد السيد المسيح</a></li>
<li><a href="${SITE}/kids/story/5">قصة نوح والفلك</a></li>
</ul>
<h2>لماذا رفيقي لأطفالك؟</h2>
<p>نقدم محتوى آمناً وتعليمياً يساعد الأطفال المسيحيين على التعرف على قصص الكتاب المقدس بطريقة شيقة ومبسطة، مع فيديوهات تعليمية مناسبة للأعمار الصغيرة.</p>`,

    "/orthodox": `<h1>أرثوذوكسيات — المحتوى القبطي الأرثوذكسي الشامل</h1>
<p>${page.desc}</p>
<h2>أقسام الأرثوذوكسيات</h2>
<ul>
<li><a href="${SITE}/orthodox/agpeya">كتاب الأجبية — ساعات الصلاة السبع القبطية</a>: صلاة باكر، الساعة الثالثة، السادسة، التاسعة، الغروب، النوم، نصف الليل.</li>
<li><a href="${SITE}/orthodox/synaxarium">السنكسار القبطي</a>: سير القديسين والشهداء الأقباط لكل يوم من أيام السنة القبطية.</li>
<li><a href="${SITE}/orthodox/kholagy">الخولاجي المقدس</a>: نصوص قداس القديس باسيليوس الكبير، قداس غريغوريوس اللاهوتي، وقداس كيرلس بالعربي والقبطي.</li>
<li><a href="${SITE}/orthodox/hymns">الألحان القبطية والإبصلمودية</a>: ألحان القداس الإلهي، تسبحة نصف الليل، إبصلمودية كيهك.</li>
<li><a href="${SITE}/orthodox/katameros">القطمارس</a>: القراءات الليتورجية اليومية للقداس — بولس، كاثوليكون، إبركسيس، مزامير، إنجيل.</li>
<li><a href="${SITE}/orthodox/deacon">مردات الشماس</a>: كيرياليسون، مرد الاعتراف، مردات رفع البخور.</li>
<li><a href="${SITE}/orthodox/saints">سير القديسين الأقباط</a>: حياة وقصص القديسين والشهداء الأقباط الأرثوذكس.</li>
<li><a href="${SITE}/orthodox/creed">قانون الإيمان النيقاوي</a>: نص قانون الإيمان المسكوني الكامل.</li>
<li><a href="${SITE}/orthodox/books">الكتب الأرثوذكسية</a>: مراجع ومصادر الكنيسة القبطية الأرثوذكسية.</li>
<li><a href="${SITE}/orthodox/tafseer">التفسير الأرثوذكسي</a>: تفسير آيات الكتاب المقدس من منظور أرثوذكسي قبطي.</li>
</ul>
<h2>عن الكنيسة القبطية الأرثوذكسية</h2>
<p>الكنيسة القبطية الأرثوذكسية هي من أقدم الكنائس المسيحية في العالم، تأسست على يد القديس مرقس الرسول في مصر. تتميز بتراث ليتورجي وروحي عريق يمتد لأكثر من ألفي عام، يشمل اللغة القبطية، والألحان القديمة، والطقوس والقداسات الإلهية.</p>`,

    "/bible": `<h1>قراءة الكتاب المقدس بالعربية</h1>
<p>${page.desc}</p>
<h2>أسفار الكتاب المقدس</h2>
<h3>العهد القديم</h3>
<p>يشتمل الكتاب المقدس العهد القديم على 39 سفراً (أو 46 سفراً في الترجمة الكاثوليكية) تبدأ بسفر التكوين وتنتهي بسفر ملاخي. تشمل: التكوين، الخروج، اللاويين، العدد، التثنية، يشوع، القضاة، راعوث، صموئيل، الملوك، الأيام، عزرا، نحميا، أستير، أيوب، المزامير، الأمثال، الجامعة، نشيد الأناشيد، إشعياء، إرميا، حزقيال، دانيال، وسائر الأنبياء الصغار.</p>
<h3>العهد الجديد</h3>
<p>يشتمل العهد الجديد على 27 سفراً تبدأ بإنجيل متى وتنتهي برؤيا يوحنا. تشمل: متى، مرقس، لوقا، يوحنا، أعمال الرسل، رسائل بولس الرسول، رسائل عامة، وسفر الرؤيا.</p>
<p><a href="${SITE}/bible/تكوين/1">اقرأ سفر التكوين — الإصحاح الأول</a></p>
<p><a href="${SITE}/bible/مزامير/23">اقرأ مزمور 23 — الرب راعيَّ</a></p>
<p><a href="${SITE}/bible/يوحنا/3">اقرأ إنجيل يوحنا — الإصحاح الثالث</a></p>`,

    "/plans": `<h1>خطط قراءة الكتاب المقدس</h1>
<p>${page.desc}</p>
<p>خطط قراءة الكتاب المقدس على منصة رفيقي تساعدك على قراءة الكتاب المقدس كاملاً بانتظام، بخطوات يومية واضحة ومتابعة لتقدمك. اختر المدة التي تناسب وقتك وابدأ رحلتك الروحية اليوم.</p>
<h2>خطط القراءة المتاحة</h2>
<ul>
<li><a href="${SITE}/plans?plan=plan-30">خطة القراءة ٣٠ يوم</a> — اقرأ أهم قصص الكتاب المقدس في شهر واحد، مثالية للمبتدئين.</li>
<li><a href="${SITE}/plans?plan=plan-60">خطة القراءة ٦٠ يوم</a> — رحلة عبر العهد الجديد كاملاً في شهرين.</li>
<li><a href="${SITE}/plans?plan=plan-90">خطة القراءة ٩٠ يوم</a> — دراسة معمقة للإنجيل والرسائل في ثلاثة أشهر.</li>
<li><a href="${SITE}/plans?plan=plan-180">خطة القراءة ٦ شهور</a> — قراءة شاملة للكتاب المقدس في نصف سنة.</li>
<li><a href="${SITE}/plans?plan=plan-365">خطة القراءة سنة كاملة</a> — اقرأ الكتاب المقدس بالكامل، 3-4 إصحاحات يومياً.</li>
</ul>
<h2>كيف تبدأ خطة قراءة الكتاب المقدس؟</h2>
<ol>
<li>اختر المدة المناسبة لك من 30 يوماً حتى سنة كاملة.</li>
<li>اقرأ الإصحاحات المقررة يومياً والتزم بالخطة.</li>
<li>تابع نسبة تقدمك حتى تُكمل الكتاب المقدس.</li>
</ol>
<h2>أسئلة شائعة عن خطط القراءة</h2>
<p><strong>كم يستغرق قراءة الكتاب المقدس كاملاً؟</strong><br>يمكن قراءته كاملاً في سنة إذا قرأت 3-4 إصحاحات يومياً، أو أسرع بخطط 30-90 يوماً للأجزاء المختارة.</p>
<p><strong>من أين أبدأ قراءة الكتاب المقدس؟</strong><br>يُنصح المبتدئون بالبدء بإنجيل يوحنا ثم العهد الجديد، أو من سفر التكوين بالترتيب.</p>
<p><a href="${SITE}/bible">ابدأ القراءة من الكتاب المقدس</a> | <a href="${SITE}/daily-verse">آية اليوم</a></p>`,

    "/emotions": `<h1>آيات الكتاب المقدس حسب المشاعر</h1>
<p>${page.desc}</p>
<h2>اختر مشاعرك واعثر على الآيات المناسبة</h2>
<ul>
<li><a href="${SITE}/emotions/فرح">آيات الكتاب المقدس عن الفرح والبهجة</a></li>
<li><a href="${SITE}/emotions/حزن">آيات الكتاب المقدس عن الحزن والعزاء</a></li>
<li><a href="${SITE}/emotions/قلق">آيات الكتاب المقدس عن القلق والاطمئنان</a></li>
<li><a href="${SITE}/emotions/خوف">آيات الكتاب المقدس عن الخوف والشجاعة</a></li>
<li><a href="${SITE}/emotions/سلام">آيات الكتاب المقدس عن السلام والراحة</a></li>
<li><a href="${SITE}/emotions/رجاء">آيات الكتاب المقدس عن الرجاء والأمل</a></li>
<li><a href="${SITE}/emotions/شكر">آيات الكتاب المقدس عن الشكر والامتنان</a></li>
<li><a href="${SITE}/emotions/محبة">آيات الكتاب المقدس عن المحبة</a></li>
<li><a href="${SITE}/emotions/إيمان">آيات الكتاب المقدس عن الإيمان</a></li>
<li><a href="${SITE}/emotions/صبر">آيات الكتاب المقدس عن الصبر والثبات</a></li>
<li><a href="${SITE}/emotions/وحدة">آيات الكتاب المقدس عن الوحدة والأنيس الروحي</a></li>
<li><a href="${SITE}/emotions/حكمة">آيات الكتاب المقدس عن الحكمة والتمييز</a></li>
<li><a href="${SITE}/emotions/شفاء">آيات الكتاب المقدس عن الشفاء والبرء</a></li>
<li><a href="${SITE}/emotions/غضب">آيات الكتاب المقدس عن الغضب وضبط النفس</a></li>
</ul>
<h2>لماذا تبحث عن آيات حسب مشاعرك؟</h2>
<p>الكتاب المقدس يخاطب كل حالة إنسانية. سواء كنت تمر بضيقة، فرح، أو قلق، ستجد في صفحات الكتاب المقدس كلمات تُعزيك وتُقويك. اختر ما يناسب حالتك الآن.</p>`,

    "/family": `<h1>ركن العائلة المسيحية</h1>
<p>${page.desc}</p>
<h2>أقسام ركن العائلة</h2>
<ul>
<li><strong>صلوات عائلية</strong>: مجموعة صلوات يومية للعائلة المسيحية — صلاة الصباح، صلاة الطعام، صلاة المساء، صلاة قبل النوم.</li>
<li><strong>تربية روحية للأطفال</strong>: مواد ودروس لتعليم الأطفال أسس الإيمان المسيحي القبطي الأرثوذكسي.</li>
<li><strong>ركن المشورة</strong>: فيديوهات وإرشادات من آباء الكنيسة للوالدين عن التربية والحياة الزوجية.</li>
<li><strong>قراءات عائلية مشتركة</strong>: مقترحات لقراءة الكتاب المقدس مع الأطفال بأسلوب مناسب لأعمارهم.</li>
</ul>
<h2>لماذا الحياة الروحية العائلية مهمة؟</h2>
<p>البيت المسيحي هو الكنيسة الصغرى. حين يصلي الوالدان مع أطفالهم، يقرؤون الكتاب المقدس معاً، ويعيشون قيم الإيمان في تعاملاتهم اليومية، يبنون أساساً روحياً قوياً يلازم الأطفال طوال حياتهم.</p>
<p><a href="${SITE}/kids">قصص الكتاب المقدس للأطفال</a> | <a href="${SITE}/kids/hymns">ترانيم الأطفال</a> | <a href="${SITE}/orthodox/agpeya">كتاب الأجبية</a></p>`,

    "/service": `<h1>قسم الخدمة — للكهنة وخدام مدارس الأحد</h1>
<p>${page.desc}</p>
<h2>ماذا يقدم قسم الخدمة؟</h2>
<ul>
<li><strong>بحث موضوعي ذكي</strong>: ابحث عن آيات الكتاب المقدس حسب الموضوع (الغفران، التوبة، المحبة، الصلاة...) باستخدام البحث الدلالي الذكي.</li>
<li><strong>تفاسير الآباء</strong>: لكل آية، اطلع على تفسير الآباء القبط الأرثوذكس مباشرة.</li>
<li><strong>مولِّد هيكل العظة</strong>: للكهنة — يقترح الذكاء الاصطناعي هيكل عظة كنسية: مقدمة، نقاط رئيسية، تطبيق روحي، خاتمة.</li>
<li><strong>مولِّد درس مدرسة الأحد</strong>: للخدام — يقترح هيكل درس مناسب للأطفال: مقدمة، نقاط مبسطة، نشاط تطبيقي، صلاة ختامية.</li>
<li><strong>مساحة عمل / مسودة</strong>: اجمع الآيات والهيكل معاً، انسخ المسودة، أو اطبعها لاستخدامها في الخدمة.</li>
</ul>
<h2>كيف تستخدم القسم؟</h2>
<ol>
<li>اختر التبويب المناسب: للكهنة أو للخدام.</li>
<li>أدخل موضوع العظة أو الدرس والجمهور المستهدف.</li>
<li>اطلب اقتراح هيكل من الذكاء الاصطناعي.</li>
<li>ابحث عن آيات تدعم النقاط، واطلع على تفسيرها.</li>
<li>أضف الآيات للمسودة، ثم انسخها أو اطبعها.</li>
</ol>
<p><strong>تنبيه لاهوتي</strong>: المحتوى المُولَّد بالذكاء الاصطناعي مساعد للتحضير فقط، وليس بديلاً عن الإرشاد الكنسي والدراسة اللاهوتية المعمّقة.</p>
<p><a href="${SITE}/bible">الكتاب المقدس</a> | <a href="${SITE}/orthodox/tafseer">تفاسير الآباء</a> | <a href="${SITE}/orthodox/kholagy">الخولاجي المقدس</a></p>`,

    "/highlights": `<h1>آياتي المظللة — مكتبتي الشخصية من كلمة الله</h1>
<p>${page.desc}</p>
<h2>ميزات التظليل في رفيقي</h2>
<ul>
<li>ظلّل الآيات بألوان مختلفة (أصفر، أخضر، أزرق، وردي) لتصنيف موضوعات مختلفة.</li>
<li>راجع كل آياتك المظللة في صفحة واحدة منظمة.</li>
<li>أضف ملاحظاتك الشخصية على كل آية.</li>
<li>شارك الآيات المظللة مع أصدقائك.</li>
</ul>
<p><a href="${SITE}/bible">ابدأ القراءة والتظليل</a> | <a href="${SITE}/search">ابحث عن آية لتظليلها</a></p>`,

    "/about": `<h1>عن موقع الكتاب المقدس رفيقي</h1>
<p>الكتاب المقدس رفيقي هو منصة روحية مسيحية قبطية أرثوذكسية مجانية تهدف إلى مساعدة المؤمنين على التعمق في كلمة الله يومياً. يوفر الموقع قراءة الكتاب المقدس كاملاً باللغة العربية مع التفسير، وخطط قراءة منظمة، وآيات حسب المشاعر، وقسماً للأطفال، وأقساماً للتراث القبطي الأرثوذكسي.</p>
<h2>رسالتنا</h2>
<p>نؤمن أن كلمة الله هي نور للحياة اليومية. لذلك بنينا هذا الموقع ليكون رفيقاً روحياً مجانياً لكل مسيحي يبحث عن التعمق في الإيمان والتقرب من الله من خلال قراءة الكتاب المقدس يومياً.</p>
<h2>ما يقدمه الموقع</h2>
<ul>
<li><a href="${SITE}/bible">قراءة الكتاب المقدس</a>: 66 سفراً كاملاً بالعربية مع تفسير لكل آية من آباء الكنيسة.</li>
<li><a href="${SITE}/plans">خطط القراءة اليومية</a>: خطط من 30 إلى 365 يوماً لقراءة الكتاب المقدس كاملاً.</li>
<li><a href="${SITE}/emotions">آيات حسب مشاعرك</a>: آيات منتقاة للفرح، الحزن، القلق، الخوف، الشكر، والرجاء.</li>
<li><a href="${SITE}/orthodox">الأرثوذوكسيات</a>: الأجبية، السنكسار، الخولاجي المقدس، الألحان القبطية، القطمارس.</li>
<li><a href="${SITE}/kids">قصص الأطفال</a>: قصص مصورة وفيديوهات وترانيم للأطفال المسيحيين.</li>
<li><a href="${SITE}/service">قسم الخدمة</a>: أدوات بالذكاء الاصطناعي لمساعدة الكهنة وخدام مدارس الأحد.</li>
<li><a href="${SITE}/family">ركن العائلة</a>: مشورة أسرية، صلوات العائلة، وأفكار للعبادة الأسرية.</li>
</ul>
<h2>التواصل معنا</h2>
<p>يسعدنا تلقي ملاحظاتك واقتراحاتك على البريد الإلكتروني: Contact@oscardevs.com</p>
<p><a href="${SITE}/contact">نموذج التواصل</a> | <a href="${SITE}/privacy">سياسة الخصوصية</a></p>`,

    "/orthodox/hymns": `<h1>الألحان القبطية والإبصلمودية — كتب الألحان الكاملة</h1>
<p>يضم قسم الألحان القبطية والإبصلمودية في موقع رفيقي النصوص الكاملة لكتب الألحان القبطية الأرثوذكسية: ألحان القداس الإلهي، الإبصلمودية اليومية، إبصلمودية كيهك الخاصة بصوم الميلاد، وألحان الأعياد الكبرى.</p>
<h2>محتويات قسم الألحان القبطية</h2>
<ul>
<li><strong>ألحان القداس الإلهي</strong>: نصوص ألحان قداس القديس باسيليوس والبابا كيرلس وغريغوريوس بالعربي والقبطي.</li>
<li><strong>تسبحة نصف الليل</strong>: نص التسبحة السبعية الأسبوعية (سبعة مزامير لكل يوم) مع الأدعية والمديحات.</li>
<li><strong>إبصلمودية كيهك</strong>: الإبصلمودية الخاصة بشهر كيهك (ديسمبر) وهي من أجمل الألحان القبطية وأكثرها روحانية.</li>
<li><strong>ألحان الأعياد الكبرى</strong>: ألحان عيد الميلاد المجيد، والغطاس، والقيامة، والصليب.</li>
<li><strong>الألحان الأسبوعية</strong>: الإبصلمودية اليومية لكل أيام الأسبوع بالعربي والقبطي.</li>
</ul>
<h2>عن الألحان القبطية</h2>
<p>الألحان القبطية هي إرث موسيقي روحي يعود إلى آلاف السنين، ورثته الكنيسة القبطية الأرثوذكسية من الحضارة المصرية المسيحية. تتميز بألحانها الفريدة التي تُغنَّى باللغتين القبطية والعربية، وتُعبّر عن أعمق معاني اللاهوت المسيحي الأرثوذكسي.</p>
<h2>الإبصلمودية</h2>
<p>الإبصلمودية (أو السواعي) هي كتاب الألحان والمزامير القبطية المستخدمة في الصلوات الليلية. تتضمن مزامير مرتلة بألحان قبطية أصيلة، وأدعية، ومديحات للسيد المسيح والعذراء مريم والقديسين.</p>
<p><a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/orthodox/agpeya">كتاب الأجبية</a> | <a href="${SITE}/orthodox/kholagy">الخولاجي المقدس</a></p>`,

    "/orthodox/deacon": `<h1>مردات الشماس القبطية — كيرياليسون ومردات القداس</h1>
<p>يحتوي قسم مردات الشماس على النصوص الكاملة للمردات والإجابات الليتورجية التي يرددها الشماس والشعب في الكنيسة القبطية الأرثوذكسية أثناء القداس الإلهي وصلوات رفع البخور.</p>
<h2>محتويات قسم مردات الشماس</h2>
<ul>
<li><strong>كيرياليسون</strong>: "يا رب ارحم" — اللحن الأساسي في القداس الإلهي القبطي بالقبطي والعربي.</li>
<li><strong>مرد الاعتراف</strong>: نص مرد الاعتراف المستخدم في القداس الإلهي القبطي.</li>
<li><strong>مردات رفع البخور</strong>: المردات المستخدمة في صلاة رفع البخور صباحاً ومساءً.</li>
<li><strong>مردات القداس الإلهي</strong>: إجابات الشعب والشماس خلال القداس المقدس.</li>
<li><strong>إيهاب وأمين</strong>: المردات المختلفة المستخدمة في أجزاء القداس.</li>
</ul>
<h2>دور الشماس في الكنيسة القبطية</h2>
<p>الشماس في الكنيسة القبطية الأرثوذكسية هو وسيط بين الكاهن والشعب، يرتل الألحان ويردد المردات الليتورجية ويساعد في تنظيم الخدمة الكنسية. تمتد رتبة الشماسية إلى العصور الرسولية الأولى للكنيسة.</p>
<h2>أهمية حفظ المردات</h2>
<p>حفظ المردات القبطية وترديدها بدقة جزء أصيل من الإيمان القبطي الأرثوذكسي، إذ تنقل هذه المردات معاني لاهوتية عميقة عبر الألحان القديمة الموروثة من الآباء.</p>
<p><a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/orthodox/hymns">الألحان القبطية</a> | <a href="${SITE}/orthodox/kholagy">الخولاجي المقدس</a></p>`,

    "/contact": `<h1>تواصل معنا — الكتاب المقدس رفيقي</h1>
<p>نسعد بتواصلك معنا لأي استفسار أو اقتراح أو ملاحظة حول موقع الكتاب المقدس رفيقي.</p>
<h2>بيانات التواصل</h2>
<ul>
<li><strong>البريد الإلكتروني:</strong> Contact@oscardevs.com</li>
<li><strong>الموقع:</strong> ${SITE}</li>
</ul>
<h2>اقتراحاتك تهمنا</h2>
<p>إذا كان لديك اقتراح لتحسين الموقع، أو رغبت في الإبلاغ عن خطأ في محتوى التفسير أو الألحان أو الطقوس القبطية، فنحن نرحب بذلك ونسعد بالرد عليك.</p>
<p><a href="${SITE}/about">من نحن</a> | <a href="${SITE}/privacy">سياسة الخصوصية</a></p>`,

    "/privacy": `<h1>سياسة الخصوصية — الكتاب المقدس رفيقي</h1>
<p>نحن في الكتاب المقدس رفيقي نلتزم بحماية خصوصية مستخدمينا. هذه الصفحة توضح كيفية جمع البيانات واستخدامها.</p>
<h2>البيانات التي نجمعها</h2>
<ul>
<li>معرف مجهول الهوية للجلسة (cookie) لحفظ تقدمك في القراءة وخطط القراءة.</li>
<li>بيانات استخدام مجمّعة وغير شخصية لتحسين تجربة الموقع.</li>
</ul>
<h2>ما لا نجمعه</h2>
<p>لا نجمع أسماء أو بيانات شخصية تعريفية. لا يوجد تسجيل إلزامي للاستخدام.</p>
<h2>ملفات تعريف الارتباط (Cookies)</h2>
<p>يستخدم الموقع cookie بسيطة لحفظ جلسة المستخدم وتفضيلاته. يمكنك حذفها في أي وقت من إعدادات المتصفح.</p>
<p><a href="${SITE}/contact">تواصل معنا</a> | <a href="${SITE}/about">من نحن</a></p>`,

    "/orthodox/kholagy": `<h1>الخولاجي المقدس — قداس القديس باسيليوس وغريغوريوس وكيرلس</h1>
<p>الخولاجي المقدس هو كتاب القداسات الإلهية في الكنيسة القبطية الأرثوذكسية، ويحتوي على نصوص ثلاثة قداسات كاملة مع ألحانها العربية والقبطية.</p>
<h2>القداسات الثلاثة</h2>
<ul>
<li><strong>قداس القديس باسيليوس الكبير</strong>: القداس الأساسي المستخدم في معظم أيام السنة القبطية، وهو من وضع القديس باسيليوس أسقف قيصرية.</li>
<li><strong>قداس غريغوريوس اللاهوتي</strong>: يُقام في الأعياد السيدية الكبرى كعيد الميلاد والغطاس والقيامة.</li>
<li><strong>قداس كيرلس الكبير</strong>: من وضع القديس كيرلس عمود الدين الأول البابا الرابع والعشرون، ويُقام في مناسبات خاصة.</li>
</ul>
<h2>أجزاء القداس الإلهي</h2>
<p>يتكون القداس الإلهي القبطي من: قداس الموعوظين، قداس المؤمنين، صلوات رفع البخور، القراءات، الإنجيل، الصلوات السرية، التقدمة، الأبركسيس، الاعتراف، ودستور الإيمان.</p>
<p><a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/orthodox/hymns">الألحان القبطية</a> | <a href="${SITE}/orthodox/agpeya">كتاب الأجبية</a></p>`,

    "/orthodox/saints": `<h1>سير القديسين الأقباط والشهداء الأرثوذكس</h1>
<p>سير وقصص القديسين والشهداء الأقباط الأرثوذكس عبر العصور، من الآباء الرسوليين حتى شهداء العصر الحديث.</p>
<h2>أبرز القديسين الأقباط</h2>
<ul>
<li><strong>القديس مرقس الرسول</strong>: مؤسس الكنيسة القبطية الأرثوذكسية، كرز بالإنجيل في مصر وليبيا وأثيوبيا.</li>
<li><strong>البابا كيرلس الكبير</strong>: عمود الدين، البابا الرابع والعشرون، دافع عن عقيدة التجسد الإلهي.</li>
<li><strong>القديس أنطونيوس الكبير</strong>: أبو الرهبان، أسس الرهبانية المسيحية في الصحراء المصرية.</li>
<li><strong>القديسة دميانة</strong>: شهيدة قبطية من القرن الثالث الميلادي.</li>
<li><strong>القديس جورجيوس</strong>: شهيد الإيمان المسيحي.</li>
</ul>
<h2>السنكسار القبطي</h2>
<p>السنكسار هو كتاب سير القديسين المرتّب حسب التقويم القبطي، يُقرأ منه في كل قداس إلهي.</p>
<p><a href="${SITE}/orthodox/synaxarium">قراءة السنكسار القبطي</a> | <a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a></p>`,

    "/orthodox/katameros": `<h1>القطمارس — القراءات الليتورجية اليومية القبطية</h1>
<p>القطمارس (أو كتاب القراءات الليتورجية) هو الكتاب القبطي الذي يرتب آيات الكتاب المقدس وفق التقويم القبطي لتُقرأ في كل قداس إلهي على مدار السنة.</p>
<h2>محتوى القطمارس</h2>
<ul>
<li><strong>رسالة بولس الرسول</strong>: مقطع من رسائل القديس بولس يتناسب مع اليوم الليتورجي.</li>
<li><strong>الكاثوليكون</strong>: مقطع من الرسائل الكاثوليكية (بطرس، يوحنا، يعقوب، يهوذا).</li>
<li><strong>الإبركسيس</strong>: مقطع من سفر أعمال الرسل.</li>
<li><strong>المزمور</strong>: مزمور داود المناسب للعيد أو اليوم.</li>
<li><strong>الإنجيل</strong>: مقطع إنجيلي يُقرأ في ختام القراءات.</li>
</ul>
<h2>أهمية القطمارس</h2>
<p>يضمن القطمارس أن تُقرأ معظم أجزاء الكتاب المقدس على الجماعة خلال السنة القبطية، مما يجعل المؤمنين يسمعون كلمة الله يومياً في القداس.</p>
<p><a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/orthodox/kholagy">الخولاجي المقدس</a></p>`,

    "/orthodox/creed": `<h1>قانون الإيمان النيقاوي — دستور الإيمان المسيحي</h1>
<p>قانون الإيمان النيقاوي (أو الدستور) هو الصياغة المسكونية لأركان الإيمان المسيحي، وُضع في مجمع نيقية عام 325م ومجمع القسطنطينية عام 381م.</p>
<h2>النص الكامل لقانون الإيمان</h2>
<p>نؤمن بإله واحد آب ضابط الكل، خالق السماء والأرض وكل ما يرى وما لا يرى. ونؤمن برب واحد يسوع المسيح ابن الله الوحيد المولود من الآب قبل كل الدهور...</p>
<h2>أهمية قانون الإيمان في الكنيسة القبطية</h2>
<p>يُرتّل قانون الإيمان في كل قداس إلهي ويُعبّر عن الإيمان المسيحي الأرثوذكسي الواحد الجامع لكنائس العالم.</p>
<p><a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/orthodox/kholagy">الخولاجي المقدس</a></p>`,

    "/orthodox/books": `<h1>الكتب الأرثوذكسية القبطية — مراجع ومصادر</h1>
<p>مكتبة المراجع والكتب الأرثوذكسية القبطية: كتب التفسير، اللاهوت، الطقوس، وسير القديسين.</p>
<h2>أقسام المكتبة</h2>
<ul>
<li>كتب التفسير الأرثوذكسي للكتاب المقدس</li>
<li>كتب اللاهوت والعقيدة القبطية</li>
<li>كتب الطقوس والليتورجيا القبطية</li>
<li>كتب الروحانيات والسلوك المسيحي</li>
<li>سير وكتابات الآباء الأقباط</li>
</ul>
<p><a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/orthodox/tafseer">التفسير الأرثوذكسي</a></p>`,

    "/orthodox/tafseer": `<h1>التفسير الأرثوذكسي للكتاب المقدس</h1>
<p>تفسير آيات الكتاب المقدس من منظور أرثوذكسي قبطي استناداً إلى كتابات آباء الكنيسة القبطية الأرثوذكسية.</p>
<h2>منهج التفسير الأرثوذكسي</h2>
<p>يعتمد التفسير القبطي الأرثوذكسي على تراث الآباء كالقديس أثناسيوس الرسولي والقديس كيرلس الكبير والبابا شنودة الثالث وغيرهم من آباء الكنيسة.</p>
<p><a href="${SITE}/bible">قراءة الكتاب المقدس مع التفسير</a> | <a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a></p>`,

    "/search": `<h1>البحث في الكتاب المقدس</h1>
<p>${page.desc}</p>
<h2>بحث ذكي في أكثر من 31,000 آية</h2>
<p>يوفر موقع رفيقي محرك بحث متقدم يسمح لك بالبحث في جميع آيات الكتاب المقدس العربي. يدعم البحث بالكلمات الكاملة والجزئية، ويعرض النتائج مع السياق الكامل للآية.</p>
<h2>ما يمكنك البحث عنه</h2>
<ul>
<li>ابحث عن آية الكتاب المقدس بكلمة مفتاحية مثل "محبة" أو "سلام" أو "إيمان"</li>
<li>ابحث عن شخصية مثل "موسى" أو "إبراهيم" أو "بولس"</li>
<li>ابحث عن موضوع مثل "الصلاة" أو "الصوم" أو "المعمودية"</li>
<li>ابحث عن عبارة كاملة من الكتاب المقدس</li>
</ul>
<h2>آيات مشهورة يمكن البحث عنها</h2>
<ul>
<li><a href="${SITE}/search?q=الرب+راعيَّ">الرب راعيَّ فلا يعوزني شيء — مزمور 23</a></li>
<li><a href="${SITE}/search?q=محبة+الله">هكذا أحب الله العالم — يوحنا 3:16</a></li>
<li><a href="${SITE}/search?q=اطلبوا+تجدوا">اطلبوا تجدوا، اقرعوا يُفتح لكم — متى 7:7</a></li>
<li><a href="${SITE}/search?q=لا+تخف">لا تخف لأني معك — إشعياء 41:10</a></li>
<li><a href="${SITE}/search?q=كل+الأشياء+أستطيع">كل الأشياء أستطيع في المسيح — فيلبي 4:13</a></li>
<li><a href="${SITE}/search?q=آيات+عن+السلام">آيات الكتاب المقدس عن السلام والطمأنينة</a></li>
<li><a href="${SITE}/search?q=آيات+عن+الخوف">آيات الكتاب المقدس عن الخوف والشجاعة</a></li>
</ul>`,

    "/orthodox/history": `<h1>تاريخ الكنيسة القبطية الأرثوذكسية</h1>
<p>تأسست الكنيسة القبطية الأرثوذكسية على يد القديس مرقس الرسول في الإسكندرية عام 42م، وهي إحدى أقدم الكنائس المسيحية في العالم، تحتفظ بتراث ليتورجي وروحي يمتد لأكثر من عشرين قرناً.</p>
<h2>أهم المحطات في تاريخ الكنيسة القبطية</h2>
<ul>
<li><strong>القرن الأول (42م)</strong>: تأسيس الكرازة المرقسية في مصر على يد القديس مرقس الإنجيلي، أول أساقفة الإسكندرية.</li>
<li><strong>القرن الثاني والثالث</strong>: ازدهار مدرسة الإسكندرية اللاهوتية وأعلامها: كليمندس الإسكندري، أوريجانوس، ديونيسيوس الكبير.</li>
<li><strong>325م — مجمع نيقية</strong>: أسقف الإسكندرية أثناسيوس الرسولي يدافع عن عقيدة الثالوث القدوس ضد الآريوسية.</li>
<li><strong>431م — مجمع أفسس</strong>: البابا كيرلس الكبير (عمود الدين) يثبّت لقب "والدة الإله" لمريم العذراء.</li>
<li><strong>451م — مجمع خلقيدونية</strong>: رفضت الكنيسة القبطية قرارات المجمع واحتفظت بالإيمان بالطبيعة الواحدة للمسيح.</li>
<li><strong>القرن السابع</strong>: الفتح الإسلامي لمصر — الكنيسة تواصل رسالتها في ظل الحكم الإسلامي.</li>
<li><strong>القرن العشرون</strong>: عهد البابا شنودة الثالث (1971–2012) — نهضة قبطية شاملة وانفتاح مسكوني.</li>
<li><strong>2012 حتى الآن</strong>: قداسة البابا تواضروس الثاني — البابا الـ118 على الكرسي المرقسي.</li>
</ul>
<h2>قائمة البطاركة</h2>
<p>تعاقب على كرسي مار مرقس في الإسكندرية 118 بابا، من القديس مرقس الرسول حتى قداسة البابا تواضروس الثاني الحالي. يُلقَّب بطريرك الإسكندرية بـ"بابا الإسكندرية وبطريرك الكرازة المرقسية".</p>
<h2>المجامع المسكونية الثلاثة</h2>
<p>تعترف الكنيسة القبطية بثلاثة مجامع مسكونية فقط: نيقية (325م)، القسطنطينية (381م)، وأفسس (431م). وهي بذلك كنيسة "ما قبل خلقيدونية".</p>
<p><a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/orthodox/saints">سير القديسين الأقباط</a> | <a href="${SITE}/orthodox/creed">قانون الإيمان</a></p>`,

    "/orthodox/qa": `<h1>أسئلة وأجوبة لاهوتية في العقيدة القبطية الأرثوذكسية</h1>
<p>إجابات شاملة على الأسئلة الشائعة في الإيمان القبطي الأرثوذكسي — من العقيدة والطقوس إلى الأسرار والحياة الروحية.</p>
<h2>أسئلة عن العقيدة والإيمان</h2>
<ul>
<li><strong>س: ما هي الطبيعة الواحدة للمسيح في العقيدة القبطية؟</strong><br/>ج: تؤمن الكنيسة القبطية بالطبيعة الواحدة المركبة للسيد المسيح — إله كامل وإنسان كامل، في وحدة تامة لا تفريق فيها ولا امتزاج ولا تغيير.</li>
<li><strong>س: ما هي الأسرار السبعة في الكنيسة القبطية؟</strong><br/>ج: المعمودية، الميرون (التثبيت)، الإفخارستيا (القربان المقدس)، التوبة والاعتراف، مسحة المرضى، الكهنوت، الإكليل (الزواج).</li>
<li><strong>س: لماذا يصوم الأقباط أكثر من 200 يوم في السنة؟</strong><br/>ج: الصوم في الكنيسة القبطية ممارسة روحية أصيلة موروثة عن الآباء، ويشمل: الصوم الكبير (55 يوماً)، صوم الرسل، صوم العذراء (15 يوماً)، صوم الميلاد (43 يوماً)، والأصوام الأسبوعية (الأربعاء والجمعة).</li>
<li><strong>س: ما الفرق بين الكنيسة القبطية والكنيسة الكاثوليكية؟</strong><br/>ج: الكنيسة القبطية الأرثوذكسية مستقلة عن روما ولا تعترف بسلطة البابا الروماني. تتبع الكنيسة القبطية مجامع نيقية وأفسس فقط، وتختلف عن الكاثوليكية في عقيدة طبيعة المسيح.</li>
</ul>
<h2>أسئلة عن الحياة الكنسية</h2>
<ul>
<li><strong>س: ما هو دور الاعتراف في الكنيسة القبطية؟</strong><br/>ج: الاعتراف سر مقدس يتم أمام أب الاعتراف (الكاهن) الذي يمثل المسيح. المؤمن يعترف بخطاياه ويتلقى نعمة الحل والغفران.</li>
<li><strong>س: متى يُعمَّد الأطفال في الكنيسة القبطية؟</strong><br/>ج: يُعمَّد الأطفال في سن 40 يوماً (الذكور) و80 يوماً (الإناث)، وتتم المعمودية بالتغطيس الثلاثي.</li>
</ul>
<p><a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/orthodox/creed">قانون الإيمان النيقاوي</a> | <a href="${SITE}/orthodox/history">تاريخ الكنيسة القبطية</a></p>`,

    "/orthodox/figures": `<h1>شخصيات الكنيسة القبطية الأرثوذكسية — آباء وقديسون ومفكرون</h1>
<p>أبرز شخصيات الكنيسة القبطية الأرثوذكسية عبر التاريخ: البطاركة العظام، الآباء اللاهوتيون، الشهداء، والرهبان الذين شكّلوا تراث الكنيسة.</p>
<h2>آباء الكنيسة الأوائل</h2>
<ul>
<li><strong>القديس مرقس الرسول</strong>: مؤسس الكرازة المرقسية وأول بابا للإسكندرية، استشهد عام 68م.</li>
<li><strong>القديس أثناسيوس الرسولي</strong>: "أبو الأرثوذكسية"، دافع بشدة عن عقيدة لاهوت المسيح ضد الآريوسية في مجمع نيقية.</li>
<li><strong>القديس كيرلس الكبير (عمود الدين)</strong>: البابا الرابع والعشرون، أعظم لاهوتيي الكنيسة القبطية، دافع عن لقب "والدة الإله".</li>
<li><strong>القديس أنطونيوس الكبير</strong>: أبو الرهبان، أسس الرهبانية المسيحية في صحراء مصر في القرن الثالث.</li>
<li><strong>القديس باخوميوس</strong>: مؤسس الرهبانية الشركية (المشتركة) في صعيد مصر.</li>
</ul>
<h2>آباء العصر الحديث</h2>
<ul>
<li><strong>البابا كيرلس السادس (1959-1971)</strong>: أحيا الحياة الرهبانية وشهد عهده تجديداً روحياً عميقاً.</li>
<li><strong>البابا شنودة الثالث (1971-2012)</strong>: أبرز آباء الكنيسة في العصر الحديث، له مئات الكتب اللاهوتية والروحية.</li>
<li><strong>البابا تواضروس الثاني (2012-الآن)</strong>: البابا الـ118 على الكرسي المرقسي.</li>
</ul>
<p><a href="${SITE}/orthodox/saints">سير القديسين</a> | <a href="${SITE}/orthodox/history">تاريخ الكنيسة</a> | <a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a></p>`,

    "/orthodox/apocrypha": `<h1>الأسفار القانونية الثانية (الديوتيروكانونية) في الكنيسة القبطية</h1>
<p>الأسفار القانونية الثانية هي الأسفار التي تعترف بها الكنيسة القبطية الأرثوذكسية وتعتبرها مُلهَمة، غير أنها ليست في القانون اليهودي للعهد القديم.</p>
<h2>الأسفار القانونية الثانية المعتمدة</h2>
<ul>
<li><strong>طوبيا (توبيت)</strong>: قصة إيمانية عن طوبيا وأبيه وملاك الله رافائيل.</li>
<li><strong>يهوديت</strong>: قصة البطلة يهوديت التي أنقذت شعبها من الغزو الآشوري.</li>
<li><strong>يشوع بن سيراخ (سيراخ)</strong>: كتاب حكمة عملية ودينية من القرن الثاني قبل الميلاد.</li>
<li><strong>حكمة سليمان</strong>: تأملات في الحكمة الإلهية والحياة الأبدية.</li>
<li><strong>باروخ</strong>: مراثي وصلوات نُسبت إلى باروخ كاتب إرميا النبي.</li>
<li><strong>المكابيون الأول والثاني</strong>: تاريخ انتفاضة المكابيين ضد الاضطهاد السلوقي.</li>
<li><strong>إضافات دانيال</strong>: صلاة عزريا، نشيد الثلاثة الفتية، سوسنة، بل والتنين.</li>
<li><strong>إضافات أستير</strong>: إضافات يونانية لسفر أستير.</li>
</ul>
<h2>موقف الكنيسة القبطية</h2>
<p>تعتبر الكنيسة القبطية هذه الأسفار ملهَمة ومعتمدة ضمن قانون الكتاب المقدس، وتُقرأ في القداسات وتُستشهد بها في التعليم الكنسي مثلها مثل سائر أسفار الكتاب المقدس.</p>
<p><a href="${SITE}/bible">قراءة الكتاب المقدس</a> | <a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/orthodox/books">الكتب الأرثوذكسية</a></p>`,

    "/orthodox/maps": `<h1>خرائط الكتاب المقدس — جغرافيا الأرض المقدسة والأحداث الكتابية</h1>
<p>خرائط تفاعلية ومعلومات جغرافية عن الأماكن الواردة في الكتاب المقدس — من مصر وفلسطين إلى آسيا الصغرى واليونان وروما.</p>
<h2>أهم المواقع الجغرافية في الكتاب المقدس</h2>
<ul>
<li><strong>مصر</strong>: أرض الخروج — موطن يوسف وموسى، ملجأ العائلة المقدسة.</li>
<li><strong>أرض كنعان (فلسطين)</strong>: وطن بني إسرائيل، مسرح معظم أحداث العهد القديم.</li>
<li><strong>أورشليم</strong>: عاصمة المملكة، موضع الهيكل، مكان الصلب والقيامة.</li>
<li><strong>الجليل</strong>: موطن يسوع المسيح، مسرح كثير من معجزاته وتعاليمه.</li>
<li><strong>الناصرة</strong>: مدينة طفولة السيد المسيح.</li>
<li><strong>بيت لحم</strong>: مكان ميلاد المسيح وداود الملك.</li>
<li><strong>الإسكندرية</strong>: مركز الكرازة المرقسية والمدرسة اللاهوتية.</li>
<li><strong>أنطاكية</strong>: حيث سُمي التلاميذ مسيحيين لأول مرة.</li>
<li><strong>روما</strong>: مسرح استشهاد بطرس وبولس الرسولين.</li>
</ul>
<h2>رحلات الرسول بولس</h2>
<p>قام الرسول بولس بثلاث رحلات تبشيرية كبرى أسس فيها كنائس في آسيا الصغرى واليونان وأوروبا، إضافة إلى رحلته النهائية إلى روما.</p>
<p><a href="${SITE}/bible">الكتاب المقدس</a> | <a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/orthodox/history">تاريخ الكنيسة</a></p>`,

    "/orthodox/pope-qa": `<h1>أسئلة وأجوبة قداسة البابا شنودة الثالث — إرث لاهوتي خالد</h1>
<p>مجموعة من أسئلة وأجوبة قداسة البابا شنودة الثالث (البابا الـ117 للإسكندرية، 1971-2012) في العقيدة والإيمان والحياة الروحية — من أعظم اللاهوتيين الأقباط في القرن العشرين.</p>
<h2>أسئلة في العقيدة</h2>
<ul>
<li><strong>س: ما هو معنى الثالوث القدوس؟</strong><br/>ج: الله واحد في جوهره، ثلاثة في أقانيمه: الآب والابن والروح القدس. ليسوا ثلاثة آلهة، بل إله واحد في ثلاثة أقانيم متمايزة.</li>
<li><strong>س: كيف نفهم التجسد الإلهي؟</strong><br/>ج: الكلمة الأزلية اتخذ لنفسه جسداً بشرياً من العذراء مريم، فصار إلهاً كاملاً وإنساناً كاملاً — بلا تغيير في لاهوته، ومتحداً مع الناسوت اتحاداً لا انفصال فيه.</li>
</ul>
<h2>أسئلة في الحياة الروحية</h2>
<ul>
<li><strong>س: كيف أنمو روحياً؟</strong><br/>ج: بالصلاة اليومية المنتظمة، وقراءة الكتاب المقدس، والاعتراف الدوري، والتناول المستمر، والخدمة الكنسية.</li>
<li><strong>س: ما هو دور الصوم في الحياة المسيحية؟</strong><br/>ج: الصوم رياضة روحية تقوي الإرادة وتُضعف الجسد المائل نحو الشهوات، وهو عبادة لله قبل أن يكون حمية جسدية.</li>
</ul>
<h2>عن البابا شنودة الثالث</h2>
<p>وُلد نظير جيد روفائيل جيد عام 1923، تنسّك في صحراء وادي النطرون، رُسم بابا عام 1971. ترك وراءه مئات الكتب في اللاهوت والروحانيات، وآلاف العظات والأسئلة والأجوبة التي تُعدّ مرجعاً للكنيسة القبطية.</p>
<p><a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/orthodox/qa">أسئلة لاهوتية</a> | <a href="${SITE}/orthodox/books">كتب الآباء</a></p>`,

    "/sitemap": `<h1>خريطة موقع الكتاب المقدس رفيقي</h1>
<p>دليل شامل بجميع أقسام وصفحات موقع الكتاب المقدس رفيقي.</p>
<h2>الكتاب المقدس</h2>
<ul>
<li><a href="${SITE}/bible">قراءة الكتاب المقدس كاملاً</a></li>
<li><a href="${SITE}/bible/التكوين/1">سفر التكوين — الإصحاح الأول</a></li>
<li><a href="${SITE}/bible/يوحنا/3">إنجيل يوحنا — الإصحاح الثالث</a></li>
<li><a href="${SITE}/bible/المزامير/23">مزمور 23 — الرب راعيَّ</a></li>
<li><a href="${SITE}/plans">خطط القراءة اليومية (30-365 يوم)</a></li>
<li><a href="${SITE}/search">البحث في الكتاب المقدس</a></li>
<li><a href="${SITE}/highlights">آياتي المظللة</a></li>
</ul>
<h2>التغذية الروحية</h2>
<ul>
<li><a href="${SITE}/emotions">آيات حسب مشاعرك</a></li>
<li><a href="${SITE}/daily-verse">آية اليوم</a></li>
<li><a href="${SITE}/challenge">تحدي القراءة المقدسة</a></li>
</ul>
<h2>الأرثوذوكسيات</h2>
<ul>
<li><a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a></li>
<li><a href="${SITE}/orthodox/agpeya">كتاب الأجبية — ساعات الصلاة السبع</a></li>
<li><a href="${SITE}/orthodox/synaxarium">السنكسار القبطي</a></li>
<li><a href="${SITE}/orthodox/kholagy">الخولاجي المقدس</a></li>
<li><a href="${SITE}/orthodox/hymns">الألحان القبطية والإبصلمودية</a></li>
<li><a href="${SITE}/orthodox/katameros">القطمارس</a></li>
<li><a href="${SITE}/orthodox/deacon">مردات الشماس</a></li>
<li><a href="${SITE}/orthodox/saints">سير القديسين الأقباط</a></li>
<li><a href="${SITE}/orthodox/creed">قانون الإيمان النيقاوي</a></li>
<li><a href="${SITE}/orthodox/books">الكتب الأرثوذكسية</a></li>
<li><a href="${SITE}/orthodox/tafseer">التفسير الأرثوذكسي</a></li>
<li><a href="${SITE}/orthodox/history">تاريخ الكنيسة القبطية</a></li>
<li><a href="${SITE}/orthodox/apocrypha">الأسفار الديوتيروكانونية</a></li>
</ul>
<h2>الأطفال والعائلة</h2>
<ul>
<li><a href="${SITE}/kids">قسم الأطفال</a></li>
<li><a href="${SITE}/kids/hymns">ترانيم الأطفال</a></li>
<li><a href="${SITE}/kids/videos">قصص بالفيديو</a></li>
<li><a href="${SITE}/kids/stories">قصص مصورة</a></li>
<li><a href="${SITE}/kids/memorize">حفظ الآيات</a></li>
<li><a href="${SITE}/family">ركن العائلة المسيحية</a></li>
<li><a href="${SITE}/service">قسم الخدمة</a></li>
</ul>
<h2>المجتمع والكنائس</h2>
<ul>
<li><a href="${SITE}/groups">المجموعات</a></li>
<li><a href="${SITE}/church">الكنائس القبطية</a></li>
</ul>
<h2>عن الموقع</h2>
<ul>
<li><a href="${SITE}/about">من نحن</a></li>
<li><a href="${SITE}/contact">تواصل معنا</a></li>
<li><a href="${SITE}/privacy">سياسة الخصوصية</a></li>
<li><a href="${SITE}/terms">شروط الاستخدام</a></li>
</ul>`,

    "/terms": `<h1>شروط وأحكام استخدام موقع الكتاب المقدس رفيقي</h1>
<p>باستخدامك لموقع الكتاب المقدس رفيقي، فإنك توافق على الشروط والأحكام التالية. يُرجى قراءتها بعناية.</p>
<h2>استخدام المحتوى</h2>
<ul>
<li>المحتوى المنشور على الموقع (نصوص الكتاب المقدس، التفاسير، الألحان) للاستخدام الشخصي والتعليمي والروحي فقط.</li>
<li>لا يُسمح بإعادة نشر محتوى الموقع تجارياً دون إذن مسبق.</li>
<li>نصوص الكتاب المقدس مصدرها ترجمات تقليدية عربية وهي في الملكية العامة.</li>
</ul>
<h2>إخلاء المسؤولية</h2>
<ul>
<li>المحتوى الديني والتفاسير المقدمة هي لأغراض التثقيف الروحي ولا تُغني عن الرجوع لأب الاعتراف أو الراعي الكنسي.</li>
<li>المحتوى المُولَّد بالذكاء الاصطناعي (في قسم الخدمة) هو مساعد للتحضير فقط.</li>
</ul>
<h2>الخصوصية والبيانات</h2>
<p>نلتزم بحماية بياناتك. لمزيد من التفاصيل راجع <a href="${SITE}/privacy">سياسة الخصوصية</a>.</p>
<h2>التعديلات</h2>
<p>نحتفظ بحق تعديل هذه الشروط في أي وقت. الاستمرار في استخدام الموقع يعني قبولك للشروط المعدلة.</p>
<p><a href="${SITE}/privacy">سياسة الخصوصية</a> | <a href="${SITE}/contact">تواصل معنا</a> | <a href="${SITE}/about">من نحن</a></p>`,

    "/premium": `<h1>الاشتراك المميز في رفيقي — ميزات متقدمة للرحلة الروحية</h1>
<p>ارتقِ بتجربتك الروحية مع الاشتراك المميز في الكتاب المقدس رفيقي. ميزات متقدمة تساعدك على التعمق أكثر في كلمة الله.</p>
<h2>ما يقدمه الاشتراك المميز</h2>
<ul>
<li><strong>البحث الذكي بالمعنى (Semantic Search)</strong>: ابحث بأفكارك لا بالكلمات الحرفية فقط — يفهم محرك البحث نيّتك.</li>
<li><strong>تحليل المشاعر المتقدم</strong>: آيات مقترحة بدقة أعلى بناءً على مشاعرك الحالية.</li>
<li><strong>اقتراحات آيات مخصصة</strong>: توصيات يومية تتناسب مع رحلتك الروحية الشخصية.</li>
<li><strong>قسم الخدمة الكامل</strong>: للكهنة وخدام مدارس الأحد — مولِّد العظات والدروس بالذكاء الاصطناعي.</li>
<li><strong>بلا قيود على الاستخدام</strong>: وصول غير محدود لجميع الأدوات الذكية.</li>
</ul>
<h2>لمن يصلح الاشتراك المميز؟</h2>
<ul>
<li>الآباء الكهنة الراغبين في أداة احترافية لإعداد العظات.</li>
<li>خدام مدارس الأحد لإعداد الدروس بأسلوب إبداعي.</li>
<li>المؤمنين الراغبين في تجربة روحية أعمق وأكثر تخصيصاً.</li>
</ul>
<p><a href="${SITE}/service">قسم الخدمة</a> | <a href="${SITE}/bible">الكتاب المقدس</a> | <a href="${SITE}/about">عن الموقع</a></p>`,

    "/church": `<h1>دليل الكنائس القبطية الأرثوذكسية — ابحث عن كنيستك</h1>
<p>دليل شامل للكنائس القبطية الأرثوذكسية في مصر ومختلف دول العالم. تواصل مع مجتمعك الكنسي وتابع قراءة الكتاب المقدس مع جماعتك.</p>
<h2>الكنيسة القبطية الأرثوذكسية</h2>
<p>تضم الكنيسة القبطية الأرثوذكسية أكثر من 2500 كنيسة في مصر وحدها، إضافة إلى مئات الكنائس في المهجر عبر أمريكا الشمالية وأوروبا وأستراليا وكندا.</p>
<h2>أبرشيات الكنيسة القبطية في مصر</h2>
<ul>
<li>القاهرة والجيزة — المركز الرئيسي للبطريركية</li>
<li>الإسكندرية — مقر الكرازة المرقسية التاريخية</li>
<li>أسيوط والصعيد — قلب الوجود القبطي التاريخي</li>
<li>المنيا وسوهاج وقنا وأسوان — المحافظات ذات الكثافة القبطية</li>
<li>الغربية والمنوفية والبحيرة — أبرشيات الوجه البحري</li>
</ul>
<h2>كيف تجد كنيستك؟</h2>
<p>استخدم محرك البحث في صفحة الكنائس للبحث حسب المحافظة أو المدينة. يمكنك أيضاً اقتراح إضافة كنيسة غير موجودة.</p>
<p><a href="${SITE}/church-request">أضف كنيستك</a> | <a href="${SITE}/orthodox">قسم الأرثوذوكسيات</a> | <a href="${SITE}/groups">المجموعات</a></p>`,

    "/challenge": `<h1>تحدي القراءة المقدسة — نافس وتقدم في قراءة الكتاب المقدس</h1>
<p>شارك في تحديات قراءة الكتاب المقدس مع مجتمع رفيقي. احرز إنجازات روحية، تابع تقدمك، وشارك أصدقاءك في رحلة القراءة.</p>
<h2>أنواع التحديات</h2>
<ul>
<li><strong>تحدي السنة الكاملة</strong>: اقرأ الكتاب المقدس كاملاً في 365 يوماً — 3 إصحاحات يومياً تقريباً.</li>
<li><strong>تحدي الشهر</strong>: اقرأ سفراً كاملاً في شهر واحد — يناسب المبتدئين.</li>
<li><strong>تحدي العهد الجديد</strong>: اقرأ العهد الجديد (27 سفراً) في 90 يوماً.</li>
<li><strong>تحدي المزامير</strong>: اقرأ مزمور كل يوم خلال شهر واحد (150 مزموراً).</li>
</ul>
<h2>لماذا تشارك في التحدي؟</h2>
<ul>
<li>المحاسبة المشتركة تساعدك على الالتزام بالقراءة اليومية.</li>
<li>إنجازات مرئية تُحفزك على الاستمرار.</li>
<li>مشاركة التقدم مع الأصدقاء تُعمّق التجربة الروحية.</li>
</ul>
<p><a href="${SITE}/plans">خطط القراءة</a> | <a href="${SITE}/bible">الكتاب المقدس</a> | <a href="${SITE}/groups">المجموعات</a></p>`,

    "/kids/memorize": `<h1>حفظ آيات الكتاب المقدس للأطفال — طريقة مسيحية ممتعة</h1>
<p>تعلّم الأطفال حفظ آيات الكتاب المقدس بطريقة تفاعلية وممتعة. الحفظ ينمي الذاكرة الروحية ويرسّخ كلمة الله في القلب منذ الصغر.</p>
<h2>آيات مقترحة للحفظ حسب العمر</h2>
<h3>للأطفال الصغار (4-7 سنوات)</h3>
<ul>
<li>"الرب راعيَّ فلا يعوزني شيء" — مزمور 23:1</li>
<li>"محبوب يا يسوع في قلبي" — ترنيمة</li>
<li>"هكذا أحب الله العالم" — يوحنا 3:16</li>
<li>"الله محبة" — 1 يوحنا 4:8</li>
</ul>
<h3>للأطفال الكبار (8-12 سنوات)</h3>
<ul>
<li>"أنا هو الطريق والحق والحياة" — يوحنا 14:6</li>
<li>"اطلبوا أولاً ملكوت الله وبره" — متى 6:33</li>
<li>"أستطيع كل شيء في المسيح الذي يقويني" — فيلبي 4:13</li>
<li>"كلمتك سراج لقدمي ونور لسبيلي" — مزمور 119:105</li>
</ul>
<h2>طرق الحفظ الممتعة للأطفال</h2>
<ul>
<li>الترديد مع الحركات والإيماءات</li>
<li>الحفظ بالألحان والترانيم</li>
<li>بطاقات ذاكرة ملوّنة</li>
<li>المسابقات العائلية</li>
</ul>
<p><a href="${SITE}/kids">قسم الأطفال</a> | <a href="${SITE}/kids/hymns">ترانيم الأطفال</a> | <a href="${SITE}/bible">الكتاب المقدس</a></p>`,

    "/kids/games": `<h1>ألعاب وأنشطة الكتاب المقدس للأطفال — تعلّم وانبسط</h1>
<p>أنشطة وألعاب تفاعلية مستوحاة من قصص الكتاب المقدس للأطفال — التعلم من خلال اللعب يُرسّخ المعلومة ويُقوي الإيمان.</p>
<h2>أنواع الأنشطة المتاحة</h2>
<ul>
<li><strong>أسئلة وإجابات كتابية</strong>: اختبر معلوماتك عن قصص الكتاب المقدس.</li>
<li><strong>مطابقة الآيات</strong>: اربط الآية بالسفر الصحيح.</li>
<li><strong>تصحيح الجمل</strong>: اكتشف الخطأ في الآية المكتوبة.</li>
<li><strong>ترتيب القصة</strong>: رتّب أحداث القصة الكتابية بالترتيب الصحيح.</li>
</ul>
<h2>لماذا الألعاب الكتابية؟</h2>
<p>الطفل الذي يتعلم من خلال اللعب يحتفظ بالمعلومة أطول وأعمق. الألعاب الكتابية تُعرّف الأطفال على شخصيات وقصص وآيات الكتاب المقدس بأسلوب شيّق لا يُنسى.</p>
<p><a href="${SITE}/kids">قسم الأطفال</a> | <a href="${SITE}/kids/stories">قصص مصورة</a> | <a href="${SITE}/kids/memorize">حفظ الآيات</a></p>`,

    "/kids/adventures": `<h1>مغامرات الإيمان للأطفال — رحلات في قصص الكتاب المقدس</h1>
<p>مغامرات تفاعلية تأخذ الأطفال في رحلة ممتعة عبر قصص الكتاب المقدس. كل مغامرة تروي قصة كتابية وتعلّم درساً روحياً.</p>
<h2>مغامرات شهيرة من الكتاب المقدس</h2>
<ul>
<li><strong>مغامرة نوح</strong>: بناء السفينة، الطوفان العظيم، وقوس قزح وعد الله.</li>
<li><strong>مغامرة موسى</strong>: العليقة المشتعلة، الخروج من مصر، عبور البحر الأحمر.</li>
<li><strong>مغامرة يوسف</strong>: من الجُبّ إلى القصر — كيف حوّل الله الألم لبركة.</li>
<li><strong>مغامرة داود</strong>: الراعي الصغير الذي واجه العملاق جالوت.</li>
<li><strong>مغامرة يونان</strong>: داخل الحوت الكبير — درس عن طاعة الله.</li>
<li><strong>مغامرة دانيال</strong>: الأتون الملتهب وجُبّ الأسود — الثبات في الإيمان.</li>
</ul>
<p><a href="${SITE}/kids">قسم الأطفال</a> | <a href="${SITE}/kids/stories">قصص مصورة</a> | <a href="${SITE}/kids/videos">قصص بالفيديو</a></p>`,

    "/kids/parents": `<h1>ركن الآباء والأمهات المسيحيين — تربية روحية في البيت</h1>
<p>دليل عملي للآباء المسيحيين لتربية أطفالهم روحياً في البيت، بأدوات وموارد مناسبة لكل مرحلة عمرية.</p>
<h2>نصائح عملية للتربية المسيحية</h2>
<ul>
<li><strong>الصلاة العائلية اليومية</strong>: خصّص وقتاً يومياً للصلاة مع أطفالك — صباحاً أو مساءً. حتى 5 دقائق تبني عادة روحية قوية.</li>
<li><strong>قراءة الكتاب المقدس معاً</strong>: اقرأ قصة كتابية واحدة كل مساء قبل النوم. استخدم قصصاً مبسطة للأطفال الصغار.</li>
<li><strong>الذهاب للكنيسة أسبوعياً</strong>: احضر القداس الإلهي وحصص مدارس الأحد مع أطفالك.</li>
<li><strong>حفظ الآيات</strong>: علّم أطفالك آية جديدة كل أسبوع.</li>
<li><strong>مشاهدة الفيديوهات الدينية معاً</strong>: استخدم قصص الكتاب المقدس بالفيديو كوسيلة تعليمية ممتعة.</li>
</ul>
<h2>الأسئلة الشائعة من الآباء</h2>
<ul>
<li><strong>في أي سن أبدأ التعليم الديني؟</strong>: من سن 2-3 سنوات — بالصلاة البسيطة والترانيم.</li>
<li><strong>كيف أتعامل مع الأسئلة الصعبة؟</strong>: كن صادقاً، وأشرك الكاهن أو معلم مدرسة الأحد في الإجابة.</li>
</ul>
<p><a href="${SITE}/family">ركن العائلة</a> | <a href="${SITE}/kids">قسم الأطفال</a> | <a href="${SITE}/kids/stories">قصص للأطفال</a></p>`,

    "/groups": `<h1>مجموعات الكتاب المقدس — اقرأ وتأمّل مع الجماعة</h1>
<p>انضم إلى مجموعات قراءة الكتاب المقدس في رفيقي — تشارك الدراسة الكتابية مع أصدقائك، ومتابعة التقدم معاً، والتشجيع المتبادل في الرحلة الروحية.</p>
<h2>لماذا القراءة الجماعية؟</h2>
<ul>
<li>المحاسبة الجماعية تُعزز الانتظام في القراءة اليومية.</li>
<li>تبادل التأملات يُعمّق الفهم الروحي.</li>
<li>التشجيع المتبادل يُقوّي الإيمان في الجماعة.</li>
<li>"إذ اجتمع اثنان أو ثلاثة باسمي أنا هناك في وسطهم" — متى 18:20</li>
</ul>
<h2>كيف تنشئ مجموعة؟</h2>
<ol>
<li>أنشئ مجموعة جديدة وحدد اسمها وموضوعها.</li>
<li>شارك رابط الدعوة مع أصدقائك وزملائك في الخدمة.</li>
<li>حددوا خطة قراءة مشتركة.</li>
<li>تابعوا التقدم وشاركوا التأملات.</li>
</ol>
<p><a href="${SITE}/groups/create">أنشئ مجموعة</a> | <a href="${SITE}/groups/join">انضم لمجموعة</a> | <a href="${SITE}/plans">خطط القراءة</a></p>`,
  };

  const body = richBodies[path] || `<h1>${page.title.split('|')[0].trim()}</h1>\n<p>${page.desc}</p>`;

  const pageOgImage = path === '/orthodox' ? buildOrthodoxOgUrl('أرثوذوكسيات') : undefined;
  return wrapHtml(page.title, page.desc, canonical, body, page.schema, pageOgImage, noindex);
}

let cachedBooks: Array<{ id: number; name: string; chaptersCount: number }> | null = null;

async function ensureBooks() {
  if (!cachedBooks) {
    cachedBooks = (await storage.getAllBooks()).map(b => ({
      id: b.id,
      name: b.name,
      chaptersCount: b.chaptersCount
    }));
  }
  return cachedBooks;
}

function serveCached(res: Response, cacheKey: string): boolean {
  const cached = snapshotCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("X-Bot-Snapshot", "cached");
    res.set("X-Robots-Tag", cached.noindex ? "noindex, follow" : "index, follow");
    res.send(cached.html);
    return true;
  }
  return false;
}

function cacheAndServe(res: Response, cacheKey: string, html: string, noindex?: boolean) {
  snapshotCache.set(cacheKey, { html, ts: Date.now(), noindex });
  evictOldest();
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("X-Bot-Snapshot", "fresh");
  res.set("X-Robots-Tag", noindex ? "noindex, follow" : "index, follow");
  res.send(html);
}

export async function botSnapshotMiddleware(req: Request, res: Response, next: NextFunction) {
  const ua = req.headers["user-agent"] || "";
  if (!isBot(ua)) return next();

  const path = req.path;
  const bookParam = req.query.book as string | undefined;
  const chapterParam = req.query.chapter as string | undefined;

  // ── Path-based: /bible/:book/:chapter/:view (video, tafsir, lesson) ─────
  const bibleChapterViewPath = path.match(/^\/bible\/([^/]+)\/(\d+)\/(video|tafsir|lesson)$/);
  if (bibleChapterViewPath) {
    try {
      const bookName = decodeURIComponent(bibleChapterViewPath[1]);
      const chapter = parseInt(bibleChapterViewPath[2], 10);
      const view = bibleChapterViewPath[3];
      const books = await ensureBooks();
      const book = books.find(b => b.name === bookName);
      if (!book || isNaN(chapter) || chapter < 1 || chapter > book.chaptersCount) {
        res.status(404).send('Not Found');
        return;
      }

      const cacheKey = `ch:${bookName}:${chapter}:${view}`;
      if (serveCached(res, cacheKey)) return;

      let html: string;

      if (view === 'tafsir') {
        // Render real tafsir content from CSV files — unique indexable content
        const csvName = getCSVName(bookName);
        const tafsirText = csvName ? getChapterTafsir(csvName, chapter) : null;
        const bookIntro = csvName ? getBookIntro(csvName) : null;
        html = buildTafsirSnapshot(book.name, chapter, tafsirText, bookIntro, books);

      } else if (view === 'video') {
        // Render VideoObject schema with real YouTube ID
        const videoId = videoLinks[bookName]?.[chapter];
        const chanteRaw = chanteVideos[bookName]?.[chapter] ?? null;
        const chanteId = chanteRaw ? (typeof chanteRaw === 'string' ? chanteRaw : chanteRaw.id) : null;
        if (!videoId && !chanteId) return next(); // no video — skip, don't waste crawl budget
        html = buildVideoSnapshot(book.name, chapter, videoId || chanteId!, chanteId, books);

      } else {
        // 'lesson' — dynamic RSS content, not indexable; redirect bot to chapter page
        return next();
      }

      return cacheAndServe(res, cacheKey, html);
    } catch (err) {
      console.error("[bot-snapshot] Error:", err);
      return next();
    }
  }

  // ── Path-based: /bible/:book/:chapter ────────────────────────────────────
  const bibleChapterPath = path.match(/^\/bible\/([^/]+)\/(\d+)$/);
  if (bibleChapterPath) {
    try {
      const bookName = decodeURIComponent(bibleChapterPath[1]);
      const chapter = parseInt(bibleChapterPath[2], 10);
      const books = await ensureBooks();
      const book = books.find(b => b.name === bookName);
      if (!book || isNaN(chapter) || chapter < 1 || chapter > book.chaptersCount) {
        res.status(404).send('Not Found');
        return;
      }

      const cacheKey = `ch:${bookName}:${chapter}`;
      if (serveCached(res, cacheKey)) return;

      const verses = await storage.getVersesByBook(book.id, chapter);
      if (!verses || verses.length === 0) return next();

      const html = buildChapterSnapshot(
        book.name, chapter,
        verses.map(v => ({ verse: v.verse, text: v.text })),
        books
      );
      return cacheAndServe(res, cacheKey, html);
    } catch (err) {
      console.error("[bot-snapshot] Error:", err);
      return next();
    }
  }

  // ── Path-based: /bible/:book ──────────────────────────────────────────────
  const bibleBookPath = path.match(/^\/bible\/([^/]+)$/);
  if (bibleBookPath) {
    try {
      const bookName = decodeURIComponent(bibleBookPath[1]);
      const books = await ensureBooks();
      const book = books.find(b => b.name === bookName);
      if (!book) return next();

      const cacheKey = `bk:${bookName}`;
      if (serveCached(res, cacheKey)) return;

      const html = buildBookSnapshot(book.name, book.chaptersCount, books);
      return cacheAndServe(res, cacheKey, html);
    } catch (err) {
      console.error("[bot-snapshot] Error:", err);
      return next();
    }
  }

  // ── Legacy query-string: /bible?book=X&chapter=Y (redirect bots to path-based) ──
  if (path === "/bible" && bookParam) {
    try {
      const books = await ensureBooks();
      const book = books.find(b => b.name === bookParam);
      if (!book) return next();

      if (chapterParam) {
        const chapter = parseInt(chapterParam, 10);
        if (isNaN(chapter) || chapter < 1 || chapter > book.chaptersCount) return next();
        return res.redirect(301, `/bible/${encodeURIComponent(book.name)}/${chapter}`);
      } else {
        return res.redirect(301, `/bible/${encodeURIComponent(book.name)}`);
      }
    } catch (err) {
      console.error("[bot-snapshot] Error:", err);
      return next();
    }
  }

  // ── Topic pages: /topics/:slug ────────────────────────────────────────
  const topicMatch = path.match(/^\/topics\/([^/]+)$/);
  if (topicMatch) {
    const slug = topicMatch[1];
    try {
      const cacheKey = `tp:${slug}`;
      if (serveCached(res, cacheKey)) return;

      const topic = await storage.getSeoTopicBySlug(slug);
      if (!topic) return next();

      // Fetch verses via keyword matching
      const allVerses = await Promise.all(
        topic.keywords.slice(0, 3).map(kw => storage.smartSearchVerses(kw, 6))
      );
      const seen = new Set<number>();
      const verses = allVerses.flat()
        .filter(v => { if (seen.has(v.id)) return false; seen.add(v.id); return true; })
        .slice(0, 15);

      const canonical = `${SITE}/topics/${slug}`;
      const topicTitleFull = `آيات الكتاب المقدس عن ${topic.title} | الكتاب المقدس رفيقي`;
      const topicTitleShort = `آيات عن ${topic.title} | الكتاب المقدس رفيقي`;
      const title = topicTitleFull.length <= 70 ? topicTitleFull
        : topicTitleShort.length <= 70 ? topicTitleShort
        : `${topic.title} | الكتاب المقدس رفيقي`;
      const description = `مجموعة آيات من الكتاب المقدس عن ${topic.title}. ${verses.length} آية مختارة تتحدث عن ${topic.keywords.slice(0, 3).join('، ')}.`;

      const versesHtml = verses.map((v, i) =>
        `<li><strong>${esc((v as any).bookName || '')} ${v.chapter}:${v.verse}</strong> — ${esc(v.text.substring(0, 200))}</li>`
      ).join('\n');

      const internalLinks = getInternalLinks(topic.title, 5);
      const internalLinksHtml = buildInternalLinksHtml(internalLinks);

      const relatedTopics = await storage.getSimilarTopics(slug, topic.keywords, 5);
      const relatedLinksHtml = relatedTopics.length > 0
        ? relatedTopics.map(r => `<a href="${SITE}/topics/${r.slug}">${esc(r.title)}</a>`).join(' | ')
        : '';

      const webPageSchema = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        description,
        url: canonical,
        inLanguage: 'ar',
        about: { '@type': 'Thing', name: topic.title },
        publisher: { '@type': 'Organization', name: 'الكتاب المقدس رفيقي', url: SITE },
      };

      const itemListSchema = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `آيات عن ${topic.title}`,
        description,
        numberOfItems: verses.length,
        itemListElement: verses.slice(0, 10).map((v, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${(v as any).bookName || ''} ${v.chapter}:${v.verse}`,
          description: v.text.substring(0, 150),
        })),
      };

      const body = `
<nav aria-label="breadcrumb">
  <a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/search">البحث</a> &rsaquo; ${esc(topic.title)}
</nav>
<h1>آيات الكتاب المقدس عن ${esc(topic.title)}</h1>
<p><em>مجموعة آيات من الكتاب المقدس عن ${esc(topic.title)}. ${esc(description)}</em></p>
<section>
  <h2>الكلمات المفتاحية</h2>
  <p>${topic.keywords.map(k => esc(k)).join(' · ')}</p>
</section>
<article>
  <h2>الآيات (${verses.length})</h2>
  <ol>${versesHtml}</ol>
</article>
${relatedLinksHtml ? `<nav aria-label="مواضيع ذات صلة"><h2>مواضيع ذات صلة</h2><p>${relatedLinksHtml}</p></nav>` : ''}
<nav aria-label="روابط داخلية"><h2>روابط ذات صلة</h2><p>${internalLinksHtml}</p></nav>
<p><a href="${SITE}/search?q=${encodeURIComponent(topic.title)}">بحث أعمق عن "${esc(topic.title)}"</a></p>`;

      const html = wrapHtml(title, description, canonical, body, [webPageSchema, itemListSchema]);
      storage.incrementTopicVisit(slug).catch(() => {});
      return cacheAndServe(res, cacheKey, html);
    } catch (err) {
      console.error('[bot-snapshot] Topic error:', err);
      return next();
    }
  }

  // ── Video pages: /video/:youtubeId ───────────────────────────────────────
  const videoMatch = path.match(/^\/video\/([A-Za-z0-9_\-]+)$/);
  if (videoMatch) {
    const youtubeId = videoMatch[1];
    const cacheKey = `vid:${youtubeId}`;
    if (serveCached(res, cacheKey)) return;

    const v = getVideoSeoById(youtubeId);
    const canonical = `${SITE}/video/${youtubeId}`;
    const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
    const embedUrl = `https://www.youtube.com/embed/${youtubeId}`;

    const chapterLink = v.book && v.chapter
      ? `<p><a href="${SITE}/bible?book=${encodeURIComponent(v.book)}&chapter=${v.chapter}">📖 اقرأ ${esc(v.book)} الإصحاح ${v.chapter}</a></p>`
      : "";
    const bookLink = v.book
      ? `<p><a href="${SITE}/bible?book=${encodeURIComponent(v.book)}">📚 تفسير ${esc(v.book)} كامل</a></p>`
      : "";

    const relatedLinks = getInternalLinks(v.title, 4);
    const relatedLinksHtml = buildInternalLinksHtml(relatedLinks);

    const videoSchema = {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "name": v.title,
      "description": v.description,
      "thumbnailUrl": thumbnailUrl,
      "embedUrl": embedUrl,
      "uploadDate": new Date().toISOString().split("T")[0],
      "inLanguage": "ar",
      "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE },
      ...(v.book && v.chapter ? {
        "about": {
          "@type": "Book",
          "name": v.book,
          "inLanguage": "ar"
        }
      } : {})
    };

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": SITE },
        { "@type": "ListItem", "position": 2, "name": "الكتاب المقدس", "item": `${SITE}/bible` },
        ...(v.book ? [{ "@type": "ListItem", "position": 3, "name": esc(v.title), "item": canonical }] : []),
      ]
    };

    const body = `
<nav aria-label="breadcrumb">
  <a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/bible">الكتاب المقدس</a>${v.book ? ` &rsaquo; <a href="${SITE}/bible?book=${encodeURIComponent(v.book)}">${esc(v.book)}</a>` : ""}
</nav>
<h1>${esc(v.title)}</h1>
<p><em>${esc(v.description)}</em></p>
<figure>
  <img src="${thumbnailUrl}" alt="${esc(v.title)}" width="640" height="360" loading="lazy">
  <figcaption>${esc(v.title)}</figcaption>
</figure>
<section>
  <h2>مشاهدة الفيديو</h2>
  <p><a href="https://www.youtube.com/watch?v=${youtubeId}" rel="noopener noreferrer" target="_blank">مشاهدة على YouTube &#8599;</a></p>
  <p><a href="${SITE}/video/${youtubeId}">مشاهدة على موقعنا</a></p>
</section>
<section>
  <h2>الكلمات المفتاحية</h2>
  <p>${v.keywords.map(k => esc(k)).join(" · ")}</p>
</section>
<nav>
${chapterLink}
${bookLink}
<p><a href="${SITE}/bible">📖 الكتاب المقدس كاملاً</a></p>
<p><a href="${SITE}/plans">📅 خطط القراءة</a></p>
</nav>
<nav aria-label="مواضيع ذات صلة"><h2>روابط ذات صلة</h2><p>${relatedLinksHtml}</p></nav>`;

    const html = wrapHtml(v.title, v.description, canonical, body, [videoSchema, breadcrumb]);
    return cacheAndServe(res, cacheKey, html);
  }

  // ── Emotions type pages: /emotions/:type ─────────────────────────────────
  const emotionMatch = path.match(/^\/emotions\/([^/]+)$/);
  if (emotionMatch) {
    const emotionType = decodeURIComponent(emotionMatch[1]);
    const cacheKey = `em:${emotionType}`;
    if (serveCached(res, cacheKey)) return;

    const canonical = `${SITE}/emotions/${encodeURIComponent(emotionType)}`;
    const emotionTitleFull = `آيات الكتاب المقدس عن ${emotionType} | تغذية روحية | الكتاب المقدس رفيقي`;
    const title = emotionTitleFull.length <= 70 ? emotionTitleFull : `آيات الكتاب المقدس عن ${emotionType} | رفيقي`;
    const description = `اعثر على آيات الكتاب المقدس التي تتحدث عن ${emotionType}. آيات مختارة تمنحك الدعم والتشجيع الروحي.`;

    const verses = await storage.smartSearchVerses(emotionType, 12).catch(() => []);
    const versesHtml = verses.slice(0, 10).map(v =>
      `<li><strong>${esc((v as any).bookName || '')} ${v.chapter}:${v.verse}</strong> — ${esc(v.text.substring(0, 200))}</li>`
    ).join('\n');

    const schema = [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": title,
        "description": description,
        "url": canonical,
        "inLanguage": "ar",
        "about": { "@type": "Thing", "name": emotionType },
        "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
      },
      ...(verses.length > 0 ? [{
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": `آيات الكتاب المقدس عن ${emotionType}`,
        "numberOfItems": verses.length,
        "itemListElement": verses.slice(0, 8).map((v, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "name": `${(v as any).bookName || ''} ${v.chapter}:${v.verse}`,
          "description": v.text.substring(0, 150),
        })),
      }] : []),
    ];

    const body = `
<nav aria-label="breadcrumb">
  <a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/emotions">التغذية الروحية</a> &rsaquo; ${esc(emotionType)}
</nav>
<h1>آيات الكتاب المقدس عن ${esc(emotionType)}</h1>
<p><em>${esc(description)}</em></p>
${versesHtml ? `<article><h2>آيات عن ${esc(emotionType)} (${verses.length})</h2><ol>${versesHtml}</ol></article>` : ''}
<nav>
  <h2>استكشف المزيد</h2>
  <ul>
    <li><a href="${SITE}/emotions">جميع المشاعر والتغذية الروحية</a></li>
    <li><a href="${SITE}/bible">قراءة الكتاب المقدس</a></li>
    <li><a href="${SITE}/search?q=${encodeURIComponent(emotionType)}">البحث عن "${esc(emotionType)}"</a></li>
    <li><a href="${SITE}/plans">خطط القراءة اليومية</a></li>
  </ul>
</nav>`;

    const html = wrapHtml(title, description, canonical, body, schema);
    return cacheAndServe(res, cacheKey, html);
  }

  // ── Audio/listen pages: /listen/:book/:chapter ───────────────────────────
  const listenMatch = path.match(/^\/listen\/([^/]+)\/(\d+)$/);
  if (listenMatch) {
    const bookName = decodeURIComponent(listenMatch[1]);
    const chapter = parseInt(listenMatch[2], 10);
    if (!isNaN(chapter) && chapter > 0) {
      const cacheKey = `li:${bookName}:${chapter}`;
      if (serveCached(res, cacheKey)) return;

      const canonical = `${SITE}/listen/${encodeURIComponent(bookName)}/${chapter}`;
      const title = `استماع ${bookName} الإصحاح ${chapter} | الكتاب المقدس الصوتي`;
      const description = `استمع لسفر ${bookName} الإصحاح ${chapter} صوتياً. قراءة صوتية للكتاب المقدس باللغة العربية.`;

      const schema = {
        "@context": "https://schema.org",
        "@type": "AudioObject",
        "name": title,
        "description": description,
        "inLanguage": "ar",
        "url": canonical,
        "about": { "@type": "Book", "name": bookName, "inLanguage": "ar" }
      };

      const body = `
<nav aria-label="breadcrumb">
  <a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/bible/${encodeURIComponent(bookName)}">${esc(bookName)}</a> &rsaquo; استماع الإصحاح ${chapter}
</nav>
<h1>${esc(title)}</h1>
<p><em>${esc(description)}</em></p>
<nav>
  <ul>
    <li><a href="${SITE}/bible/${encodeURIComponent(bookName)}/${chapter}">📖 قراءة ${esc(bookName)} ${chapter}</a></li>
    <li><a href="${SITE}/bible/${encodeURIComponent(bookName)}">📚 جميع إصحاحات ${esc(bookName)}</a></li>
    ${chapter > 1 ? `<li><a href="${SITE}/listen/${encodeURIComponent(bookName)}/${chapter - 1}">🔊 الإصحاح ${chapter - 1}</a></li>` : ""}
    <li><a href="${SITE}/listen/${encodeURIComponent(bookName)}/${chapter + 1}">🔊 الإصحاح ${chapter + 1}</a></li>
  </ul>
</nav>`;

      const html = wrapHtml(title, description, canonical, body, schema);
      return cacheAndServe(res, cacheKey, html);
    }
  }

  // ── Kids story pages: /kids/story/:id ────────────────────────────────────
  const kidsStoryMatch = path.match(/^\/kids\/story\/(\d+)$/);
  if (kidsStoryMatch) {
    const storyId = parseInt(kidsStoryMatch[1], 10);
    const cacheKey = `ks:${storyId}`;
    if (serveCached(res, cacheKey)) return;

    const canonical = `${SITE}/kids/story/${storyId}`;
    const title = `قصة الكتاب المقدس للأطفال رقم ${storyId} | قصص مسيحية للأطفال`;
    const description = `قصة مسيحية مصورة للأطفال من الكتاب المقدس. محتوى تعليمي ديني آمن ومناسب للأطفال.`;

    const schema = {
      "@context": "https://schema.org",
      "@type": "Article",
      "name": title,
      "description": description,
      "url": canonical,
      "inLanguage": "ar",
      "audience": { "@type": "PeopleAudience", "suggestedMinAge": 4, "suggestedMaxAge": 12 },
      "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
    };

    const body = `
<nav aria-label="breadcrumb">
  <a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/kids">الأطفال</a> &rsaquo; <a href="${SITE}/kids/stories">القصص</a> &rsaquo; القصة ${storyId}
</nav>
<h1>${esc(title)}</h1>
<p><em>${esc(description)}</em></p>
<nav>
  <ul>
    <li><a href="${SITE}/kids">قسم الأطفال</a></li>
    <li><a href="${SITE}/kids/stories">جميع القصص المصورة</a></li>
    ${storyId > 1 ? `<li><a href="${SITE}/kids/story/${storyId - 1}">القصة السابقة</a></li>` : ""}
    <li><a href="${SITE}/kids/story/${storyId + 1}">القصة التالية</a></li>
  </ul>
</nav>`;

    const html = wrapHtml(title, description, canonical, body, schema);
    return cacheAndServe(res, cacheKey, html);
  }

  // ── Plans with query param: /plans?plan=plan-30 etc. ─────────────────────
  if (path === "/plans" && req.query.plan) {
    const planId = String(req.query.plan);
    const PLANS: Record<string, { name: string; days: number; desc: string }> = {
      'plan-30':  { name: 'خطة القراءة ٣٠ يوم',        days: 30,  desc: 'اقرأ أهم قصص الكتاب المقدس في ثلاثين يوماً' },
      'plan-60':  { name: 'خطة القراءة ٦٠ يوم',        days: 60,  desc: 'رحلة عبر العهد الجديد كاملاً في ستين يوماً' },
      'plan-90':  { name: 'خطة القراءة ٩٠ يوم',        days: 90,  desc: 'دراسة معمقة للإنجيل والرسائل في تسعين يوماً' },
      'plan-180': { name: 'خطة القراءة ٦ شهور',        days: 180, desc: 'قراءة شاملة للكتاب المقدس في ستة أشهر' },
      'plan-365': { name: 'خطة القراءة سنة كاملة',     days: 365, desc: 'اقرأ الكتاب المقدس بالكامل في سنة' },
    };
    const plan = PLANS[planId];
    if (plan) {
      const cacheKey = `plan:${planId}`;
      if (serveCached(res, cacheKey)) return;
      const canonical = `${SITE}/plans?plan=${encodeURIComponent(planId)}`;
      const title = `${plan.name} | خطط قراءة الكتاب المقدس | رفيقي`;
      const description = `${plan.desc}. خطة قراءة يومية منظمة تساعدك على الاستمرار في القراءة الروحية للكتاب المقدس باللغة العربية.`;
      const schema = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": plan.name,
        "description": description,
        "totalTime": `P${plan.days}D`,
        "inLanguage": "ar",
        "url": canonical,
        "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
      };
      const body = `
<nav aria-label="breadcrumb"><a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/plans">خطط القراءة</a> &rsaquo; ${esc(plan.name)}</nav>
<h1>${esc(title)}</h1>
<p>${esc(description)}</p>
<p>المدة: <strong>${plan.days} يوم</strong> — قراءة يومية منتظمة من الكتاب المقدس.</p>
<section>
  <h2>خطط قراءة أخرى</h2>
  <ul>
    ${Object.entries(PLANS).filter(([id]) => id !== planId).map(([id, p]) =>
      `<li><a href="${SITE}/plans?plan=${encodeURIComponent(id)}">${esc(p.name)} (${p.days} يوم)</a></li>`
    ).join('\n    ')}
  </ul>
</section>
<p><a href="${SITE}/bible">ابدأ القراءة من الكتاب المقدس</a> | <a href="${SITE}/plans">كل خطط القراءة</a></p>`;
      return cacheAndServe(res, cacheKey, wrapHtml(title, description, canonical, body, schema));
    }
  }

  // ── Daily verse pages: /daily-verse and /daily-verse/:date ───────────────
  if (path === "/daily-verse" || path.match(/^\/daily-verse\/\d{4}-\d{2}-\d{2}$/)) {
    const cacheKey = `dv:${path}`;
    if (serveCached(res, cacheKey)) return;

    const isArchive = path !== "/daily-verse";
    const dateStr = isArchive ? path.split("/").pop()! : new Date().toISOString().split("T")[0];
    const canonical = `${SITE}${path}`;

    // Try to fetch the actual verse for this date from calendar DB
    let verseText = "";
    let verseRef = "";
    try {
      const d = new Date(dateStr);
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const dv = await storage.getCalendarDailyVerse(month, day);
      if (dv?.verseText) {
        verseText = dv.verseText;
        verseRef = dv.verseReference ?? "";
      }
    } catch (_) {}

    const title = isArchive
      ? `آية اليوم ${dateStr} من الكتاب المقدس | رفيقي`
      : `آية اليوم من الكتاب المقدس — تأمل روحي يومي | رفيقي`;
    const rawDvDesc = verseText
      ? `"${verseText.slice(0, 100)}" — ${verseRef}. تأمل يومي روحي من الكتاب المقدس.`
      : `آية يومية من الكتاب المقدس${isArchive ? ` بتاريخ ${dateStr}` : ""}. تأمل يومي روحي مع الكتاب المقدس رفيقي.`;
    const description = rawDvDesc.length > 160 ? `${rawDvDesc.slice(0, 157).trim()}...` : rawDvDesc;

    const schema: object[] = [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": title,
        "description": description,
        "url": canonical,
        "inLanguage": "ar",
        "datePublished": dateStr,
        "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
      }
    ];
    if (verseText) {
      schema.push({
        "@context": "https://schema.org",
        "@type": "Quotation",
        "text": verseText,
        "citation": verseRef,
        "inLanguage": "ar",
        "isPartOf": { "@type": "Book", "name": "الكتاب المقدس" }
      });
    }

    const body = `
<h1>${esc(title)}</h1>
${verseText ? `<blockquote dir="rtl"><p>${esc(verseText)}</p><footer>— ${esc(verseRef)}</footer></blockquote>` : ""}
<p>${esc(description)}</p>
<section>
  <h2>أقرأ أيضاً</h2>
  <ul>
    <li><a href="${SITE}/daily-verse">آية اليوم</a></li>
    <li><a href="${SITE}/bible">قراءة الكتاب المقدس كاملاً</a></li>
    <li><a href="${SITE}/emotions">آيات حسب مشاعرك</a></li>
    <li><a href="${SITE}/plans">خطط القراءة اليومية</a></li>
  </ul>
</section>`;

    const html = wrapHtml(title, description, canonical, body, schema);
    return cacheAndServe(res, cacheKey, html);
  }

  // ── Church pages: /church/:id ─────────────────────────────────────────────
  const churchMatch = path.match(/^\/church\/(\d+)$/);
  if (churchMatch) {
    const churchId = parseInt(churchMatch[1], 10);
    try {
      const cacheKey = `ch-loc:${churchId}`;
      if (serveCached(res, cacheKey)) return;

      const church = await storage.getChurchById(churchId);
      if (!church || church.status !== 'approved') return next();

      const canonical = `${SITE}/church/${churchId}`;
      const churchTitleFull = `${church.name} | كنيسة قبطية أرثوذكسية — رفيقي`;
      const title = churchTitleFull.length <= 70 ? churchTitleFull : `${church.name} | كنيسة قبطية | رفيقي`;
      const description = `${church.name} — كنيسة قبطية أرثوذكسية في ${church.governorate}. تابع قراءة الكتاب المقدس مع مجتمع كنيستك.`;

      const schema = [
        {
          "@context": "https://schema.org",
          "@type": "Church",
          "name": church.name,
          "description": description,
          "url": canonical,
          "inLanguage": "ar",
          "address": {
            "@type": "PostalAddress",
            "addressRegion": church.governorate,
            "addressCountry": "EG"
          },
          "denomination": "القبطية الأرثوذكسية"
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": SITE },
            { "@type": "ListItem", "position": 2, "name": "الكنائس", "item": `${SITE}/church` },
            { "@type": "ListItem", "position": 3, "name": church.name, "item": canonical }
          ]
        }
      ];

      const body = `
<nav aria-label="breadcrumb"><a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/church">الكنائس</a> &rsaquo; ${esc(church.name)}</nav>
<h1>${esc(church.name)}</h1>
<p><strong>المحافظة:</strong> ${esc(church.governorate)}</p>
<p>${esc(description)}</p>
<nav>
  <ul>
    <li><a href="${SITE}/bible">قراءة الكتاب المقدس</a></li>
    <li><a href="${SITE}/plans">خطط القراءة</a></li>
    <li><a href="${SITE}/church">جميع الكنائس</a></li>
  </ul>
</nav>`;

      const html = wrapHtml(title, description, canonical, body, schema);
      return cacheAndServe(res, cacheKey, html);
    } catch (err) {
      console.error("[bot-snapshot] Church error:", err);
      return next();
    }
  }

  // ── Agpeya index: /orthodox/agpeya ───────────────────────────────────────
  if (path === "/orthodox/agpeya") {
    const cacheKey = "ag:index";
    if (serveCached(res, cacheKey)) return;
    const canonical = `${SITE}/orthodox/agpeya`;
    const title = "الأجبية القبطية — ساعات الصلاة السبع الأرثوذكسية | رفيقي";
    const description = "الأجبية القبطية: كتاب الصلوات اليومية للمسيحي الأرثوذكسي. سبع ساعات صلاة: باكر، الثالثة، السادسة، التاسعة، الغروب، النوم، نصف الليل. مجاناً بالكامل.";
    const hoursHtml = agpeyaHoursFull.map(h =>
      `<li><a href="${SITE}/orthodox/agpeya/${h.id}">${esc(h.name)} — ${esc(h.arabicTime)}</a></li>`
    ).join("\n");
    const schema = [
      {
        "@context": "https://schema.org",
        "@type": "Book",
        "name": "الأجبية",
        "inLanguage": "ar",
        "about": "الكنيسة القبطية الأرثوذكسية",
        "url": canonical,
        "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
      },
      buildFaqSchema([
        { q: "ما هي الأجبية القبطية؟", a: "الأجبية هي كتاب الصلوات اليومية للمسيحي القبطي الأرثوذكسي، ويتضمن سبع ساعات صلاة على مدار اليوم والليل: باكر، الثالثة، السادسة، التاسعة، الغروب، النوم، ونصف الليل." },
        { q: "كم عدد ساعات الصلاة في الأجبية؟", a: "تشمل الأجبية سبع ساعات صلاة: ساعة باكر، الساعة الثالثة، الساعة السادسة، الساعة التاسعة، ساعة الغروب، ساعة النوم، وساعة نصف الليل." },
        { q: "من أين جاءت الأجبية القبطية؟", a: "الأجبية ترجع في أصولها إلى الصلوات الليتورجية المبكرة للكنيسة القبطية منذ القرن الرابع الميلادي، وهي مستوحاة من المزامير وصلوات الرهبان والآباء الأوائل." }
      ])
    ];
    const body = `
<nav aria-label="breadcrumb"><a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/orthodox">أرثوذوكسيات</a> &rsaquo; الأجبية</nav>
<h1>الأجبية القبطية — ساعات الصلاة السبع الأرثوذكسية</h1>
<p>${esc(description)}</p>
<nav><h2>الساعات السبع</h2><ul>${hoursHtml}</ul></nav>`;
    return cacheAndServe(res, cacheKey, wrapHtml(title, description, canonical, body, schema, buildOrthodoxOgUrl("الأجبية القبطية")));
  }

  // ── Agpeya hour: /orthodox/agpeya/:hourId ────────────────────────────────
  const agpeyaHourMatch = path.match(/^\/orthodox\/agpeya\/([^/]+)$/);
  if (agpeyaHourMatch) {
    const hourId = agpeyaHourMatch[1];
    const hour = agpeyaHoursFull.find(h => h.id === hourId);
    if (!hour) return next();
    const cacheKey = `ag:${hourId}`;
    if (serveCached(res, cacheKey)) return;
    const canonical = `${SITE}/orthodox/agpeya/${hourId}`;
    const ov = HOUR_SEO_OVERRIDES[hourId];
    const title = ov ? ov.title : `${hour.name} — الأجبية القبطية | الكتاب المقدس رفيقي`;
    const rawDesc = `${hour.name}: ${hour.description} مزامير: ${hour.psalms}. إنجيل: ${hour.gospel}.`;
    const description = ov ? ov.description : (rawDesc.length > 160 ? `${rawDesc.slice(0, 157).trim()}...` : rawDesc);
    const allPrayers = [...commonOpeningPrayers, ...hour.prayers];
    const prayersHtml = allPrayers.map(p =>
      `<section><h2>${esc(p.title)}${p.role ? ` (${esc(p.role)})` : ""}</h2><p>${esc(p.text.substring(0, 500))}${p.text.length > 500 ? "..." : ""}</p></section>`
    ).join("\n");
    const schema = [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": title,
        "description": description,
        "inLanguage": "ar",
        "url": canonical,
        "isPartOf": { "@type": "Book", "name": "الأجبية", "url": `${SITE}/orthodox/agpeya` }
      },
      ...(ov?.faq ? [buildFaqSchema(ov.faq)] : [])
    ];
    const memoryHtml = hour.memory ? `<p><strong>ذكرى:</strong> ${esc(hour.memory)}</p>` : '';
    const body = `
<nav aria-label="breadcrumb"><a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/orthodox">أرثوذوكسيات</a> &rsaquo; <a href="${SITE}/orthodox/agpeya">الأجبية</a> &rsaquo; ${esc(hour.name)}</nav>
<h1>${esc(hour.name)}</h1>
<p>${esc(description)}</p>
${memoryHtml}
${prayersHtml}
<nav><a href="${SITE}/orthodox/agpeya">← جميع ساعات الأجبية</a></nav>`;
    return cacheAndServe(res, cacheKey, wrapHtml(title, description, canonical, body, schema, buildOrthodoxOgUrl(hour.name, hour.arabicTime)));
  }

  // ── Synaxarium index: /orthodox/synaxarium ────────────────────────────────
  if (path === "/orthodox/synaxarium") {
    const cacheKey = "sx:index";
    if (serveCached(res, cacheKey)) return;
    const canonical = `${SITE}/orthodox/synaxarium`;
    const title = "السنكسار القبطي | سير القديسين والشهداء الأقباط";
    const description = "السنكسار كتاب سير القديسين والشهداء والأعياد في الكنيسة القبطية الأرثوذكسية، مرتّباً حسب التقويم القبطي (13 شهراً).";
    const monthsHtml = synaxariumMonths.map(m =>
      `<li><a href="${SITE}/orthodox/synaxarium/${m.id}/1">${esc(m.arabicName)} (${esc(m.copticName)}) — ${esc(m.gregStart)}</a></li>`
    ).join("\n");
    const schema = [
      {
        "@context": "https://schema.org",
        "@type": "Book",
        "name": "السنكسار القبطي",
        "inLanguage": "ar",
        "about": "سير القديسين الأقباط",
        "url": canonical,
        "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
      },
      buildFaqSchema([
        { q: "ما هو السنكسار القبطي؟", a: "السنكسار هو كتاب سير القديسين والشهداء في الكنيسة القبطية الأرثوذكسية، مرتَّباً حسب التقويم القبطي (13 شهراً). يُقرأ منه يومياً في القداس الإلهي للتذكر بسير القديسين." },
        { q: "كم عدد الأشهر في التقويم القبطي؟", a: "التقويم القبطي يتكون من 13 شهراً: 12 شهراً كل منها 30 يوماً، وشهر صغير (نسيء) من 5 إلى 6 أيام." },
        { q: "من هم أشهر القديسين الأقباط؟", a: "من أشهر القديسين الأقباط: القديس مارك الرسول مؤسس الكرازة، القديسة دميانة، القديس أباكير ويوحنا، الشهيد أبو سيفين، والأنبا أنطونيوس أبو الرهبانية." }
      ])
    ];
    const body = `
<nav aria-label="breadcrumb"><a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/orthodox">أرثوذوكسيات</a> &rsaquo; السنكسار</nav>
<h1>السنكسار القبطي الأرثوذكسي</h1>
<p>${esc(description)}</p>
<nav><h2>الأشهر القبطية</h2><ul>${monthsHtml}</ul></nav>`;
    return cacheAndServe(res, cacheKey, wrapHtml(title, description, canonical, body, schema, buildOrthodoxOgUrl("السنكسار القبطي")));
  }

  // ── Synaxarium day: /orthodox/synaxarium/:monthId/:day ────────────────────
  const synaxariumDayMatch = path.match(/^\/orthodox\/synaxarium\/(\d+)\/(\d+)$/);
  if (synaxariumDayMatch) {
    const monthId = parseInt(synaxariumDayMatch[1], 10);
    const day = parseInt(synaxariumDayMatch[2], 10);
    const month = getMonthById(monthId);
    if (!month || day < 1 || day > 30) return next();
    const cacheKey = `sx:${monthId}:${day}`;
    if (serveCached(res, cacheKey)) return;
    const canonical = `${SITE}/orthodox/synaxarium/${monthId}/${day}`;
    const entries = getDayEntries(monthId, day);
    const rawSxTitle = `سنكسار ${month.arabicName} ${day} — ${entries.map(e => e.name).slice(0, 2).join("، ")} | الكتاب المقدس رفيقي`;
    const title = rawSxTitle.length <= 70 ? rawSxTitle : `سنكسار ${month.arabicName} ${day} | الكتاب المقدس رفيقي`;
    const rawDesc = entries.length > 0
      ? `سنكسار ${month.arabicName} ${day}: ${entries.map(e => `${e.name} — ${e.description.substring(0, 80)}`).join(". ")}.`
      : `سنكسار ${month.arabicName} ${day} — ${month.copticName} ${day}.`;
    const description = rawDesc.length > 160 ? `${rawDesc.slice(0, 157).trim()}...` : rawDesc;
    const entriesHtml = entries.map(e =>
      `<article><h2>${entryTypeIcon[e.type]} ${esc(e.name)} <span>(${esc(e.type)})</span></h2><p>${esc(e.description)}</p></article>`
    ).join("\n");
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": title,
      "description": description,
      "inLanguage": "ar",
      "url": canonical,
      "datePublished": month.gregStart,
      "isPartOf": { "@type": "Book", "name": "السنكسار القبطي", "url": `${SITE}/orthodox/synaxarium` }
    };
    const prevDay = day > 1 ? `<a href="${SITE}/orthodox/synaxarium/${monthId}/${day - 1}">${esc(month.arabicName)} ${day - 1}</a>` : "";
    const nextDay = day < month.days.length ? `<a href="${SITE}/orthodox/synaxarium/${monthId}/${day + 1}">${esc(month.arabicName)} ${day + 1}</a>` : "";
    const body = `
<nav aria-label="breadcrumb"><a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/orthodox">أرثوذوكسيات</a> &rsaquo; <a href="${SITE}/orthodox/synaxarium">السنكسار</a> &rsaquo; ${esc(month.arabicName)} ${day}</nav>
<h1>سنكسار ${esc(month.arabicName)} ${day}</h1>
<p>${esc(description)}</p>
${entriesHtml}
<nav>${prevDay} | <a href="${SITE}/orthodox/synaxarium">جميع الأشهر</a> | ${nextDay}</nav>`;
    return cacheAndServe(res, cacheKey, wrapHtml(title, description, canonical, body, schema));
  }

  // noindex for search-results URLs (with ?q=...) and other query-bearing pages
  const hasSearchQuery = path === "/search" && typeof req.query.q === "string" && (req.query.q as string).trim() !== "";
  const staticSnapshot = buildStaticPageSnapshot(path, hasSearchQuery);
  if (staticSnapshot) {
    const cacheKey = hasSearchQuery ? `st:${path}?q` : `st:${path}`;
    if (serveCached(res, cacheKey)) return;
    return cacheAndServe(res, cacheKey, staticSnapshot, hasSearchQuery);
  }

  // ── Orthodox/kholagy paths (canonical: /orthodox/kholagy/...) ─────────────
  const orthodoxKholagyChapterMatch = path.match(/^\/orthodox\/kholagy\/([^/]+)\/([^/]+)$/);
  if (orthodoxKholagyChapterMatch) {
    const liturgyId = orthodoxKholagyChapterMatch[1];
    const chapterId = orthodoxKholagyChapterMatch[2];
    const liturgy = liturgies.find(l => l.id === liturgyId);
    if (!liturgy) return next();
    const chapter = liturgy.chapters.find(c => c.id === chapterId);
    if (!chapter) return next();
    const cacheKey = `okh:${liturgyId}:${chapterId}`;
    if (serveCached(res, cacheKey)) return;
    const canonical = `${SITE}/orthodox/kholagy/${liturgyId}/${chapterId}`;
    const fullChTitle = `${chapter.title} | ${liturgy.name} | رفيقي`;
    const title = fullChTitle.length <= 70 ? fullChTitle : `${chapter.title} | الخولاجي | رفيقي`;
    const description = chapter.description ?? `${chapter.title} من ${liturgy.name} — نص القداس القبطي بالعربية والقبطية`;
    const partsHtml = chapter.parts.map(p =>
      `<section><h3>${esc(p.title)}${p.role ? ` <span>(${esc(p.role)})</span>` : ""}</h3><p>${esc(p.text.substring(0, 600))}${p.text.length > 600 ? "..." : ""}</p></section>`
    ).join("\n");
    const chapterIdx = liturgy.chapters.findIndex(c => c.id === chapterId);
    const prevChapter = chapterIdx > 0 ? liturgy.chapters[chapterIdx - 1] : null;
    const nextChapter = chapterIdx < liturgy.chapters.length - 1 ? liturgy.chapters[chapterIdx + 1] : null;
    const schema = { "@context": "https://schema.org", "@type": "WebPage", "name": title, "description": description, "inLanguage": "ar", "url": canonical, "isPartOf": { "@type": "Book", "name": liturgy.name, "url": `${SITE}/orthodox/kholagy/${liturgyId}` } };
    const body = `<nav aria-label="breadcrumb"><a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/orthodox">أرثوذوكسيات</a> &rsaquo; <a href="${SITE}/orthodox/kholagy">الخولاجي</a> &rsaquo; <a href="${SITE}/orthodox/kholagy/${liturgyId}">${esc(liturgy.name)}</a> &rsaquo; ${esc(chapter.title)}</nav>
<h1>${esc(chapter.title)}</h1>
${chapter.description ? `<p>${esc(chapter.description)}</p>` : ""}
${partsHtml}
<nav>${prevChapter ? `<a href="${SITE}/orthodox/kholagy/${liturgyId}/${prevChapter.id}">← ${esc(prevChapter.title)}</a>` : ""} &nbsp;|&nbsp; ${nextChapter ? `<a href="${SITE}/orthodox/kholagy/${liturgyId}/${nextChapter.id}">${esc(nextChapter.title)} →</a>` : ""}</nav>`;
    return cacheAndServe(res, cacheKey, wrapHtml(title, description, canonical, body, schema));
  }

  const orthodoxKholagyLiturgyMatch = path.match(/^\/orthodox\/kholagy\/([^/]+)$/);
  if (orthodoxKholagyLiturgyMatch) {
    const liturgyId = orthodoxKholagyLiturgyMatch[1];
    const liturgy = liturgies.find(l => l.id === liturgyId);
    if (!liturgy) return next();
    const cacheKey = `okh:${liturgyId}`;
    if (serveCached(res, cacheKey)) return;
    const canonical = `${SITE}/orthodox/kholagy/${liturgyId}`;
    const title = `${liturgy.name} — الخولاجي المقدس | الكتاب المقدس رفيقي`;
    const description = liturgy.description;
    const chaptersHtml = liturgy.chapters.map(ch =>
      `<li><a href="${SITE}/orthodox/kholagy/${liturgyId}/${ch.id}">${esc(ch.title)}</a>${ch.description ? ` — ${esc(ch.description.substring(0, 80))}` : ""}</li>`
    ).join("\n");
    const schema = { "@context": "https://schema.org", "@type": "Book", "name": liturgy.name, "description": description, "inLanguage": "ar", "url": canonical, "numberOfPages": liturgy.chapters.length, "genre": "Liturgy", "about": "القداس القبطي الأرثوذكسي", "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE } };
    const body = `<nav aria-label="breadcrumb"><a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/orthodox">أرثوذوكسيات</a> &rsaquo; <a href="${SITE}/orthodox/kholagy">الخولاجي</a> &rsaquo; ${esc(liturgy.name)}</nav>
<h1>${esc(liturgy.name)}</h1>
<p><strong>يُقام في:</strong> ${esc(liturgy.occasion)}</p>
<p>${esc(description)}</p>
<nav aria-label="أقسام القداس"><h2>أقسام ${esc(liturgy.name)}</h2><ol>${chaptersHtml}</ol></nav>`;
    return cacheAndServe(res, cacheKey, wrapHtml(title, description, canonical, body, schema));
  }

  // ── Kholagy index: /kholagy ───────────────────────────────────────────────
  if (path === "/kholagy") {
    const cacheKey = "kh:index";
    if (serveCached(res, cacheKey)) return;
    const canonical = `${SITE}/orthodox/kholagy`;
    const title = "الخولاجي القبطي — قداس باسيليوس وغريغوريوس وكيرلس | رفيقي";
    const description = "الخولاجي القبطي كاملاً: نصوص القداسات القبطية الأرثوذكسية الثلاثة بالعربية — قداس القديس باسيليوس، غريغوريوس، وكيرلس. مجاناً بدون تحميل.";
    const liturgiesHtml = liturgies.map(lit =>
      `<li><a href="${SITE}/orthodox/kholagy/${lit.id}">${esc(lit.name)}</a> — ${esc(lit.occasion)}</li>`
    ).join("\n");
    const schema = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "الخولاجي المقدس",
      "description": description,
      "inLanguage": "ar",
      "url": canonical,
      "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
    };
    const body = `
<nav aria-label="breadcrumb"><a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/orthodox">أرثوذوكسيات</a> &rsaquo; الخولاجي المقدس</nav>
<h1>الخولاجي المقدس</h1>
<p>${esc(description)}</p>
<ul>${liturgiesHtml}</ul>`;
    return cacheAndServe(res, cacheKey, wrapHtml(title, description, canonical, body, schema));
  }

  // ── Kholagy liturgy index: /kholagy/:liturgyId ───────────────────────────
  const kholagyLiturgyMatch = path.match(/^\/kholagy\/([^/]+)$/);
  if (kholagyLiturgyMatch) {
    const liturgyId = kholagyLiturgyMatch[1];
    const liturgy = liturgies.find(l => l.id === liturgyId);
    if (!liturgy) return next();
    const cacheKey = `kh:${liturgyId}`;
    if (serveCached(res, cacheKey)) return;
    const canonical = `${SITE}/orthodox/kholagy/${liturgyId}`;
    const title = `${liturgy.name} — الخولاجي المقدس | الكتاب المقدس رفيقي`;
    const description = liturgy.description;
    const chaptersHtml = liturgy.chapters.map(ch =>
      `<li><a href="${SITE}/orthodox/kholagy/${liturgyId}/${ch.id}">${esc(ch.title)}</a>${ch.description ? ` — ${esc(ch.description.substring(0, 80))}` : ""}</li>`
    ).join("\n");
    const schema = {
      "@context": "https://schema.org",
      "@type": "Book",
      "name": liturgy.name,
      "description": description,
      "inLanguage": "ar",
      "url": canonical,
      "numberOfPages": liturgy.chapters.length,
      "genre": "Liturgy",
      "about": "القداس القبطي الأرثوذكسي",
      "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي", "url": SITE }
    };
    const body = `
<nav aria-label="breadcrumb"><a href="${SITE}">الرئيسية</a> &rsaquo; <a href="${SITE}/orthodox">أرثوذوكسيات</a> &rsaquo; <a href="${SITE}/orthodox/kholagy">الخولاجي</a> &rsaquo; ${esc(liturgy.name)}</nav>
<h1>${esc(liturgy.name)}</h1>
<p><strong>يُقام في:</strong> ${esc(liturgy.occasion)}</p>
<p>${esc(description)}</p>
<nav aria-label="أقسام القداس"><h2>أقسام ${esc(liturgy.name)}</h2><ol>${chaptersHtml}</ol></nav>`;
    return cacheAndServe(res, cacheKey, wrapHtml(title, description, canonical, body, schema));
  }

  // ── Kholagy chapter: /kholagy/:liturgyId/:chapterId ──────────────────────
  const kholagyChapterMatch = path.match(/^\/kholagy\/([^/]+)\/([^/]+)$/);
  if (kholagyChapterMatch) {
    const liturgyId = kholagyChapterMatch[1];
    const chapterId = kholagyChapterMatch[2];
    const liturgy = liturgies.find(l => l.id === liturgyId);
    if (!liturgy) return next();
    const chapter = liturgy.chapters.find(c => c.id === chapterId);
    if (!chapter) return next();
    const cacheKey = `kh:${liturgyId}:${chapterId}`;
    if (serveCached(res, cacheKey)) return;
    const canonical = `${SITE}/orthodox/kholagy/${liturgyId}/${chapterId}`;
    const fullKhTitle = `${chapter.title} | ${liturgy.name} | رفيقي`;
    const title = fullKhTitle.length <= 70 ? fullKhTitle : `${chapter.title} | الخولاجي | رفيقي`;
    const description = chapter.description ?? `${chapter.title} من ${liturgy.name} — نص القداس القبطي بالعربية والقبطية`;
    const partsHtml = chapter.parts.map(p =>
      `<section>
        <h3>${esc(p.title)}${p.role ? ` <span>(${esc(p.role)})</span>` : ""}</h3>
        <p>${esc(p.text.substring(0, 600))}${p.text.length > 600 ? "..." : ""}</p>
      </section>`
    ).join("\n");
    const chapterIdx = liturgy.chapters.findIndex(c => c.id === chapterId);
    const prevChapter = chapterIdx > 0 ? liturgy.chapters[chapterIdx - 1] : null;
    const nextChapter = chapterIdx < liturgy.chapters.length - 1 ? liturgy.chapters[chapterIdx + 1] : null;
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": title,
      "description": description,
      "inLanguage": "ar",
      "url": canonical,
      "isPartOf": { "@type": "Book", "name": liturgy.name, "url": `${SITE}/orthodox/kholagy/${liturgyId}` },
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": SITE },
          { "@type": "ListItem", "position": 2, "name": "الخولاجي", "item": `${SITE}/orthodox/kholagy` },
          { "@type": "ListItem", "position": 3, "name": liturgy.name, "item": `${SITE}/orthodox/kholagy/${liturgyId}` },
          { "@type": "ListItem", "position": 4, "name": chapter.title, "item": canonical }
        ]
      }
    };
    const body = `
<nav aria-label="breadcrumb">
  <a href="${SITE}">الرئيسية</a> &rsaquo;
  <a href="${SITE}/orthodox">أرثوذوكسيات</a> &rsaquo;
  <a href="${SITE}/orthodox/kholagy">الخولاجي</a> &rsaquo;
  <a href="${SITE}/orthodox/kholagy/${liturgyId}">${esc(liturgy.name)}</a> &rsaquo;
  ${esc(chapter.title)}
</nav>
<h1>${esc(chapter.title)}</h1>
${chapter.description ? `<p>${esc(chapter.description)}</p>` : ""}
${partsHtml}
<nav aria-label="تنقل الأقسام">
  ${prevChapter ? `<a href="${SITE}/orthodox/kholagy/${liturgyId}/${prevChapter.id}">← ${esc(prevChapter.title)}</a>` : ""}
  &nbsp;|&nbsp;
  ${nextChapter ? `<a href="${SITE}/orthodox/kholagy/${liturgyId}/${nextChapter.id}">${esc(nextChapter.title)} →</a>` : ""}
</nav>`;
    return cacheAndServe(res, cacheKey, wrapHtml(title, description, canonical, body, schema));
  }

  // ── noindex for admin, utility, and user-specific pages ──────────────────
  // Mirrors Disallow entries in robots.txt for defense-in-depth (bots that ignore robots.txt)
  const noindexPaths = [
    '/admin', '/admin/exit', '/ministry-auth',
    '/liturgy-control', '/liturgy-display',
    '/groups', '/group',
    '/groups/create', '/groups/join', '/church-request',
    '/highlights', '/share',
  ];
  if (noindexPaths.some(p => path === p || path.startsWith(p + '/'))) {
    const html = wrapHtml(
      'رفيقي',
      'صفحة داخلية',
      `${SITE}${path}`,
      `<h1>رفيقي</h1><p><a href="${SITE}">الرئيسية</a></p>`,
      { "@context": "https://schema.org", "@type": "WebPage" },
      undefined,
      true // noindex
    );
    return res
      .set("Content-Type", "text/html; charset=utf-8")
      .set("X-Robots-Tag", "noindex, follow")
      .send(html);
  }

  next();
}
