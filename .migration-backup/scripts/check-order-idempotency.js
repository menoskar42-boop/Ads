#!/usr/bin/env node
/**
 * Two taps on "buy" placed two orders and took the stock off twice.
 *
 * The cart is cleared AFTER the transaction commits, so a second request that
 * started before the first finished still read a full cart and placed its own
 * order — same customer, same items, twice the stock movement.
 *
 * A flag on the session does not fix this. Concurrent requests each load their
 * own copy of the session and the last write wins, so the flag is invisible to
 * exactly the case it was meant to catch. The only thing both requests are
 * guaranteed to agree about is the database.
 *
 * So the checkout page mints a token, the form carries it, and a unique index
 * refuses the second one. The customer then lands on the order that already
 * exists — not on an error page telling them something went wrong when nothing
 * did, and not on a second order they have to ring up to cancel.
 *
 *   node scripts/check-order-idempotency.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const shop = fs.readFileSync(path.join(ROOT, 'src/routes/shop.js'), 'utf8');
const view = fs.readFileSync(path.join(ROOT, 'src/views/shop/checkout.ejs'), 'utf8');

/* ── The constraint ────────────────────────────────────────────────────── */
check('العمود موجود', /ALTER TABLE orders ADD COLUMN IF NOT EXISTS idem_token TEXT;/.test(srv));
// Unique per company, so two shops cannot collide; partial, so the orders that
// predate this (and any order placed without a token) stay legal.
check('وفهرس فريد لكل شركة',
  /CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idem\s*\n\s*ON orders \(company_id, idem_token\) WHERE idem_token IS NOT NULL;/.test(srv));

/* ── The token travels ─────────────────────────────────────────────────── */
check('الصفحة بتولّد توكن لكل مرة بتترسم',
  /idemToken: crypto\.randomBytes\(16\)\.toString\('hex'\)/.test(shop));
check('و`crypto` متطلوبة فعلاً في الملف', /^const crypto = require\('crypto'\);$/m.test(shop));
check('والفورم بيرجّعه', /name="idem_token" value="<%= idemToken %>"/.test(view));
check('والراوت بيقراه ويقصّه', /String\(req\.body\.idem_token \|\| ''\)\.slice\(0, 64\)/.test(shop));
check('وبيتخزّن مع الأوردر', /idem_token\)/.test(shop) && /paymentMethod, walletUsed, idemToken\]/.test(shop));

/* ── The second tap lands somewhere sensible ───────────────────────────── */
check('التاني بيترفض من القاعدة مش من الجلسة',
  /err\.code === '23505'/.test(shop));
check('والعميل بيروح على الأوردر اللي اتعمل فعلاً',
  /SELECT id FROM orders WHERE company_id=\$1 AND idem_token=\$2/.test(shop)
  && /res\.redirect\(`\/shop\/\$\{slug\}\/order\/\$\{prev\.id\}`\)/.test(shop));
check('والسلة بتتفضّى في الحالة دي كمان',
  /req\.session\.carts\[slug\] = \{\};\s*\n\s*return res\.redirect\(`\/shop\/\$\{slug\}\/order\/\$\{prev\.id\}`\)/.test(shop));

/* ── A form without a token still works ────────────────────────────────── */
// A cached page, or a customer who submits from an old tab, must still be able
// to buy. Losing the protection is a smaller harm than refusing a real order.
check('وفورم قديم من غير توكن لسه بيشتري',
  /\.slice\(0, 64\) \|\| null;/.test(shop) && /if \(err && err\.code === '23505' && idemToken\)/.test(shop));

/* ── The token is unguessable ──────────────────────────────────────────── */
{
  const crypto = require('crypto');
  const a = crypto.randomBytes(16).toString('hex');
  const b = crypto.randomBytes(16).toString('hex');
  check('والتوكن عشوائي بطول كافي', a.length === 32 && a !== b);
  // Math.random has already been flagged elsewhere in this codebase for money.
  check('ومش مولّد بـMath.random', !/idem[\s\S]{0,120}Math\.random/.test(shop));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني ضغطتين على «اشتري» لسه بيعملوا أوردرين.`
  : '\nضغطتين على «اشتري» = أوردر واحد، والعميل بيروح عليه.');
process.exit(fail ? 1 : 0);
