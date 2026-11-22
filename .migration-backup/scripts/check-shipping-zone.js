#!/usr/bin/env node
/**
 * Free delivery to anywhere, by leaving a field out.
 *
 * Checkout priced shipping as `if (govr) { const zone = …; if (zone) … }`.
 * Both misses fall through to zero:
 *
 *   · no `shipping_zone` in the POST  → free,
 *   · a governorate the merchant does not deliver to → free.
 *
 * The form marks the field `required`, but `required` is an attribute in the
 * buyer's browser — the server never re-asked. Nothing errored; the shop just
 * saw a smaller number on an order it then had to deliver.
 *
 * Zero IS right for a merchant with no zones configured — that is a shop that
 * does not charge for delivery. The whole bug is that "no zones" and "zone not
 * found" took the same branch, so the check insists they are separate.
 *
 * It also covers the thing found while fixing it: the cart and checkout pages
 * printed `req.query.error` straight onto the page, so a link could put any
 * sentence in front of a buyer under the shop's own name.
 *
 *   node scripts/check-shipping-zone.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const shipping = require('../src/lib/shipping');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/* The comment explaining this bug quotes the buggy line verbatim. Scan code. */
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── The pricing rule itself ───────────────────────────────────────────── */
{
  check('الشحن المجاني فوق الحدّ لسه شغّال',
    shipping.costFor({ cost: 50, free_over: 500 }, 500) === 0
    && shipping.costFor({ cost: 50, free_over: 500 }, 499) === 50);
  check('ومنطقة من غير حدّ مجاني بتاخد سعرها دايماً',
    shipping.costFor({ cost: 50, free_over: null }, 99999) === 50);
}

/* ── The route separates "no zones" from "zone not found" ──────────────── */
{
  const src = read('src/routes/shop.js');
  const body = (src.match(/router\.post\('\/:slug\/checkout'[\s\S]*?\n\}\);/) || [''])[0];
  check('الشيك‌آوت بيجيب مناطق التاجر الأول', /const zones = await shipping\.getZones\(company\.id\)/.test(body));
  check('ولو عنده مناطق ومحافظة الطلب مش منهم → الأوردر بيترفض',
    /if \(zones\.length\)[\s\S]{0,320}if \(!zone\)[\s\S]{0,160}ROLLBACK/.test(body));
  check('والرفض بيرجّع العميل برسالة، مش بيعدّي بصفر',
    /errorCode=shipping_zone/.test(body));
  // The old shape is the failure. As long as `if (govr)` alone decides the
  // price, a POST without the field is free delivery again.
  check('ومفيش `if (govr)` لوحده بيقرّر السعر',
    !/let shipCost = 0[\s\S]{0,80}\n\s*if \(govr\) \{/.test(body));
}

/* ── No page prints the URL's own text back at the buyer ───────────────── */
{
  const src = code('src/routes/shop.js');
  check('مفيش صفحة بتطبع `req.query.error` كما هي', !/error: req\.query\.error/.test(src));
  for (const v of ['cart', 'checkout']) {
    const view = read(`src/views/shop/${v}.ejs`);
    check(`صفحة ${v} بتعرض رسالة من القاموس`, /t\('(cart|checkout)\.err\.' \+ errorCode\)/.test(view));
  }
  const i18n = read('src/i18n/strings.js');
  for (const k of ['checkout.err.unavailable', 'checkout.err.shipping_zone', 'cart.err.stock']) {
    check('ومفتاح ' + k + ' موجود باللغتين',
      (i18n.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length === 2);
  }
}

console.log(fail
  ? `\n${fail} مشكلة — يعني ممكن حد يشتري بشحن مجاني لأي محافظة.`
  : '\nالشحن بيتسعّر من مناطق التاجر، والمحافظة المجهولة بترفض مش بتعدّي ببلاش.');
process.exit(fail ? 1 : 0);
