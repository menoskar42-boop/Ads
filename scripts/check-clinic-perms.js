#!/usr/bin/env node
/**
 * A receptionist could read a diagnosis.
 *
 * Everything in the clinic ran on one login — the owner's — so whoever sat at
 * the front desk had the owner's reach: the full medical file, the invoices,
 * the settings. The external review listed it as the fourth thing to fix before
 * selling to a real clinic, and it is not only the clinic's problem: a
 * receptionist does not *want* to be able to open a diagnosis.
 *
 * What makes this fix worth trusting is where the check lives. Scattering
 * `if (!req.perms.x) return 403` across forty routes gives thirty-nine guarded
 * routes and one everybody forgets — the same shape as the tenant-isolation bug
 * fixed the same day. So permission hangs off a PATH PREFIX and one middleware
 * enforces it, and that is what this asserts: not "route X is guarded" but
 * "anything under this prefix is, including whatever gets added next year".
 *
 *   node scripts/check-clinic-perms.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require('../src/clinic/perms');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The model ─────────────────────────────────────────────────────────── */
check('الأدوار الخمسة موجودة + المالك',
  ['owner', 'manager', 'reception', 'doctor', 'accountant', 'callcenter']
    .every((r) => P.ROLES[r]));
check('المالك بيشوف كل حاجة', Object.values(P.ROLES.owner).every(Boolean));

// The whole point of the feature, stated as three facts.
check('الاستقبال مايشوفش الملف الطبي', P.ROLES.reception.medical === false);
check('مركز الاتصال مايشوفش الملف الطبي', P.ROLES.callcenter.medical === false);
check('المحاسب مايشوفش الملف الطبي', P.ROLES.accountant.medical === false);
check('الاستقبال مايشوفش الفلوس', P.ROLES.reception.finance === false);
check('الطبيب مايشوفش الفلوس ولا الإعدادات',
  P.ROLES.doctor.finance === false && P.ROLES.doctor.settings === false);
check('محدش غير المالك والمدير يدير الموظفين',
  Object.entries(P.ROLES).filter(([, v]) => v.staff).map(([k]) => k).sort().join(',') === 'manager,owner');

/* ── The path map ──────────────────────────────────────────────────────── */
const PATHS = [
  ['/patients', 'patients'],
  ['/patients/12', 'patients'],
  ['/patients/12/vitals', 'medical'],
  ['/patients/12/notes', 'medical'],
  ['/patients/12/prescriptions', 'medical'],
  ['/patients/12/trends', 'medical'],
  ['/invoices', 'finance'],
  ['/invoices/9', 'finance'],
  ['/finance', 'finance'],
  ['/settings', 'settings'],
  ['/audit', 'settings'],
  ['/staff', 'staff'],
  ['/queue', 'schedule'],
  ['/', null],
];
for (const [p, want] of PATHS) {
  check(`${p} → ${want || 'دخول بس'}`, P.needsFor(p) === want, String(P.needsFor(p)));
}

// The medical sub-paths are the reason the patient list and the patient file
// can have different answers, so a new one must not silently be public.
check('كل مسار طبي تحت المريض بيطلب medical',
  P.MEDICAL_SUBPATHS.every((m) => P.needsFor('/patients/7' + m) === 'medical'),
  P.MEDICAL_SUBPATHS.join(' '));

/* ── It is actually mounted, once, on the router ───────────────────────── */
const clinic = fs.readFileSync(path.join(ROOT, 'src/routes/clinic_admin.js'), 'utf8');
check('الحارس مركّب على الراوتر كله مرة واحدة',
  /router\.use\(requireLogin, staffScope\.only\('\/clinic'\), requireClinic, clinicPerms\.guard\(\)\)/.test(clinic));
check('والصلاحيات محسوبة في requireClinic', /req\.perms = perms/.test(clinic)
  && /res\.locals\.perms = perms/.test(clinic));
// A POST must be refused too — a hidden button is not a permission system.
check('الرفض بيشمل POST مش بس GET',
  /req\.method === 'GET'/.test(fs.readFileSync(path.join(ROOT, 'src/clinic/perms.js'), 'utf8'))
  && /res\.status\(403\)\.send\('403'\)/.test(fs.readFileSync(path.join(ROOT, 'src/clinic/perms.js'), 'utf8')));

/* ── The login ─────────────────────────────────────────────────────────── */
const company = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
check('موظف العيادة بيدخل من نفس باب الدخول', /FROM clinic_staff cs JOIN companies c/.test(company));
check('ولازم login_enabled', /cs\.login_enabled = true/.test(company));
check('وكلمة السر بتتقارن بالهاش', /bcrypt\.compare\(password, st\.password_hash\)/.test(company));
// The two staff sessions must not be confused for one another.
check('جلسة موظف العيادة اسمها غير جلسة الصيدلية',
  /req\.session\.clinicStaffId = st\.id/.test(company) && /s\.clinicStaffId/.test(
    fs.readFileSync(path.join(ROOT, 'src/clinic/perms.js'), 'utf8')));
check('وموظف العيادة مايدخلش صفحات المالك', /req\.session\.clinicStaffId\) \{/.test(company));

/* ── The screen actually hides what it must ────────────────────────────── */
let ejs;
try { ejs = require('ejs'); }
catch (e) {
  console.log('⏭️  ejs مش منزّل — نص الفحص ده محتاج node_modules.');
  process.exit(fail ? 1 : 2);
}
{
  // Render the patient file as a receptionist and as the owner. The server
  // refuses the clinical routes either way; this is about not printing the
  // diagnosis onto a page the receptionist IS allowed to open.
  const i18n = require('../src/i18n/strings');
  const t = (k) => i18n.t(k, 'ar');
  const VIEWS = path.join(ROOT, 'src/views');
  const file = path.join(VIEWS, 'clinic_admin/patient_file.ejs');
  const NOW = new Date('2026-08-12T10:00:00Z');
  const draw = (perms) => ejs.render(fs.readFileSync(file, 'utf8'), {
    company: { id: 1, name: 'C', slug: 'demo', logo_url: null },
    tab: 'patients', lang: 'ar', dir: 'rtl', LOC: 'ar-EG', t, modules: {}, perms,
    patient: { id: 12, name: 'مريض', phone: '01000000000', birth_date: null, birth_year: null, gender: 'male', notes: null },
    doctors: [{ id: 1, name: 'د. سارة', specialty: 'general', is_active: true }],
    visitTypes: [], appointments: [],
    visits: [{ id: 1, visit_date: '2026-07-01', doctor_name: 'د. سارة', status: 'done', diagnosis: 'التشخيص السري', notes: '' }],
    vitals: [{ recorded_at: NOW, systolic: 120, diastolic: 80, heart_rate: 72, temperature: 37.1, weight: 72, spo2: 98 }],
    notes: [{ created_at: NOW, doctor_name: 'د. سارة', category: 'general', title: 'ملاحظة', content: 'محتوى الملاحظة الطبية' }],
    prescriptions: [{ created_at: NOW, doctor_name: 'د. سارة', notes: null,
      meds: [{ name: 'دواء سرّي', dose: '1', freq: '2', duration: '5' }] }],
    specVitals: require('../src/clinic/specialties').vitalsFor('general'),
    specExtra: [],
    vitalsLabels: require('../src/clinic/specialties').vitalsLabels(t),
    specialtyLabel: 'ممارسة عامة',
    fmtDT: (d) => String(d), fmtTime: (d) => String(d), fmtDate: (d) => String(d),
    jsonLd: (o) => JSON.stringify(o),
  }, { filename: file, root: VIEWS });

  const owner = draw({ role: 'owner', medical: true, finance: true, schedule: true, patients: true, settings: true, staff: true });
  const recep = draw({ role: 'reception', medical: false, finance: false, schedule: true, patients: true, settings: false, staff: false });

  check('صاحب العيادة بيشوف الملاحظة والروشتة',
    owner.includes('محتوى الملاحظة الطبية') && owner.includes('دواء سرّي'));
  check('الاستقبال مايشوفش الملاحظة الطبية', !recep.includes('محتوى الملاحظة الطبية'));
  check('ولا الروشتة', !recep.includes('دواء سرّي'));
  check('ولا فورم تسجيل العلامات الحيوية', !/action="\/clinic\/patients\/12\/vitals"/.test(recep));
  check('بس بيشوف بيانات المريض عشان يحجزله', recep.includes('01000000000'));
}

/* ── The demo clinic must be reachable, and testable ───────────────────── */
// /admin/demos runs seven seeders with one password. Six of them created a
// login; this one did not — so the clinic demo existed and nobody could get
// into it, which is why the live QA pass had to skip every logged-in test.
{
  const seeder = fs.readFileSync(path.join(ROOT, 'scripts/enable-demo-clinic.js'), 'utf8');
  check('سكربت العيادة التجريبية بيعمل حساب دخول',
    /INSERT INTO company_users \(company_id, email, password_hash\)/.test(seeder));
  check('وإعادة التشغيل بتغيّر كلمة السر فعلاً (مش DO NOTHING)',
    /ON CONFLICT \(email\) DO UPDATE SET password_hash=EXCLUDED\.password_hash/.test(seeder));
  // Without a staff login, "the receptionist cannot read a diagnosis" is a
  // claim nobody can check.
  check('وبيعمل حساب استقبال كمان عشان الصلاحيات تتجرّب',
    /perm_role='reception'/.test(seeder) && /login_enabled=true/.test(seeder));
  // The VALUE, not the word: "no password given" is a fine thing to print.
  check('وكلمة السر مابتتطبعش في اللوج',
    !/console\.log\([^)]*\$\{password\}/.test(seeder) && !/console\.log\(password/.test(seeder));
  check('ومش مكتوبة في الملف', !/password = '[^']+'/.test(seeder));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني موظف الاستقبال لسه يقدر يقرا تشخيص.`
  : '\nصلاحيات العيادة: كل مسار بيطلب صلاحيته، والملف الطبي مقفول على مين مالوش دعوة.');
process.exit(fail ? 1 : 0);
