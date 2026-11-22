#!/usr/bin/env node
/**
 * `JSON.stringify` does not escape `</script>`.
 *
 * A product page printed its reviews into a JSON-LD block with
 * `<%- JSON.stringify(...) %>` — the customer's name, the review title and the
 * review body, raw. `JSON.stringify` escapes quotes and backslashes and
 * nothing else, so a review reading
 *
 *     </script><script>…
 *
 * closes the tag and runs. And reviews were accepted automatically, with the
 * "verified purchase" test passing on ANY order including cancelled ones — so
 * anybody could put running code on a shop's product page, for every visitor.
 *
 * The same shape sat in the company JSON-LD on every tenant page, where the
 * strings are the merchant's own business name and description.
 *
 * The project already had the fix — `res.locals.jsonLd` in server.js, with a
 * comment explaining this exact attack — and it simply was not used in these
 * places. So this check is not "are those two files fixed": it is **no template
 * may put JSON.stringify inside a script tag, ever**. A rule with one careful
 * exception is a rule nobody applies.
 *
 *   node scripts/check-inline-json.js
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

/* ── The escaper actually escapes ──────────────────────────────────────── */
{
  /* The REAL function, not a copy of it. This check used to rebuild the escaper
     by hand from server.js — which would have kept passing if the shipped one
     changed. It lives in src/lib/safe_json.js precisely so it can be required. */
  const { safeJson: jsonLd } = require('../src/lib/safe_json');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  check('الدالة الآمنة متوصّلة للقوالب', /res\.locals\.jsonLd = safeJson/.test(srv));
  check('وبتهرب < و > و&',
    jsonLd('<').includes('u003c') && jsonLd('>').includes('u003e')
    && jsonLd('&').includes('u0026') && !jsonLd('<>&').includes('<'));
  // U+2028/U+2029 are valid in JSON strings and are line terminators to a JS
  // parser — they break the script without any angle bracket at all.
  check('وبتهرب فواصل السطور U+2028 و U+2029',
    jsonLd('\u2028').includes('u2028') && jsonLd('\u2029').includes('u2029'));

  const attack = '</script><script>alert(1)</script>';
  check('والهجمة الحقيقية مابتخرجش من التاج',
    !jsonLd({ body: attack }).includes('</script>'),
    jsonLd({ body: attack }).slice(0, 40));
  // Proof the plain one is genuinely unsafe — the reason this file exists.
  check('و`JSON.stringify` الخام بيخرج منه فعلاً (ده الباج)',
    JSON.stringify({ body: attack }).includes('</script>'));
  // Still valid JSON afterwards, or the escaping would break every page.
  check('والناتج لسه JSON صالح',
    JSON.parse(jsonLd({ body: attack })).body === attack);
}

/* ── No template may do it, anywhere ───────────────────────────────────── */
{
  const VIEWS = path.join(ROOT, 'src/views');
  const bad = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) { walk(full); continue; }
      if (!f.name.endsWith('.ejs')) continue;
      const src = fs.readFileSync(full, 'utf8');
      for (const m of src.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)) {
        const n = (m[0].match(/<%-\s*JSON\.stringify/g) || []).length;
        if (n) bad.push(path.relative(ROOT, full) + ' ×' + n);
      }
    }
  };
  walk(VIEWS);
  check('مفيش قالب بيحطّ JSON.stringify جوّه <script>', bad.length === 0,
    bad.join(' | ') || 'ولا واحد');

  // And the safe one is actually in use — otherwise "no matches" would also be
  // true of a codebase that stopped embedding JSON at all.
  let uses = 0;
  const count = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) { count(full); continue; }
      if (f.name.endsWith('.ejs')) uses += (fs.readFileSync(full, 'utf8').match(/<%-\s*jsonLd\(/g) || []).length;
    }
  };
  count(VIEWS);
  check('والدالة الآمنة مستخدمة فعلاً', uses > 50, uses + ' موضع');
}

/* ── The amplifier: who can put text on a product page ─────────────────── */
{
  const shop = fs.readFileSync(path.join(ROOT, 'src/routes/shop.js'), 'utf8');
  const lib = fs.readFileSync(path.join(ROOT, 'src/lib/reviews.js'), 'utf8');
  // Escaping kills the XSS on its own. This is the other half of the report:
  // a review from an order that was never delivered is not a verified purchase,
  // and a review nobody read before publishing is a spam channel.
  check('«اشترى فعلاً» مابيعدّيش على أوردر ملغي',
    /status/.test(lib) && !/hasPurchased[\s\S]{0,400}FROM orders[^)]*\)\s*$/.test(lib));
  /* The two flags are adjacent in the tuple, so a loose "…VALUES…true" test
     matches is_verified and says nothing about is_approved. Read the pair. */
  const ins = (shop.match(/INSERT INTO product_reviews[\s\S]*?VALUES \([^)]*\)/) || [''])[0];
  check('والمراجعة مابتتنشرش تلقائياً من غير قرار',
    /is_verified, is_approved\)/.test(ins) && /,true,false\)/.test(ins),
    (ins.match(/,[a-z]+,[a-z]+\)/) || ['?'])[0]);
}

console.log(fail
  ? `\n${fail} مشكلة — يعني عميل يقدر يشغّل كود عند كل زائر للمتجر.`
  : '\nمفيش JSON خام جوّه أي <script> — والدالة الآمنة هي المستخدمة.');
process.exit(fail ? 1 : 0);
