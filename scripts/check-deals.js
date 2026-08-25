#!/usr/bin/env node
/**
 * موقع Deals (deals.oscardevs.com) — الحارس.
 *
 * ريبليت بنى الموقع، والمراجعة طلعت منه عشر ملاحظات. الفحص ده بيقفل على
 * اللي اتصلّح عشان مايرجعش، ومركّز في أربع حتت:
 *
 * ── ١) امتثال أمازون Associates ────────────────────────────────────────
 *
 * أخطر بندين في اتفاقية الـAssociates:
 *   • **السعر**: ممنوع تنشر سعر إلا من الـAPI، ولازم يتحدّث أو يتشال خلال
 *     ٢٤ ساعة. الموقع بيدخّل الأسعار **بالإيد** من اللوحة، فسعر متكتوب في
 *     `offers` بيتبعت لجوجل على إنه **ادعاء** — وده كسر للشرطين مع بعض.
 *     فـ`offers` و`aggregateRating` ممنوعين في السكيمة لحد ما يبقى في API.
 *   • **الإفصاح**: لازم يكون واضح و**جنب الروابط**، مش في الفوتر بس.
 *
 * ── ٢) صفحات السياسات تتأرشف وكانونيكال لنفسها ─────────────────────────
 *
 * كانت الخمس صفحات `noindex` وكانوا كلهم `canonicalPath: ''` — يعني كل
 * واحدة بتقول لجوجل «الأصل بتاعي هو الصفحة الرئيسية». ده بيخفي إفصاح
 * الأفيلييت اللي أمازون بتطلبه وسياسة الخصوصية اللي أدسنس بتشترطها،
 * وبيخلّي جوجل يعتبر الصفحات نسخة مكرّرة من الرئيسية.
 *
 * ── ٣) صفحة الخطأ كانت بترمي ──────────────────────────────────────────
 *
 * `error.ejs` كانت بتقرا `title` واللي مابيتبعتش، و EJS بترمي ReferenceError
 * على أي متغيّر مش موجود — يعني **كل 404 كان بيبقى 500**، والـ500 handler
 * نفسه بيرندر نفس القالب فيرمي تاني. الفحص بيرندر كل قالب فعلاً.
 *
 * ── ٤) الأمن المشترك ──────────────────────────────────────────────────
 *
 * حد الدخول لازم يقرا العنوان من `clientIp` المشترك (مش `req.ip` اللي
 * بيتقرا من هيدر اللي بيحاول)، والرفع لازم يعدّي على `uploads.guard`،
 * والـCSRF بيقارن **بايتات** مش حروف.
 *
 *   node scripts/check-deals.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
// شيل التعليقات قبل أي بحث عن كود: كلمة في تعليق مش كود شغّال، والعكس
// صحيح — تعليق بيشرح ليه حاجة ممنوعة مايصحّش يفشّل الفحص.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const app = raw('deals/app.js');
const appCode = code(app);
const db = raw('deals/db.js');

/* ── ١. امتثال أمازون ─────────────────────────────────────────────────── */
{
  check('مفيش `offers` ولا `aggregateRating` في السكيمة',
    !/offers\s*:/.test(appCode) && !/aggregateRating\s*:/.test(appCode),
    'السعر بالإيد + شرط الـ٢٤ ساعة = ادعاء غلط');

  // الإفصاح جنب الروابط: أي قالب بيرسم كروت منتجات لازم يعرض الإفصاح.
  const viewsDir = path.join(ROOT, 'deals/views');
  const withCards = fs.readdirSync(viewsDir).filter((f) => /\.ejs$/.test(f))
    .filter((f) => /include\('partials\/product_card'/.test(raw('deals/views/' + f)));
  const missing = withCards.filter((f) => !/include\('partials\/disclosure'\)/.test(raw('deals/views/' + f)));
  check('كل قالب فيه كروت منتجات بيعرض الإفصاح جنبها',
    withCards.length > 0 && missing.length === 0,
    missing.length ? 'ناقص في: ' + missing.join(', ') : withCards.join(', '));

  const disclosure = raw('deals/views/partials/disclosure.ejs');
  check('ونص الإفصاح بيقول العمولة ويوصّل لصفحة الإفصاح',
    /عمولة/.test(disclosure) && /href="\/affiliate-disclosure"/.test(disclosure));

  check('وصفحة المنتج المفردة كمان فيها إفصاح جنب الزرار',
    /رابطًا تابعًا|رابط تابع|عمولة/.test(raw('deals/views/product.ejs')));

  check('والفوتر فيه جملة الـAssociates الرسمية',
    /As an Amazon Associate I earn from qualifying purchases/.test(raw('deals/views/partials/footer.ejs')));

  // كل رابط أفيلييت في القوالب لازم يكون rel="sponsored".
  //
  // ملحوظة على الطريقة: `<a[^>]*>` **مابتنفعش** على EJS، لأن `%>` جوّه
  // الوسم فيها `>` فالماتش بيقف في نص الوسم. فبنحوّل كل تعبير EJS لكلمة
  // من غير أقواس الأول، وبعدين نقرا الوسوم.
  const flatten = (src) => src.replace(/<%[-=]?([\s\S]*?)%>/g, (_m, inner) => 'EJS_' + inner.replace(/\W+/g, '_'));
  const links = [];
  for (const f of ['partials/product_card.ejs', 'product.ejs']) {
    const src = flatten(raw('deals/views/' + f));
    for (const m of src.matchAll(/<a[^>]*affiliate_url[^>]*>/g)) links.push([f, m[0]]);
  }
  const unmarked = links.filter(([, tag]) => !/rel="[^"]*sponsored/.test(tag));
  check('وكل رابط أفيلييت `rel="sponsored"`',
    links.length > 0 && unmarked.length === 0,
    unmarked.length ? unmarked[0][0] : links.length + ' رابط');
}

/* ── ٢. رابط الأفيلييت بيتفحص قبل الحفظ ───────────────────────────────── */
{
  const { checkAffiliateUrl } = require('../deals/affiliate');
  const cases = [
    ['https://www.amazon.eg/dp/B0X', false, 'رابط أمازون بدون tag'],
    ['https://www.amazon.eg/dp/B0X?tag= ', false, 'tag فاضي'],
    ['https://www.amazon.eg/dp/B0X?tag=oscar-21', true, 'رابط أمازون بـ tag'],
    ['https://amzn.to/3abc', true, 'لينك قصير (التاج جوّه الريدايركت)'],
    ['javascript:alert(1)', false, 'سكيمة مش http'],
    ['', false, 'فاضي'],
  ];
  const wrong = cases.filter(([url, want]) => checkAffiliateUrl(url).ok !== want);
  check('فحص رابط الأفيلييت بيرفض أمازون من غير `tag=`',
    wrong.length === 0, wrong.length ? wrong.map((c) => c[2]).join(' · ') : cases.length + ' حالة');

  check('والنتيجة تلات حالات مش اتنين (متحقّق / لينك قصير مش متحقّق / مرفوض)',
    checkAffiliateUrl('https://amzn.to/3abc').kind === 'short'
    && checkAffiliateUrl('https://www.amazon.eg/dp/B0X?tag=t').kind === 'tagged');

  check('والراوتين بيستدعوه قبل الحفظ',
    (appCode.match(/checkAffiliateUrl\(req\.body\.affiliate_url\)/g) || []).length === 2);

  check('وخطأ الإدخال بيرجع 400 مش 500',
    /function badInput\([\s\S]*?status\(400\)/.test(appCode)
    && !/throw new Error\('العنوان ورابط Affiliate مطلوبان'\)/.test(appCode),
    '«حدث خطأ مؤقت» على غلط إدخال كدب على الأدمن');
}

/* ── ٣. الأرشفة والكانونيكال ──────────────────────────────────────────── */
{
  const pages = eval('(' + /const LEGAL_PAGES = ({[\s\S]*?\n});/.exec(app)[1] + ')');
  const names = Object.keys(pages);
  check('صفحات السياسات الخمسة موجودة',
    names.length === 5 && names.includes('/affiliate-disclosure') && names.includes('/privacy'),
    names.join(' '));

  check('وكلها تتأرشف (مفيش noindex عليها)',
    /noindex: false,/.test(/Object\.entries\(LEGAL_PAGES\)[\s\S]*?\}\);/.exec(appCode)[0]));

  check('وكل واحدة كانونيكال لنفسها مش للرئيسية',
    /canonicalPath: routePath,/.test(appCode));

  check('وكلها في السايت‌ماب',
    /Object\.keys\(LEGAL_PAGES\)\.map/.test(appCode),
    'صفحة تتأرشف ومش في السايت‌ماب فرصة ضايعة');

  // حدود Bing المخزّنة: العنوان ≤٦٠، الوصف ١٥٠–١٦٠.
  const longTitle = names.filter((n) => [...pages[n].title].length > 60);
  const badDesc = names.filter((n) => {
    const len = [...pages[n].metaDescription].length;
    return len < 140 || len > 160;
  });
  check('والعناوين ≤ ٦٠ حرف', longTitle.length === 0, longTitle.join(', ') || 'كلها');
  check('والأوصاف في حدود ١٥٠–١٦٠', badDesc.length === 0, badDesc.join(', ') || 'كلها');

  // ومحتوى حقيقي، مش سطر واحد (شرط أدسنس للمحتوى قليل القيمة).
  const thin = names.filter((n) => pages[n].body.join(' ').split(/\s+/).length < 60);
  check('ومحتوى الصفحات مش رفيّع', thin.length === 0, thin.join(', ') || 'كلها فقرات');

  // صفحة الخطأ: مالهاش كانونيكال أصلاً.
  check('وصفحة الخطأ مالهاش كانونيكال (مش نسخة من الرئيسية)',
    /canonicalPath: null/.test(raw('deals/views/error.ejs'))
    && /_canon !== null/.test(raw('deals/views/partials/header.ejs')));

  check('و/admin عليه X-Robots-Tag noindex',
    /req\.path\.startsWith\('\/admin'\)\)\s*res\.setHeader\('X-Robots-Tag'/.test(appCode));
}

/* ── ٤. كل قالب بيرندر فعلاً ──────────────────────────────────────────── */
{
  let ejs;
  try { ejs = require('ejs'); } catch { console.log('⏭️  ejs مش متثبّت — رندر القوالب اتخطّى'); process.exit(2); }
  const base = {
    site: { site_name: 'Deals', site_description: 'وصف', theme_color: '#0f766e', logo_url: null },
    baseUrl: 'https://deals.oscardevs.com', providers: [{ id: 'MANUAL', label: 'Manual', enabled: true }],
    csrfToken: 'tok', metaDescription: 'وصف', noindex: false, structuredData: [], jsonLd: JSON.stringify,
  };
  const p = { id: 1, slug: 's', title: 'منتج', short_description: 'وصف', full_description: 'نص', image_url: null, current_price: 10, currency: 'EGP', affiliate_url: 'https://amazon.eg/dp/x?tag=t', category_name: 'ت', category_slug: 'c' };
  const a = { id: 1, slug: 'a', title: 'مقال', excerpt: 'ملخص', body: 'نص', published_at: new Date(), created_at: new Date(), updated_at: new Date(), cover_image_url: null, is_published: true };
  const views = {
    'home.ejs': { products: [p], articles: [a], title: 'Deals' },
    'listing.ejs': { products: [p], heading: 'ع', description: 'و', title: 'ق', canonicalPath: '/category/c' },
    'product.ejs': { product: p, title: 'منتج' },
    'article.ejs': { article: a, title: 'مقال' },
    'legal.ejs': { title: 'الشروط', heading: 'الشروط', body: ['فقرة', 'فقرة'], canonicalPath: '/terms', noindex: false },
    'error.ejs': { status: 404, message: 'غير موجود' },
    'admin/login.ejs': { title: 'دخول', error: null },
    'admin/dashboard.ejs': { title: 'لوحة', products: [p], categories: [{ id: 1, name: 'ت', slug: 'c' }], articles: [a], settings: { site_name: 'Deals', site_description: 'د', logo_url: null, theme_color: '#0f766e' } },
    'admin/edit_product.ejs': { title: 'تعديل', product: p, categories: [{ id: 1, name: 'ت' }] },
  };
  const broken = [];
  const titles = [];
  for (const [file, extra] of Object.entries(views)) {
    const full = path.join(ROOT, 'deals/views', file);
    try {
      const html = ejs.render(fs.readFileSync(full, 'utf8'), { ...base, ...extra }, { filename: full });
      const h1 = (html.match(/<h1[ >]/g) || []).length;
      if (h1 !== 1) broken.push(`${file}: ${h1} h1`);
      titles.push([file, (/<title>([\s\S]*?)<\/title>/.exec(html) || [, ''])[1]]);
    } catch (e) { broken.push(`${file}: ${e.message.split('\n').pop()}`); }
  }
  check('كل قالب بيرندر ومعاه h1 واحد',
    broken.length === 0, broken.join(' · ') || Object.keys(views).length + ' قالب');

  // الغلطة الأصلية نفسها: `title` مقروء من غير حارس `typeof`.
  check('وصفحة الخطأ مابتقراش متغيّر ممكن ما يتبعتش',
    /typeof title !== 'undefined'/.test(raw('deals/views/error.ejs')),
    'ReferenceError هنا بيحوّل كل 404 إلى 500');

  const longT = titles.filter(([, t]) => [...t].length > 60);
  check('وعناوين القوالب ≤ ٦٠ حرف', longT.length === 0, longT.map((t) => t[0]).join(', ') || 'كلها');
}

/* ── ٥. الأمن المشترك ─────────────────────────────────────────────────── */
{
  check('حد الدخول بيقرا العنوان من `clientIp` المشترك',
    /require\('\.\.\/src\/middleware\/rateLimit'\)/.test(appCode) && /clientIp\(req\)/.test(appCode)
    && !/loginAttempts\.get\(req\.ip\)/.test(appCode),
    '`req.ip` بيتقرا من هيدر اللي بيحاول');

  check('وخريطة المحاولات ليها سقف',
    /loginAttempts\.size > \d+/.test(appCode), 'من غيره اللي بينتحل العنوان بيملاها');

  check('والرفع بيعدّي على `uploads.guard`',
    /uploads\.guard\(/.test(appCode) && /uploads\.extname\(/.test(appCode));

  check('والـCSRF بيقارن بايتات مش حروف',
    /const submitted = Buffer\.from\(/.test(appCode) && /submitted\.length !== expected\.length/.test(appCode),
    'timingSafeEqual بترمي RangeError على طولين مختلفين');

  check('وكلمة سر الأدمن من البيئة مش من الكود',
    /process\.env\.DEALS_ADMIN_PASSWORD/.test(appCode)
    && !/DEALS_ADMIN_PASSWORD\s*=\s*['"][^'"]+['"]/.test(appCode));

  check('ومفيش جدول مستخدمين ميت في قاعدة البيانات',
    !/CREATE TABLE IF NOT EXISTS deals_admin_users/.test(db),
    'جدول هاشات محدش بيقرا منه = سطح هجوم مجاني');
}

console.log(fail ? `\n⚠️  ${fail} مخالفة.` : '\nموقع Deals سليم.');
process.exit(fail ? 1 : 0);
