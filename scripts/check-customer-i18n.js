#!/usr/bin/env node
/**
 * The Arabic page that spoke English, and the Saudi shop that charged pounds.
 *
 * The customer's own account pages — orders, tracking, addresses, points,
 * wishlist, subscriptions — were written with the words baked into the HTML.
 * Two failures, in opposite directions, on the same pages:
 *
 *   · **English into an Arabic page.** «Invalid email or password.» came from
 *     the route as a finished English sentence, and the register page printed
 *     `err.message` — the database talking directly to a shopper.
 *   · **Arabic into an English page.** Every heading, button and placeholder
 *     was Arabic text in the template, so switching the language changed the
 *     chrome and nothing else. Numbers and dates were pinned to `ar-EG`.
 *
 * And underneath both, «ج» typed after the price. A shop that sells in riyals
 * showed its customers Egyptian pounds. The symbol is not decoration on a
 * price — it is half of what the price means.
 *
 * The check does not read the templates for banned words; it RENDERS every one
 * of them in both languages and fails if a translation key survives to the
 * page, if the render throws, or if the other language's text appears. Then it
 * holds the two rules that made the bug possible: no hard-coded currency, and
 * no locale pinned in a template.
 *
 *   node scripts/check-customer-i18n.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const { t, pickContent } = require('../src/i18n/strings');
const currency = require('../src/lib/currency');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The symbol after the number ───────────────────────────────────────── */
{
  check('عملة المتجر هي اللي بتظهر مش «ج» متصلّبة',
    currency.label({ currency: 'SAR' }, 'ar') === 'ر.س' && currency.label({ currency: 'AED' }, 'en') === 'AED');
  check('والمصري افتراضي لما مافيش إعداد', currency.label(null, 'ar') === 'ج.م');
  check('والحروف الصغيرة بتتقرا', currency.label({ currency: 'egp' }, 'ar') === 'ج.م');
  // Guessing a symbol for a code we do not know is worse than printing the code.
  check('وعملة مش معروفة بتتكتب بكودها مش بتخمين', currency.label({ currency: 'XYZ' }, 'ar') === 'XYZ');
  check('والصفحة الإنجليزية مابتطبعش حرف عربي', currency.label({ currency: 'EGP' }, 'en') === 'EGP');
  const mw = fs.readFileSync(path.join(ROOT, 'src/middleware/i18n.js'), 'utf8');
  check('و`cur()` متاحة لكل قالب', /res\.locals\.cur = \(source\) => currency\.label\(source, lang\)/.test(mw));
}

/* ── Render every customer page, in both languages ─────────────────────── */
{
  const order = {
    id: 7, status: 'preparing', total_amount: 250, company_name: 'X', slug: 'x',
    currency: 'SAR', shipping_cost: 20, discount_amount: 5, coupon_code: 'C',
    shipping_zone: 'Z', created_at: new Date(),
  };
  const CASES = {
    login: { error: 'credentials' },
    register: { error: 'email_in_use', form: {} },
    orders: { orders: [order] },
    order_track: { order, items: [{ product_name: 'P', quantity: 2, unit_price: 10 }], history: [], returnStatus: 'pending' },
    addresses: { addresses: [{ id: 1, label: null, is_default: true, recipient_name: 'R', phone: '1', governorate: 'G', city: 'C', street: 'S', apartment: null }] },
    points: { points: 250, wallet: 12.5, orders: [{ id: 1, points_earned: 5, points_redeemed: 0, created_at: new Date() }], giftSaved: true, giftError: 'gift_invalid' },
    wishlist: { items: [{ id: 1, name: 'N', name_ar: 'ن', price: 99, image_url: null, stock: 1, company_slug: 's', company_name: 'C', currency: 'EGP' }] },
    subscriptions: { subs: [{ id: 1, status: 'active', product_name: 'P', quantity: 1, company_name: 'C', interval_days: 30, unit_price: 9, next_renewal: new Date(), image_url: null, currency: 'AED' }], created: true },
  };

  const files = fs.readdirSync(path.join(ROOT, 'src/views/customer')).filter((f) => f.endsWith('.ejs'));
  check('كل صفحة في المجلد ليها حالة اختبار', files.every((f) => CASES[f.replace('.ejs', '')]),
    files.filter((f) => !CASES[f.replace('.ejs', '')]).join(' ') || files.length + ' صفحة');

  for (const lang of ['ar', 'en']) {
    const base = {
      lang, dir: lang === 'ar' ? 'rtl' : 'ltr', LOC: lang === 'en' ? 'en-GB' : 'ar-EG',
      t: (k) => t(k, lang),
      pickContent: (row, field, ci) => pickContent(row, field, lang, ci),
      cur: (x) => currency.label(x, lang),
      ads: { enabled: false, client: '', slots: {} }, showAds: false,
      jsonLd: (x) => JSON.stringify(x), safeUrl: (u) => u,
      session: { customerEmail: 'a@b.c' }, query: {},
    };
    const broken = [];
    const raw = [];
    const wrongTongue = [];
    for (const [name, data] of Object.entries(CASES)) {
      const file = path.join(ROOT, 'src/views/customer', name + '.ejs');
      let html;
      try {
        html = ejs.render(fs.readFileSync(file, 'utf8'), Object.assign({}, base, data), { filename: file });
      } catch (e) { broken.push(name + ': ' + e.message.split('\n')[0]); continue; }
      const keys = html.match(/\b(?:cst|status|customer|common)\.[a-z_.]+/g);
      if (keys) raw.push(name + ':' + keys[0]);
      // Text nodes only: class names and URLs are not what the customer reads.
      const text = html
        .replace(/<script[\s\S]*?<\/script>/g, ' ')
        .replace(/<style[\s\S]*?<\/style>/g, ' ')
        .replace(/<[^>]*>/g, ' ');
      if (lang === 'en' && /[؀-ۿ]/.test(text.replace(/Oscardevs/g, ''))) {
        wrongTongue.push(name + ': ' + (text.match(/[؀-ۿ][^<]{0,30}/) || [''])[0].trim());
      }
    }
    check(`كل صفحات العميل بتتعرض بالـ${lang}`, broken.length === 0, broken.join(' · ') || Object.keys(CASES).length + ' صفحة');
    check(`ومفيش مفتاح ترجمة طالع للشاشة (${lang})`, raw.length === 0, raw.join(' · ') || 'ولا واحد');
    if (lang === 'en') {
      check('والصفحة الإنجليزية مافيهاش نص عربي', wrongTongue.length === 0, wrongTongue.join(' · ') || 'ولا حرف');
    }
  }
}

/* ── The two habits that caused it ─────────────────────────────────────── */
{
  const dir = path.join(ROOT, 'src/views/customer');
  const hard = [];
  const pinned = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ejs'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/(\s|>)ج(\s|<)/.test(src)) hard.push(f);
    if (/toLocale\w*\('(ar|en)-/.test(src)) pinned.push(f);
  }
  check('مفيش «ج» متصلّبة في أي قالب', hard.length === 0, hard.join(' · ') || 'ولا واحد');
  check('ومفيش لغة أرقام متصلّبة (بتتبع `LOC`)', pinned.length === 0, pinned.join(' · ') || 'ولا واحد');
}

/* ── And the route sends a code, not a finished sentence ───────────────── */
{
  const src = fs.readFileSync(path.join(ROOT, 'src/routes/customer.js'), 'utf8');
  check('راوت العميل بيبعت كود مش جملة إنجليزية',
    !/error: '[A-Z]/.test(src), (src.match(/error: '[A-Z][^']*'/g) || []).join(' · '));
  check('ومفيش `err.message` رايح لصفحة عميل', !/error: '[^']*' \+ err\.message/.test(src));
  check('وكود كرت الهدية من قايمة معروفة',
    /\['gift_invalid', 'gift_used', 'gift_expired', 'gift_failed'\][\s\S]{0,80}includes\(req\.query\.gifterror\)/.test(src));
  check('ومفيش رسالة عربية جاهزة في الرابط', !/gifterror=' \+ encodeURIComponent/.test(src));
  check('والعملة بتتجاب من المتجر في الاستعلامات',
    (src.match(/c\.currency/g) || []).length >= 3);
}

console.log(fail
  ? `\n${fail} مشكلة — يعني عميل ممكن يقرا صفحة بلغة تانية أو سعر بعملة مش بتاعته.`
  : '\nصفحات العميل بتتكلم لغته، والسعر بعملة المتجر اللي باع.');
process.exit(fail ? 1 : 0);
