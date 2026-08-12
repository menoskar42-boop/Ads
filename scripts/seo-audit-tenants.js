#!/usr/bin/env node
/**
 * Hold the TENANT pages to the same SEO and AdSense rules as the main site.
 *
 * seo-audit.js covers the public marketing pages. render-clinic-pages.js covers
 * the clinic. Everything else a customer actually gets — eleven verticals, each
 * on its own subdomain, and the pages a prospect is sent to from every service
 * card — had no automated check at all. A second <h1>, a title Bing truncates,
 * or an ad unit on a page with no content could ship on ten systems at once and
 * nothing would say a word. That gap is written down in docs/NEXT_FOUR.md; this
 * closes it.
 *
 * The rules are NOT restated here — audit() is required from seo-audit.js, so
 * "too long" means the same thing on both sides of the site.
 *
 * tenant.js renders every vertical from one big locals object, so this uses one
 * fixture with every key and varies page_type plus the data that vertical reads.
 *
 * Usage:
 *   node scripts/seo-audit-tenants.js            # every vertical
 *   node scripts/seo-audit-tenants.js shop gym   # only these
 */
'use strict';
let ejs;
try { ejs = require('ejs'); }
catch (e) {
  // Exit 2, not 1: check-all renders that as "skipped" rather than a failure,
  // so a missing package never reads as a broken page.
  console.log('⏭️  ejs مش منزّل — الفحص ده محتاج node_modules.');
  process.exit(2);
}
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const VIEWS = path.join(ROOT, 'src/views');
const { audit } = require('./seo-audit');
// The real helper, not a stand-in: the views call it to pick the translated
// field, and a fake one would hide a bug in that path.
const { pickContent } = require('../src/i18n/strings');

const SLUG = 'demo-business';
const SITE = `https://${SLUG}.oscardevs.com`;

// Enough description to clear the thin-content gate the real routes use.
// What a customer who filled their page in properly would have. Deliberately
// realistic rather than padded: if a vertical cannot clear the AdSense word
// floor even with this, that is a finding about the template, not the fixture.
const DESC = 'نشاط تجريبي بيستخدم لفحص إن الصفحة العامة بترسم صح وبتلتزم بحدود العنوان '
  + 'والوصف والهيدنجز وعدد الكلمات. بنقدّم خدمة للعملاء في أسيوط والمحافظات المجاورة، '
  + 'بمواعيد مرنة وأسعار واضحة من غير مفاجآت، وفريق بيرد على أي استفسار في نفس اليوم. '
  + 'تقدر تتواصل معانا على الواتس أو التليفون، أو تعدّي على العنوان في أي وقت خلال '
  + 'مواعيد العمل المكتوبة تحت.';

function money(v) { return Number(v || 0).toFixed(2) + ' ج.م'; }

// Every local tenant.js passes to res.render(view, …), with the neutral value
// for anything a given vertical does not read.
function base(over) {
  const company = Object.assign({
    id: 1, slug: SLUG, name: 'النشاط التجريبي', company_name: 'النشاط التجريبي',
    logo_url: null, description: DESC, page_type: 'portfolio',
    phone: '01552406406', whatsapp: '201552406406', address: 'أسيوط',
    email: 'demo@example.com', facebook: null, instagram: null,
    content_i18n: null, currency: 'EGP',
  }, (over && over.company) || {});

  const item = (i) => ({
    id: i, name: 'صنف رقم ' + i, name_ar: 'صنف رقم ' + i, name_en: null,
    title: 'صنف رقم ' + i, price: 100 + i, sale_price: null, image_url: null,
    description: 'وصف قصير للصنف.', qty: 10, available_qty: 10, category_id: 1,
    slug: 'item-' + i, is_active: true, form: null, expiry: null, expiry_status: null,
  });
  const three = [1, 2, 3, 4, 5, 6].map(item);

  return Object.assign({
    company, noindex: false, pageContent: null,
    // The portfolio view reads content.stats/process/faq/testimonials and does
    // not guard the object itself — null here is a crash, not an empty page.
    content: { stats: [], process: [], faq: [], testimonials: [] },
    // getPreset(company.profession) in tenant.js — the portfolio view reads
    // colours and copy straight off it, so a null here is a crash, not a blank.
    preset: { primary: '#1e3a8a', accent: '#f59e0b', hero: 'نبذة عن النشاط',
      about: DESC,
      // Four entries with {title, desc}: the view indexes services[3] directly.
      services: [1, 2, 3, 4, 5, 6].map((i) => ({
        title: 'الخدمة رقم ' + i,
        desc: 'شرح مختصر للخدمة دي وإيه اللي بتقدّمه للعميل وليه تختارها.',
      })) },
    topAd: null, sidebarAd: null, footerAd: null,
    portfolio: three, products: three, categories: [{ id: 1, name: 'قسم' }], banners: [],
    pharmacyItems: three, pharmacySettings: { delivery_fee: 10, min_order: 50, hours: '٩ص–١١م' },
    pharmacyStockCount: 3,
    foodOutlets: [{ id: 1, name: 'الفرع', items: three }], foodItemCount: 3,
    aiAssistantOn: false, foodUpsellOn: false,
    clinicDoctors: [{ id: 1, name: 'د. تجريبي', specialty: 'عام', photo_url: null, bio: 'نبذة.' }],
    clinicSettings: { specialty: 'general', about: DESC, address: 'أسيوط', phone: '0882000000',
      whatsapp: '201000000000', hours: 'السبت–الخميس ٤م–١٠م', booking_enabled: true,
      map_lat: null, map_lng: null },
    clinicSpecialtyLabel: 'عيادة عامة',
    nutritionSettings: { about: DESC, hours: '٤م–١٠م', phone: '0882000000', whatsapp: '201000000000', booking_enabled: true },
    furnitureSettings: { about: DESC, phone: '0882000000', whatsapp: '201000000000', showroom: 'أسيوط' },
    furnitureProducts: three,
    workshopSettings: { about: DESC, phone: '0882000000', whatsapp: '201000000000', address: 'أسيوط' },
    workshopStats: { cars: 12, orders: 30 },
    hallSettings: { about: DESC, phone: '0882000000', whatsapp: '201000000000', address: 'أسيوط', capacity: 300 },
    hallPackages: [{ id: 1, name: 'باقة', price_per_person: 250, description: 'تشمل البوفيه.' }],
    nurserySettings: { about: DESC, phone: '0882000000', whatsapp: '201000000000', address: 'أسيوط' },
    nurseryGroups: [{ id: 1, name: 'المجموعة الأولى', age_from: 2, age_to: 4, monthly_fee: 800 }],
    instSettings: { about: DESC, phone: '0882000000', whatsapp: '201000000000' },
    gymSettings: { about: DESC, phone: '0882000000', whatsapp: '201000000000', address: 'أسيوط' },
    gymPlans: [{ id: 1, name: 'شهري', price: 500, duration_days: 30, description: 'وصف.' }],
    gymTrainers: [{ id: 1, name: 'مدرّب', specialty: 'لياقة', photo_url: null }],
    gymClasses: [{ id: 1, name: 'حصة', day_of_week: 1, start_time: '18:00', trainer_name: 'مدرّب' }],
    gymGallery: [], gymBookedStatus: null, gymBookError: false,
    enquirySent: false,
    // The merchant's chosen payment methods, as their customer sees them.
    payment: { instructions: 'حوّل وابعتلنا صورة التحويل.', methods: [
      { key: 'cod', label: 'الدفع عند الاستلام' },
      { key: 'link', label: 'ادفع أونلاين', online: true, url: 'https://accept.paymob.com/l/demo' },
      { key: 'instapay', label: 'InstaPay', detail: 'demo@instapay' },
    ] },
    currentCategory: '', currentSearch: '',
    shopPriceRange: { min: 0, max: 1000 }, shopFilters: {},
    feat: {}, deals: {}, storeCurrencies: [], cartCount: 0,
    sent: false, contactError: null,

    // res.locals the layout reads.
    lang: 'ar', dir: 'rtl', LOC: 'ar-EG', t: (k) => k, money,
    siteOrigin: SITE, canonicalUrl: SITE + '/', assetVersion: '1',
    showAds: true,
    ads: { enabled: true, publisherId: 'ca-pub-3132188303904900', slots: { pageBottom: '6' } },
    canonicalCompanyUrl: (s) => `https://${s}.oscardevs.com`,
    siteLogo: null, siteManifest: null, siteAppName: 'النشاط التجريبي',
    modules: {}, session: {}, req: { query: {} }, pickContent,
    jsonLd: (o) => JSON.stringify(o)
      .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'),
  }, over || {}, { company });   // company last: the merged one, not the patch
}

// view ↔ page_type, exactly as tenant.js selects them.
const TENANTS = {
  portfolio:    { view: 'tenant_portfolio.ejs' },
  shop:         { view: 'tenant_shop.ejs' },
  pharmacy:     { view: 'tenant_pharmacy.ejs' },
  orders:       { view: 'tenant_orders.ejs' },
  clinic:       { view: 'tenant_clinic.ejs' },
  nutrition:    { view: 'tenant_nutrition.ejs' },
  furniture:    { view: 'tenant_furniture.ejs' },
  workshop:     { view: 'tenant_workshop.ejs' },
  hall:         { view: 'tenant_hall.ejs' },
  nursery:      { view: 'tenant_nursery.ejs' },
  installments: { view: 'tenant_installments.ejs' },
  gym:          { view: 'tenant_gym.ejs' },
};

const asked = process.argv.slice(2);
const names = asked.length ? asked.filter((n) => TENANTS[n]) : Object.keys(TENANTS);
if (asked.length && names.length !== asked.length) {
  console.log('نوع مش معروف: ' + asked.filter((n) => !TENANTS[n]).join(', '));
  process.exit(1);
}

// tenant.js: `if (!indexable) res.locals.showAds = false`, and pharmacy, clinic
// and nutrition are never monetised at all (medical pages, AdSense policy).
// Kept in step with tenant.js by check-tenant-ads below — pharmacy/clinic/
// nutrition for medical reasons, the other five because their templates cannot
// reach the word floor even when a customer fills everything in.
const NEVER_ADS = new Set(['pharmacy', 'clinic', 'nutrition',
  'orders', 'workshop', 'hall', 'nursery', 'installments']);

function render(type, state) {
  const rich = state === 'rich';
  const empty = { about: '', phone: '', whatsapp: '', address: '' };
  const over = rich ? {} : {
    // The gate's own inputs, emptied: no stock, no plans, no description.
    noindex: true, showAds: false,
    products: [], portfolio: [], pharmacyItems: [], furnitureProducts: [],
    foodOutlets: [], gymPlans: [], gymTrainers: [], gymClasses: [],
    hallPackages: [], nurseryGroups: [], clinicDoctors: [],
    pharmacyStockCount: 0, foodItemCount: 0,
    hallSettings: empty, nurserySettings: empty, workshopSettings: empty,
    gymSettings: empty, instSettings: empty, furnitureSettings: empty,
    nutritionSettings: empty, clinicSettings: Object.assign({}, empty, { specialty: 'general', booking_enabled: false }),
    company: { page_type: type, description: '' },
  };
  if (rich && NEVER_ADS.has(type)) over.showAds = false;
  const locals = base(Object.assign({ company: { page_type: type } }, over));
  if (!rich) locals.company.description = '';
  const file = path.join(VIEWS, TENANTS[type].view);
  return ejs.render(fs.readFileSync(file, 'utf8'), locals, { filename: file, root: VIEWS });
}

let failed = 0;
for (const type of names) {
  // ── Filled in: must satisfy every rule the main site does ──────────────
  let html;
  try { html = render(type, 'rich'); }
  catch (e) {
    failed++;
    console.log(`❌ ${type} — مارسمش: ${(process.env.SEO_VERBOSE ? e.stack : e.message).split('\n').slice(0, 4).join('\n      ')}`);
    continue;
  }
  // Three templates are genuinely short even when a customer fills everything
  // in: orders 116, furniture 121, nutrition 96 words. None of them carries an
  // ad unit, so this is not an AdSense violation — it is a content gap, and it
  // is recorded here with its number rather than hidden by lowering the bar for
  // everyone. Raise the template's content and lower these; do not raise them.
  const KNOWN_SHORT = { orders: 116, furniture: 121, nutrition: 96 };
  const r = audit(type, html, {});
  if (KNOWN_SHORT[type]) {
    r.problems = r.problems.filter((p) => !/محتوى قليل جداً/.test(p));
    if (r.words > KNOWN_SHORT[type]) {
      console.log(`   ℹ️  ${type} كبر من ${KNOWN_SHORT[type]} لـ${r.words} كلمة — نزّل الرقم في KNOWN_SHORT`);
    } else if (r.words < KNOWN_SHORT[type]) {
      r.problems.push(`المحتوى قلّ من ${KNOWN_SHORT[type]} لـ${r.words} كلمة — الصفحة بتترقّ مش بتكبر`);
    }
  }
  if (r.problems.length) {
    failed++;
    console.log(`❌ ${type} (مليان) — ${r.problems.length} مخالفة:`);
    r.problems.forEach((p) => console.log('   · ' + p));
  } else {
    console.log(`✅ ${type} (مليان: ${r.words} كلمة${r.hasAds ? '، عليها إعلانات' : ''})`);
  }

  // ── Empty: the whole point of the indexing gate ────────────────────────
  // A tenant who signed up and never filled anything in must not be indexed
  // and must not carry an ad unit. That is rule #5 in SEO_MISTAKES_LOG, and it
  // is what keeps a hundred empty subdomains from becoming doorway pages
  // against the AdSense account.
  let thin;
  try { thin = render(type, 'thin'); }
  catch (e) {
    failed++;
    console.log(`❌ ${type} (فاضي) — مارسمش: ${e.message.split('\n')[0]}`);
    continue;
  }
  const problems = [];
  if (!/<meta name="robots"[^>]*noindex/.test(thin)) problems.push('صفحة فاضية من غير noindex — دي doorway page');
  if (/adsbygoogle|pagead2\.googlesyndication/.test(thin)) problems.push('إعلانات على صفحة فاضية — مخالفة AdSense صريحة');
  if (problems.length) {
    failed++;
    console.log(`❌ ${type} (فاضي) — ${problems.length} مخالفة:`);
    problems.forEach((p) => console.log('   · ' + p));
  }
}

// The list above is a copy of a decision made in tenant.js. Copies drift, and
// this one drifting means ads quietly return to a page too thin to carry them.
{
  const routeSrc = fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8');
  const offInRoute = new Set();
  for (const m of routeSrc.matchAll(/page_type === '(\w+)'\)\s*res\.locals\.showAds = false/g)) offInRoute.add(m[1]);
  const listed = /\[([^\]]+)\]\.includes\(company\.page_type\)\)\s*\{\s*\n\s*res\.locals\.showAds = false/.exec(routeSrc);
  if (listed) for (const q of listed[1].match(/'(\w+)'/g) || []) offInRoute.add(q.replace(/'/g, ''));
  const drift = [...NEVER_ADS].filter((x) => !offInRoute.has(x))
    .concat([...offInRoute].filter((x) => !NEVER_ADS.has(x)));
  if (drift.length) {
    failed++;
    console.log(`❌ قايمة «بدون إعلانات» مختلفة بين tenant.js والفحص: ${drift.join(', ')}`);
  } else {
    console.log(`✅ قايمة «بدون إعلانات» متطابقة مع tenant.js (${offInRoute.size} قطاع)`);
  }
}

console.log(failed
  ? `\n${failed} قطاع فيه مخالفة — دي صفحات بيشوفها عملاء العملاء.`
  : `\nكل صفحات المستأجرين (${names.length} قطاع) مطابقة لشروط SEO و AdSense.`);
process.exit(failed ? 1 : 0);
