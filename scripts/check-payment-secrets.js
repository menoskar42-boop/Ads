#!/usr/bin/env node
/**
 * A merchant's gateway credentials must never be readable — not in the
 * database, and not in the page they configure them on.
 *
 * They were both. `gateway_secret` and `gateway_hmac` were plaintext columns,
 * AND the settings form printed them into value="" — so a live Paymob API key
 * sat in the database, in the page source, in the browser's cache and in any
 * screen-share of that tab. That key can take payments in the merchant's name;
 * the HMAC can forge the callback that marks their orders paid.
 *
 * The e-invoice credentials in the same codebase were already encrypted, which
 * is what makes this worth a permanent check rather than a one-off fix: the
 * pattern existed and payments simply had not adopted it.
 *
 * Asserted here:
 *   · the vault round-trips, and its output does not contain the plaintext;
 *   · a missing key REFUSES rather than falling back to plaintext;
 *   · a credential that cannot be decrypted degrades to null, not a 500 on
 *     every order;
 *   · no template prints a secret column;
 *   · every read of the plaintext columns goes through the fallback helper,
 *     so re-adding a direct read fails here.
 *
 * No database and no dependencies.
 *
 *   node scripts/check-payment-secrets.js
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

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'check-only-key';
const V = require(path.join(ROOT, 'src/lib/pay_vault'));

/* ── The cipher ────────────────────────────────────────────────────────── */
const PLAIN = 'paymob_sk_live_9f3a2b7c';
const blob = V.encrypt(PLAIN);
check('a credential survives a round trip', V.decrypt(blob) === PLAIN);
check('the stored blob does not contain the credential', !blob.includes('9f3a2b7c'));
check('two encryptions of the same value differ (random IV)', V.encrypt(PLAIN) !== blob);
check('the hint identifies without revealing',
  V.hint(PLAIN).includes('••••') && !V.hint(PLAIN).includes('9f3a2b7c'), V.hint(PLAIN));
check('a short credential is masked completely', V.hint('abc123') === '••••••••');

// Its own salt: the e-invoice store must not be able to read payment secrets
// even when both run under the same SESSION_SECRET.
{
  const E = require(path.join(ROOT, 'src/einvoice/vault'));
  let leaked = false;
  try { leaked = E.decrypt(blob) === PLAIN; } catch (e) { leaked = false; }
  check('the e-invoice vault cannot decrypt a payment credential', !leaked);
}

/* ── The failure modes ─────────────────────────────────────────────────── */
check('a malformed stored value reads as null, not an exception',
  V.read('not:a:blob', null) === null);
check('a row still holding plaintext is still readable', V.read(null, 'legacy_key') === 'legacy_key');
check('the encrypted column wins over the plaintext one', V.read(blob, 'legacy_key') === PLAIN);

/* ── The call sites ────────────────────────────────────────────────────── */
{
  const view = fs.readFileSync(path.join(ROOT, 'src/views/accounting/payments.ejs'), 'utf8');
  // value="<%= pay.gateway_secret %>" is the exact shape that leaked.
  const printed = /value="<%=?[^"]*gateway_(secret|hmac)\b/.test(view);
  check('the settings form never prints a secret into value=""', !printed);
  check('it says a credential is stored without showing it',
    /gateway_secret_set/.test(view) && /gateway_hmac_set/.test(view));
  check('there is an explicit way to erase one',
    /gateway_secret_clear/.test(view) && /gateway_hmac_clear/.test(view));
}
{
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/accounting.js'), 'utf8');
  check('saving refuses when no encryption key is configured', /payVault\.configured\(\)/.test(route));
  check('the plaintext columns are nulled on save', /gateway_secret=NULL, gateway_hmac=NULL/.test(route));
  check('the view is not handed the secrets',
    /delete shown\.gateway_secret/.test(route) && /delete shown\.gateway_hmac/.test(route));
}
{
  // Any consumer must go through read(); a bare column read is the bug back.
  const files = ['src/lib/gateways/index.js', 'src/routes/shop.js', 'src/routes/tenant.js'];
  const bare = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const line of src.split('\n')) {
      if (!/\.gateway_(secret|hmac)\b/.test(line)) continue;
      if (/payVault\.read|_enc/.test(line)) continue;
      bare.push(`${f}: ${line.trim().slice(0, 60)}`);
    }
  }
  check('every consumer decrypts instead of reading the column', bare.length === 0, bare.join(' | '));
}

/* ── Opt-in, never imposed ─────────────────────────────────────────────── */
// Owner's rule (CLAUDE.md, 2026-08-11): a merchant adds an e-invoice or a
// payment gateway if they want one, the same as any other part of their page.
// Both are therefore OFF until switched on, and this fails if a default ever
// flips — "on unless you turn it off" would put a merchant's tax identity or
// card processing live without them asking.
{
  const einv = fs.readFileSync(path.join(ROOT, 'src/einvoice/schema.js'), 'utf8');
  check('the e-invoice is off until a merchant enables it',
    /enabled\s+BOOLEAN NOT NULL DEFAULT false/.test(einv));
  const acct = fs.readFileSync(path.join(ROOT, 'src/accounting/schema.js'), 'utf8');
  check('no payment gateway until a merchant configures one',
    /gateway TEXT DEFAULT 'none'/.test(acct));
  // And the manual methods are individually nullable rather than required, so a
  // merchant can offer cash only and nothing else.
  check('the manual methods are optional too',
    /instapay_handle TEXT,/.test(acct) && /wallet_number TEXT,/.test(acct)
    && !/instapay_handle TEXT NOT NULL/.test(acct));
}

console.log(fail ? `\n${fail} فشل — دي مفاتيح بتحرّك فلوس عملائك.` : '\nمفاتيح الدفع مشفّرة ومش بتتعرض.');
process.exit(fail ? 1 : 0);
