#!/usr/bin/env node
/**
 * The gym that had one login.
 *
 * The whole panel ran on the owner's account, so whoever stood at reception,
 * the trainer with a tablet and whoever worked the till all had the owner's
 * reach: the month's takings, the plan prices, every member's phone number,
 * the staff accounts. A gym will not hand that login to a part-time trainer —
 * so in practice nobody but the owner ever signed in, which is the opposite of
 * what a shift needs.
 *
 * This is the fourth system to get roles, and it is the SAME module shape as
 * the restaurant's on purpose: one idea to learn across the platform, not five.
 * The enforcement is the part worth copying — `if (!req.perms.x) return 403`
 * spread over twenty routes gives nineteen guarded routes and one everybody
 * forgets, so permission hangs off a PATH PREFIX and one middleware applies it.
 *
 * What this check holds:
 *
 *   · every guarded area is reachable by somebody and closed to somebody —
 *     a permission nobody lacks is decoration;
 *   · the trainer's tablet cannot read the member list or the takings;
 *   · a gym staff session is not a company session (the books stay owner-only)
 *     and not another system's session either;
 *   · and the menu shows only what the role can open, because a link that
 *     answers with a locked door reads as the software being broken.
 *
 *   node scripts/check-gym-perms.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const P = require('../src/gym/perms');
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

/* ── The roles ─────────────────────────────────────────────────────────── */
{
  check('الأدوار الخمسة موجودة',
    ['owner', 'manager', 'reception', 'cashier', 'trainer'].every((r) => P.ROLES[r]),
    Object.keys(P.ROLES).join(' · '));
  check('والمالك بيوصل كل حاجة', Object.values(P.ROLES.owner).every((v) => v === true));
  check('والمالك مش دور بيتوزّع', !P.ROLE_KEYS.includes('owner'));

  // A permission everybody has is not a permission.
  const perms = Object.keys(P.ROLES.owner);
  const useless = perms.filter((k) => P.ROLE_KEYS.every((r) => P.ROLES[r][k] === true));
  check('ومفيش صلاحية الكل معاه', useless.length === 0, useless.join(' · ') || perms.length + ' صلاحية');
  // `staff` is owner-only ON PURPOSE — handing out accounts is how somebody
  // hands out their own reach, and that decision belongs to whoever pays.
  const unreachable = perms.filter((k) => k !== 'staff' && P.ROLE_KEYS.every((r) => P.ROLES[r][k] === false));
  check('ولا صلاحية محدش معاه (غير حسابات الموظفين بقصد)', unreachable.length === 0, unreachable.join(' · '));
}

/* ── The lines that matter ─────────────────────────────────────────────── */
{
  check('الاستقبال مايشوفش الفلوس', P.ROLES.reception.finance === false);
  check('ولا الإعدادات', P.ROLES.reception.settings === false);
  check('والكاشير مايفتحش ملفات الأعضاء', P.ROLES.cashier.members === false);
  // A tablet left on a bench is the worst possible place for a member list.
  check('والمدرّب مايشوفش الأعضاء ولا الفلوس',
    P.ROLES.trainer.members === false && P.ROLES.trainer.finance === false);
  check('والمدرّب يشوف الكلاسات', P.ROLES.trainer.classes === true);
  check('وحسابات الموظفين للمالك بس', P.ROLE_KEYS.every((r) => P.ROLES[r].staff === false));
}

/* ── Path prefix → permission ──────────────────────────────────────────── */
{
  check('المسار هو اللي بيحدّد الصلاحية',
    P.needsFor('/reports') === 'finance' && P.needsFor('/members/12') === 'members'
    && P.needsFor('/desk/undo') === 'desk' && P.needsFor('/staff/3/login') === 'staff');
  check('واللي مش في القايمة محتاج دخول بس', P.needsFor('/') === null);
  // Longest match wins, so a stricter child prefix is possible later.
  check('وأطول مطابقة هي اللي بتكسب', P.needsFor('/media') === 'settings');

  // Every guarded route in the router must be covered by a prefix — a route
  // outside them is the one nobody guards.
  const g = code('src/routes/gym_admin.js');
  const routes = [...g.matchAll(/router\.(get|post)\('([^']+)'/g)].map((m) => m[2]);
  const sensitive = routes.filter((r) => /^\/(reports|plans|settings|media|staff|pos|members)/.test(r));
  const uncovered = sensitive.filter((r) => !P.needsFor(r.replace(/\(\\\\d\+\)/g, '')));
  check('وكل راوت حسّاس مغطّى ببادئة', uncovered.length === 0, uncovered.join(' · ') || sensitive.length + ' راوت');
}

/* ── The guard, run ────────────────────────────────────────────────────── */
{
  const run = (session, url, method) => {
    let outcome = 'next';
    const req = { session, path: url, method: method || 'GET', company: { company_name: 'x' } };
    const res = {
      status: () => ({ render: () => { outcome = 'denied'; }, send: () => { outcome = 'denied'; } }),
    };
    P.guard()(req, res, () => { outcome = 'next'; });
    return outcome;
  };
  check('المالك بيعدّي على كل حاجة', run({}, '/reports') === 'next' && run({}, '/staff') === 'next');
  check('والاستقبال بيتمنع من التقارير',
    run({ gymStaffId: 5, gymRole: 'reception' }, '/reports') === 'denied');
  check('وبيعدّي على الاستقبال', run({ gymStaffId: 5, gymRole: 'reception' }, '/desk') === 'next');
  check('والمدرّب بيتمنع من الأعضاء', run({ gymStaffId: 6, gymRole: 'trainer' }, '/members') === 'denied');
  check('والكاشير بيتمنع من ملف عضو', run({ gymStaffId: 7, gymRole: 'cashier' }, '/members/3') === 'denied');
  // A POST must be refused too, or the screen is a suggestion.
  check('والمنع بيشمل الـPOST مش العرض بس',
    run({ gymStaffId: 6, gymRole: 'trainer' }, '/members/3/subscribe', 'POST') === 'denied');
  // An unknown role must not become a superuser.
  check('ودور مش معروف بياخد أقل صلاحية مش أكترها',
    run({ gymStaffId: 9, gymRole: 'حاجة' }, '/reports') === 'denied');
}

/* ── A staff session is not the owner's session ────────────────────────── */
{
  check('جلسة موظف الجيم متسمّية باسمها', scope.areaOf({ gymStaffId: 3 }) === '/gym');
  check('وبتتحسب موظف مش مالك', scope.isStaff({ gymStaffId: 3 }) === true);
  check('وجلسة المالك مش موظف', scope.areaOf({ companyId: 1 }) === null);
  const company = code('src/routes/company.js');
  check('والدخول بيحطّ مفتاح مستقل', /req\.session\.gymStaffId = st\.id;/.test(company));
  check('وبيمنع الموظف من صفحات المالك', /req\.session\.gymStaffId\) \{[\s\S]{0,120}redirect\('\/gym'\)/.test(company));
  check('والدفاتر لسه للمالك بس', /staffScope\.ownerOnly\(\)/.test(code('src/routes/accounting.js')));
  const gym = code('src/routes/gym_admin.js');
  check('والراوتر مركّب الحارس مرة واحدة',
    /router\.use\(requireLogin, staffScope\.only\('\/gym'\), requireGym, gymPerms\.guard\(\)\)/.test(gym));
  check('وموظف نظام تاني بيترجع لمكانه', /staffScope\.only\('\/gym'\)/.test(gym));
}

/* ── The menu shows what the role can open ─────────────────────────────── */
{
  const tpl = fs.readFileSync(path.join(ROOT, 'src/views/gym_admin/_layout_top.ejs'), 'utf8');
  const render = (perms) => ejs.render(tpl + '</div></body></html>',
    { company: { company_name: 'جيم' }, tab: '', pageTitle: 'x', perms },
    { filename: path.join(ROOT, 'src/views/gym_admin/_layout_top.ejs') });
  const trainer = render(P.permsFor({ gymStaffId: 1, gymRole: 'trainer' }));
  check('المدرّب مايشوفش لينك التقارير', !/\/gym\/reports/.test(trainer));
  check('ولا لينك الأعضاء', !/href="\/gym\/members"/.test(trainer));
  check('وبيشوف الكلاسات', /\/gym\/classes/.test(trainer));
  const owner = render(P.permsFor({}));
  check('والمالك بيشوف كل حاجة', /\/gym\/reports/.test(owner) && /\/gym\/staff/.test(owner));
  check('وصفحة المنع فيها طريق للخروج',
    /home/.test(fs.readFileSync(path.join(ROOT, 'src/views/gym_admin/denied.ejs'), 'utf8')));
}

/* ── And the rota is not the account ───────────────────────────────────── */
{
  const schema = code('src/gym/schema.js');
  check('فيه جدول للموظفين', /CREATE TABLE IF NOT EXISTS gym_staff/.test(schema));
  check('والدخول مقفول افتراضياً', /login_enabled BOOLEAN NOT NULL DEFAULT false/.test(schema));
  check('واسم الدخول فريد لكن اختياري',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_staff_username[\s\S]{0,140}WHERE username IS NOT NULL/.test(schema));
  const g = code('src/routes/gym_admin.js');
  check('وتغيير الدور مابيطلبش كلمة السر', /A blank password keeps the old one|UPDATE gym_staff SET username=\$1, perm_role=\$2, login_enabled=\$3/.test(g));
  check('وكل تعديل متقيّد بالجيم', (g.match(/AND company_id=\$\d/g) || []).length >= 4);
}

console.log(fail
  ? `\n${fail} مشكلة — يعني مدرّب ممكن يقرا أرقام الأعضاء أو تقارير الفلوس.`
  : '\nكل دور بيشوف شغله: الاستقبال بيدخّل، الكاشير بيبيع، المدرّب بيشوف كلاساته.');
process.exit(fail ? 1 : 0);
