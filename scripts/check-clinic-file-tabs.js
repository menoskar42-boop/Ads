#!/usr/bin/env node
/**
 * The patient file, and the sentence nobody may invent.
 *
 * Everything a clinic knows about a patient was one scrolling page — details,
 * entry forms, then every visit, every reading, every prescription — and every
 * open read all of it, including for somebody checking one date. Tabs fix that.
 *
 * But splitting a file into tabs creates a specific new way to lie. A tab whose
 * query failed and a tab with genuinely no rows render identically unless the
 * difference is carried through. And "this patient has no prescriptions" is a
 * clinical statement: somebody will act on it. So a dataset knows whether it
 * was READ, and the screen says so when it was not.
 *
 * Two tabs are new because the clinic already had the data and no way to reach
 * it from the file: the patient's invoices, and their attachments.
 *
 *   node scripts/check-clinic-file-tabs.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const F = require('../src/clinic/file_tabs');
const { strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const route = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/clinic_admin.js'), 'utf8'));
const view = fs.readFileSync(path.join(ROOT, 'src/views/clinic_admin/patient_file.ejs'), 'utf8');

/* ── Empty and unreadable are different sentences ──────────────────────── */
{
  check('قراءة فشلت مش قايمة فاضية', F.stateOf({ ok: false }) === 'unknown');
  check('والفاضي فاضي', F.stateOf({ ok: true, rows: [] }) === 'empty');
  check('واللي فيه حاجة فيه', F.stateOf({ ok: true, rows: [1] }) === 'has');
  check('والصفوف عمرها ما ترجع null', Array.isArray(F.rowsOf({ ok: false })) && F.rowsOf(null).length === 0);
  check('والقالب بيفرّق بين الاتنين',
    /state\.visits === 'unknown'/.test(view) && /pf\.unreadable/.test(view));
  check('والراوت بيسأل كل جزء لوحده', /Promise\.allSettled\(wanted\.map/.test(route));
  check('والجزء اللي فشل بيتعلّم مش بيتحوّل لفاضي',
    /data\[k\] = \{ ok: false \}/.test(route));
}

/* ── Money is never invented ───────────────────────────────────────────── */
{
  const b = F.balanceOf({ ok: true, rows: [
    { total_amount: 300, paid_amount: 100, status: 'partial' },
    { total_amount: 150, paid_amount: 150, status: 'paid' },
    { total_amount: 999, paid_amount: 0, status: 'cancelled' },
  ] });
  check('الرصيد بيتحسب من الفواتير', b.billed === 450 && b.paid === 250 && b.due === 200, JSON.stringify(b));
  check('والفاتورة الملغية مش مطلوبة', b.billed === 450);
  // The one that matters: a failed read must not produce "owes nothing".
  check('وقراءة فشلت = مفيش رصيد يتعرض', F.balanceOf({ ok: false }) === null);
  check('والقالب مابيعرضش رصيد مش موجود', /if \(balance\) \{/.test(view));
  check('ومبلغ مش رقم مابيكسرش الحساب',
    Number.isFinite(F.balanceOf({ ok: true, rows: [{ total_amount: 'x', paid_amount: null }] }).due));
}

/* ── A tab reads what a tab needs ──────────────────────────────────────── */
{
  check('التبويب بيقرا اللي يخصّه بس', F.needsFor('invoices').join() === 'invoices');
  check('والمرفقات جزئين', F.needsFor('attachments').join() === 'photos,labs');
  check('والملخص بيدفع تمن إنه الافتراضي', F.needsFor('summary').length === 4);
  // The query string is not a table name.
  check('واسم التبويب مابيتاخدش من الرابط على عماه', F.tabOf('../../etc/passwd') === 'summary');
  check('واسم صحيح بيعدّي', F.tabOf('vitals') === 'vitals');
  check('وكل تبويب ليه استعلاماته', F.TABS.every((t) => F.needsFor(t).length > 0));
  check('والراوت بيقرا التبويب من الدالة دي', /fileTabs\.tabOf\(req\.query\.tab\)/.test(route));
  check('وبيجيب الفواتير والمرفقات',
    /FROM clinic_invoices i/.test(route) && /FROM clinic_patient_photos/.test(route) && /FROM clinic_lab_orders l/.test(route));
}

/* ── The tabs are on the screen, in both languages ─────────────────────── */
{
  const keys = F.TABS.map((t) => 'pf.tab.' + t)
    .concat(['pf.unreadable', 'pf.billed', 'pf.paid', 'pf.due', 'pf.no_invoices',
      'pf.photos', 'pf.no_photos', 'pf.labs', 'pf.no_labs'])
    .concat(['before', 'after', 'xray'].map((k) => 'pf.kind.' + k));
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل تبويب ليه اسم (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }
  check('وشريط التبويبات في الصفحة', /fileTabs\.forEach/.test(view) && /tab=<%= tb %>/.test(view));
  check('وفورمات الإدخال في الملخص بس', /perms\.medical && fileTab === 'summary'/.test(view));
  // Rendering every tab is the render check's job; this makes sure it does it.
  const render = fs.readFileSync(path.join(ROOT, 'scripts/render-clinic-pages.js'), 'utf8');
  check('وفحص العرض بيعرض كل التبويبات',
    /for \(const tb of require\('\.\.\/src\/clinic\/file_tabs'\)\.TABS\)/.test(render));
  check('وبيمرّر جزء مش مقروء في الـfixture', /labs: 'unknown'/.test(render));
}

console.log(fail === 0 ? '\n✅ التبويب اللي ما اتقراش بيقول كده، والرصيد مابيتخترعش.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
