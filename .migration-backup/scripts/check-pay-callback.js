#!/usr/bin/env node
/**
 * A one-pound payment settling a two-thousand-pound order.
 *
 * The Paymob webhook verified the HMAC and then did `if (obj.success)` — mark
 * the order paid. The signature check is real: it proves Paymob sent the
 * message. It proves nothing about **what was paid for**. Any successful
 * transaction on that merchant's account whose `merchant_order_id` parsed to
 * one of our order ids would settle that order, for any amount, and the
 * signature on it would be perfect because Paymob genuinely signed it.
 *
 * And `success: true` is not the same as "the money is ours":
 *
 *   pending                     — still waiting on the customer;
 *   is_auth without is_capture  — held on the card, not taken;
 *   is_voided / is_refunded     — taken and given back;
 *   error_occured.
 *
 * All four arrive with `success` set on the transaction object.
 *
 * The decision lives in one function, `paymob.paymentAccepted`, and this check
 * RUNS it — a webhook is the one place in the codebase nobody can test by
 * clicking, so a check that only greps for the call is not worth writing.
 *
 *   node scripts/check-pay-callback.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const paymob = require('../src/lib/gateways/paymob');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── The decision, by running it ───────────────────────────────────────── */
const good = { success: true, amount_cents: 200000, currency: 'EGP' };
const WANT = 200000;   // a 2,000 EGP order

check('الدفعة الكاملة بتعدّي', paymob.paymentAccepted(good, WANT, 'EGP').ok);
check('ودفعة جنيه على أوردر ٢٠٠٠ بترفض',
  !paymob.paymentAccepted({ ...good, amount_cents: 100 }, WANT, 'EGP').ok,
  paymob.paymentAccepted({ ...good, amount_cents: 100 }, WANT, 'EGP').why);
check('والزيادة بتعدّي (الفرق مشكلة استرداد مش سبب لتعليق الأوردر)',
  paymob.paymentAccepted({ ...good, amount_cents: 250000 }, WANT, 'EGP').ok);
check('وعملة مختلفة بترفض',
  !paymob.paymentAccepted({ ...good, currency: 'USD' }, WANT, 'EGP').ok);

for (const [field, label] of [['pending', 'معلّقة'], ['error_occured', 'فيها خطأ'],
                              ['is_voided', 'ملغية'], ['is_refunded', 'مستردّة']]) {
  check(`و«success» مع ${label} بترفض`,
    !paymob.paymentAccepted({ ...good, [field]: true }, WANT, 'EGP').ok);
}
check('وحجز على الكارت من غير تحصيل بيرفض',
  !paymob.paymentAccepted({ ...good, is_auth: true }, WANT, 'EGP').ok);
check('وبعد التحصيل بيعدّي',
  paymob.paymentAccepted({ ...good, is_auth: true, is_capture: true }, WANT, 'EGP').ok);
check('و«true» كنص من JSON بتتقرا صح',
  paymob.paymentAccepted({ success: 'true', amount_cents: 200000, currency: 'EGP' }, WANT, 'EGP').ok
  && !paymob.paymentAccepted({ success: 'true', pending: 'true', amount_cents: 200000 }, WANT, 'EGP').ok);
check('ومن غير مبلغ متوقّع بترفض (مش بتفترض)',
  !paymob.paymentAccepted(good, 0, 'EGP').ok && !paymob.paymentAccepted(good, NaN, 'EGP').ok);
check('و`obj` فاضي بيرفض', !paymob.paymentAccepted(null, WANT, 'EGP').ok);

/* ── Both webhooks use it, and neither still trusts success alone ──────── */
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

for (const [label, rel, re] of [
  ['المتجر', 'src/routes/shop.js', /router\.post\('\/pay\/paymob\/callback'[\s\S]*?\n\}\);/],
  ['الصيدلية والمطعم', 'src/routes/tenant.js', /router\.post\('\/order\/pay\/paymob\/callback'[\s\S]*?\n\}\);/],
]) {
  const body = (code(rel).match(re) || [''])[0];
  check(label + ': الويب‌هوك بيسأل الدالة', /paymob\.paymentAccepted\(/.test(body), body ? '' : 'مالقيتش الراوت');
  check(label + ': ومفيش `if (obj.success)` لوحده لسه بيعلّم مدفوع',
    !/if \(obj\.success === true \|\| obj\.success === 'true'\)/.test(body));
  check(label + ': وبيجيب المبلغ المتوقّع من الأوردر',
    /payment_intent_cents/.test(body));
  check(label + ': والتوقيع لسه بيتفحص قبل كل ده',
    /verifyCallbackHmac/.test(body));
  check(label + ': والرفض بيتسجّل مش بيعدّي في صمت', /verdict\.why/.test(body));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني ممكن أوردر يتعلّم «مدفوع» بمبلغ مش بتاعه.`
  : '\nالتوقيع بيثبت مين بعت، والمبلغ بيثبت إنه دفع الأوردر ده.');
process.exit(fail ? 1 : 0);
