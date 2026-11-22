#!/usr/bin/env node
/**
 * A branch filter that every number ignored.
 *
 * `req.branch` was resolved on every furniture request, stored on the request,
 * put in `res.locals` — and then not passed to the dashboard or the reports. So
 * a showroom filtered to one branch read the company's combined figures with a
 * branch name at the top of the page. The module that defines branches opens
 * with the exact sentence this breaks: "we took 90,000 this month" tells the
 * owner nothing if he cannot see that one branch took 85,000 of it.
 *
 * And the delivery board filtered on `branch_id` while `schedule()` never wrote
 * one. Booking a trip from a branch view produced a row with branch_id NULL
 * that the same view then would not show. Not a failure — a DISAPPEARANCE,
 * which is worse: a failure gets rebooked, a vanished appointment gets
 * discovered by a customer waiting at home for a van nobody sent.
 *
 * How a table gets scoped is decided by what it already knows, never by a new
 * column:
 *
 *   · rows that CARRY branch_id filter on it;
 *   · rows that BELONG to one of those derive it — a customer payment through
 *     its invoice, a return through its invoice, a canteen tab through its
 *     worker. A copied branch_id is a second answer that can disagree.
 *
 * And some things stay company-wide on purpose — ONE timber store, ONE supplier
 * list. Those are not scoped, and the dashboard now SAYS SO on the card. A
 * number that silently means something else is the thing being fixed here; a
 * mixed dashboard with unlabelled cards would just be a new version of it.
 *
 *   node scripts/check-branch-scope.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const B = require('../src/furniture/branches');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── The filter helper, by running it ──────────────────────────────────── */
{
  const branches = [{ id: 7 }, { id: 9 }];
  check('«كل الفروع» مابيضيفش شرط', B.sqlFor(null, [1]) === '');
  {
    const p = [1];
    check('وفرع بيضيف شرط بالرقم الصح', B.sqlFor(7, p) === ' AND branch_id = $2' && p[1] === 7);
  }
  check('و«قبل الفروع» بتدوّر على NULL', B.sqlFor('none', [1]) === ' AND branch_id IS NULL');
  check('وفرع مش بتاع الشركة بيرجع «الكل» مش بيتحط في SQL',
    B.filterFrom('99', branches) === null && B.filterFrom('7', branches) === 7);
  check('و«none» حالة معتبرة مش قيمة فاضية', B.filterFrom('none', branches) === 'none');
}

/* ── The delivery that used to vanish ──────────────────────────────────── */
{
  const del = code('src/furniture/delivery.js');
  const route = code('src/routes/furniture_delivery.js');
  check('حجز التوصيل بيكتب الفرع',
    /INSERT INTO furniture_deliveries[\s\S]{0,400}branch_id\)/.test(del)
    && /idToStamp\(o\.branch, o\.branchId/.test(del));
  check('والراوت بيبعت الفرع اللي المستخدم واقف عليه',
    /branch: req\.branch, branchId: b\.branch_id, branches: req\.branches/.test(route));
  check('واللوحة لسه بتفلتر بيه (اللي كان بيخفي الحجز)',
    /sqlFor\(branch, params, 'd\.branch_id'\)/.test(code('src/furniture/delivery.js')));
}

/* ── The numbers ───────────────────────────────────────────────────────── */
{
  const rep = code('src/furniture/reports.js');
  const admin = code('src/routes/furniture_admin.js');
  const repRoute = code('src/routes/furniture_reports.js');

  check('الداشبورد بياخد الفرع', /async function dashboard\(pool, cid, branch = null\)/.test(rep));
  check('والراوت بيبعته فعلاً', /R\.dashboard\(pool, req\.company\.id, req\.branch\)/.test(admin));
  check('وملخّص الفترة والخزنة بياخدوه',
    /async function periodSummary\(pool, cid, from, to, branch = null\)/.test(rep)
    && /async function cashBalance\(pool, cid, branch = null\)/.test(rep));
  check('وصفحة التقارير بتبعته كمان', /gather\(pool, req\.company\.id, from, to, req\.branch\)/.test(repRoute));

  // The tables that carry branch_id are filtered on it.
  for (const t of ['furniture_sales', 'furniture_expenses', 'furniture_deliveries']) {
    check(`و${t} متفلتر بالعمود بتاعه`,
      new RegExp('FROM ' + t + '[\\s\\S]{0,260}scope\\(branch').test(rep));
  }
  // The tables that reach a branch through another row derive it.
  for (const [t, via] of [['furniture_customer_payments', 'sale_id'],
                          ['furniture_returns', 'sale_id'],
                          ['furniture_canteen_purchases', 'worker_id']]) {
    check(`و${t} بيوصل لفرعه عن طريق ${via}`,
      new RegExp("via\\(branch, p, '" + t + "', '" + via + "'").test(rep));
  }
  check('والاشتقاق بـEXISTS على الصف الأصلي مش بعمود متكرر',
    /AND EXISTS \(SELECT 1 FROM \$\{parent\} p WHERE p\.id = \$\{table\}\.\$\{fk\} AND \$\{cond\}\)/.test(rep));

  /* Each query builds its own params array. One shared array across ten
     parallel queries puts the branch placeholder in a different slot than the
     SQL asks for — the kind of bug that returns a number instead of an error. */
  check('وكل استعلام بيبني مصفوفة معاملاته لوحده',
    /const P = \(\) => \[cid, from, to\]/.test(rep) && /const P = \(\) => \[cid\]/.test(rep));
}

/* ── What stays company-wide says so ───────────────────────────────────── */
{
  const rep = code('src/furniture/reports.js');
  check('المخزون ومديونية الموردين والأوامر المفتوحة لسه على مستوى الشركة',
    /companyWide: \['stock', 'owedToSuppliers', 'openOrders'\]/.test(rep));
  check('ومقارنة الفروع نفسها مابتتفلترش (دي غرضها المقارنة)',
    /B\.segment\(pool, cid, from, to\)/.test(code('src/routes/furniture_reports.js')));
  const view = fs.readFileSync(path.join(ROOT, 'src/views/furniture_admin/dashboard.ejs'), 'utf8');
  check('والكروت دي بتقول «كل الفروع» وانت واقف على فرع',
    (view.match(/fn2\.card\.all_branches/g) || []).length >= 3 && /d\.branch != null/.test(view));
  const i18n = fs.readFileSync(path.join(ROOT, 'src/i18n/strings.js'), 'utf8');
  check('والمفتاح باللغتين', (i18n.match(/'fn2\.card\.all_branches'/g) || []).length === 2);
}

console.log(fail
  ? `\n${fail} مشكلة — يعني رقم الفرع ممكن يكون رقم الشركة كلها من غير ما حد يعرف.`
  : '\nالفلتر بيوصل للأرقام، واللي بره الفلتر مكتوب عليه إنه كل الفروع.');
process.exit(fail ? 1 : 0);
