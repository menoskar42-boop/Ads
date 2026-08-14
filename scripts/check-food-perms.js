#!/usr/bin/env node
/**
 * The restaurant ran on one login, and that login was the owner's.
 *
 * Which meant the till, the tablet on the kitchen wall and the rider's phone all
 * reached the menu prices, the coupons, the day's takings and the AI
 * subscription. No restaurant hands a delivery rider that account — so in
 * practice nobody but the owner could use the system during a shift, which is
 * the only time a restaurant uses it at all.
 *
 * This follows the clinic's module deliberately, and this file asserts the same
 * two things:
 *   · permission hangs off a PATH PREFIX and one middleware applies it, so a
 *     route added next year is guarded by where it lives — not by whether
 *     somebody remembered to add an `if`;
 *   · the kitchen tablet, which hangs where anyone in the kitchen can read it,
 *     cannot open the orders list — that list carries the customer's name,
 *     phone and address.
 *
 *   node scripts/check-food-perms.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require('../src/food/perms');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The model ─────────────────────────────────────────────────────────── */
check('الأدوار الأربعة موجودة + صاحب المطعم',
  ['owner', 'manager', 'cashier', 'kitchen', 'delivery'].every((r) => P.ROLES[r]));
check('صاحب المطعم بيشوف كل حاجة', Object.values(P.ROLES.owner).every(Boolean));

// The point of the feature, as facts.
check('الكاشير مايشوفش الفلوس', P.ROLES.cashier.finance === false);
check('ولا يعدّل المنيو', P.ROLES.cashier.menu === false);
check('الدليفري بيشوف الطلب بس', P.ROLES.delivery.orders === true
  && !P.ROLES.delivery.menu && !P.ROLES.delivery.finance && !P.ROLES.delivery.marketing);
// A wall-mounted screen is the worst place for a customer's address.
check('شاشة المطبخ ماتفتحش قايمة الطلبات (فيها عنوان العميل وتليفونه)',
  P.ROLES.kitchen.orders === false && P.ROLES.kitchen.kitchen === true);
check('مدير الوردية بيقفل الليلة بس مايديرش الحسابات',
  P.ROLES.manager.finance === true && P.ROLES.manager.staff === false);
check('محدش غير صاحب المطعم يدير الموظفين',
  Object.entries(P.ROLES).filter(([, v]) => v.staff).map(([k]) => k).join(',') === 'owner');

/* ── The path map ──────────────────────────────────────────────────────── */
const PATHS = [
  ['/orders', 'orders'],
  ['/orders/12/status', 'orders'],
  ['/orders/count', 'orders'],
  ['/kds', 'kitchen'],
  ['/kds/9/ready', 'kitchen'],
  ['/menu', 'menu'],
  ['/outlet/save', 'menu'],
  ['/category/3/delete', 'menu'],
  ['/item/7/update', 'menu'],
  ['/coupons', 'marketing'],
  ['/ai/upsell', 'marketing'],
  ['/reports', 'finance'],
  ['/staff', 'staff'],
  ['/staff/2/login', 'staff'],
  ['/', null],
];
for (const [p, want] of PATHS) {
  check(`${p} → ${want || 'دخول بس'}`, P.needsFor(p) === want, String(P.needsFor(p)));
}

// Every route in the real router must fall under a prefix the map knows —
// otherwise the guard silently waves it through.
{
  const src = fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8');
  const routes = [...src.matchAll(/^router\.(?:get|post)\('([^']+)'/gm)].map((m) => m[1]);
  const loose = routes.filter((r) => r !== '/' && P.needsFor(r) === null);
  check('كل راوت في /food واقع تحت صلاحية', loose.length === 0, loose.join(' ') || 'كلهم');
  check('والراوتر فيه الراوتات المتوقّعة', routes.length > 15, routes.length + ' راوت');
}

/* ── It is actually mounted, once, on the router ───────────────────────── */
{
  const src = fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8');
  check('الحارس مركّب على الراوتر كله مرة واحدة',
    /router\.use\(requireLogin, staffScope\.only\('\/food'\), requireOrders, foodPerms\.guard\(\)\)/.test(src));
  check('والصلاحيات محسوبة في requireOrders',
    /req\.perms = perms/.test(src) && /res\.locals\.perms = perms/.test(src));
  // A hidden button is not a permission system.
  const perms = fs.readFileSync(path.join(ROOT, 'src/food/perms.js'), 'utf8');
  check('الرفض بيشمل POST مش بس GET',
    /req\.method === 'GET'/.test(perms) && /res\.status\(403\)\.send\('403'\)/.test(perms));
  // Sending everyone to /food/orders would greet the kitchen with a locked door.
  check('أول شاشة بتتحدّد حسب الدور',
    /res\.redirect\(foodPerms\.homeFor\(req\.perms\)\)/.test(src));
  check('والمطبخ بيروح شاشة المطبخ',
    P.homeFor(P.ROLES.kitchen) === '/food/kds' && P.homeFor(P.ROLES.cashier) === '/food/orders');
}

/* ── The login ─────────────────────────────────────────────────────────── */
{
  const company = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
  check('موظف المطعم بيدخل من نفس باب الدخول', /FROM food_staff fs JOIN companies c/.test(company));
  check('ولازم login_enabled', /fs\.login_enabled = true/.test(company));
  check('وكلمة السر بتتقارن بالهاش',
    /foodR\.rows\[0\][\s\S]{0,400}bcrypt\.compare\(password, st\.password_hash\)/.test(company));
  // Three staff sessions now exist; none may be read as another.
  check('جلسة موظف المطعم اسمها غير جلسة الصيدلية والعيادة',
    /req\.session\.foodStaffId = st\.id/.test(company)
    && /s\.foodStaffId/.test(fs.readFileSync(path.join(ROOT, 'src/food/perms.js'), 'utf8')));
  check('وموظف المطعم مايدخلش صفحات المالك', /req\.session\.foodStaffId\) \{/.test(company));
}

/* ── A staff login is not a company login ──────────────────────────────── */
// Every scoped account sets session.companyId, because that is how the tenant
// is identified — so any mount that asks only "is there a companyId?" was
// treating a rider as the owner. /accounting asked exactly that: the whole
// ledger one URL away from a delivery account.
{
  const scope = require('../src/lib/staff_scope');
  check('الجلسة بتتعرف تبع أي نظام',
    scope.areaOf({ foodStaffId: 1 }) === '/food'
    && scope.areaOf({ clinicStaffId: 1 }) === '/clinic'
    && scope.areaOf({ staffId: 1 }) === '/pharmacy'
    && scope.areaOf({ companyId: 9 }) === null);

  const run = (mw, session) => {
    let nexted = false, to = null;
    mw({ session }, { redirect: (u) => { to = u; } }, () => { nexted = true; });
    return { nexted, to };
  };
  const ownerOnly = scope.ownerOnly();
  check('المالك بيدخل الحسابات', run(ownerOnly, { companyId: 9 }).nexted);
  check('والدليفري لأ — بيترجّع لشاشته', run(ownerOnly, { companyId: 9, foodStaffId: 1 }).to === '/food');
  check('وكاشير الصيدلية ولا الاستقبال كمان',
    run(ownerOnly, { staffId: 1 }).to === '/pharmacy'
    && run(ownerOnly, { clinicStaffId: 1 }).to === '/clinic');

  const onlyFood = scope.only('/food');
  check('موظف المطعم بيدخل /food', run(onlyFood, { foodStaffId: 1 }).nexted);
  check('والمالك كمان', run(onlyFood, { companyId: 9 }).nexted);
  check('وموظف العيادة لأ', run(onlyFood, { clinicStaffId: 1 }).to === '/clinic');

  const acct = fs.readFileSync(path.join(ROOT, 'src/routes/accounting.js'), 'utf8');
  check('الدفاتر مركّب عليها ownerOnly',
    /router\.use\(requireLogin, staffScope\.ownerOnly\(\), loadCompany\)/.test(acct));
  for (const [file, area] of [['pharmacy_admin', '/pharmacy'], ['clinic_admin', '/clinic'], ['food_admin', '/food']]) {
    const src2 = fs.readFileSync(path.join(ROOT, 'src/routes/' + file + '.js'), 'utf8');
    check(`و${area} مقفول على موظفينه`, src2.includes(`staffScope.only('${area}')`));
  }
  // The owner's own pages (billing, page settings) send all three home.
  const comp = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
  check('وصفحات المالك بتردّ التلاتة',
    /req\.session\.staffId\) \{/.test(comp) && /req\.session\.clinicStaffId\) \{/.test(comp)
    && /req\.session\.foodStaffId\) \{/.test(comp));
}

/* ── The table ─────────────────────────────────────────────────────────── */
{
  const schema = fs.readFileSync(path.join(ROOT, 'src/food/schema.js'), 'utf8');
  check('جدول food_staff موجود', /CREATE TABLE IF NOT EXISTS food_staff/.test(schema));
  check('واسم الدخول فريد', /idx_food_staff_username[\s\S]{0,80}lower\(username\)/.test(schema));
  // Partial, because a name on the rota with no login is a normal row.
  check('والفهرس جزئي عشان الموظف من غير حساب يفضل صالح',
    /ON food_staff \(lower\(username\)\) WHERE username IS NOT NULL/.test(schema));
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8');
  check('كل استعلام موظفين متقيّد بالشركة',
    (route.match(/FROM food_staff|UPDATE food_staff|DELETE FROM food_staff/g) || []).length ===
    (route.match(/food_staff[\s\S]{0,200}?company_id=\$/g) || []).length);
  check('والدور اللي جاي من الفورم بيتفلتر من القايمة',
    (route.match(/foodPerms\.ROLE_KEYS\.includes\(b\.perm_role\)/g) || []).length === 2);
  check('وكلمة السر بتتهَش', /bcrypt\.hash\(password, 10\)/.test(route));
  // Changing somebody's role must not require knowing their password.
  check('وتغيير الدور مايستلزمش كلمة السر', /UPDATE food_staff SET username=\$1, perm_role=\$2/.test(route));
}

/* ── The screen ────────────────────────────────────────────────────────── */
let ejs;
try { ejs = require('ejs'); }
catch (e) {
  console.log('⏭️  ejs مش منزّل — باقي الفحص محتاج node_modules.');
  process.exit(fail ? 1 : 2);
}
{
  const i18n = require('../src/i18n/strings');
  const t = (k) => i18n.t(k, 'ar');
  const VIEWS = path.join(ROOT, 'src/views');
  const nav = path.join(VIEWS, 'food_admin/nav.ejs');
  const drawNav = (perms) => ejs.render(fs.readFileSync(nav, 'utf8'), {
    company: { id: 1, company_name: 'مطعم', slug: 'demo' },
    session: {}, lang: 'ar', dir: 'rtl', t, active: '', perms,
  }, { filename: nav, root: VIEWS });

  const kitchen = drawNav(P.permsFor({ foodStaffId: 3, foodRole: 'kitchen', staffName: 'المطبخ' }));
  const cashier = drawNav(P.permsFor({ foodStaffId: 4, foodRole: 'cashier', staffName: 'كاشير' }));
  const owner = drawNav(P.permsFor({}));

  check('صاحب المطعم بيشوف كل الروابط',
    ['/food/orders', '/food/kds', '/food/menu', '/food/coupons', '/food/reports', '/food/staff']
      .every((u) => owner.includes('href="' + u + '"')));
  // A link the server answers with 403 is worse than no link at all.
  check('المطبخ مايشوفش لينك الطلبات', !kitchen.includes('href="/food/orders"'));
  check('ولا التقارير ولا الموظفين',
    !kitchen.includes('href="/food/reports"') && !kitchen.includes('href="/food/staff"'));
  check('بس بيشوف شاشة المطبخ', kitchen.includes('href="/food/kds"'));
  check('الكاشير بيشوف الطلبات مش الفلوس',
    cashier.includes('href="/food/orders"') && !cashier.includes('href="/food/reports"'));
  check('ولا لينك الحسابات', !cashier.includes('href="/accounting"'));
  check('والموظف شايف اسمه ودوره على الشاشة', cashier.includes('كاشير'));

  // The denied page and the staff screen must actually draw.
  const denied = path.join(VIEWS, 'food_admin/denied.ejs');
  const d = ejs.render(fs.readFileSync(denied, 'utf8'), {
    company: { id: 1, company_name: 'مطعم', slug: 'demo' }, session: {}, lang: 'ar', dir: 'rtl', t,
    need: 'finance', perms: P.permsFor({ foodStaffId: 5, foodRole: 'delivery', staffName: 'سائق' }),
    home: '/food/orders', pendingOrders: 0,
  }, { filename: denied, root: VIEWS });
  check('صفحة الرفض بترسم وبتقول دوره وبترجّعه لشاشته',
    d.includes(t('food.staff.denied_title')) && d.includes(t('food.staff.role.delivery'))
    && d.includes('href="/food/orders"'));

  const staffView = path.join(VIEWS, 'food_admin/staff.ejs');
  const sv = ejs.render(fs.readFileSync(staffView, 'utf8'), {
    company: { id: 1, company_name: 'مطعم', slug: 'demo' }, session: {}, lang: 'ar', dir: 'rtl', t,
    perms: P.permsFor({}), roles: P.ROLE_KEYS, ROLES: P.ROLES, pendingOrders: 0,
    saved: false, errorCode: null,
    staff: [{ id: 1, name: 'أحمد', username: 'ahmed', perm_role: 'cashier', phone: '0100', login_enabled: true, is_active: true },
            { id: 2, name: 'المطبخ', username: null, perm_role: 'kitchen', phone: null, login_enabled: false, is_active: true }],
  }, { filename: staffView, root: VIEWS });
  check('شاشة الموظفين بترسم', sv.length > 2000);
  check('وبتوضّح كل دور بيشوف إيه', P.ROLE_KEYS.every((r) => sv.includes(t('food.staff.role.' + r))));
  check('وكلمة السر مابتترسمش في الصفحة', !/value="[^"]*"[^>]*type="password"/.test(sv)
    && !/type="password"[^>]*value=/.test(sv));
  check('وفاضية معناها ماتتغيّرش', sv.includes(t('food.staff.pw_keep')));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني المطعم لسه بيشتغل كله على حساب المالك.`
  : '\nصلاحيات المطعم: كل مسار بيطلب صلاحيته، وشاشة المطبخ مش شايفة عنوان حد.');
process.exit(fail ? 1 : 0);
