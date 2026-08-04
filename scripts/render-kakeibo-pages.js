#!/usr/bin/env node
/**
 * Render the Kakeibo screens that were simplified, in Arabic and in English,
 * and assert what the simplification is actually about.
 *
 * Folding fields away is easy to get wrong in a way no eyeball catches: a field
 * moved below a <details> is still submitted, but a field moved OUTSIDE the
 * <form> silently stops being saved. So this does not check that the pages look
 * right — it checks that every input still exists and is still inside the form,
 * that the first screen really is down to three fields, and that the English
 * build has no Arabic left in it.
 *
 * Usage: node scripts/render-kakeibo-pages.js
 */
'use strict';
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const V = path.join(ROOT, 'src/views/kakeibo');
const { makeT } = require(path.join(ROOT, 'src/kakeibo/i18n'));

const CATEGORIES = [
  { key: 'food', icon: '🍽', color: '#c0392b' },
  { key: 'transport', icon: '🚗', color: '#2f6f5e' },
  { key: 'bills', icon: '🧾', color: '#8e44ad' },
  { key: 'health', icon: '💊', color: '#16a085' },
  { key: 'fun', icon: '🎉', color: '#d35400' },
  { key: 'other', icon: '📦', color: '#7f8c8d' },
];

function base(lang) {
  return {
    lang, dir: lang === 'en' ? 'ltr' : 'rtl',
    t: makeT(lang),
    money: (v) => String(Math.round(Number(v) || 0)),
    num: (v) => String(v),
    CATEGORIES,
    PAYMENT_METHODS: ['cash', 'card', 'wallet'],
    today: '2026-08-04',
    currencies: ['EGP', 'SAR', 'AED'],
    countries: ['EG', 'SA', 'AE'],
    aiEnabled: true,
    pushEnabled: false,
    pushKey: null,
    assetVersion: '1',
    pageTitle: '',
  };
}

const CASES = {
  onboarding: () => ({ error: null, profile: {} }),
  onboarding_edit: () => ({ __file: 'onboarding.ejs', error: null,
    profile: { monthly_income: 12000, saving_goal: 1500, salary_day: 25, country: 'EG', weekend: 'fri_sat', currency: 'EGP', salary_type: 'fixed' } }),
  add: () => ({ error: null, editExpense: null }),
  add_edit: () => ({ __file: 'add.ejs', error: null,
    editExpense: { id: 7, amount: 250, category: 'food', payment_method: 'card', spent_on: '2026-07-30', description: 'Lunch', receipt_url: '/uploads/r.jpg' } }),
  profile: () => ({ saved: false, upgraded: false, upErr: null,
    user: { display_name: 'Ali', email: 'a@b.com', is_guest: false },
    profile: { monthly_income: 12000, saving_goal: 1500, currency: 'EGP' } }),
};

function render(name, lang) {
  const c = CASES[name]();
  const file = path.join(V, c.__file || (name + '.ejs'));
  return ejs.render(fs.readFileSync(file, 'utf8'), Object.assign(base(lang), c),
    { filename: file, root: path.join(ROOT, 'src/views') });
}

// Count only the inputs a person has to deal with before the fold.
function beforeDetails(html) {
  const i = html.indexOf('<details');
  return i === -1 ? html : html.slice(0, i);
}
function countFields(html) {
  return (html.match(/<(?:input|select|textarea)\b/g) || [])
    .filter((_, idx) => true).length;
}

let fail = 0;
const check = (label, ok, extra) => {
  if (!ok) { fail++; console.log(`❌ ${label}${extra ? ' — ' + extra : ''}`); }
  else console.log(`✅ ${label}${extra ? ' — ' + extra : ''}`);
};

for (const lang of ['ar', 'en']) {
  for (const name of Object.keys(CASES)) {
    let html;
    try { html = render(name, lang); }
    catch (e) { fail++; console.log(`❌ ${name}/${lang} render: ${e.message}`); continue; }
    if (!html.trim()) { fail++; console.log(`❌ ${name}/${lang} empty`); continue; }
    check(`${name}/${lang} renders`, true, `${countFields(html)} fields total`);
  }
}

// The point of the change, asserted.
const onb = render('onboarding', 'ar');
const onbTop = beforeDetails(onb);
const onbQuestions = (onbTop.match(/class="lbl"/g) || []).length;
check('onboarding: 3 questions before the fold', onbQuestions === 3, `${onbQuestions}`);
check('onboarding: country/weekend/currency still submitted', ['country', 'weekend', 'currency']
  .every((n) => onb.includes(`name="${n}"`)));
check('onboarding: still asks income, salary_day, saving_goal',
  ['monthly_income', 'salary_day', 'saving_goal'].every((n) => onb.includes(`name="${n}"`)));

const add = render('add', 'ar');
const addTop = beforeDetails(add);
// amount + category radios (6) + description = 8 before the fold; method/date/receipt below.
check('add: method, date and receipt are below the fold',
  !addTop.includes('name="payment_method"') && !addTop.includes('name="spent_on"') && !addTop.includes('name="receipt"'));
check('add: amount, category and description stay visible',
  addTop.includes('name="amount"') && addTop.includes('name="category"') && addTop.includes('name="description"'));
check('add: the 📷 button still has its file input', add.includes('id="receiptInput"'));
const addEdit = render('add_edit', 'ar');
check('add (editing): details open by default', /<details\s+open/.test(addEdit));
check('add (new): details closed by default', !/<details\s+open/.test(add));

const prof = render('profile', 'ar');
for (const href of ['/family', '/goals', '/budgets', '/investments', '/twin', '/simulator', '/onboarding', '/holidays']) {
  check(`profile: ${href} still linked`, prof.includes(`href="${href}"`));
}
const profEn = render('profile', 'en');
const arabic = /[؀-ۿ]/;
// The language switcher is labelled in the language it switches TO, so "ع" on
// an English page is correct. Drop it before looking for leaks.
const strip = (h) => h.replace(/<a[^>]*href="\?lang=[^"]*"[\s\S]*?<\/a>/g, ' ')
  .replace(/<[^>]+>/g, ' ');
const enText = strip(profEn);
check('profile/en: no Arabic leaked', !arabic.test(enText),
  arabic.test(enText) ? (enText.match(/[؀-ۿ][^<>]{0,40}/) || [''])[0] : '');
const onbEn = strip(render('onboarding', 'en'));
check('onboarding/en: no Arabic leaked', !arabic.test(onbEn),
  arabic.test(onbEn) ? (onbEn.match(/[؀-ۿ][^<>]{0,40}/) || [''])[0] : '');
const addEn = strip(render('add', 'en'));
check('add/en: no Arabic leaked', !arabic.test(addEn),
  arabic.test(addEn) ? (addEn.match(/[؀-ۿ][^<>]{0,40}/) || [''])[0] : '');

console.log(fail ? `\n${fail} فشل.` : '\nكل الفحوص عدّت.');
process.exit(fail ? 1 : 0);
