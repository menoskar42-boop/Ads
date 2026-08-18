#!/usr/bin/env node
/**
 * A shelf that owed stock it did not have — and refused to be corrected.
 *
 * Availability is `qty - reserved_qty` everywhere in the pharmacy. Recalling a
 * lot cut `qty` and left `reserved_qty` where it was, so a row could hold
 * qty 0 against 8 reserved: minus eight boxes. Every screen prints
 * `GREATEST(…, 0)`, so it read as a harmless zero.
 *
 * Then the second half. The inventory form refuses a count below what is
 * reserved — a good rule, and the reason it exists is that promising stock
 * already spoken for makes an open order unfulfillable. But with a phantom
 * reservation it refused the pharmacist's correction "because 8 are reserved",
 * for orders that could never be filled from a recalled lot. The bug hid
 * itself behind a GREATEST and then blocked its own fix.
 *
 * The invariant is `reserved_qty <= qty`, and it is kept in three places:
 * every path that lowers qty lowers the holds with it, a backfill repairs rows
 * written before that, and a CHECK constraint stops the next path getting it
 * wrong quietly.
 *
 *   node scripts/check-reserved-stock.js
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
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── Every write that lowers qty lowers the holds too ──────────────────── */
{
  const stock = code('src/pharmacy/stock.js');
  const batches = code('src/pharmacy/batches.js');
  const CLAMP = /reserved_qty = LEAST\(reserved_qty, GREATEST\(0, qty - \$3\)\)/;

  const recall = (batches.match(/async function recall[\s\S]*?\n\}/) || [''])[0];
  check('سحب التشغيلة بيقلّل الحجوزات مع الكمية', CLAMP.test(recall));

  const sell = (stock.match(/async function sellDirect[\s\S]*?\n\}/) || [''])[0];
  check('والبيع المباشر كمان', CLAMP.test(sell));

  // fulfill already took both down — that is the shape the others now match.
  const fulfill = (stock.match(/async function fulfill[\s\S]*?\n\}/) || [''])[0];
  check('والتسليم لسه بيقلّل الاتنين', /reserved_qty = GREATEST\(0, reserved_qty - \$3\)/.test(fulfill));

  // And the hold itself can never be booked above the shelf.
  const reserve = (stock.match(/async function reserve[\s\S]*?\n\}/) || [''])[0];
  check('والحجز نفسه محدود بالكمية الموجودة',
    /reserved_qty = LEAST\(qty, reserved_qty \+ \$3\)/.test(reserve));

  /* The sweep, not the list: any UPDATE that lowers qty and says nothing about
     reserved_qty is the bug coming back under a different name. */
  const naked = [];
  for (const [rel, src] of [['src/pharmacy/stock.js', stock], ['src/pharmacy/batches.js', batches]]) {
    for (const m of src.matchAll(/UPDATE pharmacy_inventory[\s\S]{0,400}?(?=`)/g)) {
      const stmt = m[0];
      if (!/SET[\s\S]*qty = GREATEST\(0, qty - /.test(stmt)) continue;
      if (/reserved_qty/.test(stmt)) continue;
      naked.push(rel + ':' + (src.slice(0, m.index).split('\n').length));
    }
  }
  check('ومفيش تحديث بيقلّل الكمية وساكت عن الحجوزات', naked.length === 0,
    naked.join(' · ') || 'ولا واحد');
}

/* ── The rows written before the fix, and the rule underneath ──────────── */
{
  const schema = code('src/pharmacy/schema.js');
  check('فيه إصلاح بأثر رجعي للصفوف اللي الحجز فيها أكبر من الكمية',
    /UPDATE pharmacy_inventory SET reserved_qty = qty WHERE reserved_qty > qty/.test(schema));
  check('وقيد بيمنع رجوعها',
    /CHECK \(reserved_qty <= qty\)/.test(schema));
  const iFix = schema.indexOf('SET reserved_qty = qty WHERE reserved_qty > qty');
  const iChk = schema.indexOf('CHECK (reserved_qty <= qty)');
  check('والإصلاح قبل القيد (قيد على صفوف مخالفة مابيتعملش)',
    iFix > -1 && iChk > iFix, `repair@${iFix} check@${iChk}`);
  /* A CHECK that stops the boot is worse than a wrong number on one medicine:
     the pharmacy would be down instead of slightly wrong. */
  check('وإضافة القيد مالهاش تأثير على إقلاع النظام لو فشلت',
    /catch \(e\) \{[\s\S]{0,220}pharmacy reserved check/.test(schema));
}

/* ── The rule the form enforces is still there, now on true numbers ────── */
{
  const admin = code('src/routes/pharmacy_admin.js');
  check('والفورم لسه بيرفض كمية أقل من المحجوز فعلاً',
    /if \(wanted < reserved\)/.test(admin));
  check('وبيقول للصيدلي الرقم والسبب',
    /محجوزين لطلبات مفتوحة/.test(admin));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني الرصيد المتاح ممكن يبقى سالب والتصحيح مرفوض.`
  : '\nالمحجوز مايعديش الموجود، وأي تقليل للكمية بيقلّل الحجز معاه.');
process.exit(fail ? 1 : 0);
