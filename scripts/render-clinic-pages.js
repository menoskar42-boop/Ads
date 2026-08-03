#!/usr/bin/env node
/**
 * Render every clinic back-office page in Arabic and in English and fail on any
 * Arabic that still reaches the English page.
 *
 * A template can look fully translated and still leak: labels that come from JS
 * (module names, status maps, specialty fields) only appear once the page is
 * actually built. Rendering is the only check that catches that class of bug,
 * so each page gets a fixture here rather than being eyeballed once.
 *
 * Usage:
 *   node scripts/render-clinic-pages.js            # all pages with a fixture
 *   node scripts/render-clinic-pages.js dental_viewer patients
 */
'use strict';
const ejs = require('ejs');
const path = require('path');
const { t } = require('../src/i18n/strings');
const { visibleArabic } = require('./check-clinic-i18n');

const VIEWS = path.join(__dirname, '..', 'src', 'views');
const CLINIC = path.join(VIEWS, 'clinic_admin');

// ── Shared fixture pieces ────────────────────────────────────────────────────
const NOW = new Date('2026-08-03T10:00:00Z');
const patient = {
  id: 1, name: 'Ahmed Ali', phone: '01000000000', gender: 'ذكر',
  birth_year: 1990, birth_date: '1990-04-01', address: 'Street 5', notes: '',
};
const doctor = { id: 1, name: 'Dr. Sara', specialty: 'general', is_active: true, sort_order: 0 };
const statusesHV = [
  { key: 'requested', label: 'مطلوبة' }, { key: 'scheduled', label: 'محجوزة' },
  { key: 'on_way', label: 'في الطريق' }, { key: 'done', label: 'تمّت' },
  { key: 'cancelled', label: 'ملغاة' },
];

// Locals every page gets from the app (company, tab, i18n helpers).
function base(lang, tab) {
  return {
    company: { id: 1, name: 'Demo Clinic', slug: 'demo', logo_url: null },
    tab,
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    LOC: lang === 'en' ? 'en-GB' : 'ar-EG',
    t: (k) => t(k, lang),
    modules: {},
  };
}

// ── Per-page fixtures ────────────────────────────────────────────────────────
// Each entry returns the locals that page's route passes to res.render.
const FIXTURES = {
  dental_viewer: () => ({
    tab: 'dental',
    photo: {
      id: 1, patient_id: 1, patient_name: patient.name, kind: 'xray',
      caption: '', image_url: '/uploads/x.jpg',
    },
    shapes: [{ type: 'arrow', x: 0.1, y: 0.1, x2: 0.4, y2: 0.4, color: '#ef4444' }],
  }),

  patients: () => ({ tab: 'patients', patients: [patient], q: '' }),

  dental_patient: () => ({
    tab: 'dental',
    patient,
    doctors: [doctor],
    statuses: [
      { key: 'sound', label: 'سليم', color: '#ffffff' },
      { key: 'caries', label: 'تسوس', color: '#ef4444' },
      { key: 'missing', label: 'مخلوع/مفقود', color: '#111827' },
    ],
    chartMap: { 11: { status: 'caries', surfaces: 'MO' } },
    plan: [{
      id: 1, phase: 1, tooth: '16', procedure: 'RCT', doctor_name: doctor.name,
      status: 'planned', done_at: null, cost: 900,
    }],
    totals: { all: 900, done: 0 },
    photos: [{ id: 1, kind: 'xray', image_url: '/uploads/x.jpg', caption: '', created_at: NOW }],
    upper: [[18, 17, 16, 15, 14, 13, 12, 11], [21, 22, 23, 24, 25, 26, 27, 28]],
    lower: [[48, 47, 46, 45, 44, 43, 42, 41], [31, 32, 33, 34, 35, 36, 37, 38]],
  }),

  dental_perio: () => ({
    tab: 'dental',
    patient,
    doctors: [doctor],
    exams: [{ id: 1, exam_date: '2026-06-01' }, { id: 2, exam_date: '2026-08-01' }],
    current: { id: 2, data: { 11: { pd: [3, 2, 3, 4, 5, 3], bop: [0, 1, 0, 0, 1, 0], rec: 1, mob: 0 } } },
    previous: { id: 1, data: { 11: { pd: [4, 3, 4, 4, 5, 4] } } },
    upper: [[18, 17, 16, 15, 14, 13, 12, 11], [21, 22, 23, 24, 25, 26, 27, 28]],
    lower: [[48, 47, 46, 45, 44, 43, 42, 41], [31, 32, 33, 34, 35, 36, 37, 38]],
  }),

  mod_dental: () => ({
    tab: 'dental',
    orders: [{
      id: 1, patient_id: 1, patient_name: patient.name, work_type: 'crown',
      tooth_numbers: '11,12', shade: 'A2', lab_name: 'Nile Lab',
      due_at: '2026-07-01', cost: 1200, status: 'in_lab',
    }],
    patients: [patient], doctors: [doctor],
    planned: [{ patient_id: 1, patient_name: patient.name, procedure: 'RCT', tooth: '16', phase: 1, cost: 900 }],
    late: [{ patient_name: patient.name, work_type: 'crown' }],
    workTypes: [
      { key: 'crown', label: 'تاج (Crown)' },
      { key: 'other', label: 'أخرى' },
    ],
    labStatuses: [
      { key: 'sent', label: 'اتبعت للمعمل' }, { key: 'in_lab', label: 'تحت التنفيذ' },
      { key: 'received', label: 'وصلت العيادة' }, { key: 'delivered', label: 'اتركّبت للمريض' },
      { key: 'redo', label: 'مرتجعة/إعادة' },
    ],
  }),

  voice_bookings: () => ({
    tab: 'addons',
    state: { used: 3, quota: 50 },
    doctors: [doctor],
    rows: [
      {
        id: 1, status: 'needs_review', created_at: NOW, transcript: 'test',
        parsed: { confidence: 0.6, patient_name: '', phone: '', when_text: 'bukra', doctor_hint: 'Dr. Sara' },
      },
      {
        id: 2, status: 'booked', created_at: NOW, transcript: 'test',
        parsed: { confidence: 0.9, patient_name: patient.name, when_text: 'today' },
      },
      { id: 3, status: 'failed', created_at: NOW, error: 'no audio', parsed: {} },
    ],
  }),

  mod_homevisits: () => ({
    tab: 'homevisits',
    visits: [{
      id: 1, patient_name: patient.name, status: 'requested', doctor_name: doctor.name,
      area: 'Al-Walidiya', scheduled_at: NOW, address: 'Street 5', reason: 'Check-up',
      visit_fee: 100, transport_fee: 50, collected: 0, phone: '01000000000',
    }],
    open: [], doctors: [doctor], patients: [patient],
    statuses: statusesHV, byArea: [{ area: 'Al-Walidiya', n: 3, revenue: 500 }],
  }),
};

// ── Runner ───────────────────────────────────────────────────────────────────
function renderPage(name, lang) {
  const page = FIXTURES[name]();
  const file = path.join(CLINIC, name + '.ejs');
  return ejs.render(
    require('fs').readFileSync(file, 'utf8'),
    Object.assign(base(lang, page.tab), page),
    { filename: file, root: VIEWS }
  );
}

const asked = process.argv.slice(2);
const names = asked.length ? asked : Object.keys(FIXTURES);
let failed = 0;

for (const name of names) {
  if (!FIXTURES[name]) {
    console.log(`⏭️  ${name} — لا يوجد fixture بعد`);
    continue;
  }
  let ar, en;
  try {
    ar = renderPage(name, 'ar');
    en = renderPage(name, 'en');
  } catch (e) {
    failed++;
    console.log(`❌ ${name} — فشل العرض: ${e.message}`);
    continue;
  }
  if (!/[؀-ۿ]/.test(ar)) {
    failed++;
    console.log(`❌ ${name} — الصفحة العربية بلا نص عربي`);
    continue;
  }
  const leaks = visibleArabic(en);
  if (leaks.length) {
    failed++;
    console.log(`❌ ${name} — ${leaks.length} نص عربي في النسخة الإنجليزية:`);
    leaks.slice(0, 12).forEach((s) => console.log('   · ' + s.slice(0, 90)));
  } else {
    console.log(`✅ ${name}`);
  }
}

console.log(failed ? `\n${failed} صفحة فيها مشكلة.` : '\nكل الصفحات المفحوصة نظيفة.');
process.exit(failed ? 1 : 0);
