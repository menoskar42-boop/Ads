#!/usr/bin/env node
/**
 * كل عنوان في البيانات المنظّمة = الـcanonical بالظبط.
 *
 * ── الغلطة اللي اتكشفت في مراجعة الكود الخارجية ────────────────────────
 *
 * `sector.ejs` كان بيبني عناوين الـBreadcrumb والـ`url` بإيده:
 *
 *     siteOrigin + "/" + s.slug
 *
 * فبعد تقسيم اللغة، الصفحة بقت بتقول حاجتين مختلفتين عن نفسها:
 *
 *     canonical  →  /ar/clinic-management-egypt
 *     breadcrumb →  /clinic-management-egypt      ← بيتحوّل ٣٠١
 *
 * جوجل بتستخدم الـBreadcrumb في فهم هرم الموقع وفي شكل النتيجة. تضارب
 * بين الرابط المرئي والبيانات المنظّمة بيضعّف الاتنين. و«الرئيسية» كانت
 * بتشاور على `/` اللي هو نفسه تحويلة.
 *
 * ── الإصلاح مش «أزوّد /ar في تلات أماكن» ───────────────────────────────
 *
 * ده بيصلّح النهارده ويسيب الغلط ممكن بكرة — أول قالب جديد يبني عنوان
 * بإيده بيرجّع نفس المشكلة. الإصلاح إن يبقى فيه **دالة واحدة**
 * (`publicUrl`) والقوالب تنده عليها، والفحص يرفض بناء عنوان بالإيد.
 *
 * ── الفحص بيرندر فعلاً ─────────────────────────────────────────────────
 *
 * مش بيدوّر على نص في القالب — بيرندر الصفحة، ويقرا الـJSON-LD، ويقارن
 * كل عنوان جوّاه بالـcanonical. ده بيمسك الحالة اللي القالب فيها شكله
 * سليم والناتج غلط.
 *
 * Usage: node scripts/check-schema-urls.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://oscardevs.com';
const langRoutes = require('../src/lib/lang_routes');
const { SECTORS, othersOf } = require('../src/lib/sector_landings');
const { SERVICES, othersOf: otherServices, READY_SYSTEMS } = require('../src/lib/services');
const { arabicNumber } = require('../src/lib/pricing');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

const publicUrl = (p) => SITE + langRoutes.withLang(p || '/', 'ar');

/** مفاتيح بتشاور على أصل أو حساب خارجي — مش على صفحة عندنا. */
const ASSET_KEYS = new Set(['logo', 'image', 'thumbnailUrl', 'contentUrl', 'sameAs']);

function base(slug) {
  return {
    siteOrigin: SITE,
    canonicalUrl: publicUrl('/' + slug),
    publicUrl,
    lang: 'ar', dir: 'rtl', langPrefix: '/ar',
    hreflang: langRoutes.liveLangs().map((l) => ({
      lang: langRoutes.LANGS[l].hreflang, path: langRoutes.withLang('/' + slug, l),
    })),
    facts: require('../src/lib/company_facts').facts(),
    pricing: require('../src/lib/pricing'),
    assetVersion: '1', t: (k) => k, termsVersion: '1.3',
    ads: { enabled: true, publisherId: 'x', slots: {} }, showAds: true,
    canonicalCompanyUrl: () => SITE,
    jsonLd: (o) => JSON.stringify(o)
      .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'),
  };
}

/** كل العناوين اللي على دومينّا جوّه أي JSON-LD في الصفحة. */
function schemaUrls(html) {
  const urls = [];
  for (const m of html.matchAll(/application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    const raw = m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&');
    let obj;
    try { obj = JSON.parse(raw); } catch (e) { urls.push({ bad: raw.slice(0, 60) }); continue; }
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && v.startsWith(SITE)) urls.push({ key: k, url: v });
        else walk(v);
      }
    }(obj));
  }
  return urls;
}

const PAGES = [
  ...Object.keys(SECTORS).map((slug) => ({
    slug, file: 'landing/sector.ejs', label: `قطاع ${slug}`,
    locals: {
      sector: Object.assign({ slug }, SECTORS[slug]),
      others: othersOf(slug),
      demoUrl: `https://${SECTORS[slug].demo}.oscardevs.com/`,
    },
  })),
  ...Object.keys(SERVICES).map((slug) => ({
    slug, file: 'landing/service.ejs', label: `خدمة ${slug}`,
    locals: {
      service: Object.assign({ slug }, SERVICES[slug]),
      others: otherServices(slug),
      readySystemsAr: arabicNumber(READY_SYSTEMS),
    },
  })),
];

(async () => {
  // ── ١) كل عنوان في السكيمة عليه prefix اللغة ────────────────────────
  const offenders = [];
  let checked = 0;
  for (const p of PAGES) {
    let html;
    try {
      html = await ejs.renderFile(path.join(ROOT, 'src/views', p.file),
        Object.assign(base(p.slug), p.locals), { root: path.join(ROOT, 'src/views') });
    } catch (e) {
      offenders.push(`${p.label}: مااترندرش — ${e.message.split('\n')[0]}`);
      continue;
    }
    const canon = (/rel="canonical" href="([^"]+)"/.exec(html) || [])[1];
    for (const u of schemaUrls(html)) {
      checked += 1;
      if (u.bad) { offenders.push(`${p.label}: JSON-LD مكسور — ${u.bad}`); continue; }
      // العنوان على دومينّا لازم يبدأ بـ`/ar` (أو يكون مرساة `#organization`).
      const p2 = u.url.slice(SITE.length);
      /* المستثنى — ودي مش تساهل، دي حقايق عن الأنواع دي:
       *
       * · `#organization` مرساة داخل الصفحة، مش عنوان صفحة.
       * · `logo` و`image` و`sameAs` أصول أو حسابات — الأصل مالوش نسخة
       *   عربية وإنجليزية، و`/ar/logo.png` مالوش وجود أصلاً.
       * · `https://oscardevs.com` بلا مسار هو **عنوان الكيان** في
       *   `Organization.url`، وده صح يبقى الجذر: الشركة مش صفحة عربية.
       *
       * اللي **لازم** ياخد prefix هو عنوان **صفحة**: `url` بتاع الصفحة
       * نفسها، وعناصر الـBreadcrumb. */
      if (p2.startsWith('#')) continue;
      if (ASSET_KEYS.has(u.key)) continue;
      if (/\.[a-z0-9]{2,5}$/i.test(p2)) continue;
      if (p2 === '' || p2 === '/') continue;
      if (!/^\/(ar|en)(\/|$)/.test(p2)) {
        offenders.push(`${p.label} → ${u.key}: ${u.url} (والـcanonical ${canon})`);
      }
    }
  }
  check(`كل عنوان في سكيمة ${PAGES.length} صفحة عليه prefix اللغة (${checked} عنوان)`,
    offenders.length === 0,
    offenders.slice(0, 6).join('\n   ')
    + (offenders.length > 6 ? `\n   … و${offenders.length - 6} غيرهم` : ''));

  // ── ٢) والقوالب مابتبنيش عنوان بإيدها ───────────────────────────────
  //
  // ده اللي بيمنع رجوع الغلطة من قالب جديد.

  const handmade = [];
  for (const f of ['landing/sector.ejs', 'landing/service.ejs']) {
    const src = fs.readFileSync(path.join(ROOT, 'src/views', f), 'utf8')
      .replace(/<%#[\s\S]*?%>/g, ' ');
    if (/siteOrigin\s*(\+|%>)\s*['"]?\//.test(src)) handmade.push(f);
  }
  check('القوالب بتنده `publicUrl` مش بتركّب العنوان بإيدها', handmade.length === 0,
    `${handmade.join('، ')} لسه بيركّبوا \`siteOrigin + "/"...\`. `
    + 'الدالة الواحدة هي اللي بتمنع رجوع الغلطة من قالب جديد.');

  /* ── ٢ب) ومفيش أي قالب في المستودع بيركّب عنوان صفحة عامة بإيده ───────
   *
   * القاعدة اللي فوق بتفحص قالبين بس. لكن نفس الغلطة كانت في **أربع
   * صفحات تانية** اتكشفت بعد النشر:
   *
   *   · `radiology/landing.ejs` — كانونيكال على `/radiology` بلا prefix،
   *     يعني الصفحة بتقول إن نسختها الأصلية عنوان بيرجّعك لها هي نفسها.
   *   · `research/upload.ejs`   — نفس الحاجة في `url` بتاع السكيمة.
   *   · `legal/company_facts.ejs` — `@id` و`url` للكيان.
   *
   * التقارير الخارجية مسكت واحدة منهم بس. المسح ده بيمسك الأربعة وأي
   * واحدة جاية — بيمشي على كل القوالب ويدوّر على `siteOrigin + '/…'`
   * لمسار **موجود في قايمة الصفحات العامة**.
   *
   * الأصول (`/og-default.png`) والمسارات المش عامة (`/apply/status`)
   * مستثناة: مالهاش نسخ لغوية أصلاً. */
  const publicSet = langRoutes.publicPaths();
  const handBuilt = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) { walk(full); continue; }
      if (!f.name.endsWith('.ejs')) continue;
      const txt = fs.readFileSync(full, 'utf8').replace(/<%#[\s\S]*?%>/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
      for (const m of txt.matchAll(/siteOrigin[^;\n]{0,40}\+\s*'(\/[a-z0-9/-]+)'/g)) {
        if (publicSet.has(m[1])) {
          handBuilt.push(`${path.relative(ROOT, full)} → ${m[1]}`);
        }
      }
    }
  }(path.join(ROOT, 'src/views')));
  check('مفيش قالب بيركّب عنوان صفحة عامة بإيده', handBuilt.length === 0,
    handBuilt.join('\n   ') + '\n   العنوان المركّب بالإيد بيفضل بلا prefix بعد '
    + 'تقسيم اللغة — فالصفحة بتشاور على عنوان بيتحوّل عليها هي نفسها. '
    + 'استخدم `publicUrl(path)`.');

  // ── ٣) و`publicUrl` متوفّرة في السيرفر ──────────────────────────────

  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  check('`publicUrl` متوفّرة في `res.locals`', /res\.locals\.publicUrl\s*=/.test(server),
    'من غيرها القوالب اللي بتنده عليها بتقع وقت العرض — EJS مالوش `require`.');
  check('وبتقرا اللغة وقت النداء مش وقت التسجيل',
    /res\.locals\.publicUrl = \(p\) =>[\s\S]{0,160}res\.locals\.lang/.test(server),
    'الميدل‌وير ده بيشتغل قبل `lang_prefix`، فلو اللغة اتقرت دلوقتي '
    + 'هتبقى دايماً الافتراضية.');

  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('❌ الفحص وقع:', e.message); process.exit(1); });
