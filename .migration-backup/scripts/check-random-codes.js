#!/usr/bin/env node
/**
 * A gift card whose code you can predict is money you can take.
 *
 * Gift card codes were eight characters picked with `Math.random()`. That is
 * not a weak random number generator, it is not a random number generator at
 * all for this purpose: V8 seeds it from values an attacker can narrow down,
 * and its whole future output is recoverable from a handful of observed
 * outputs. A shop that issues a hundred cards has published a hundred samples.
 * Guessing the next code stops being brute force and becomes arithmetic.
 *
 * Referral codes (two free months) came from the same call.
 *
 * The rule: **anything that is worth money or must not be guessed is minted
 * from `crypto`** — and the sweep is over the whole `src/` tree, because the
 * next person to need a code will copy the nearest example.
 *
 *   node scripts/check-random-codes.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const codes = require('../src/lib/codes');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The generator, by running it ──────────────────────────────────────── */
{
  check('كود الهدية بيبدأ بـGIFT وطوله ثابت',
    /^GIFT[A-Z0-9]{10}$/.test(codes.giftCode()), codes.giftCode());
  check('وكود الإحالة ٦ حروف', /^[A-Z0-9]{6}$/.test(codes.referralCode()));

  /* Spoken over the phone. Only ONE of each confusable pair needs to go:
     O and 0 both dropped, I and 1 both dropped, S dropped and 5 kept — a 5
     alone is never misheard as an S, it is the pair that is the problem. */
  check('والأبجدية مافيهاش حروف بتتلخبط في التليفون',
    !/[OI01S]/.test(codes.ALPHABET), codes.ALPHABET);
  const sample = Array.from({ length: 400 }, () => codes.randomCode(12)).join('');
  check('ومفيش حرف ملخبط بيطلع في أي كود', !/[OI01S]/.test(sample));

  // Not a randomness test — a "did somebody wire it to a constant" test.
  const many = new Set(Array.from({ length: 5000 }, () => codes.randomCode(6)));
  check('و٥٠٠٠ كود بيطلعوا مختلفين', many.size === 5000, many.size + '/5000');

  // Rejection sampling: with `% 31` the first 8 letters come up ~3% more often.
  const counts = {};
  for (const ch of Array.from({ length: 20000 }, () => codes.randomCode(4)).join('')) {
    counts[ch] = (counts[ch] || 0) + 1;
  }
  const vals = Object.values(counts);
  const expected = 80000 / codes.ALPHABET.length;
  const worst = Math.max(...vals.map((v) => Math.abs(v - expected) / expected));
  check('والتوزيع متوازن (مفيش انحياز من %)', worst < 0.12, 'أقصى انحراف ' + (worst * 100).toFixed(1) + '%');
}

/* ── Nothing in src/ mints an identifier from Math.random ──────────────── */
{
  const nl = (m) => m.replace(/[^\n]/g, ' ');
  const hits = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name === 'node_modules') continue;
      const full = path.join(dir, f.name);
      if (f.isDirectory()) { walk(full); continue; }
      if (!f.name.endsWith('.js')) continue;
      const src = fs.readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, nl)
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
      for (const m of src.matchAll(/Math\.random\s*\(/g)) {
        hits.push(path.relative(ROOT, full) + ':' + src.slice(0, m.index).split('\n').length);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  check('مفيش `Math.random` في أي حتة في src/', hits.length === 0, hits.join(' · ') || 'ولا واحدة');
}

/* ── The two call sites use the shared generator ───────────────────────── */
{
  const co = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
  const ad = fs.readFileSync(path.join(ROOT, 'src/routes/admin.js'), 'utf8');
  check('كرت الهدية بيتولّد من المكتبة', /codes\.giftCode\(\)/.test(co));
  check('وكود الإحالة كمان', /codes\.referralCode\(\)/.test(ad));
  // Uniqueness and unpredictability are different problems; the retry solves
  // only the first and must not be dropped as "no longer needed".
  check('ولسه بيعيد المحاولة لو الكود متكرر',
    /for \(let attempt = 0; attempt < 12/.test(ad));
}

/* ── And no page prints the URL's own words back at the merchant ───────── */
{
  const nl = (m) => m.replace(/[^\n]/g, ' ');
  const co = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, nl)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
  check('مفيش `error: req.query.error` في لوحة التاجر', !/error: req\.query\.error/.test(co));
  check('ومفيش `err.message` بيترجع في رابط', !/encodeURIComponent\(err\.message\)/.test(co));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني كود بفلوس ممكن يتخمّن.`
  : '\nكل كود بفلوس مولّد من crypto، ومفيش نص من الرابط بيتطبع للتاجر.');
process.exit(fail ? 1 : 0);
