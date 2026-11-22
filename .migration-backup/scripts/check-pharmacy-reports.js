#!/usr/bin/env node
/**
 * The three reports, and the one convention that makes or breaks all of them.
 *
 * A return in this system is a row in `pharmacy_sales` with `kind='return'`,
 * and its item rows carry POSITIVE quantities — the direction lives in `kind`,
 * because the header is where the signed money goes. Which means the obvious
 * `SUM(si.qty)` counts a box that came back over the counter as a box that was
 * sold, and both reports built on it lie in the same direction:
 *
 *   · «أكثر مبيعاً» promotes the medicine customers keep bringing back;
 *   · «راكد» calls a shelf busy when the only movement was a refund.
 *
 * There is no database in this environment, so the SQL cannot be executed here.
 * That is stated rather than papered over: what this file checks about the
 * queries is that each one carries the netting rule, that the idle report finds
 * medicines with no sales rows at all (a JOIN would silently drop exactly the
 * items the report exists to find), and that the waste report counts both kinds
 * of loss. The parts that are plain JavaScript — the window clamp and the loss
 * totals — are run for real.
 *
 *   node scripts/check-pharmacy-reports.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const R = require('../src/pharmacy/reports');
const { t, strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── A returned box is not a sale ──────────────────────────────────────── */
{
  // Every aggregate over sale items must say which way the boxes moved.
  const aggregates = R.topSellers.match(/SUM\([^)]*\)/g) || [];
  check('كل جمع في «أكثر مبيعاً» بيطرح المرتجع',
    aggregates.length > 0 && aggregates.every((a) => /kind = 'return' THEN -/.test(a)),
    aggregates.filter((a) => !/kind = 'return' THEN -/.test(a)).join(' · ') || aggregates.length + ' جملة');
  check('والصنف اللي رجع أكتر مما اتباع مابيظهرش في القايمة',
    /HAVING SUM\(CASE WHEN s\.kind = 'return' THEN -si\.qty ELSE si\.qty END\) > 0/.test(R.topSellers.replace(/\s+/g, ' ')));
  check('و«راكد» مابتحسبش المرتجع حركة',
    (R.slowMoving.match(/s\.kind <> 'return'/g) || []).length === 2,
    (R.slowMoving.match(/s\.kind <> 'return'/g) || []).length + ' موضع');
}

/* ── The report that must not lose what it is looking for ──────────────── */
{
  // A medicine that never sold has no rows to join to. NOT EXISTS keeps it.
  check('«راكد» بتلاقي اللي عمره ما اتباع',
    /NOT EXISTS \(/.test(R.slowMoving) && !/JOIN pharmacy_sale_items[\s\S]{0,200}GROUP BY/.test(R.slowMoving));
  check('وبتعرض اللي عليه رصيد بس',
    /GREATEST\(inv\.qty - inv\.reserved_qty, 0\) > 0/.test(R.slowMoving));
  check('والمحجوز مابيتحسبش على الرف',
    /inv\.qty - inv\.reserved_qty/.test(R.slowMoving));
}

/* ── Two kinds of loss, kept apart ─────────────────────────────────────── */
{
  check('الهالك فيه المرتجع اللي مارجعش على الرف',
    /s\.kind = 'return' AND s\.restock = false/.test(R.waste));
  check('وفيه التشغيلة اللي خلصت وفيها كمية',
    /b\.qty > 0[\s\S]{0,80}b\.expiry < CURRENT_DATE/.test(R.waste));
  check('والاتنين متفرّقين بعمود بيقول مصدره', /'return'::text AS source/.test(R.waste) && /'expired'::text AS source/.test(R.waste));

  const rows = [
    { source: 'expired', qty: 3, cost: 10 },
    { source: 'return', qty: 2, cost: 5.5 },
    { source: 'return', qty: 4, cost: null },   // cost unknown
    { source: 'return', qty: -2, cost: 5 },     // nonsense from the wire
  ];
  const totals = R.wasteTotals(rows);
  check('وحساب الخسارة بيجمع صح', totals.expired === 30 && totals.returns === 11 && totals.total === 41, JSON.stringify(totals));
  check('وتكلفة مش معروفة بتتحسب صفر مش NaN', Number.isFinite(totals.total));
  check('وكمية بالسالب مابتنقّصش الخسارة', totals.units === 9, String(totals.units));
  check('ومفيش صفوف = مفيش خسارة', R.wasteTotals(null).total === 0);
}

/* ── The window a person typed ─────────────────────────────────────────── */
{
  check('مدة مش رقم بترجع للافتراضي', R.windowDays('كتير', 30) === 30);
  check('وصفر بيبقى يوم', R.windowDays('0', 30) === 1);
  check('وسنتين بيبقوا سنة', R.windowDays('9999', 30) === 365);
  check('والرقم السليم بيعدّي زي ما هو', R.windowDays('45', 30) === 45);
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8');
  check('والراوت بيقص المدة قبل ما تروح للاستعلام',
    /reports\.windowDays\(req\.query\.days/.test(route) && /reports\.windowDays\(req\.query\.idle/.test(route));
  check('والتقارير لصاحب صلاحية المخزون',
    /router\.get\('\/reports', gate\('inventory'\)/.test(route));
}

/* ── On the screen, in both languages ──────────────────────────────────── */
{
  const keys = ['nav', 'title', 'sub', 'top', 'top_sub', 'slow', 'slow_sub', 'waste', 'waste_sub',
    'none', 'none_slow', 'none_waste', 'never', 'src.return', 'src.expired', 'tied_up', 'last_sold'].map((k) => 'ph.rep.' + k);
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل نص التقارير موجود (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }

  const file = path.join(ROOT, 'src/views/pharmacy_admin/reports.ejs');
  const waste = [
    { source: 'expired', at: new Date(), name: 'بنادول', qty: 3, cost: 10, note: 'B1' },
    { source: 'return', at: new Date(), name: 'كومتركس', qty: 1, cost: null, note: null },
  ];
  const data = {
    days: 30, idleDays: 60,
    top: [{ medicine_id: 1, name: 'بنادول', qty: 12, revenue: 360 }],
    slow: [{ medicine_id: 2, name: 'فيتامين', available: 9, cost: 20, last_sold: null }],
    waste, wasteTotals: R.wasteTotals(waste),
  };
  const render = (lang, canFinance) => ejs.render(fs.readFileSync(file, 'utf8'), Object.assign({
    t: (k) => t(k, lang), lang, dir: lang === 'ar' ? 'rtl' : 'ltr', LOC: lang === 'en' ? 'en-GB' : 'ar-EG',
    company: { id: 1, company_name: 'صيدلية', slug: 'pharmacy' }, session: {},
    perms: { inventory: true, pos: true, orders: true, settings: true, staff: true, canFinance },
    payReady: true, einvoiceOn: false, payLink: '/accounting/payments', einvoiceLink: '/einvoice',
  }, data), { filename: file });

  for (const lang of ['ar', 'en']) {
    let html = null, error = null;
    try { html = render(lang, true); } catch (e) { error = e.message.split('\n')[0]; }
    check(`صفحة التقارير بتتعرض (${lang})`, !error, error || 'تمام');
    if (html) {
      const raw = html.match(/\bph\.rep\.[a-z_.]+/g);
      check(`ومفيش مفتاح طالع للشاشة (${lang})`, !raw, raw ? raw[0] : 'ولا واحد');
    }
  }
  // Empty is a state too — a pharmacy with no sales yet must not see a broken page.
  {
    let error = null;
    try {
      ejs.render(fs.readFileSync(file, 'utf8'), Object.assign({
        t: (k) => t(k, 'ar'), lang: 'ar', dir: 'rtl', LOC: 'ar-EG',
        company: { id: 1, company_name: 'ص', slug: 's' }, session: {},
        perms: { inventory: true, canFinance: true },
        payReady: null, einvoiceOn: null, payLink: '/accounting/payments', einvoiceLink: '/einvoice',
      }, { days: 30, idleDays: 60, top: [], slow: [], waste: [], wasteTotals: R.wasteTotals([]) }), { filename: file });
    } catch (e) { error = e.message.split('\n')[0]; }
    check('وصيدلية لسه مابعتش حاجة بتشوف صفحة سليمة', !error, error || 'تمام');
  }

  check('الفلوس بتبان للّي معاه صلاحيتها', /360\.00/.test(render('ar', true)));
  check('ومابتبانش للّي مالوش', !/360\.00/.test(render('ar', false)));
}

console.log(fail === 0 ? '\n✅ التقارير بتطرح المرتجع، ومابتضيّعش اللي عمره ما اتباع.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
