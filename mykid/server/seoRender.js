// ===== مولّد صفحات HTML الغنيّة للأرشفة (SSR بسيط بلا مكتبات) =====
import { SITE, SECTIONS, getSection } from "./seoContent.js";
import { GUIDES } from "./guidesContent.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");

// دليل الآباء المرتبط بقسم (إن وُجد)
function guideForSection(slug) {
  return GUIDES.find((g) => g.related === slug);
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ===== شبكة عناصر القسم (محتوى نصّي غنيّ يظهر بلا JavaScript) =====
function renderItems(section) {
  const cards = section.items
    .map((it) => {
      if (section.kind === "ar-letter") {
        return `<li class="seo-card"><span class="seo-emoji">${it.emoji}</span>
          <b class="seo-glyph">${esc(it.char)}</b>
          <span class="seo-name">${esc(it.name)}</span>
          <span class="seo-word">${esc(it.char)} مثل ${esc(it.word)}</span></li>`;
      }
      if (section.kind === "en-letter") {
        return `<li class="seo-card"><span class="seo-emoji">${it.emoji}</span>
          <b class="seo-glyph">${esc(it.char)}</b>
          <span class="seo-name">${esc(it.name)}</span>
          <span class="seo-word">${esc(it.char)} for ${esc(it.word)}</span></li>`;
      }
      if (section.kind === "number") {
        return `<li class="seo-card"><b class="seo-glyph">${esc(it.arDigit)}</b>
          <span class="seo-name">${esc(it.arName)}</span>
          <span class="seo-word">${esc(it.value)} — ${esc(it.enName)}</span></li>`;
      }
      if (section.kind === "creature-sound") {
        return `<li class="seo-card"><span class="seo-emoji">${it.emoji}</span>
          <span class="seo-name">${esc(it.name)}</span>
          <span class="seo-word">${esc(it.en)} — ${esc(it.sound)}</span></li>`;
      }
      // creature
      return `<li class="seo-card"><span class="seo-emoji">${it.emoji}</span>
        <span class="seo-name">${esc(it.name)}</span>
        <span class="seo-word">${esc(it.en)}</span></li>`;
    })
    .join("\n");
  return `<ul class="seo-grid">${cards}</ul>`;
}

// ===== بيانات JSON-LD المنظّمة (تساعد SEO و GEO) =====
function jsonLd(section) {
  const url = `${SITE.url}/${section.slug}`;
  const itemList = {
    "@type": "ItemList",
    itemListElement: section.items.slice(0, 30).map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name || it.arName || it.char,
    })),
  };
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LearningResource",
        name: section.h1,
        description: section.description,
        url,
        image: `${SITE.url}/og.png`,
        inLanguage: ["ar", "en"],
        educationalLevel: "Preschool",
        typicalAgeRange: "3-6",
        learningResourceType: "game",
        interactivityType: "active",
        teaches: section.keywords.slice(0, 3).join(", "),
        audience: { "@type": "EducationalAudience", educationalRole: "student" },
        isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
        publisher: { "@type": "Organization", name: SITE.shortName, url: SITE.url, logo: { "@type": "ImageObject", url: `${SITE.url}/og.png` } },
        hasPart: itemList,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE.url },
          { "@type": "ListItem", position: 2, name: section.h1, item: url },
        ],
      },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

// ===== روابط بقية الأقسام (ربط داخلي يقوّي الأرشفة) =====
function relatedLinks(currentSlug) {
  const links = SECTIONS.filter((s) => s.slug !== currentSlug)
    .map((s) => `<li><a href="/${s.slug}">${s.emoji} ${esc(s.h1)}</a></li>`)
    .join("\n");
  return `<nav class="seo-related" aria-label="أقسام أخرى">
    <h2>تعلّم المزيد مع عالم الاستكشاف السحري</h2>
    <ul>${links}</ul></nav>`;
}

// ===== الصفحة الكاملة لقسم =====
export function renderSectionPage(slug) {
  const section = getSection(slug);
  if (!section) return null;
  const url = `${SITE.url}/${section.slug}`;
  const intro = section.intro.map((p) => `<p>${esc(p)}</p>`).join("\n");
  const guide = guideForSection(section.slug);
  const guideCta = guide
    ? `<p class="seo-intro"><a href="/guides/${guide.slug}">📚 ${esc(guide.h1)} ←</a></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${esc(section.title)}</title>
<meta name="description" content="${esc(section.description)}" />
<meta name="keywords" content="${esc(section.keywords.join("، "))}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(SITE.name)}" />
<meta property="og:locale" content="${SITE.locale}" />
<meta property="og:title" content="${esc(section.title)}" />
<meta property="og:description" content="${esc(section.description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE.url}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="${SITE.twitter}" />
<meta name="twitter:title" content="${esc(section.title)}" />
<meta name="twitter:description" content="${esc(section.description)}" />
<meta name="twitter:image" content="${SITE.url}/og.png" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${section.emoji}</text></svg>" />
<link rel="stylesheet" href="/css/seo.css" />
${jsonLd(section)}
</head>
<body>
<header class="seo-header">
  <a class="seo-logo" href="/">🦁 عالم الاستكشاف السحري</a>
</header>
<main class="seo-main">
  <h1>${section.emoji} ${esc(section.h1)}</h1>
  <div class="seo-intro">${intro}</div>
  <a class="seo-play" href="/app?region=${section.region}">▶ العب وتعلّم الآن</a>
  ${guideCta}
  <section aria-label="المحتوى التعليمي">
    <h2>محتوى ${esc(section.h1)}</h2>
    ${renderItems(section)}
  </section>
  ${relatedLinks(section.slug)}
</main>
<footer class="seo-footer">
  <p>عالم الاستكشاف السحري — تطبيق تعليمي تفاعلي للأطفال من ٣ إلى ٦ سنوات.</p>
  <p><a href="/">العودة إلى صفحة الاستكشاف</a></p>
</footer>
</body>
</html>`;
}

// ===== الصفحة الرئيسية الغنيّة (للأرشفة) =====
export function renderHomePage() {
  const sections = SECTIONS.map(
    (s) => `<li class="seo-home-card"><a href="/${s.slug}">
      <span class="seo-emoji">${s.emoji}</span>
      <span class="seo-name">${esc(s.h1)}</span></a></li>`
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>استكشف كل أقسام التعلّم | عالم الاستكشاف السحري</title>
<meta name="description" content="عالم الاستكشاف السحري: تطبيق مغامرات تعليمي للأطفال من ٣ إلى ٦ سنوات لتعليم الحروف العربية والإنجليزية والأرقام والحيوانات والألوان والأشكال بالصوت والألعاب." />
<meta name="keywords" content="تطبيق تعليمي للاطفال، تعليم الحروف، تعليم الارقام، العاب تعليمية، تعلم العربية والانجليزية للاطفال" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${SITE.url}/explore" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(SITE.name)}" />
<meta property="og:locale" content="${SITE.locale}" />
<meta property="og:title" content="${esc(SITE.name)}" />
<meta property="og:description" content="تطبيق مغامرات تعليمي للأطفال: حروف وأرقام وحيوانات وألوان وأشكال بالصوت والألعاب." />
<meta property="og:url" content="${SITE.url}/explore" />
<meta property="og:image" content="${SITE.url}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="${SITE.twitter}" />
<meta name="twitter:image" content="${SITE.url}/og.png" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦁</text></svg>" />
<link rel="stylesheet" href="/css/seo.css" />
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.name,
  url: SITE.url,
  inLanguage: ["ar", "en"],
  description:
    "تطبيق مغامرات تعليمي للأطفال من ٣ إلى ٦ سنوات لتعليم الحروف والأرقام والحيوانات والألوان والأشكال.",
})}</script>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "ما العمر المناسب لتطبيق عالم الاستكشاف السحري؟",
      acceptedAnswer: { "@type": "Answer", text: "التطبيق مُصمَّم خصيصاً للأطفال من سنّ ٣ إلى ٦ سنوات (مرحلة ما قبل المدرسة والروضة)، مع تدرّج في الصعوبة يناسب كل عمر." } },
    { "@type": "Question", name: "هل التطبيق مجاني؟",
      acceptedAnswer: { "@type": "Answer", text: "نعم، يمكن لطفلك اللعب والتعلّم مجاناً من المتصفح مباشرةً دون تثبيت أو تسجيل." } },
    { "@type": "Question", name: "هل يحتاج الطفل إلى اتصال دائم بالإنترنت؟",
      acceptedAnswer: { "@type": "Answer", text: "أغلب الأنشطة تعمل دون اتصال بعد أوّل فتح لأن التطبيق من نوع PWA يعمل بلا إنترنت، بينما تحتاج بعض ميزات الصوت الذكي إلى الشبكة." } },
    { "@type": "Question", name: "هل التطبيق آمن ولا يجمع بيانات الطفل؟",
      acceptedAnswer: { "@type": "Answer", text: "لا نجمع أيّ بيانات شخصية؛ يُحفظ التقدّم على جهاز الطفل فقط، والميكروفون يعمل عند الضغط فقط، ولا يعرض التطبيق أيّ إعلانات." } },
    { "@type": "Question", name: "كيف يساعد التطبيق في تعليم الحروف والأرقام؟",
      acceptedAnswer: { "@type": "Answer", text: "نعتمد أسلوباً متعدّد الحواس: يرى طفلك الحرف، ويسمع نطقه بصوت واضح، ويتتبّعه بإصبعه، مع مراجعة متباعدة ومكافآت تشجيعية لترسيخ ما تعلّمه." } },
    { "@type": "Question", name: "هل يوجد إشراف لوليّ الأمر؟",
      acceptedAnswer: { "@type": "Answer", text: "نعم، توجد لوحة لوليّ الأمر محميّة برقم سرّي تعرض تقدّم كل طفل، مع تذكير اختياري بوقت اللعب، وإمكانية تعطيل الميكروفون والذكاء الاصطناعي." } },
  ],
})}</script>
</head>
<body>
<header class="seo-header">
  <span class="seo-logo">🦁 عالم الاستكشاف السحري</span>
</header>
<main class="seo-main">
  <h1>🦁 عالم الاستكشاف السحري — تطبيق تعليمي للأطفال</h1>
  <div class="seo-intro">
    <p>عالم الاستكشاف السحري تطبيق مغامرات تعليمي تفاعلي للأطفال من عمر ٣ إلى ٦ سنوات. يتعلّم طفلك الحروف العربية والإنجليزية والأرقام والحيوانات والأسماك والطيور والفواكه والألوان والأشكال، بأسلوب اللعب والمكافآت لا التلقين.</p>
    <p>اختر قسماً لتبدأ رحلة التعلّم، أو افتح التطبيق التفاعلي كاملاً.</p>
  </div>
  <a class="seo-play" href="/app">▶ افتح التطبيق التفاعلي</a>
  <section aria-label="أقسام التعلّم">
    <h2>أقسام التعلّم</h2>
    <ul class="seo-home-grid">${sections}</ul>
  </section>

  <section aria-label="طريقة التعلّم">
    <h2>كيف يتعلّم طفلك في عالم الاستكشاف السحري؟</h2>
    <p>نؤمن أنّ الطفل في سنّ ٣ إلى ٦ سنوات يتعلّم باللعب لا بالتلقين. لذلك بُني التطبيق على أساليب تربويّة مُثبَتة علمياً تجعل التعلّم تجربة ممتعة يطلبها الطفل بنفسه كل يوم:</p>
    <ul class="seo-prose">
      <li><strong>التعلّم متعدّد الحواس:</strong> يرى طفلك الحرف أو الرقم، ويسمع نطقه بصوت عربيّ واضح، ويتتبّعه بإصبعه على الشاشة — فتترسّخ المعلومة عبر البصر والسمع والحركة معاً.</li>
      <li><strong>المراجعة المتباعدة:</strong> يعيد التطبيق عرض ما تعلّمه الطفل على فترات ذكيّة لتثبيته في الذاكرة طويلة المدى بدل نسيانه.</li>
      <li><strong>التعزيز الإيجابي:</strong> نجوم ومكافآت وكلمات تشجيع لطيفة عند كل نجاح، تبني ثقة الطفل وتحبّبه في التعلّم دون ضغط أو إحباط.</li>
      <li><strong>صديق يرافق الطفل:</strong> شخصية «ميزو» الودودة تشرح وتشجّع وتتفاعل مع الطفل، فتحوّل الدرس إلى مغامرة بين صديقين.</li>
      <li><strong>تدرّج تلقائي:</strong> تُفتح المناطق تدريجياً كلّما أتقن الطفل ما قبلها، فلا يشعر بالملل ولا بالصعوبة المفاجئة.</li>
    </ul>
  </section>

  <section aria-label="ماذا يتعلّم طفلك">
    <h2>ماذا يتعلّم طفلك؟</h2>
    <p>يغطّي «عالم الاستكشاف السحري» أساسيات مرحلة ما قبل المدرسة في رحلة واحدة متكاملة:</p>
    <ul class="seo-prose">
      <li><strong>الحروف العربية:</strong> شكل الحرف، نطقه، وكلمة مثال لكلّ حرف مع صورة تربط الحرف بمعناه.</li>
      <li><strong>الحروف الإنجليزية:</strong> الأبجدية كاملة بالنطق الصحيح وكلمات مثال لتأسيس لغوي مبكّر.</li>
      <li><strong>الأرقام والعدّ:</strong> الأرقام من ١ إلى ١٠ وأكثر، مع العدّ والجمع والطرح البسيط والمقارنة.</li>
      <li><strong>الحيوانات والطبيعة:</strong> حيوانات وطيور وأسماك وحشرات بأصواتها وأسمائها بالعربية والإنجليزية.</li>
      <li><strong>الألوان والأشكال والفواكه:</strong> تمييز الألوان والأشكال الأساسية وأسماء الفواكه.</li>
      <li><strong>تأسيس القراءة:</strong> ربط الأصوات بالحروف وبناء أولى الكلمات.</li>
      <li><strong>الآداب والقيم ومهارات التفكير:</strong> مواقف يومية تعلّم الطفل التهذيب، وألعاب تنمّي التركيز والذاكرة والمنطق.</li>
    </ul>
  </section>

  <section aria-label="أمان الطفل">
    <h2>لماذا «عالم الاستكشاف السحري» آمن لطفلك؟</h2>
    <p>سلامة طفلك وخصوصيّته أولويّتنا الأولى، ولذلك صُمّم التطبيق ليكون بيئة محميّة:</p>
    <ul class="seo-prose">
      <li>لا نجمع أيّ بيانات شخصية عن الطفل، ويُحفظ كل التقدّم على جهازك فقط.</li>
      <li>لوحة لوليّ الأمر محميّة برقم سرّي، مع تذكير اختياري بوقت اللعب للحفاظ على توازن وقت الشاشة.</li>
      <li>الميكروفون يعمل عند ضغط الطفل فقط، ولا يُسجَّل ولا يُخزَّن.</li>
      <li>لا يعرض التطبيق أيّ إعلانات، ولا يستخدم ملفات تعريف ارتباط إعلانية.</li>
    </ul>
  </section>

  <section aria-label="الأسئلة الشائعة">
    <h2>الأسئلة الشائعة</h2>
    <h3>ما العمر المناسب لتطبيق عالم الاستكشاف السحري؟</h3>
    <p>التطبيق مُصمَّم خصيصاً للأطفال من سنّ ٣ إلى ٦ سنوات (مرحلة ما قبل المدرسة والروضة)، مع تدرّج في الصعوبة يناسب كل عمر.</p>
    <h3>هل التطبيق مجاني؟</h3>
    <p>نعم، يمكن لطفلك اللعب والتعلّم مجاناً من المتصفّح مباشرةً دون تثبيت أو تسجيل.</p>
    <h3>هل يحتاج الطفل إلى اتصال دائم بالإنترنت؟</h3>
    <p>أغلب الأنشطة تعمل دون اتصال بعد أوّل فتح لأنّ التطبيق من نوع PWA، بينما تحتاج بعض ميزات الصوت الذكيّ إلى الشبكة.</p>
    <h3>هل التطبيق آمن ولا يجمع بيانات الطفل؟</h3>
    <p>لا نجمع أيّ بيانات شخصية؛ يُحفظ التقدّم على جهاز الطفل فقط، والميكروفون يعمل عند الضغط فقط، ولا يعرض التطبيق أيّ إعلانات.</p>
    <h3>كيف يساعد التطبيق في تعليم الحروف والأرقام؟</h3>
    <p>نعتمد أسلوباً متعدّد الحواس: يرى طفلك الحرف، ويسمع نطقه، ويتتبّعه بإصبعه، مع مراجعة متباعدة ومكافآت تشجيعية لترسيخ ما تعلّمه.</p>
    <h3>هل يوجد إشراف لوليّ الأمر؟</h3>
    <p>نعم، توجد لوحة لوليّ الأمر محميّة برقم سرّي تعرض تقدّم كل طفل، مع تذكير اختياري بوقت اللعب، وإمكانية تعطيل الميكروفون.</p>
  </section>

  <nav class="seo-related" aria-label="أدلة الآباء">
    <h2>📚 أدلة الآباء</h2>
    <ul><li><a href="/guides">نصائح وأدلة عملية لتعليم طفلك الحروف والأرقام والحيوانات ←</a></li></ul>
  </nav>
</main>
<footer class="seo-footer">
  <p>عالم الاستكشاف السحري — تطبيق تعليمي تفاعلي للأطفال من ٣ إلى ٦ سنوات.</p>
  <p><a href="/about">حول التطبيق</a> · <a href="/privacy">سياسة الخصوصية</a> · <a href="/guides">أدلة الآباء</a></p>
</footer>
</body>
</html>`;
}

// ===== sitemap.xml طبقاً لمواصفات Google =====
// وسوم <image:image> للصور الفعلية الموجودة فقط (حيوانات/فواكه/طيور/أسماك/حشرات)
// لتفهرسها Google Images — مصدر زيارات كبير لمواقع الأطفال.
function imageTagsFor(section) {
  if (!Array.isArray(section.items)) return "";
  return section.items
    .filter((it) => it.img && fs.existsSync(path.join(ASSETS_DIR, it.img)))
    .map(
      (it) =>
        `    <image:image>\n      <image:loc>${SITE.url}/assets/${it.img}</image:loc>\n` +
        `      <image:title>${esc(it.name || "")}</image:title>\n    </image:image>`
    )
    .join("\n");
}

export function renderSitemap() {
  const lastmod = SITE.dateModified;
  const urls = [
    { loc: `${SITE.url}/`, priority: "1.0", freq: "daily" },
    { loc: `${SITE.url}/explore`, priority: "0.9", freq: "weekly" },
    ...SECTIONS.map((s) => ({
      loc: `${SITE.url}/${s.slug}`,
      priority: "0.9",
      freq: "weekly",
      images: imageTagsFor(s),
    })),
    { loc: `${SITE.url}/guides`, priority: "0.7", freq: "monthly" },
    ...GUIDES.map((g) => ({
      loc: `${SITE.url}/guides/${g.slug}`,
      priority: "0.7",
      freq: "monthly",
    })),
    { loc: `${SITE.url}/about`, priority: "0.5", freq: "yearly" },
    { loc: `${SITE.url}/privacy`, priority: "0.4", freq: "yearly" },
    { loc: `${SITE.url}/contact`, priority: "0.4", freq: "yearly" },
  ];
  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n` +
        `    <changefreq>${u.freq}</changefreq>\n    <priority>${u.priority}</priority>` +
        (u.images ? `\n${u.images}` : "") +
        `\n  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>`;
}

// ===== robots.txt =====
export function renderRobots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`;
}
