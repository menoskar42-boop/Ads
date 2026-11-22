#!/usr/bin/env node
/**
 * صفحات الخليج: إنجليزي حقيقي · فروق حقيقية · ومفيش ادعاء امتثال.
 *
 * ── تلات خطوط حمرا ─────────────────────────────────────────────────────
 *
 * ١. **مش نفس الصفحة باسم بلد متبدّل.** مانوس كتبها بالحرف: «لا تنشئ خمس
 *    صفحات متطابقة بتغيير اسم الدولة»، وكلود: «لا تترجم ترجمة آلية».
 *    الاتنين بيوصفوا صفحة doorway — الغلطة رقم ٧ في
 *    `docs/SEO_MISTAKES_LOG.md`، ووقعنا فيها قبل كده.
 *
 * ٢. **مفيش ادعاء توافق تنظيمي.** إحنا **مش** متكاملين مع ZATCA ولا
 *    Nphies ولا أي جهة. الادعاء ده في سوق منظّم مش «مبالغة تسويقية» —
 *    بيحطّ العميل في مخالفة. الصفحة بتقول اللي مش بنعمله في قسم مستقل.
 *
 * ٣. **مفيش عربي في المتن الإنجليزي.** صفحة `/en/` فيها فقرات عربية هي
 *    صفحة مترجمة نص نص — والزائر الخليجي اللي فتحها بيقفلها.
 *
 * Usage: node scripts/check-gulf.js
 */
'use strict';
const path = require('path');
const ejs = require('ejs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://oscardevs.com';
const CHROME = process.env.CHROME_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const gulf = require('../src/lib/gulf_pages');
const markets = require('../src/lib/markets');
const langRoutes = require('../src/lib/lang_routes');
const pricing = require('../src/lib/pricing');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

// ── ١) الفروق بين السوقين حقيقية ───────────────────────────────────────

const sa = gulf.LOCAL.sa;
const ae = gulf.LOCAL.ae;
for (const f of ['vat', 'weekend', 'eInvoice', 'city', 'note']) {
  check(`الفرق «${f}» مش متطابق بين السوقين`, sa[f] !== ae[f],
    `الاتنين بيقولوا «${sa[f]}» — ده اسم بلد بيتبدّل في نفس النص، `
    + 'يعني صفحة doorway.');
}

// ── ٢) السعر الخليجي مش السعر المصري ───────────────────────────────────

const egClinic = pricing.PRICES.clinic.monthly;
const saClinic = markets.priceOf('clinic', 'sa').monthly;
check('سعر الخليج مش نفس سعر مصر', saClinic !== egClinic,
  `الاتنين ${egClinic}. ١٩٩ جنيه ≈ ١٤ ريال — العميل السعودي مش بيقول `
  + '«رخيص»، بيقول «فيه إيه؟». ودي ملاحظة كلود بالحرف.');
check('وكل نظام ليه سعر خليجي',
  Object.keys(pricing.PRICES).every((t) => markets.GULF[t]),
  'نظام بلا سعر خليجي بيرندر صفحة بسعر فاضي.');
check('وأسعار الخليج معلّمة إنها اجتهاد مش قياس',
  markets.unsourced().length > 0 && markets.MARKETS.sa.sourced === false,
  '`sourced: false` بيقول إن الأرقام دي قرار مالك مش مسح أسعار منافسين. '
  + 'شيلها لما يبقى فيه قياس حقيقي بتاريخ ومصدر.');

// ── ٣) الرندر: إنجليزي حقيقي بمحتوى كفاية ──────────────────────────────

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const p of gulf.pages()) {
    const page = gulf.build(p.market, p.topic);
    const price = page.type ? markets.priceOf(page.type, p.market) : null;
    const rest = p.path.replace(/^\/en/, '');
    let html;
    try {
      html = await ejs.renderFile(path.join(ROOT, 'src/views/landing/gulf.ejs'), {
        page,
        freeMonths: pricing.FREE_MONTHS,
        monthly: price && price.monthly,
        buy: price && price.buy,
        demoUrl: page.demo ? `https://${page.demo}.oscardevs.com/` : null,
        siteOrigin: SITE, canonicalUrl: SITE + p.path,
        publicUrl: (x) => SITE + langRoutes.withLang(x || '/', 'ar'),
        lang: 'en', dir: 'ltr', langPrefix: '/en',
        /* ⚠️ **من `alternatesFor` مش محسوبة هنا تاني.** السطور اللي كانت
         * هنا كانت بتعيد بناء منطق `lang_prefix` بإيدها — فالفحص كان
         * بيرندر بمدخلات بيصنعها بنفسه ويتأكد منها، يعني بيختبر نفسه مش
         * الموقع. ولما الوسم اتغيّر لـ`en-SA`/`en-AE` الفحص فضل أخضر. */
        hreflang: gulf.alternatesFor(p.path),
        hreflangDefault: null,
        facts: require('../src/lib/company_facts').facts(),
        pricing, assetVersion: '1', t: (k) => k, termsVersion: '1.3',
        ads: { enabled: false, publisherId: '', slots: {} }, showAds: false,
        canonicalCompanyUrl: () => SITE, jsonLd: (o) => JSON.stringify(o),
      }, { root: path.join(ROOT, 'src/views') });
    } catch (e) {
      check(`${p.path} بيرندر`, false, e.message.split('\n')[0]);
      continue;
    }
    const pg = await browser.newPage();
    await pg.setContent(html);
    const r = await pg.evaluate(() => ({
      h1: document.querySelectorAll('h1').length,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      words: document.body.innerText.split(/\s+/).filter(Boolean).length,
      arabicInBody: /[ء-ي]/.test(document.querySelector('main').innerText),
      hreflang: [...document.querySelectorAll('link[rel=alternate]')].map((l) => l.hreflang),
      honest: /does not do/i.test(document.body.innerText),
      switchLink: !!document.querySelector('a.switch'),
    }));
    await pg.close();

    const tag = p.path.replace('/en/', '');
    check(`[${tag}] h1 واحد و lang=en`, r.h1 === 1 && r.lang === 'en' && r.dir === 'ltr',
      `h1=${r.h1} lang=${r.lang} dir=${r.dir}`);
    check(`[${tag}] ${r.words} كلمة — فوق حد المحتوى الرقيق`, r.words >= 300,
      'صفحة تحت ٣٠٠ كلمة صفحة رقيقة، ومانوس وكلود منعوا «الصفحات شبه الفارغة».');
    check(`[${tag}] مفيش عربي في المتن`, !r.arabicInBody,
      'فقرة عربية في صفحة `/en/` معناها إنها مترجمة نص نص.');
    check(`[${tag}] قسم «اللي مابنعملهوش» موجود`, r.honest,
      'ده اللي بيمنع ادعاء التوافق مع ZATCA/Nphies — وهو أقوى حاجة في الصفحة.');
    check(`[${tag}] وفيه زر تبديل للعربي`, r.switchLink,
      'قرار المالك: زر ظاهر بدل تحويل تلقائي بالـIP.');
    /* المجموعة إقليمية: `en-SA` و`en-AE` بيسردوا بعض، مفيش وسم عربي
     * (مافيش نسخة عربية للصفحة دي)، **ومفيش `x-default`** — قراءة مانوس
     * للـHTML المنشور لقت الأربع صفحات بتعلن `en` و`x-default` على
     * نفسها، يعني كل واحدة بتقول إنها هي النسخة الوحيدة وهي الافتراضي. */
    const expected = gulf.alternatesFor(p.path).map((a) => a.lang).sort();
    check(`[${tag}] hreflang إقليمي ومتبادل`,
      JSON.stringify(r.hreflang.filter((h) => h !== 'x-default').sort()) === JSON.stringify(expected),
      `أعلن ${JSON.stringify(r.hreflang)} والمفروض ${JSON.stringify(expected)}.`);
    check(`[${tag}] مفيش نسخة عربية معلَنة`, !r.hreflang.some((h) => /^ar\b/.test(h)),
      'الصفحة دي مالهاش نسخة عربية — وإعلان نسخة مش موجودة بيوَدّي الزاحف على ٤٠٤.');
    check(`[${tag}] ومفيش x-default`, !r.hreflang.includes('x-default'),
      'مافيش في المجموعة دي صفحة بلا استهداف إقليمي، والافتراضي المخترع '
      + 'بيخلّي صفحة السعودية وصفحة الإمارات تتنافسوا على نفس المكان.');
  }
  await browser.close();

  // ── ٤) ومفيش ادعاء توافق في النص المصدر ──────────────────────────────

  const src = require('fs').readFileSync(path.join(ROOT, 'src/lib/gulf_pages.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const claim of [/compliant with ZATCA/i, /ZATCA[- ]certified/i,
    /Nphies[- ]integrated/i, /fully compliant/i]) {
    check(`مفيش ادعاء «${claim.source.slice(0, 26)}»`, !claim.test(src),
      'ادعاء التوافق في سوق منظّم بيحطّ العميل في مخالفة — وإحنا مش متكاملين.');
  }

  // ── ٥) والمسارات في السايت‌ماب ────────────────────────────────────────

  const legal = require('fs').readFileSync(path.join(ROOT, 'src/routes/legal.js'), 'utf8');
  check('صفحات الخليج في السايت‌ماب', /gulfPages\.pages\(\)\.map\(\(p\) => \(\{ loc: p\.path/.test(legal),
    'صفحة مفهرسة مش في السايت‌ماب = محدّش بيوصّل الزواحف لها.');
  check('و`absLoc` بيسيب المسار اللي عليه prefix خلاص',
    /\/\^\\\/\(ar\|en\)\(\\\/\|\$\)\/\.test\(loc\)/.test(legal),
    'من غير ده، `/en/sa/...` هياخد prefix تاني ويبقى `/ar/en/sa/...`.');

  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('❌ الفحص وقع:', e.message); process.exit(1); });
