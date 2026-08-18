#!/usr/bin/env node
/**
 * One order, two payment pages.
 *
 * `GET /shop/:slug/pay/:orderId` called the gateway on **every visit**. A
 * refresh, the back button, or the tracking link a customer keeps in WhatsApp
 * each registered a fresh payment intent for the same basket — two live
 * payment pages, both payable. Which way that fails depends entirely on how
 * the gateway treats a repeated merchant_order_id: either the buyer is charged
 * twice, or the second visit errors and they can never pay at all. Neither is
 * something the buyer did.
 *
 * The report named the shop. The pharmacy and the restaurant had the same
 * route, through `initiateTenantPay` — which is the good news, because one
 * helper covers both.
 *
 * The rule this check enforces: **a payment intent is created once and reused
 * while it is live**, and when a genuinely new one is needed it carries its own
 * id at the gateway (`shop-12-2`), so replacing an expired intent cannot
 * collide with the one it replaces. The webhook therefore has to recognise
 * both spellings — a callback it drops is a paid order that stays unpaid.
 *
 *   node scripts/check-pay-intent.js
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
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── The intent is reused, in both places that create one ──────────────── */
const SITES = [
  ['المتجر', 'src/routes/shop.js', /router\.get\('\/:slug\/pay\/:orderId'[\s\S]*?\n\}\);/],
  ['الصيدلية والمطعم', 'src/routes/tenant.js', /async function initiateTenantPay[\s\S]*?\n\}/],
];
for (const [label, rel, re] of SITES) {
  const body = (read(rel).match(re) || [''])[0];
  check(label + ': بيقرا نيّة الدفع الحيّة قبل ما يعمل واحدة جديدة',
    /payment_url/.test(body) && /payment_intent_at/.test(body), body ? '' : 'مالقيتش الراوت');
  check(label + ': وبيرجّع العميل على نفس اللينك من غير نداء للبوابة',
    /res\.redirect\((?:o|order)?\.?[a-zA-Z_.]*payment_url\)/.test(body));
  check(label + ': وبيتأكد إن المبلغ ما اتغيّرش قبل ما يعيد استخدامها',
    /payment_intent_cents\s*\)?\s*===\s*amountCents|Number\(o\.payment_intent_cents\) === amountCents/.test(body));
  check(label + ': والمحاولة الجديدة ليها رقم خاص بيها عند البوابة',
    /attempt > 1/.test(body));
  // The reuse test must come BEFORE the gateway call, or it is decoration.
  const iReuse = body.indexOf('payment_url');
  const iCall = body.indexOf('createGatewayPayment');
  check(label + ': والفحص قبل النداء مش بعده', iReuse > -1 && iCall > -1 && iReuse < iCall,
    `reuse@${iReuse} call@${iCall}`);
}

/* ── The webhook still finds the order ─────────────────────────────────── */
{
  const shop = read('src/routes/shop.js');
  const tn = read('src/routes/tenant.js');
  const reShop = /\/\^shop-\(\\d\+\)\(\?:-\\d\+\)\?\$\//.test(shop);
  const reTn = /\/\^\(pharmacy\|food\)-\(\\d\+\)\(\?:-\\d\+\)\?\$\//.test(tn);
  check('ويب‌هوك المتجر بيعرف رقم المحاولة كمان', reShop);
  check('وويب‌هوك الصيدلية والمطعم كمان', reTn);
  // Run the two patterns rather than trusting that they were typed correctly:
  // a callback the webhook drops is a paid order that stays unpaid forever.
  const A = /^shop-(\d+)(?:-\d+)?$/, B = /^(pharmacy|food)-(\d+)(?:-\d+)?$/;
  check('والنمطين شغالين فعلاً على الشكلين',
    A.exec('shop-12')[1] === '12' && A.exec('shop-12-3')[1] === '12'
    && B.exec('food-7')[2] === '7' && B.exec('pharmacy-7-2')[2] === '7'
    && !A.test('shop-12-') && !A.test('shop-x'));
}

/* ── The columns exist ─────────────────────────────────────────────────── */
{
  const srv = read('server.js');
  const acc = read('src/accounting/schema.js');
  for (const col of ['payment_url', 'payment_intent_at', 'payment_intent_cents', 'payment_attempt']) {
    check('عمود ' + col + ' متعرّف للتلات جداول',
      new RegExp('orders ADD COLUMN IF NOT EXISTS ' + col).test(srv)
      && new RegExp('pharmacy_orders ADD COLUMN IF NOT EXISTS ' + col).test(acc)
      && new RegExp('food_orders ADD COLUMN IF NOT EXISTS ' + col).test(acc));
  }
}

console.log(fail
  ? `\n${fail} مشكلة — يعني زيارة تانية لصفحة الدفع ممكن تعمل صفحة دفع تانية لنفس الأوردر.`
  : '\nنيّة الدفع بتتعمل مرة وبتتعاد، والمحاولة الجديدة ليها رقمها.');
process.exit(fail ? 1 : 0);
