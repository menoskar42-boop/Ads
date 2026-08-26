#!/usr/bin/env node
/**
 * صفحة الخطأ: مفيش إعلانات · noindex · وكل رابط فيها بيوصل على طول.
 *
 * ── تلات قواعد، كل واحدة اتكسرت قبل كده ────────────────────────────────
 *
 * ١. **مفيش أدسنس على صفحة خطأ.** دي سياسة صريحة: صفحة مالهاش محتوى
 *    حقيقي مايتعرضش عليها إعلانات. الحساب `pub-3132188303904900` خط أحمر
 *    في `CLAUDE.md`.
 *
 * ٢. **`noindex`.** صفحة الخطأ اللي بتتأرشف بتظهر في نتائج البحث بدل
 *    الصفحة اللي الزائر بيدوّر عليها.
 *
 * ٣. **كل رابط بالـprefix.** الروابط كانت `/` و`/blog` و`/about` — يعني
 *    كل رابط في صفحة الخطأ نفسه بيعمل تحويلة. والزائر اللي وصل هنا أصلاً
 *    تايه، فآخر حاجة يحتاجها قفزة زيادة.
 *
 * ── والمسار للمنتج ─────────────────────────────────────────────────────
 *
 * مراجعتان خارجيتان طلبوا نفس الحاجة: صفحة الخطأ لازم تدّي مسار للمنتج
 * مش رسالة «مش موجودة» وخلاص. الأنظمة بتتعرض من `SECTORS` — فأي نظام
 * جديد بيظهر لوحده، ومحدّش محتاج يفتكر يزوّده هنا.
 *
 * Usage: node scripts/check-404.js
 */
'use strict';
const path = require('path');
const ejs = require('ejs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://oscardevs.com';
const CHROME = process.env.CHROME_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { SECTORS } = require('../src/lib/sector_landings');
const langRoutes = require('../src/lib/lang_routes');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

const errorSectors = Object.keys(SECTORS).map((slug) => ({
  slug, label: SECTORS[slug].title.split('—')[0].trim(),
}));

(async () => {
  const html = await ejs.renderFile(path.join(ROOT, 'src/views/404.ejs'), {
    siteOrigin: SITE,
    canonicalUrl: SITE + '/ar/nope',
    errorSectors,
    publicUrl: (p) => SITE + langRoutes.withLang(p || '/', 'ar'),
    lang: 'ar', dir: 'rtl', t: (k) => k, assetVersion: '1', termsVersion: '1.3',
    ads: { enabled: true, publisherId: 'ca-pub-3132188303904900', slots: {} },
    showAds: true, // ⚠️ مفعّلة عن قصد: الصفحة لازم تفضل بلا إعلانات برضه
    facts: require('../src/lib/company_facts').facts(),
    pricing: require('../src/lib/pricing'),
    canonicalCompanyUrl: () => SITE,
    jsonLd: (o) => JSON.stringify(o),
  }, { root: path.join(ROOT, 'src/views') });

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  await page.setContent(html);
  const r = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    return {
      links,
      bare: links.filter((h) => h && h.startsWith('/') && !/^\/(ar|en)(\/|$)/.test(h)),
      ads: document.documentElement.outerHTML.includes('adsbygoogle'),
      robots: (document.querySelector('meta[name=robots]') || {}).content || '',
      h1: document.querySelectorAll('h1').length,
    };
  });
  await browser.close();

  /* ⚠️ `showAds: true` فوق مقصودة: لو الصفحة بتحترم `showAds`، الفحص ده
   * بيفشل — وده الصح. صفحة الخطأ مالهاش إعلانات مهما كانت الإعدادات. */
  check('مفيش أدسنس على صفحة الخطأ — حتى لو `showAds` مفعّلة', !r.ads,
    'صفحة مالهاش محتوى حقيقي وعليها إعلانات = مخالفة سياسة أدسنس.');

  check('الصفحة `noindex`', /noindex/.test(r.robots),
    `robots = «${r.robots}». صفحة خطأ متأرشفة بتظهر بدل الصفحة المطلوبة.`);

  check(`كل روابط الصفحة (${r.links.length}) بالـprefix`, r.bare.length === 0,
    `بلا prefix: ${r.bare.join('، ')}. الزائر اللي وصل هنا تايه أصلاً — `
    + 'مايستاهلش تحويلة زيادة على كل رابط.');

  check('h1 واحد', r.h1 === 1, `لقيت ${r.h1}.`);

  const shown = r.links.filter((h) => /^\/ar\/[a-z-]+-egypt$/.test(h)).length;
  check(`وفيها مسار لكل نظام (${shown} من ${errorSectors.length})`,
    shown === errorSectors.length,
    'مراجعتان خارجيتان طلبوا مسار للمنتج بدل رسالة خطأ عارية. '
    + 'والقايمة مشتقّة من `SECTORS` فالنظام الجديد بيظهر لوحده.');

  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('❌ الفحص وقع:', e.message); process.exit(1); });
