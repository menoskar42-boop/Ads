#!/usr/bin/env node
/**
 * The third and last system that ran entirely on the owner's login.
 *
 * A dietitian's practice is small — usually the dietitian plus somebody at the
 * front desk — which is exactly why this mattered rather than why it didn't:
 * the assistant who weighs the patient and books the next visit was signing in
 * AS THE DIETITIAN, so a blood panel and a treatment plan were one click from
 * the reception desk.
 *
 * The split this asserts is the one a real practice already makes: weighing
 * somebody and taking a waist measurement is the assistant's job; the labs, the
 * plan, the printed report and handing the patient their portal account are the
 * dietitian's.
 *
 *   node scripts/check-nutrition-perms.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require('../src/nutrition/perms');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The model ─────────────────────────────────────────────────────────── */
check('الأدوار موجودة', ['owner', 'assistant', 'reception'].every((r) => P.ROLES[r]));
check('الأخصائي بيشوف كل حاجة', Object.values(P.ROLES.owner).every(Boolean));
check('المساعد بيقيس', P.ROLES.assistant.measure === true);
check('بس مايفتحش تحليل ولا خطة', P.ROLES.assistant.clinical === false);
check('والاستقبال مايقيسش أصلاً', P.ROLES.reception.measure === false);
check('ومحدش غير الأخصائي يدير الفريق',
  Object.entries(P.ROLES).filter(([, v]) => v.staff).map(([k]) => k).join(',') === 'owner');
check('ولا يفتح الإعدادات وقاعدة الأطعمة',
  P.ROLES.assistant.settings === false && P.ROLES.reception.settings === false);

/* ── The path map ──────────────────────────────────────────────────────── */
const PATHS = [
  ['/patients', 'patients'],
  ['/patients/12', 'patients'],
  ['/patients/12/measure', 'measure'],
  ['/patients/12/measure/3/delete', 'measure'],
  ['/patients/12/lab', 'clinical'],
  ['/patients/12/lab/4/delete', 'clinical'],
  ['/patients/12/report', 'clinical'],
  ['/patients/12/plans', 'clinical'],
  ['/patients/12/login', 'clinical'],
  ['/patients/12/login/disable', 'clinical'],
  ['/plans/9', 'clinical'],
  ['/plans/9/activate', 'clinical'],
  ['/foods', 'settings'],
  ['/settings', 'settings'],
  ['/staff', 'staff'],
  ['/staff/2/login', 'staff'],
  ['/', null],
];
for (const [p, want] of PATHS) {
  check(`${p} → ${want || 'دخول بس'}`, P.needsFor(p) === want, String(P.needsFor(p)));
}
// The whole reason the patient list and the patient's blood work can differ.
check('كل مسار إكلينيكي تحت المريض بيطلب clinical',
  P.CLINICAL_SUBPATHS.every((m) => P.needsFor('/patients/7' + m) === 'clinical'),
  P.CLINICAL_SUBPATHS.join(' '));
check('وأرشفة المريض شغل الاستقبال (patients مش clinical)',
  P.needsFor('/patients/7/archive') === 'patients');

// Every route in the three nutrition routers must land under a known prefix.
{
  const files = ['nutrition_admin', 'nutrition_plans', 'nutrition_foods'];
  const loose = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/' + f + '.js'), 'utf8');
    // nutrition_foods is mounted at /foods, so its own paths are relative.
    const prefix = f === 'nutrition_foods' ? '/foods' : '';
    for (const m of src.matchAll(/^router\.(?:get|post)\('([^']+)'/gm)) {
      const p = (prefix + m[1]).replace(/\(\\\\d\+\)/g, '').replace(/:(\w+)/g, '1');
      if (p !== '/' && p !== '/foods/' && P.needsFor(p) === null) loose.push(f + ':' + p);
    }
  }
  check('كل راوت تغذية واقع تحت صلاحية', loose.length === 0, loose.join(' ') || 'كلهم');
}

/* ── Mounted once, on the router ───────────────────────────────────────── */
{
  const src = fs.readFileSync(path.join(ROOT, 'src/routes/nutrition_admin.js'), 'utf8');
  check('الحارس مركّب على الراوتر كله مرة واحدة',
    /router\.use\(requireLogin, staffScope\.only\('\/nutrition'\), requirePractice, nutriPerms\.guard\(\)\)/.test(src));
  check('والصلاحيات محسوبة في requirePractice',
    /req\.perms = perms/.test(src) && /res\.locals\.perms = perms/.test(src));
  // The plan and food routers are mounted INSIDE the guarded router, so they
  // inherit it — that is the only reason they are covered.
  check('وراوتر الخطط والأطعمة جوّه الحارس',
    src.indexOf("router.use(requireLogin, staffScope.only('/nutrition')") < src.indexOf("require('./nutrition_plans')"));
  const perms = fs.readFileSync(path.join(ROOT, 'src/nutrition/perms.js'), 'utf8');
  check('الرفض بيشمل POST مش بس GET',
    /req\.method === 'GET'/.test(perms) && /res\.status\(403\)\.send\('403'\)/.test(perms));
}

/* ── The login and the table ───────────────────────────────────────────── */
{
  const company = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
  check('موظف العيادة بيدخل من نفس باب الدخول', /FROM nutrition_staff ns JOIN companies c/.test(company));
  check('ولازم login_enabled', /ns\.login_enabled = true/.test(company));
  check('وجلسته اسمها غير التلاتة التانيين',
    /req\.session\.nutriStaffId = st\.id/.test(company)
    && /s\.nutriStaffId/.test(fs.readFileSync(path.join(ROOT, 'src/nutrition/perms.js'), 'utf8')));
  check('ومايدخلش صفحات المالك', /req\.session\.nutriStaffId\) \{/.test(company));
  check('و/nutrition مقفولة على موظفينها',
    require('../src/lib/staff_scope').areaOf({ nutriStaffId: 1 }) === '/nutrition');

  const schema = fs.readFileSync(path.join(ROOT, 'src/nutrition/schema.js'), 'utf8');
  check('جدول nutrition_staff موجود', /CREATE TABLE IF NOT EXISTS nutrition_staff/.test(schema));
  check('والفهرس جزئي على اسم الدخول',
    /ON nutrition_staff \(lower\(username\)\) WHERE username IS NOT NULL/.test(schema));

  const route = fs.readFileSync(path.join(ROOT, 'src/routes/nutrition_admin.js'), 'utf8');
  check('كل استعلام فريق متقيّد بالشركة',
    (route.match(/FROM nutrition_staff|UPDATE nutrition_staff|DELETE FROM nutrition_staff/g) || []).length ===
    (route.match(/nutrition_staff[\s\S]{0,200}?company_id=\$/g) || []).length);
  check('والدور اللي جاي من الفورم بيتفلتر من القايمة',
    (route.match(/nutriPerms\.ROLE_KEYS\.includes\(b\.perm_role\)/g) || []).length === 2);
  check('وكلمة السر بتتهَش', /bcrypt\.hash\(password, 10\)/.test(route));
  // Handing out or revoking an account is exactly the kind of thing the log exists for.
  check('وإدارة الفريق بتتسجّل في سجل الوصول',
    (route.match(/audit\.log\(pool, req, \{ entity: 'staff'/g) || []).length >= 3);
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
  const file = path.join(VIEWS, 'nutrition_admin/patient.ejs');
  const NOW = new Date('2026-08-14T10:00:00Z');
  const draw = (perms) => ejs.render(fs.readFileSync(file, 'utf8'), {
    company: { id: 1, company_name: 'عيادة', slug: 'demo' },
    lang: 'ar', dir: 'rtl', LOC: 'ar-EG', t, tab: 'patients', perms,
    patient: { id: 12, name: 'مريض', phone: '01000000000', gender: 'male', height_cm: 170, goal: 'lose', birth_date: '1990-01-01', notes: null },
    calc: { ok: true, age: 36, bmr: 1600, tdee: 2200, target: 1900, protein_g: 130, fat_g: 55, carb_g: 200 },
    measurements: [{ id: 1, taken_on: NOW, weight_kg: 88, body_fat_pct: 24, waist_cm: 96, source: 'clinic' }],
    labs: [{ id: 2, title: 'سكر صائم', value: 130, unit: 'mg/dL', taken_on: NOW }],
    plans: [{ id: 3, title: 'خطة يوليو', start_date: NOW, lines: 12, target_kcal: 1900, is_active: true }],
    login: { login: '01000000000', is_active: true, last_login_at: NOW }, newPassword: null,
    portalUrl: 'https://demo.oscardevs.com/portal', settings: {},
    saved: false, err: null, progress: null, series: [],
    activities: require('../src/nutrition/engine').ACTIVITY_KEYS,
    goals: require('../src/nutrition/engine').GOAL_KEYS,
  }, { filename: file, root: VIEWS });

  const owner = draw(P.permsFor({}));
  const assistant = draw(P.permsFor({ nutriStaffId: 2, nutriRole: 'assistant', staffName: 'مساعد' }));
  const reception = draw(P.permsFor({ nutriStaffId: 3, nutriRole: 'reception', staffName: 'استقبال' }));

  check('الأخصائي بيشوف التحليل والخطة', owner.includes('سكر صائم') && owner.includes('خطة يوليو'));
  check('المساعد مايشوفش نتيجة التحليل', !assistant.includes('سكر صائم'));
  check('ولا الخطة الغذائية', !assistant.includes('خطة يوليو'));
  check('ولا زرار التقرير', !/href="\/nutrition\/patients\/12\/report"/.test(assistant));
  check('ولا فورم حساب المريض', !/action="\/nutrition\/patients\/12\/login"/.test(assistant));
  check('بس بيسجّل القياسات', /action="\/nutrition\/patients\/12\/measure"/.test(assistant));
  check('والاستقبال مايسجّلش قياس', !/action="\/nutrition\/patients\/12\/measure"/.test(reception));
  check('بس بيشوف بيانات المريض عشان يحجزله', reception.includes('01000000000'));

  // The nav must not draw doors that will not open.
  check('المساعد مايشوفش لينك الإعدادات ولا الفريق',
    !assistant.includes('href="/nutrition/settings"') && !assistant.includes('href="/nutrition/staff"'));
  check('والأخصائي شايفهم',
    owner.includes('href="/nutrition/settings"') && owner.includes('href="/nutrition/staff"'));

  // The two new screens must draw.
  const denied = path.join(VIEWS, 'nutrition_admin/denied.ejs');
  const d = ejs.render(fs.readFileSync(denied, 'utf8'), {
    company: { id: 1, company_name: 'عيادة', slug: 'demo' }, lang: 'ar', dir: 'rtl', LOC: 'ar-EG', t,
    tab: '', need: 'clinical', perms: P.permsFor({ nutriStaffId: 3, nutriRole: 'reception', staffName: 'استقبال' }),
  }, { filename: denied, root: VIEWS });
  check('صفحة الرفض بترسم وبتقول دوره',
    d.includes(t('nt.staff.denied_title')) && d.includes(t('nt.staff.role.reception')));

  const staffView = path.join(VIEWS, 'nutrition_admin/staff.ejs');
  const sv = ejs.render(fs.readFileSync(staffView, 'utf8'), {
    company: { id: 1, company_name: 'عيادة', slug: 'demo' }, lang: 'ar', dir: 'rtl', LOC: 'ar-EG', t,
    tab: 'staff', perms: P.permsFor({}), roles: P.ROLE_KEYS, ROLES: P.ROLES, saved: false, err: null,
    staff: [{ id: 1, name: 'سارة', username: 'sara', perm_role: 'assistant', phone: '0100', login_enabled: true, is_active: true }],
  }, { filename: staffView, root: VIEWS });
  check('شاشة الفريق بترسم', sv.length > 2000);
  check('وبتوضّح كل دور بيشوف إيه', P.ROLE_KEYS.every((r) => sv.includes(t('nt.staff.role.' + r))));
  check('وكلمة السر مابتترسمش في الصفحة',
    !/type="password"[^>]*value=/.test(sv) && sv.includes(t('nt.staff.pw_keep')));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني مكتب الاستقبال لسه يقدر يفتح تحليل دم.`
  : '\nصلاحيات التغذية: المساعد بيقيس، والتحاليل والخطة على الأخصائي وحده.');
process.exit(fail ? 1 : 0);
