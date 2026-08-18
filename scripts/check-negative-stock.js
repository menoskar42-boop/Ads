#!/usr/bin/env node
/**
 * Selling five off a shelf of two.
 *
 * Two places did it, in two different ways, and both left a number the merchant
 * cannot explain:
 *
 *   · **The workshop** issued parts with `qty = qty - $1` and no floor at all.
 *     Issue five when two are on the shelf and the part sits at minus three.
 *     Nothing errors; the parts screen shows a negative that no purchase
 *     accounts for, and every report built on it is wrong from then on.
 *
 *   · **The gym POS** used `GREATEST(0, stock - qty)` — the takings recorded
 *     five sold, the shelf went to zero, and the two numbers stopped agreeing.
 *     Worse, it decided whether to track stock at all with `stock > 0`, so a
 *     product became "untracked" at the exact moment it SOLD OUT, and every
 *     sale after that overs old in silence.
 *
 * Neither is the pharmacy's offline queue, where a sale is a fact that already
 * happened at the counter and flooring at zero is the honest choice. These are
 * somebody at a desk with the system open, so the answer is to refuse and say
 * what the shelf shows: correcting a count is a normal thing to do, issuing
 * stock that is not there is not.
 *
 * The shape that makes it safe is the same in both: the check lives in the
 * UPDATE's own WHERE (`AND qty >= $1 … RETURNING`), so two tills cannot both
 * pass it, and an empty result is what tells the route to refuse.
 *
 *   node scripts/check-negative-stock.js
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

/* ── The workshop ──────────────────────────────────────────────────────── */
{
  const src = code('src/routes/workshop_admin.js');
  const route = (src.match(/router\.post\('\/jobs\/:id\(\\\\d\+\)\/parts'[\s\S]*?\n\}\);/)
    || src.match(/UPDATE workshop_parts SET qty = qty - \$1[\s\S]{0,900}/) || [''])[0];
  check('إصدار قطعة الغيار بيشترط الكمية في نفس الجملة',
    /UPDATE workshop_parts SET qty = qty - \$1 WHERE id=\$2 AND company_id=\$3 AND qty >= \$1 RETURNING id/.test(src));
  check('ولو مافيش كفاية بيرجع من غير ما يكتب حاجة',
    /if \(!took\.rows\.length\)[\s\S]{0,120}ROLLBACK/.test(route));
  check('وبيقول للفني الرف فيه كام', /err=stock&have=/.test(route));
  check('ومفيش تحديث بلا شرط فاضل',
    !/UPDATE workshop_parts SET qty = qty - \$1 WHERE id=\$2 AND company_id=\$3'/.test(src));
  const view = fs.readFileSync(path.join(ROOT, 'src/views/workshop_admin/job.ejs'), 'utf8');
  check('والصفحة بتعرض الرسالة من القاموس', /t\('wsh\.err\.stock'\)/.test(view));
  const i18n = fs.readFileSync(path.join(ROOT, 'src/i18n/strings.js'), 'utf8');
  check('والمفتاح موجود باللغتين', (i18n.match(/'wsh\.err\.stock'/g) || []).length === 2);
}

/* ── The gym till ──────────────────────────────────────────────────────── */
{
  const src = code('src/routes/gym_admin.js');
  const route = (src.match(/router\.post\('\/pos\/sell'[\s\S]*?\n\}\);/) || [''])[0];
  check('بيع الجيم بيشترط الكمية في نفس الجملة',
    /UPDATE gym_products SET stock = stock - \$1 WHERE id=\$2 AND company_id=\$3 AND stock >= \$1 RETURNING id/.test(route));
  check('ومفيش `GREATEST` بيبلع الفرق', !/GREATEST\(0, stock - \$1\)/.test(route));
  check('ولو مافيش كفاية البيعة مابتتسجّلش',
    /if \(!took\.rows\.length\)[\s\S]{0,140}ROLLBACK/.test(route));
  /* The heart of it: "sold out" and "not counted" are different states now. */
  check('و«خلص» مابقتش نفس «مش بنعدّه»', /if \(prod\.track_stock\)/.test(route)
    && !/if \(prod\.stock > 0\)/.test(route));
  const schema = code('src/gym/schema.js');
  check('وعمود التتبّع موجود ومتزرع مرة واحدة',
    /ADD COLUMN track_stock BOOLEAN NOT NULL DEFAULT false/.test(schema)
    && /UPDATE gym_products SET track_stock = true WHERE stock > 0/.test(schema));
  check('والزرع جوّه شرط «العمود مش موجود» عشان مايرجعش كل بوت',
    /information_schema\.columns[\s\S]{0,160}track_stock/.test(schema));
  check('وإضافة منتج بتحترم الخانة الفاضية',
    /String\(b\.stock \|\| ''\)\.trim\(\) !== ''/.test(src));
  const view = fs.readFileSync(path.join(ROOT, 'src/views/gym_admin/pos.ejs'), 'utf8');
  check('والشاشة بتفرّق بين «خلص» و«مش متتبّع»',
    /p\.track_stock/.test(view) && /خلص/.test(view));
  check('وبتقول للكاشير الرف فيه كام لما يترفض', /errHave/.test(view));
}

/* ── Where flooring at zero IS right, it stays ─────────────────────────── */
{
  const stock = code('src/pharmacy/stock.js');
  check('الصيدلية الأوفلاين لسه بتقبل البيعة وبتبلّغ عن النقص (واقعة حصلت)',
    /GREATEST\(0, qty - \$3\)/.test(stock) && /return short;/.test(stock));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني ممكن يتباع أو يتصرف مخزون مش موجود.`
  : '\nمفيش صرف أو بيع لمخزون مش موجود، والشرط في نفس جملة التحديث.');
process.exit(fail ? 1 : 0);
