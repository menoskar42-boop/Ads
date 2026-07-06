// ===== مولّد صفحات أدلة الآباء (مقالات طويلة قابلة للأرشفة) =====
import { SITE } from "./seoContent.js";
import { GUIDES, getGuide } from "./guidesContent.js";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// JSON-LD: Article + BreadcrumbList (يقوّي SEO و GEO)
function jsonLd(guide) {
  const url = `${SITE.url}/guides/${guide.slug}`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: guide.h1,
        description: guide.description,
        url,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        image: `${SITE.url}/og.png`,
        inLanguage: "ar",
        datePublished: SITE.datePublished,
        dateModified: SITE.dateModified,
        about: guide.keywords.slice(0, 3).join(", "),
        audience: { "@type": "Audience", audienceType: "Parents" },
        author: { "@type": "Organization", name: SITE.shortName, url: SITE.url },
        isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
        publisher: { "@type": "Organization", name: SITE.shortName, url: SITE.url, logo: { "@type": "ImageObject", url: `${SITE.url}/og.png` } },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE.url },
          { "@type": "ListItem", position: 2, name: "أدلة الآباء", item: `${SITE.url}/guides` },
          { "@type": "ListItem", position: 3, name: guide.h1, item: url },
        ],
      },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function relatedGuides(currentSlug) {
  const links = GUIDES.filter((g) => g.slug !== currentSlug)
    .map((g) => `<li><a href="/guides/${g.slug}">${g.emoji} ${esc(g.h1)}</a></li>`)
    .join("\n");
  return `<nav class="seo-related" aria-label="أدلة أخرى">
    <h2>أدلة أخرى للآباء</h2>
    <ul>${links}</ul></nav>`;
}

// ===== صفحة دليل واحد =====
export function renderGuidePage(slug) {
  const guide = getGuide(slug);
  if (!guide) return null;
  const url = `${SITE.url}/guides/${guide.slug}`;

  const body = guide.sections
    .map(
      (s) =>
        `<section><h2>${esc(s.h2)}</h2>${s.p.map((p) => `<p>${esc(p)}</p>`).join("\n")}</section>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${esc(guide.title)}</title>
<meta name="description" content="${esc(guide.description)}" />
<meta name="keywords" content="${esc(guide.keywords.join("، "))}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${esc(SITE.name)}" />
<meta property="og:locale" content="${SITE.locale}" />
<meta property="og:title" content="${esc(guide.title)}" />
<meta property="og:description" content="${esc(guide.description)}" />
<meta property="og:url" content="${url}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="${SITE.twitter}" />
<meta name="twitter:title" content="${esc(guide.title)}" />
<meta name="twitter:description" content="${esc(guide.description)}" />
<meta property="og:image" content="${SITE.url}/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:image" content="${SITE.url}/og.png" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${guide.emoji}</text></svg>" />
<link rel="stylesheet" href="/css/seo.css" />
${jsonLd(guide)}
</head>
<body>
<header class="seo-header">
  <a class="seo-logo" href="/">🦁 عالم الاستكشاف السحري</a>
</header>
<main class="seo-main">
  <p class="seo-crumbs"><a href="/">الرئيسية</a> › <a href="/guides">أدلة الآباء</a> › ${esc(guide.h1)}</p>
  <h1>${guide.emoji} ${esc(guide.h1)}</h1>
  <p class="seo-meta">⏱️ قراءة ${guide.readMinutes} دقائق · للآباء · الأعمار ٣–٦</p>
  <article class="seo-article">${body}</article>
  <a class="seo-play" href="/app?region=${guide.region}">▶ جرّب الآن مع طفلك</a>
  <p class="seo-intro"><a href="/${guide.related}">اطّلع على محتوى هذا القسم بالتفصيل ←</a></p>
  ${relatedGuides(guide.slug)}
</main>
<footer class="seo-footer">
  <p>عالم الاستكشاف السحري — تطبيق تعليمي تفاعلي للأطفال من ٣ إلى ٦ سنوات.</p>
  <p><a href="/">العودة إلى صفحة الاستكشاف</a></p>
</footer>
</body>
</html>`;
}

// ===== صفحة فهرس الأدلة =====
export function renderGuidesIndex() {
  const cards = GUIDES.map(
    (g) => `<li class="seo-home-card"><a href="/guides/${g.slug}">
      <span class="seo-emoji">${g.emoji}</span>
      <span class="seo-name">${esc(g.h1)}</span></a></li>`
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>أدلة الآباء لتعليم الأطفال | عالم الاستكشاف السحري</title>
<meta name="description" content="مجموعة أدلة عملية للآباء لتعليم الأطفال من ٣ إلى ٦ سنوات: الحروف العربية والإنجليزية، الأرقام والعدّ، والحيوانات وأصواتها، بأنشطة وألعاب مجرّبة." />
<meta name="keywords" content="ادلة تعليم الاطفال، كيف اعلم طفلي، نصائح تربوية، تعليم ما قبل المدرسة" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${SITE.url}/guides" />
<meta property="og:type" content="website" />
<meta property="og:title" content="أدلة الآباء لتعليم الأطفال" />
<meta property="og:description" content="أدلة عملية لتعليم الأطفال الحروف والأرقام والحيوانات بأنشطة وألعاب." />
<meta property="og:url" content="${SITE.url}/guides" />
<meta property="og:image" content="${SITE.url}/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${SITE.url}/og.png" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📚</text></svg>" />
<link rel="stylesheet" href="/css/seo.css" />
</head>
<body>
<header class="seo-header">
  <a class="seo-logo" href="/">🦁 عالم الاستكشاف السحري</a>
</header>
<main class="seo-main">
  <h1>📚 أدلة الآباء لتعليم الأطفال</h1>
  <div class="seo-intro">
    <p>مجموعة أدلة عملية تساعدك على تعليم طفلك من ٣ إلى ٦ سنوات بطريقة صحيحة وممتعة: متى تبدأ، كيف ترتّب التعلّم، أخطاء شائعة، وأنشطة وألعاب مجرّبة لكل مهارة.</p>
  </div>
  <ul class="seo-home-grid">${cards}</ul>
</main>
<footer class="seo-footer">
  <p>عالم الاستكشاف السحري — تطبيق تعليمي تفاعلي للأطفال من ٣ إلى ٦ سنوات.</p>
</footer>
</body>
</html>`;
}
