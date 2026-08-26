#!/usr/bin/env node
/**
 * Audit the public marketing pages against the rules the project records in
 * docs/SEO_GUIDE.md, docs/GOOGLE_SEARCH_CENTRAL.md, docs/BING_WEBMASTER_HELP.md
 * and docs/ADSENSE_POLICIES.md.
 *
 * scripts/render-clinic-pages.js already holds the tenant (subdomain) pages to
 * these limits. Nothing held the main site to them, so a long <title> or a
 * second h1 on /about or /blog could ship unnoticed — which is exactly the
 * class of problem Bing flagged. This renders each public page with a fixture
 * and fails on any violation.
 *
 * Usage:
 *   node scripts/seo-audit.js          # every page
 *   node scripts/seo-audit.js home about
 */
'use strict';
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

const VIEWS = path.join(__dirname, '..', 'src', 'views');
const SITE = 'https://oscardevs.com';

// ── Limits ───────────────────────────────────────────────────────────────────
// Bing truncated our titles, so 60 is a hard ceiling, not a preference. The
// description range is the one search engines actually render.
const TITLE_MAX = 60;
// الحد الأدنى كان ٧٠ بينما القاعدة الذهبية رقم ٢ في `SEO_MISTAKES_LOG.md`
// و`BING_WEBMASTER_HELP.md` بيقولوا **١٥٠–١٦٠**. الفرق ده خلّى ٤٢ صفحة
// (٢٩ مقال + المدوّنة والأسئلة والدليل والتواصل) تعدّي الفحص بوصف من ٨٨
// لـ١٣٨ حرف — الفحص كان بيقول «سليم» وهو بيقيس قاعدة تانية غير المكتوبة.
//
// الحارس اللي أوسع من القاعدة اللي بيحرسها مابيمنعش الانحراف — بيوثّقه.
// وده اللي حصل بالظبط: اترفع لـ١٤٠ «بهامش بسيط تحت النطاق»، فـ٣٥ صفحة
// (٢٦ مقال + ٩ صفحات عامة) استقرّت في ١٤٠–١٤٩ — كلها عدّت الفحص وكلها
// جوّه تحذير Bing «الوصف قصير». الهامش ما حماش جملة، هو بس نقل الخط.
//
// دلوقتي الحد = ١٥٠ بالظبط زي المكتوب في المرجع. أي وصف بين ١٤٠ و١٤٩
// بيتزوّد بمعلومة حقيقية — مش حشو — لحد ما يوصل النطاق.
const DESC_MIN = 150;
const DESC_MAX = 160;
// AdSense treats a page with ads and almost no content as low-value. 250 words
// is well under any page we intend to monetise and well over a bare form.
const MIN_WORDS_WITH_ADS = 250;

// ── Fixtures ─────────────────────────────────────────────────────────────────
const { ARTICLES } = require('../src/routes/blog_articles');
const latest = ARTICLES.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

// Locals every main-site page gets from server.js / the route.
function base(extra) {
  return Object.assign({
    siteOrigin: SITE,
    // قاموس الحقائق: القوالب بتقراه من `res.locals` في السيرفر، فالفحص
    // لازم يديها **نفس المصدر** مش نسخة متجمّدة — وإلا الفحص بيرندر
    // أرقام غير اللي الموقع بينشرها.
    facts: require('../src/lib/company_facts').facts(),
    canonicalUrl: SITE + '/',
    // نفس helper السيرفر — الفحص لازم يرندر بنفس العناوين اللي بتتنشر.
    publicUrl: (p) => SITE + require('../src/lib/lang_routes')
      .withLang(p || '/', 'ar'),
    assetVersion: '1',
    ads: { enabled: true, publisherId: 'ca-pub-3132188303904900', slots: {
      homeTop: '1', homeMid: '2', homeBottom: '3',
      blogTop: '4', blogBottom: '5', pageBottom: '6',
    } },
    showAds: true,
    lang: 'ar',
    dir: 'rtl',
    t: (k) => k,
    canonicalCompanyUrl: (slug) => `https://${slug}.oscardevs.com`,
    termsVersion: '1.3',
    // Mirror the app's res.locals.jsonLd (server.js) so views that embed JSON-LD
    // via jsonLd() render here too — same \u-escaping the real request uses.
    pricing: require('../src/lib/pricing'),
    jsonLd: (obj) => JSON.stringify(obj)
      .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'),
  }, extra || {});
}

const { SECTORS, othersOf } = require('../src/lib/sector_landings');
const { SERVICES, othersOf: otherServices, READY_SYSTEMS } = require('../src/lib/services');

const PAGES = {
  home: {
    file: 'home.ejs',
    locals: { sent: false, contactError: null, latestArticles: latest,
      ogImage: SITE + '/og-default.png' },
  },
  about:   { file: 'legal/about.ejs',   locals: {} },
  faq:     { file: 'legal/faq.ejs',     locals: {} },
  terms:   { file: 'legal/terms.ejs',   locals: {} },
  privacy: { file: 'legal/privacy.ejs', locals: {} },
  // A form and a phone number — real, useful, but under the word count AdSense
  // expects on a monetised page, so it must stay ad-free.
  contact: { file: 'legal/contact.ejs', locals: { sent: false, error: null, showAds: false }, noAds: true, thin: true },
  our_work:{ file: 'legal/our_work.ejs',locals: {} },
  dental:  { file: 'landing/dental.ejs',locals: {} },
  workshop:{ file: 'landing/workshop.ejs', locals: {} },
  facts:   { file: 'legal/company_facts.ejs', locals: {} },
  // «اشتراك ثابت ولا عمولة؟» (البند ٦٤). الأرقام بتتقرا من `pricing.js` زي
  // الصفحة نفسها بالظبط — فلو حد غيّر سعر في مكان واحد، الفحص بيرسم الصفحة
  // بالسعر الجديد ويقارن، مش بنسخة متجمّدة هنا.
  compare: { file: 'legal/compare.ejs', locals: (() => {
    const { PRICES, FREE_MONTHS, arabicNumber } = require('../src/lib/pricing');
    const labels = { portfolio: 'بورتفوليو', shop: 'متجر إلكتروني', pharmacy: 'صيدلية',
      clinic: 'عيادة', orders: 'مطعم وطلبات', gym: 'جيم', nutrition: 'عيادة تغذية',
      furniture: 'معرض موبيليا', workshop: 'ورشة سيارات', hall: 'قاعة أفراح',
      nursery: 'حضانة', installments: 'تقسيط' };
    const rows = Object.keys(PRICES).map((k) => ({ key: k, label: labels[k] || k, ...PRICES[k] }))
      .sort((a, b) => a.monthly - b.monthly);
    const m = rows.map((r) => r.monthly), b = rows.map((r) => r.buy);
    return { rows, arabicNumber, FREE_MONTHS, systemCount: rows.length,
      minMonthly: Math.min(...m), maxMonthly: Math.max(...m),
      minBuy: Math.min(...b), maxBuy: Math.max(...b) };
  })() },
  // One entry per sector reference page: same template, different words. A
  // shared template makes it cheap to ship nine doorway pages by accident, so
  // every one of them is audited, not just the first.
  ...Object.fromEntries(Object.keys(SECTORS).map((slug) => [slug, {
    file: 'landing/sector.ejs',
    locals: {
      sector: Object.assign({ slug }, SECTORS[slug]),
      others: othersOf(slug),
      demoUrl: 'https://' + SECTORS[slug].demo + '.oscardevs.com/',
    },
  }])),
  // وخدمات التطوير المخصّص — قالب مشترك تاني، فكل واحدة بتتفحص لوحدها
  // لنفس السبب: قالب مشترك بيخلّي شحن تلات صفحات doorway رخيص بالغلط.
  ...Object.fromEntries(Object.keys(SERVICES).map((slug) => [slug, {
    file: 'landing/service.ejs',
    locals: {
      service: Object.assign({ slug }, SERVICES[slug]),
      others: otherServices(slug),
      readySystemsAr: require('../src/lib/pricing').arabicNumber(READY_SYSTEMS),
    },
  }])),
  research:{ file: 'research/upload.ejs', locals: { aiEnabled: false, error: null, showAds: false }, noAds: true },
  help:    { file: 'legal/help.ejs',    locals: {} },
  blog_index: {
    file: 'blog/index.ejs',
    locals: { articles: ARTICLES, canonicalUrl: SITE + '/blog' },
  },
  // Every article shares one template, so rendering the newest one proves the
  // template; the per-article metadata is length-checked separately below.
  blog_article: {
    file: 'blog/article.ejs',
    locals: {
      article: latest[0],
      bodyView: 'articles/' + latest[0].slug,
      articles: ARTICLES,
      canonicalUrl: SITE + '/blog/' + latest[0].slug,
    },
  },
  // Utility pages: indexed or not, they must never carry ads.
  apply_form:    { file: 'apply/form.ejs',    locals: { showAds: false, error: null, values: {} }, noAds: true },
  apply_success: { file: 'apply/success.ejs', locals: { showAds: false, ref: 'ABC123' }, noAds: true, thin: true },
  not_found:     { file: '404.ejs',           locals: { showAds: false }, noAds: true, thin: true },
};

// ── Checks ───────────────────────────────────────────────────────────────────
function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function audit(name, html, spec) {
  const out = [];

  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  if (!title) out.push('لا يوجد <title>');
  else if (title.length > TITLE_MAX) out.push(`العنوان ${title.length} حرف (الحد ${TITLE_MAX}): ${title}`);

  // A noindex page's description is never rendered in a result, so the lower
  // bound only applies to pages we actually want indexed.
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!desc) out.push('لا يوجد meta description');
  else if (desc.length > DESC_MAX) out.push(`الوصف ${desc.length} حرف (الحد ${DESC_MAX})`);
  else if (!noindex && desc.length < DESC_MIN) out.push(`الوصف ${desc.length} حرف — قصير (الحد الأدنى ${DESC_MIN})`);

  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) out.push(`عدد <h1> = ${h1} (المفروض 1)`);

  // Headings must not skip a level (h2 before any h1, h4 straight after h2…).
  const levels = (html.match(/<h([1-4])[\s>]/g) || []).map((m) => Number(m[2]));
  let prev = 0;
  for (const lv of levels) {
    if (prev && lv > prev + 1) { out.push(`قفزة في الهيدنجز: h${prev} ثم h${lv}`); break; }
    prev = lv;
  }

  if (!/<link rel="canonical"/.test(html)) out.push('لا يوجد canonical');

  // Mistakes #12, #13, #14 and #18 in docs/SEO_MISTAKES_LOG.md, none of which
  // had an automated guard and three of which have already happened twice:
  //   · <title> must equal og:title — Google reading one headline and the
  //     social card showing another is the same page telling two stories;
  //   · <meta description> must equal og:description, for the same reason;
  //   · seo_meta is the only place allowed to emit og:*, so a second copy
  //     means a page is printing its own and they will drift.
  const ogTitle = (html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1];
  const ogDesc = (html.match(/<meta property="og:description" content="([^"]*)"/) || [])[1];
  const nOgTitle = (html.match(/property="og:title"/g) || []).length;
  const nOgDesc = (html.match(/property="og:description"/g) || []).length;
  if (nOgTitle > 1) out.push(`og:title مكرّر ${nOgTitle} مرات — المصدر الوحيد المسموح هو seo_meta`);
  if (nOgDesc > 1) out.push(`og:description مكرّر ${nOgDesc} مرات — المصدر الوحيد المسموح هو seo_meta`);
  if (title && ogTitle && title !== ogTitle) {
    out.push(`<title> مختلف عن og:title — «${title}» مقابل «${ogTitle}»`);
  }
  if (desc && ogDesc && desc !== ogDesc) out.push('meta description مختلف عن og:description');

  // Every image needs alt text — Bing flagged this and it is an accessibility
  // requirement, not only an SEO one. Decorative images may use alt="".
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter((tag) => !/\balt\s*=/.test(tag));
  if (noAlt.length) out.push(`${noAlt.length} صورة بلا alt`);

  const hasAds = /adsbygoogle/.test(html);
  const words = textOf(html).split(' ').filter(Boolean).length;
  if (spec.noAds && hasAds) out.push('صفحة خدمية/بلا محتوى وعليها إعلانات — مخالفة AdSense');
  if (hasAds && words < MIN_WORDS_WITH_ADS) {
    out.push(`إعلانات على صفحة بـ ${words} كلمة فقط (الحد ${MIN_WORDS_WITH_ADS}) — محتوى قليل القيمة`);
  }
  if (!spec.thin && words < 120) out.push(`محتوى قليل جداً: ${words} كلمة`);

  return { problems: out, words, hasAds, title: title || '' };
}

// The blog metadata lives in data, not in a template, so it is checked once
// over every article rather than per render.
function auditArticles() {
  const out = [];
  const seen = new Set();
  for (const a of ARTICLES) {
    // Mirrors blog/article.ejs, which drops the brand suffix rather than let
    // the title run past 60 — so only the bare title can actually overflow.
    const brand = ' | OscarDevs';
    const full = (a.title.length + brand.length <= TITLE_MAX) ? a.title + brand : a.title;
    if (full.length > TITLE_MAX) out.push(`[${a.slug}] العنوان ${full.length} حرف: ${a.title}`);
    const d = a.metaDescription || '';
    if (!d) out.push(`[${a.slug}] بلا metaDescription`);
    else if (d.length > DESC_MAX) out.push(`[${a.slug}] الوصف ${d.length} حرف`);
    else if (d.length < DESC_MIN) out.push(`[${a.slug}] الوصف ${d.length} حرف — قصير`);
    if (seen.has(a.title)) out.push(`[${a.slug}] عنوان مكرر`);
    seen.add(a.title);
    const body = path.join(VIEWS, 'blog', 'articles', a.slug + '.ejs');
    if (!fs.existsSync(body)) out.push(`[${a.slug}] لا يوجد ملف نص للمقال`);
    else {
      const words = textOf(fs.readFileSync(body, 'utf8')).split(' ').filter(Boolean).length;
      // AdSense's "thin content" line. Our shortest real article is well above.
      if (words < 300) out.push(`[${a.slug}] المقال ${words} كلمة — قصير للإعلانات`);
    }
  }
  return out;
}

// ── Runner ───────────────────────────────────────────────────────────────────
// The rule set is the valuable part and there is only one of it: seo-audit-tenants.js
// requires audit() from here rather than restating the limits, so a change to
// what "too long" means moves both at once.
module.exports = { audit, TITLE_MAX, DESC_MIN, DESC_MAX, MIN_WORDS_WITH_ADS, base };

if (require.main === module) {
  const asked = process.argv.slice(2);
  const names = asked.length ? asked : Object.keys(PAGES);
  let failed = 0;

  for (const name of names) {
    const spec = PAGES[name];
    if (!spec) { console.log(`⏭️  ${name} — لا يوجد fixture`); continue; }
    const file = path.join(VIEWS, spec.file);
    let html;
    try {
      html = ejs.render(fs.readFileSync(file, 'utf8'), base(spec.locals),
        { filename: file, root: VIEWS });
    } catch (e) {
      failed++;
      console.log(`❌ ${name} — فشل العرض: ${e.message}`);
      continue;
    }
    const r = audit(name, html, spec);
    if (r.problems.length) {
      failed++;
      console.log(`❌ ${name} — ${r.problems.length} مخالفة:`);
      r.problems.forEach((p) => console.log('   · ' + p));
    } else {
      console.log(`✅ ${name} (${r.words} كلمة${r.hasAds ? '، عليها إعلانات' : ''})`);
    }
  }

  if (!asked.length) {
    const art = auditArticles();
    if (art.length) {
      failed++;
      console.log(`❌ المقالات — ${art.length} مخالفة:`);
      art.forEach((p) => console.log('   · ' + p));
    } else {
      console.log(`✅ المقالات (${ARTICLES.length} مقال)`);
    }
  }

  console.log(failed ? `\n${failed} صفحة فيها مخالفة.` : '\nكل الصفحات العامة مطابقة لشروط SEO و AdSense.');
  process.exit(failed ? 1 : 0);

}
