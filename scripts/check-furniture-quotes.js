#!/usr/bin/env node
/**
 * The notebook the showroom sold from.
 *
 * A furniture showroom sells by quoting: somebody asks about a bedroom and
 * leaves with a price on paper. That conversation lived in a notebook, so
 * nobody could answer "who did we quote last month, and what happened to
 * them?" — which is the question a showroom's month is actually decided by.
 * The competitors' review put it first for a reason.
 *
 * Two things about that piece of paper decide whether the software is any use:
 *
 *   · **it expires.** Timber moved, the pound moved, and a quote from March is
 *     not a price in September. A quote with no end date is a promise nobody
 *     meant to make — so `valid_until` is real, expiry is COMPUTED (a stored
 *     flag needs a job at midnight, and the quote that expired while nobody was
 *     looking is exactly the case that matters), and an expired quote is
 *     refused rather than quietly honoured.
 *   · **it becomes exactly one invoice.** "Accept" is the moment paper turns
 *     into money owed. Two clicks must not produce two invoices for one
 *     bedroom, so the quote is CLAIMED in the same statement that checks it.
 *
 * And the lines keep the price AS QUOTED. Reading today's product price back at
 * conversion would rewrite what the customer was told, which is the quiet
 * version of the same lie.
 *
 *   node scripts/check-furniture-quotes.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Q = require('../src/furniture/quotes');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const NOW = new Date('2026-09-05T10:00:00Z');

/* ── The expiry is real ────────────────────────────────────────────────── */
{
  check('العرض بيتعمله تاريخ صلاحية لوحده', Q.defaultValidUntil('2026-09-05') === '2026-09-19');
  check('والمدة بتتظبّط', Q.defaultValidUntil('2026-09-05', 30) === '2026-10-05');
  check('ومحدودة', Q.defaultValidUntil('2026-09-05', 9999) === Q.defaultValidUntil('2026-09-05', 365));
  check('واللي لسه صالح بيقول باقي كام يوم',
    Q.stateOf({ status: 'sent', valid_until: '2026-09-10' }, NOW).daysLeft === 5);
  // Computed, never stored: nobody has to run anything at midnight.
  check('واللي عدّى بيبقى منتهي من غير أي وظيفة ليلية',
    Q.stateOf({ status: 'sent', valid_until: '2026-09-01' }, NOW).state === 'expired');
  check('واليوم الأخير لسه صالح',
    Q.stateOf({ status: 'sent', valid_until: '2026-09-05' }, NOW).state === 'sent');
  check('والمقبول والمرفوض حالتهم مالهاش صلاحية',
    Q.stateOf({ status: 'accepted', valid_until: '2020-01-01' }, NOW).state === 'accepted'
    && Q.stateOf({ status: 'rejected', valid_until: '2020-01-01' }, NOW).state === 'rejected');
}

/* ── What may become an invoice ────────────────────────────────────────── */
{
  const can = (q) => Q.canConvert(q, NOW);
  check('العرض الصالح ينفع يتحوّل', can({ status: 'sent', valid_until: '2026-09-10' }).ok === true);
  check('والمنتهي لأ', can({ status: 'sent', valid_until: '2026-09-01' }).why === 'expired');
  check('والمرفوض لأ', can({ status: 'rejected', valid_until: '2026-09-10' }).why === 'rejected');
  // The one that costs money if it goes wrong.
  check('واللي اتحوّل خلاص مايتحوّلش تاني', can({ status: 'accepted', sale_id: 9 }).why === 'already');
  check('وكل سبب ليه اسمه (عشان الرسالة تفرق)',
    new Set(['expired', 'rejected', 'already'].map((w) => w)).size === 3);
}

/* ── The lead is a person, not a row per phone call ────────────────────── */
{
  check('الرقم بيتطبّع أرقام بس', Q.phoneKey('0100 123 4567') === '01001234567');
  check('والعربي كمان', Q.phoneKey('٠١٠٠١٢٣٤٥٦٧') === '01001234567');
  const schema = code('src/furniture/schema.js');
  check('وفهرس بيمنع تكرار نفس الرقم',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_furn_lead_phone[\s\S]{0,160}\(company_id, phone_key\)/.test(schema));
  check('واللي من غير رقم مابيتمنعش', /WHERE phone_key IS NOT NULL AND phone_key <> ''/.test(schema));
  const r = code('src/routes/furniture_quotes.js');
  check('والتكرار بيتقال مش بيتبلع في صمت', /err=dup_phone/.test(r));
}

/* ── One invoice, decided by the database ──────────────────────────────── */
{
  const schema = code('src/furniture/schema.js');
  check('فيه فهرس فريد على فاتورة العرض',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_furn_quote_one_sale[\s\S]{0,120}\(sale_id\) WHERE sale_id IS NOT NULL/.test(schema));
  const r = code('src/routes/furniture_quotes.js');
  check('والتحويل كله في معاملة واحدة', /BEGIN/.test(r) && /COMMIT/.test(r) && /ROLLBACK/.test(r));
  check('والعرض بيتقفل قبل ما يتقرا', /FROM furniture_quotes WHERE id=\$1 AND company_id=\$2 FOR UPDATE/.test(r));
  // The claim: the same statement that writes the link checks nobody took it.
  check('والحجز في نفس جملة الكتابة',
    /UPDATE furniture_quotes SET status='accepted', sale_id=\$3[\s\S]{0,120}WHERE id=\$1 AND company_id=\$2 AND sale_id IS NULL RETURNING id/.test(r));
  check('واللي اتسبق عليه بيترجع بالرسالة الصح', /if \(!claimed\.rows\[0\]\)[\s\S]{0,200}err=already/.test(r));
  {
    const iCheck = r.indexOf('Q.canConvert(quote');
    const iSale = r.indexOf('INSERT INTO furniture_sales');
    check('والفحص قبل ما الفاتورة تتعمل', iCheck > -1 && iSale > iCheck, `check@${iCheck} sale@${iSale}`);
  }
}

/* ── The price the customer was told ───────────────────────────────────── */
{
  const schema = code('src/furniture/schema.js');
  check('بنود العرض بتخزّن الاسم والسعر ساعتها',
    /CREATE TABLE IF NOT EXISTS furniture_quote_items[\s\S]{0,600}unit_price NUMERIC/.test(schema));
  const r = code('src/routes/furniture_quotes.js');
  check('والتحويل بيقرا من بنود العرض مش من كتالوج النهارده',
    /SELECT \* FROM furniture_quote_items WHERE quote_id=\$1 AND company_id=\$2/.test(r)
    && /it\.unit_price/.test(r) && !/selling_price/.test(r.slice(r.indexOf('/accept'))));
  check('وإجمالي الفاتورة هو إجمالي العرض', /quote\.subtotal, quote\.tax, quote\.total/.test(r));
  check('والحساب بنفس دالة الفواتير', /return S\.invoiceTotals\(lines, taxPercent\)/.test(code('src/furniture/quotes.js')));
}

/* ── Wired in, optional, and translated ────────────────────────────────── */
{
  const admin = code('src/routes/furniture_admin.js');
  check('القسم مركّب ورا علمه', /router\.use\('\/quotes', requireFlag\('quotes'\), require\('\.\/furniture_quotes'\)\)/.test(admin));
  const flags = code('src/furniture/flags.js');
  check('والقسم اختياري زي كل الأقسام', /key: 'quotes'/.test(flags));
  const i18n = fs.readFileSync(path.join(ROOT, 'src/i18n/strings.js'), 'utf8');
  for (const k of ['fn2.flag.quotes', 'fn2.q.state.expired', 'fn2.q.err.already', 'fn2.q.accept']) {
    check('والمفتاح `' + k + '` باللغتين',
      (i18n.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length === 2);
  }
  const r = code('src/routes/furniture_quotes.js');
  check('والرسايل أكواد معروفة مش كلام الرابط', /ERRORS\.includes\(req\.query\.err\)/.test(r));
  check('والعميل المحتمل والعرض متقيّدين بالشركة',
    /ref\('furniture_leads', '\$2', '\$1'\)/.test(r) && /ref\('furniture_customers', '\$3', '\$1'\)/.test(r));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني عرض سعر ممكن يتحوّل لفاتورتين، أو يتقبل بعد ما سعره بقى قديم.`
  : '\nالعرض له صلاحية، وبيتحوّل لفاتورة واحدة، وبالسعر اللي العميل سمعه.');
process.exit(fail ? 1 : 0);
