#!/usr/bin/env node
/**
 * A store owner pays for an ad and asks which one made the sale. Until now the
 * honest answer was "nobody knows".
 *
 * Three pixels were installed — Meta, TikTok, GA4 — on ONE page (the
 * storefront), firing ONE event (PageView). Meta and TikTok both optimise
 * delivery on Purchase; neither had ever received one from this platform. And
 * the product page, the strongest retargeting signal a store has, carried no
 * pixel at all.
 *
 * What is asserted here:
 *   · every buying page loads the merchant's pixels;
 *   · the five events actually fire, on the right pages;
 *   · a merchant with no IDs loads no third-party script (and odvTrack still
 *     exists, so a caller never has to test for it);
 *   · the currency is the store's, not a hardcoded EGP — the marketing review
 *     found that exact bug in the product feed.
 *
 *   node scripts/check-tracking.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const V = path.join(ROOT, 'src/views');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const read = (p) => fs.readFileSync(path.join(V, p), 'utf8');

/* ── Every page a buyer passes through carries the pixels ──────────────── */
const BUYING = ['tenant_shop.ejs', 'shop/landing.ejs', 'shop/product.ejs',
  'shop/cart.ejs', 'shop/checkout.ejs', 'shop/success.ejs'];
const blind = BUYING.filter((f) => !/merchant_pixels/.test(read(f)));
check('every buying page loads the merchant pixels', blind.length === 0, blind.join(', '));

// One copy of the loader. Three copies of a pixel snippet is how one of them
// gets a fix and the others do not.
const copies = BUYING.filter((f) => /connect\.facebook\.net/.test(read(f)));
check('the pixel snippet lives in one partial only', copies.length === 0, copies.join(', '));

/* ── The events themselves ─────────────────────────────────────────────── */
const EVENTS = [
  ['shop/product.ejs', 'ViewContent', 'صفحة المنتج'],
  ['shop/product.ejs', 'AddToCart', 'إضافة للسلة'],
  ['shop/checkout.ejs', 'InitiateCheckout', 'بدء الدفع'],
  ['shop/success.ejs', 'Purchase', 'الشراء'],
];
for (const [file, ev, ar] of EVENTS) {
  check(`${ev} بيتبعت من ${ar}`, new RegExp(`odvTrack\\('${ev}'`).test(read(file)));
}
const partial = read('partials/merchant_pixels.ejs');
check('ضغطة واتساب بتتحسب كـContact', /wa\.me\//.test(partial) && /odvTrack\('Contact'/.test(partial));

// Purchase without a value is a conversion the platform cannot bid on.
check('Purchase بيحمل قيمة الطلب ورقمه',
  /odvTrack\('Purchase'[\s\S]{0,600}order\.total_amount/.test(read('shop/success.ejs'))
  && /orderId/.test(read('shop/success.ejs')));
// البند ٨٩: نفس الشراء بيتبعت من السيرفر كمان، فالرقم لازم يكون واحد — من
// غيره ميتا بتحسب الطلب مرتين والتاجر بيزوّد ميزانية على رقم مش حقيقي.
check('وبرقم حدث واحد مع نسخة السيرفر',
  /eventId: <%- jsonLd\('order-' \+ String\(order\.id\)\)/.test(read('shop/success.ejs'))
  && /eventID: evId/.test(read('partials/merchant_pixels.ejs')));
check('AddToCart بياخد الكمية اللي العميل اختارها',
  /quantity: n/.test(read('shop/product.ejs')));

/* ── Names each platform actually understands ──────────────────────────── */
check('GA4 بياخد أسماءه هو (view_item / purchase)',
  /view_item/.test(partial) && /'purchase'/.test(partial) && /begin_checkout/.test(partial));
check('تيك توك بياخد CompletePayment مش Purchase', /CompletePayment/.test(partial));

/* ── Currency ──────────────────────────────────────────────────────────── */
check('العملة من المتجر مش مكتوبة ثابتة',
  /company && company\.currency/.test(partial));

/* ── Render both ways ──────────────────────────────────────────────────── */
let ejs;
try { ejs = require('ejs'); }
catch (e) {
  console.log('⏭️  ejs مش منزّل — نص الفحص ده محتاج node_modules.');
  process.exit(fail ? 1 : 2);
}
{
  const f = path.join(V, 'partials/merchant_pixels.ejs');
  const src = fs.readFileSync(f, 'utf8');
  const draw = (company) => ejs.render(src, { company, jsonLd: (o) => JSON.stringify(o) },
    { filename: f, root: V });

  const off = draw({});
  /* بعد البند ٨٩ اللودرات بقت دوال بتتنده لما يبقى فيه رقم ومسموح (الموافقة)،
     فروابط المنصّات موجودة في نص السكربت حتى لو التاجر مادخّلش حاجة. الشرط
     الحقيقي مش «الرابط مش مكتوب» — الشرط إن **مفيش سكربت خارجي بيتحمّل**:
     مفيش وسم <script src> لأي منهم، وخريطة الأرقام فاضية، والتحميل مشروط
     بوجود الرقم. */
  check('تاجر مادخّلش أي ID مابيحمّلش أي سكربت خارجي',
    !/<script[^>]+src=["'][^"']*(fbevents\.js|analytics\.tiktok\.com|googletagmanager)/.test(off)
    && /IDS = \{ fb: "", tt: "", ga: "" \}/.test(off)
    && /if \(IDS\.fb\) loadFb/.test(off) && /if \(IDS\.tt\) loadTt/.test(off)
    && /if \(IDS\.ga\) loadGa/.test(off));
  check('ومع ذلك odvTrack موجودة فمفيش صفحة بتقع', /window\.odvTrack = function/.test(off));

  const on = draw({ fb_pixel_id: '123', tiktok_pixel_id: 'C1', ga4_id: 'G-X', currency: 'SAR' });
  check('التاجر اللي دخّل IDs بيتحمّلوا كلهم',
    /IDS = \{ fb: "123", tt: "C1", ga: "G-X" \}/.test(on)
    && /fbevents\.js/.test(on) && /analytics\.tiktok\.com/.test(on) && /googletagmanager/.test(on));
  // والموافقة: 'off' بتحمّل على طول، و'ask' مابتحمّلش غير بعد رد الزائر.
  check('والافتراضي بيحمّل من غير سؤال', /CONSENT !== 'ask'\) loadAll\(\)/.test(on));
  const ask = draw({ fb_pixel_id: '123', consent_mode: 'ask', slug: 'x' });
  check('و«اسأل الأول» مابتحمّلش قبل الموافقة',
    /var CONSENT = "ask"/.test(ask) && /stored\(\) === 'yes'\) loadAll\(\)/.test(ask));
  check('والرفض بيتخزّن زي الموافقة فمحدش بيتسأل كل صفحة',
    /localStorage\.setItem\(KEY, v\)/.test(ask));
  check('وعملة متجره هي اللي بتتبعت', /var CUR = "SAR"/.test(on));
}

/* ── The product feed ──────────────────────────────────────────────────── */
// Same bug, other end of the funnel: every store's feed said EGP. Google
// Merchant rejects a price whose currency does not match the account; Facebook
// Catalog imports it anyway, at the wrong number.
{
  const src = fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8');
  check('الـFeed مابيقولش EGP لكل متجر', !/g:price>\$\{[^}]*\} EGP</.test(src));
  check('وبياخد عملة المتجر بصيغة ISO', /\^\[A-Z\]\{3\}\$/.test(src) && /g:price>\$\{[^}]*\} \$\{cur\}</.test(src));
}

console.log(fail
  ? `\n${fail} مشكلة — من غيرها التاجر مش عارف أي إعلان جابله بيعة.`
  : '\nالتتبّع: الخمس أحداث بتتبعت للتلات منصّات، والعملة عملة المتجر.');
process.exit(fail ? 1 : 0);
