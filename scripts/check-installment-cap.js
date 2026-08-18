#!/usr/bin/env node
/**
 * Paying 999,999 against a 100-pound instalment.
 *
 * `/clinic/installments/:id/pay` took `req.body.amount` and wrote it through:
 * a payment row for that figure, `paid_amount` on the instalment, and
 * `paid_amount + $1` on the invoice — which then compared `>= total_amount`
 * and said **paid**. A 500-pound invoice could carry a paid_amount of 999,999
 * and no page in the clinic could explain the difference.
 *
 * What makes it worth a check rather than a one-line patch: the sibling route
 * `/invoices/:id/payments` already capped, with a comment explaining exactly
 * why. So the same patient's file behaved differently depending on which
 * button the receptionist pressed. A rule enforced in one of two places is not
 * a rule, and the next payment route will be written by somebody who read
 * neither.
 *
 * And capping alone would have traded one lie for another: an instalment of
 * 100 paid with 40 would be capped to 40 and still stamped `paid_at`. So the
 * check also insists the instalment closes only when it is actually covered.
 *
 *   node scripts/check-installment-cap.js
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
const nl = (m) => m.replace(/[^\n]/g, ' ');
const src = fs.readFileSync(path.join(ROOT, 'src/routes/clinic_admin.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* Every route in the clinic that records money against an invoice. Listed by
   what they DO, so a new one added later has to be added here too. */
const PAYING_ROUTES = [
  ["دفع قسط", /router\.post\('\/installments\/:id\/pay'[\s\S]*?\n\}\);/],
  ["تحصيل على فاتورة", /router\.post\('\/invoices\/:id\/payments'[\s\S]*?\n\}\);/],
];

for (const [label, re] of PAYING_ROUTES) {
  const body = (src.match(re) || [''])[0];
  check(label + ': بيقرا الفاتورة بقفل قبل ما يحصّل',
    /FROM clinic_invoices[\s\S]{0,120}FOR UPDATE/.test(body), body ? '' : 'مالقيتش الراوت');
  check(label + ': وبيحسب المستحق الفعلي',
    /Math\.max\(0,[\s\S]{0,90}total_amount\s*\)?\s*-\s*Number\(inv\.paid_amount\)/.test(body)
    || /const due = Math\.max\(0/.test(body));
  check(label + ': والمبلغ بيتقصّ على المستحق',
    /Math\.min\((?:amount|asked), due\)/.test(body));
  check(label + ': ولو مفيش مستحق بيرفض بدل ما يسجّل صفر',
    /applied <= 0[\s\S]{0,400}ROLLBACK/.test(body));
  check(label + ': والمسجّل هو المقصوص مش المطلوب',
    !/VALUES \(\$1,\$2,\$3,\$4\)',\s*\n?\s*\[cid, (?:ins\.invoice_id|id), (?:amount|asked)[,\]]/.test(body));
}

/* The other half: a capped payment must not close an instalment it did not cover. */
{
  const body = (src.match(/router\.post\('\/installments\/:id\/pay'[\s\S]*?\n\}\);/) || [''])[0];
  check('والقسط مايتقفلش غير لما يتغطّى فعلاً',
    /paid_at = CASE WHEN \$1 >= amount THEN now\(\) ELSE paid_at END/.test(body));
  check('وتحديث القسط متحدّد بالشركة كمان',
    /UPDATE clinic_installments[\s\S]{0,260}WHERE id=\$2 AND company_id=\$3/.test(body));
}

/* Arithmetic, out loud. */
{
  const total = 500, alreadyPaid = 0, asked = 999999;
  const due = Math.max(0, total - alreadyPaid);
  const applied = Math.min(asked, due);
  check('الحسبة: فاتورة ٥٠٠ ودفعة ٩٩٩٩٩٩ بتسجّل ٥٠٠',
    applied === 500 && alreadyPaid + applied === total, applied);
}

console.log(fail
  ? `\n${fail} مشكلة — يعني فاتورة ممكن تتسجّل مدفوعة بمبلغ العيادة ماقبضتوش.`
  : '\nكل تحصيل في العيادة متقصوص على المستحق، والقسط مايتقفلش غير لما يتغطّى.');
process.exit(fail ? 1 : 0);
