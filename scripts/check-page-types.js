#!/usr/bin/env node
/**
 * Every page_type must be offered everywhere a page_type is chosen.
 *
 * Adding a vertical touches at least six places, and missing one of them fails
 * silently in the worst possible way: the home page sends a prospect to
 * /apply?type=workshop, the backend accepts the type, and the form has no
 * workshop option — so the visitor lands on a form that cannot express what
 * they came for, picks something else or leaves, and the lead is filed under
 * the wrong category. Nothing errors. Nothing is logged. The vertical simply
 * never sells.
 *
 * That is exactly what happened when the workshop shipped, and it was caught by
 * a reader rather than by anything in the repo. This is the check that would
 * have caught it.
 *
 * Usage: node scripts/check-page-types.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

// The whitelist in apply.js is the definition of what a customer may request.
const applySrc = read('src/routes/apply.js');
const m = /\[((?:\s*'[a-z_]+'\s*,?)+)\]\.includes\(req\.body\.business_type\)/.exec(applySrc)
  || /\[((?:\s*'[a-z_]+'\s*,?)+)\]\.includes\(req\.query\.type\)/.exec(applySrc);
if (!m) {
  console.log('❌ could not find the business_type whitelist in src/routes/apply.js');
  process.exit(1);
}
const TYPES = m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
console.log('page types: ' + TYPES.join(', ') + '\n');

// ── 1. The public application form must offer every one of them ─────────────
{
  const form = read('src/views/apply/form.ejs');
  const missing = TYPES.filter((t) => !new RegExp(`value="${t}"`).test(form));
  check('the apply form offers every type', missing.length === 0,
    'A visitor sent to /apply?type=X with no X option lands on a form that\n   '
    + 'cannot express what they came for. Missing: ' + missing.join(', '));
}

// ── 2. Both admin dropdowns ─────────────────────────────────────────────────
for (const f of ['src/views/admin/companies/add.ejs', 'src/views/admin/companies/edit.ejs']) {
  const src = read(f);
  const missing = TYPES.filter((t) => !new RegExp(`value="${t}"`).test(src));
  check(path.basename(path.dirname(f)) + '/' + path.basename(f) + ' offers every type',
    missing.length === 0,
    'The owner cannot create or convert a company of this type by hand.\n   '
    + 'Missing: ' + missing.join(', '));
}

// ── 3. The CRM must not file a new vertical under "portfolio" ───────────────
{
  // Every type except the portfolio default needs its own branch.
  const missing = TYPES.filter((t) => t !== 'portfolio'
    && !new RegExp(`business_type === '${t}'`).test(applySrc));
  check('the CRM categorises every type', missing.length === 0,
    'A lead for this vertical is filed as "بورتفوليو" and the follow-up goes\n   '
    + 'to the wrong list. Missing: ' + missing.join(', '));
}

// ── 4. Anything the home page links to must be a real type ──────────────────
{
  const home = read('src/views/home.ejs');
  const linked = [...home.matchAll(/\/apply\?type=([a-z_]+)/g)].map((x) => x[1]);
  const bogus = [...new Set(linked)].filter((t) => !TYPES.includes(t));
  check('every /apply?type= link on the home page is a real type', bogus.length === 0,
    'These would silently fall back to portfolio: ' + bogus.join(', '));
  // And the reverse: a system with a card but no link is a card nobody can act on.
  // Count cards inside the services section only. The trust cards further down
  // reuse the same styling classes, and counting those made the check fail on a
  // page that was actually complete — while still, correctly, catching the
  // missing hall card underneath.
  const svc = (home.match(/<section class="services"[\s\S]*?\n<\/section>/) || [''])[0];
  const cards = (svc.match(/class="service-name"/g) || []).length;
  check(`every service card has an /apply?type= link (${[...new Set(linked)].length}/${cards})`,
    cards > 0 && [...new Set(linked)].length >= cards,
    'A card a visitor can read but not act on. Types linked: ' + [...new Set(linked)].join(', '));
}

// ── 5. A type the tenant router cannot render is a 500 waiting to happen ────
{
  const tenant = read('src/routes/tenant.js');
  // 'shop' and 'portfolio' are the two ends of the chain and are handled by
  // name and by the final else respectively.
  const missing = TYPES.filter((t) => t !== 'portfolio'
    && !new RegExp(`page_type === '${t}'`).test(tenant));
  check('tenant.js selects a view for every type', missing.length === 0,
    'Without a branch the page falls through to the portfolio template and\n   '
    + 'shows none of what it claims. Missing: ' + missing.join(', '));
}

// ── 6. The sitemap gate must know every type ────────────────────────────────
{
  const legal = read('src/routes/legal.js');
  const missing = TYPES.filter((t) => !['portfolio', 'shop'].includes(t)
    && !new RegExp(`page_type === '${t}'`).test(legal));
  check('the sitemap gate covers every type', missing.length === 0,
    'An uncovered type falls into the portfolio rule, so the sitemap can list\n   '
    + 'pages that render noindex. Missing: ' + missing.join(', '));
}

// ── 7. The super-admin must be able to create every type ───────────────────
// A type missing from the admin whitelist silently becomes 'portfolio': the
// nursery you just created renders as a portfolio page, with no error and no
// log line. nursery and installments were both missing this way.
{
  const admin = read('src/routes/admin.js');
  const m2 = /const PAGE_TYPES = \[([^\]]+)\]/.exec(admin);
  if (!m2) {
    check('admin.js exposes a PAGE_TYPES list', false,
      'Expected a single const PAGE_TYPES array in src/routes/admin.js.');
  } else {
    const adminTypes = m2[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
    const missing = TYPES.filter((t) => !adminTypes.includes(t));
    check('the super-admin can create every type', missing.length === 0,
      'A type the admin form rejects falls back to portfolio with no error, so\n   '
      + 'the tenant renders the wrong template. Missing: ' + missing.join(', '));
  }
}

console.log(failed ? `\n⚠️  ${failed} مشكلة — نوع نشاط ناقص في مكان ما.`
  : '\nكل أنواع النشاط مكتملة في كل الأماكن.');
process.exit(failed ? 1 : 0);
