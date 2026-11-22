#!/usr/bin/env node
/**
 * The shop that had one login, again.
 *
 * Fifth system, same story: everything ran on the owner's account, so whoever
 * packs the orders, whoever writes the product pages and whoever runs the
 * discounts all had the owner's reach — the takings, the customers' addresses,
 * the payment credentials, the subscription that pays for the whole thing. A
 * shop will not hand that login to somebody who joined last week, so nobody but
 * the owner ever used it.
 *
 * The one thing different from the gym and the restaurant, and the reason this
 * check exists separately: **the team's panel IS the owner's panel.** Billing,
 * the plan, the page identity and the payment keys live on the same router as
 * the orders list. So `owner` is a permission NO handed-out role carries, and
 * those paths are listed explicitly rather than left out — a page about money
 * must never be reachable by omission.
 *
 *   node scripts/check-shop-perms.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const P = require('../src/shop/perms');
const scope = require('../src/lib/staff_scope');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── The owner's own pages are nobody else's ───────────────────────────── */
{
  check('مفيش دور موزّع بيوصل لصفحات المالك',
    P.ROLE_KEYS.every((r) => P.ROLES[r].owner === false), P.ROLE_KEYS.join(' · '));
  check('والمالك بيوصلها', P.ROLES.owner.owner === true);
  // Listed explicitly: a money page reachable because nobody wrote it down is
  // the failure this list exists to prevent.
  for (const p of ['/profile', '/features', '/company', '/currencies', '/landing']) {
    check('و`' + p + '` مكتوبة صراحةً كمِلك المالك', P.needsFor(p) === 'owner');
  }
  check('وحسابات الفريق للمالك بس', P.ROLE_KEYS.every((r) => P.ROLES[r].staff === false));
}

/* ── The roles ─────────────────────────────────────────────────────────── */
{
  check('الأدوار الأربعة + المالك', Object.keys(P.ROLES).length === 5, Object.keys(P.ROLES).join(' · '));
  check('موظف الطلبات يشوف الطلبات', P.ROLES.orders.orders === true);
  check('ومايغيّرش الأسعار', P.ROLES.orders.catalog === false);
  check('ومايشوفش أرقام الشهر', P.ROLES.orders.reports === false);
  // A copywriter has no need of anybody's address or phone number.
  check('واللي بيكتب المنتجات مايشوفش بيانات العملاء',
    P.ROLES.catalog.customers === false && P.ROLES.catalog.orders === false);
  check('والتسويق مايفتحش طلب ولا يغيّر سعر',
    P.ROLES.marketing.orders === false && P.ROLES.marketing.catalog === false);
  check('والمدير بيدير من غير فوترة',
    P.ROLES.manager.orders && P.ROLES.manager.catalog && P.ROLES.manager.reports && P.ROLES.manager.owner === false);
}

/* ── The guard, run ────────────────────────────────────────────────────── */
{
  const run = (session, url, method) => {
    let outcome = 'next';
    const req = { session, path: url, method: method || 'GET' };
    const res = { status: () => ({ render: () => { outcome = 'denied'; }, send: () => { outcome = 'denied'; } }) };
    P.guard()(req, res, () => { outcome = 'next'; });
    return outcome;
  };
  // Invisible until somebody hands out an account: the owner's session must be
  // untouched by all of this.
  check('جلسة المالك مابتتلمسش', run({ companyId: 1 }, '/profile') === 'next' && run({ companyId: 1 }, '/staff') === 'next');
  check('وموظف الطلبات ممنوع من الفوترة', run({ shopStaffId: 2, shopRole: 'orders' }, '/profile') === 'denied');
  check('وممنوع من العملات ومفاتيح الدفع', run({ shopStaffId: 2, shopRole: 'orders' }, '/currencies') === 'denied');
  check('وبيعدّي على الطلبات', run({ shopStaffId: 2, shopRole: 'orders' }, '/orders') === 'next');
  check('واللي بيكتب المنتجات ممنوع من الطلبات', run({ shopStaffId: 3, shopRole: 'catalog' }, '/orders/5') === 'denied');
  check('والتسويق ممنوع من تعديل منتج (POST كمان)',
    run({ shopStaffId: 4, shopRole: 'marketing' }, '/products/5/edit', 'POST') === 'denied');
  check('ومحدش موزّع بيفتح شاشة الفريق', run({ shopStaffId: 2, shopRole: 'manager' }, '/staff') === 'denied');
  check('ودور مش معروف بياخد أقل صلاحية', run({ shopStaffId: 9, shopRole: 'كذا' }, '/profile') === 'denied');
  check('ولوحة التحكم نفسها مفتوحة للكل', run({ shopStaffId: 2, shopRole: 'catalog' }, '/dashboard') === 'next');
}

/* ── The session is scoped, and the books stay shut ────────────────────── */
{
  check('جلسة فريق المتجر متسمّية', scope.areaOf({ shopStaffId: 1 }) === '/company');
  check('وبتتحسب موظف', scope.isStaff({ shopStaffId: 1 }) === true);
  // /accounting is owner-only for everybody: a shop staff session must not read
  // the ledger just because its area is /company.
  check('والدفاتر بتفضل للمالك', /staffScope\.ownerOnly\(\)/.test(code('src/routes/accounting.js')));
  const company = code('src/routes/company.js');
  check('والدخول بيحطّ مفتاح مستقل', /req\.session\.shopStaffId = st\.id;/.test(company));
  check('والحارس مركّب مرة واحدة على الراوتر', /\}, shopPerms\.guard\(\)\);/.test(company));
  check('والصلاحيات بتتحسب قبل الحارس', company.indexOf('shopPerms.permsFor(req.session)') < company.indexOf('shopPerms.guard()'));
  check('والهبوط بعد الدخول حسب الدور', /shopPerms\.homeFor\(shopPerms\.permsFor\(req\.session\)\)/.test(company));
}

/* ── The rota is not the account ───────────────────────────────────────── */
{
  const srv = code('server.js');
  check('فيه جدول لفريق المتجر', /CREATE TABLE IF NOT EXISTS shop_staff/.test(srv));
  check('والدخول مقفول افتراضياً', /login_enabled BOOLEAN NOT NULL DEFAULT false/.test(srv));
  check('واسم الدخول فريد لكن اختياري',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_staff_username[\s\S]{0,140}WHERE username IS NOT NULL/.test(srv));
  const company = code('src/routes/company.js');
  check('وكل تعديل متقيّد بالشركة', (company.match(/FROM shop_staff|shop_staff SET|INTO shop_staff/g) || []).length >= 4
    && (company.match(/AND company_id=\$\d/g) || []).length >= 3);
}

/* ── The menu shows what the role can open ─────────────────────────────── */
{
  const tpl = fs.readFileSync(path.join(ROOT, 'src/views/company/_layout_top.ejs'), 'utf8');
  check('القايمة بتسأل الصلاحية', /function __can\(href\)/.test(tpl));
  check('واللينكات ملفوفة بيها', (tpl.match(/<% if \(__can\('/g) || []).length >= 15,
    String((tpl.match(/<% if \(__can\('/g) || []).length));
  check('وشاشة الفريق للمالك بس في القايمة', /__can\('\/company\/staff'\) && !__perms\.isStaff/.test(tpl));
  const denied = fs.readFileSync(path.join(ROOT, 'src/views/company/denied.ejs'), 'utf8');
  check('وصفحة المنع فيها طريق للخروج', /home/.test(denied) && /shopstaff\.denied_title/.test(denied));
  const i18n = fs.readFileSync(path.join(ROOT, 'src/i18n/strings.js'), 'utf8');
  for (const k of ['shopstaff.title', 'shopstaff.role.orders', 'shopstaff.denied_title']) {
    check('والمفتاح `' + k + '` باللغتين',
      (i18n.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length === 2);
  }
}

console.log(fail
  ? `\n${fail} مشكلة — يعني موظف في المتجر ممكن يفتح الفوترة أو بيانات العملاء.`
  : '\nفريق المتجر كل واحد في شغله، وصفحات المالك مالهاش دور موزّع.');
process.exit(fail ? 1 : 0);
