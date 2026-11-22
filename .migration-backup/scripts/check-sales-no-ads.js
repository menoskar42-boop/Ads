#!/usr/bin/env node
/**
 * صفحات البيع ونموذج التسجيل من غير إعلانات (قرار المالك ٢٠٢٦-١٠-٠٦ + سياسة AdSense).
 *
 *   · التسجيل/التأكيد/متابعة الطلب: **ممنوع** إعلانات — سياسة AdSense (صفحات تسجيل
 *     وشكر/تأكيد). docs/ADSENSE_POLICIES.md § «سياسات تنسيب الإعلانات».
 *   · صفحات البيع (القطاعات/الخدمات/الخليج/الأسنان/الورش): من غير إعلانات بقرار المالك —
 *     إعلان طرف تالت جنب «قدّم طلب» بيسحب الزائر لبرّه.
 *   · المحتوى (المدوّنة/الأسئلة/المساعدة/الخصوصية…) والرئيسية: الإعلانات فاضلة.
 *
 * بيشغّل الراوتر نفسه بطلبات وهمية ويقرا showAds وقت الـrender — مش regex.
 *   node scripts/check-sales-no-ads.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const ok = (m, c, x) => { console.log(`${c ? '✅' : '❌'} ${m}${x ? ' — ' + x : ''}`); if (!c) fail++; };

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://no-db.invalid/x';
const legal = require('../src/routes/legal');
const { SECTORS } = require('../src/lib/sector_landings');

function showAdsFor(router, url) {
  return new Promise((resolve) => {
    const req = { method: 'GET', url, originalUrl: url, path: url, headers: {}, query: {}, get: () => '', protocol: 'https', hostname: 'oscardevs.com' };
    const res = {
      locals: { showAds: false },
      render(view, opts) { resolve({ view, showAds: this.locals.showAds }); },
      send() { resolve(null); }, redirect() { resolve(null); }, status() { return this; },
      set() { return this; }, type() { return this; }, setHeader() {}, end() { resolve(null); },
    };
    router(req, res, () => resolve(null));
  });
}

(async () => {
  const sales = ['/dental', '/car-workshop-management-egypt', ...Object.keys(SECTORS).map((s) => '/' + s)];
  const bad = [];
  for (const u of sales) {
    const r = await showAdsFor(legal, u);
    if (!r || r.showAds !== false) bad.push(u + (r ? '' : ' (مارسمتش)'));
  }
  ok(`صفحات البيع من غير إعلانات (${sales.length} صفحة)`, bad.length === 0, bad.join(' ') || 'كلها');
  const content = ['/faq', '/help', '/privacy', '/about'];
  const off = [];
  for (const u of content) { const r = await showAdsFor(legal, u); if (!r || r.showAds !== true) off.push(u); }
  ok('صفحات المحتوى لسه عليها إعلانات', off.length === 0, off.join(' ') || content.join(' '));

  const src = fs.readFileSync(path.join(ROOT, 'src/routes/legal.js'), 'utf8');
  const renders = (src.match(/res\.render\('landing\//g) || []).length;
  const guarded = (src.match(/salesPage, \(req, res\) => \{\s+(?:const [^\n]+\n\s+)*res\.render\('landing\//g) || []).length;
  ok('كل res.render(\'landing/…\') وراه salesPage (صفحة بيع جديدة مش هتنسى)', renders > 0 && renders === guarded, `${guarded}/${renders}`);

  const apply = fs.readFileSync(path.join(ROOT, 'src/routes/apply.js'), 'utf8');
  ok('فورم التسجيل ومتابعة الطلب showAds = false', (apply.match(/res\.locals\.showAds = false;/g) || []).length >= 2);
  ok('صفحة «تم استلام طلبك» مابتفعّلش الإعلانات', !/showAds\s*[:=]\s*true/.test(apply));
  const index = fs.readFileSync(path.join(ROOT, 'src/routes/index.js'), 'utf8');
  ok('الرئيسية لسه فيها الكود (التحقق من الموقع فى AdSense)', /showAds: true/.test(index));

  if (fail) { console.log(`\n❌ ${fail} فحص فشل`); process.exit(1); }
  console.log('\n✅ صفحات البيع والتسجيل من غير إعلانات، والمحتوى زى ما هو');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
