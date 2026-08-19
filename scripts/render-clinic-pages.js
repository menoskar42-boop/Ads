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
const fs = require('fs');
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
    // Every clinic page is rendered by a login with a role now. The owner is
    // the default here; the restricted view is rendered separately below so a
    // page that only works for an owner is caught.
    perms: { role: 'owner', isStaff: false, name: null,
      medical: true, finance: true, schedule: true, patients: true, settings: true, staff: true },
    // Mirror server.js res.locals.jsonLd so any public tenant view that embeds
    // JSON-LD via jsonLd() renders in this harness with the same \u-escaping.
    jsonLd: (o) => JSON.stringify(o)
      .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'),
  };
}

// The medical-profile locals the dietitian's patient page needs (backlog 84).
function profileFixture(profile, planItems) {
  const safety = require('../src/nutrition/safety');
  const rules = safety.restrictionsOf(profile);
  return {
    dietStyles: Object.keys(safety.DIETS),
    stages: Object.keys(safety.STAGE_KCAL),
    planScan: rules.length
      ? { state: 'checked', hits: safety.scanPlan(planItems || [], profile) }
      : { state: 'no_rules', hits: [] },
  };
}

// The diary locals every portal render needs (backlog 84).
function diaryFixture(ate, todayCheckin) {
  const D = require('../src/nutrition/diary');
  const C = require('../src/nutrition/checkin');
  return {
    todayCheckin: todayCheckin || null,
    checkinMoods: C.MOODS,
    ate,
    ateByMeal: D.byMeal(ate),
    ateTotals: D.dayTotals(ate),
    diaryMeals: D.MEALS,
    foods: [{ id: 1, name: 'Boiled egg', serving_desc: '1 egg', serving_g: 50 }],
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

  denied: () => ({ tab: '', need: 'medical',
    perms: { role: 'reception', isStaff: true, medical: false, finance: false,
      schedule: true, patients: true, settings: false, staff: false } }),

  // The public clinic page — the only one visitors see, so it is checked in
  // both languages too, and its <title> is length-checked below.
  tenant_clinic: (lang) => ({
    __file: 'tenant_clinic.ejs', __public: true,
    company: {
      id: 1, slug: 'demo', company_name: 'Demo Clinic', logo_url: null,
      description: 'A demo clinic used to check the public page renders.',
    },
    clinicSettings: {
      specialty: 'dentistry', about: 'About the clinic.', address: 'Street 5, Assiut',
      phone: '0882000000', whatsapp: '201000000000', hours: 'Sat–Thu 4pm–10pm',
      booking_enabled: true, map_lat: null, map_lng: null,
    },
    clinicSpecialtyLabel: require('../src/clinic/specialties').labelFor('dentistry', (k) => t(k, lang)),
    clinicDoctors: [{
      id: 1, slug: 'sara', name: 'Dr. Sara', title: 'Consultant',
      specialty: 'Orthodontics', bio: 'Ten years of practice.', photo_url: '', fee: 300,
    }],
    canonicalCompanyUrl: (slug) => 'https://' + slug + '.oscardevs.com/',
    noindex: false, sent: false, contactError: false,
    showAds: false,
    siteOrigin: 'https://demo.oscardevs.com',
  }),

  tenant_clinic_doctor: () => ({
    __file: 'tenant_clinic_doctor.ejs', __public: true,
    company: { id: 1, slug: 'demo', company_name: 'Demo Clinic', logo_url: null, description: '' },
    doctor: {
      id: 1, slug: 'sara', name: 'Dr. Sara', title: 'Consultant', specialty: 'Orthodontics',
      bio: 'Ten years of practice in orthodontics, with a focus on paediatric cases.',
      photo_url: '', fee: 300, schedule: 'Sat-Thu 4pm-10pm',
    },
    clinicSettings: { whatsapp: '201000000000', booking_enabled: true },
    clinicDoctors: [{ id: 1, slug: 'sara', name: 'Dr. Sara', specialty: 'Orthodontics' }],
    canonicalCompanyUrl: (slug) => 'https://' + slug + '.oscardevs.com/',
    noindex: false, sent: false, showAds: false,
    siteOrigin: 'https://demo.oscardevs.com',
  }),

  // Furniture system shell. Included here so the new vertical is held to the
  // same bilingual standard from its first commit rather than retro-fitted.
  furniture_dashboard: (lang) => {
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    return {
      __file: 'furniture_admin/dashboard.ejs',
      tab: 'dashboard',
      settings: { currency: 'EGP', tax_percent: 0, theme: 'light', delivery_policy: 'prepaid' },
      d: {
        from: '2026-08-01', to: '2026-08-03',
        period: { invoiced: 51300, collected: 12000, received: 5010, payroll: 3400, expenses: 8250,
          returned: 0, refunded: 0, fees: 350, feesPaid: 350, netInvoiced: 51650, difference: 34990 },
        cash: { in: 12000, out: 11650, balance: 350 },
        stock: { value: 41200, lowCount: 1, low: [] },
        owedByCustomers: 41300, owedToSuppliers: 1200, openOrders: 2, lateDeliveries: 1,
      },
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_settings: (lang) => {
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    const L = fl.localized(fl.FLAGS, (k) => t(k, lang));
    return {
      __file: 'furniture_admin/settings.ejs',
      tab: 'settings',
      settings: { business_name: 'Demo Furniture', currency: 'EGP', tax_percent: 14, theme: 'light' },
      allFlags: L, flags, furnitureNav: L.filter((f) => flags.has(f.key)),
      saved: true,
    };
  },

  // One master-data screen per entity: materials exercises the numeric fields,
  // the low-stock badge and the opening-balance hint; workers exercises the
  // pick field, which is where an untranslated choice would show up.
  furniture_materials: (lang) => {
    const m = require('../src/furniture/master');
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    return {
      __file: 'furniture_admin/master.ejs',
      tab: 'master', entity: 'materials', spec: m.ENTITIES.materials,
      rows: [
        { id: 1, name: 'Oak 18mm', unit: 'metre', qty: 4, min_qty: 10, last_purchase_price: 320 },
        { id: 2, name: 'Lacquer', unit: 'litre', qty: 40, min_qty: 5, last_purchase_price: 180 },
      ],
      edit: null, q: '', showArchived: false, counts: { active: 2, archived: 1 },
      err: null, saved: true,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_workers: (lang) => {
    const m = require('../src/furniture/master');
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    return {
      __file: 'furniture_admin/master.ejs',
      tab: 'master', entity: 'workers', spec: m.ENTITIES.workers,
      rows: [{ id: 1, name: 'Sayed', job_title: 'Carpenter', phone: '01000000000', pay_type: 'piece', pay_rate: 250 }],
      // The edit form is rendered too, so its labels and the pick options are
      // checked in both languages rather than only the table.
      edit: { id: 1, name: 'Sayed', job_title: 'Carpenter', phone: '01000000000', pay_type: 'piece', pay_rate: 250 },
      q: '', showArchived: true, counts: { active: 1, archived: 0 },
      err: 'in_use', saved: false,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  // القطع: بتعرض خانات المقاس والخامة (البند ٨٦) ولينك الخيارات، والقطعة
  // اللي مقاسها مش متسجّل بتتعرض من غير ما تدّعي مقاس.
  furniture_products: (lang) => {
    const m = require('../src/furniture/master');
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    return {
      __file: 'furniture_admin/master.ejs',
      tab: 'master', entity: 'products', spec: m.ENTITIES.products,
      rows: [
        { id: 1, name: 'Classic bedroom', code: 'BR-1', category: 'Bedrooms', selling_price: 42000,
          estimated_cost: 26000, warranty_months: 12, notes: null, image_path: null,
          width_cm: 180, depth_cm: 90, height_cm: 220, material: 'Beech', finish: 'Lacquer' },
        { id: 2, name: 'Dining table', code: null, category: null, selling_price: 0,
          estimated_cost: 0, warranty_months: 0, notes: null, image_path: '/uploads/x.jpg',
          width_cm: null, depth_cm: null, height_cm: null, material: null, finish: null },
      ],
      edit: { id: 1, name: 'Classic bedroom', code: 'BR-1', category: 'Bedrooms', selling_price: 42000,
        estimated_cost: 26000, warranty_months: 12, notes: null,
        width_cm: 180, depth_cm: 90, height_cm: 220, material: 'Beech', finish: 'Lacquer' },
      q: '', showArchived: false, counts: { active: 2, archived: 0 },
      err: 'spec', saved: false,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  // شاشة الخيارات: الأساسي أول السطر، وخيار متأرشف، وقطعة مالهاش مقاسات.
  furniture_variants: (lang) => {
    const m = require('../src/furniture/master');
    const V = require('../src/furniture/variants');
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    const product = { id: 1, name: 'Classic bedroom', selling_price: 42000,
      width_cm: 180, depth_cm: null, height_cm: 220, material: 'Beech', finish: null };
    const variants = [
      { id: 7, product_id: 1, name: 'Beech', code: 'BR-1-B', price_delta: 6000, is_active: true },
      { id: 8, product_id: 1, name: 'No marble top', code: null, price_delta: -2500, is_active: true },
      { id: 9, product_id: 1, name: 'Old finish', code: null, price_delta: 0, is_active: false },
    ];
    return {
      __file: 'furniture_admin/variants.ejs',
      tab: 'master', entity: 'products', spec: m.ENTITIES.products,
      product, variants, specs: V.specLines(product), options: V.optionsFor(product, variants),
      err: null, saved: true,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  // لوحة التصنيع: أمر متأخر، وأمر من غير ميعاد، وأمر خلص من غير صرف خامات —
  // التلات حالات اللي الشاشة لازم تفرّق بينهم بالكلام مش باللون بس.
  furniture_production: (lang) => {
    const P = require('../src/furniture/production');
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master', 'production']);
    const rows = [
      { id: 3, product_name: 'Classic bedroom', variant_name: 'Beech', qty: 2, status: 'queued',
        due_date: '2026-07-01', materials_issued_at: null, sale_no: 12, customer_name: 'Mohamed A.', note: null },
      { id: 4, product_name: 'Dining table', variant_name: null, qty: 1, status: 'in_progress',
        due_date: null, materials_issued_at: '2026-08-10T09:00:00Z', sale_no: null, customer_name: null, note: 'Rush job' },
      { id: 5, product_name: 'Wardrobe', variant_name: null, qty: 1, status: 'done',
        due_date: '2026-08-25', materials_issued_at: null, sale_no: null, customer_name: null, note: null },
    ];
    const today = '2026-08-19';
    return {
      __file: 'furniture_admin/production.ejs', tab: 'production',
      orders: rows.map((o) => ({ ...o, late: P.lateOf(o, today), notes: P.notesFor(o) })),
      view: 'open', today, tally: P.tally(rows, today),
      products: [{ id: 1, name: 'Classic bedroom', selling_price: 42000 }],
      sales: [{ id: 12, sale_date: '2026-08-01', customer_name: 'Mohamed A.' }],
      err: 'short', shortName: 'Beech 18mm', saved: false,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_purchases: (lang) => {
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    return {
      __file: 'furniture_admin/purchases.ejs',
      tab: 'purchases',
      orders: [
        { id: 1, supplier_name: 'Nile Timber', order_date: '2026-07-01', expected_delivery: '2026-07-10',
          status: 'partial', ordered_value: 3500, received_value: 1700 },
        { id: 2, supplier_name: null, order_date: '2026-08-01', expected_delivery: null,
          status: 'cancelled', ordered_value: 900, received_value: 0 },
      ],
      suppliers: [{ id: 1, name: 'Nile Timber' }],
      materials: [{ id: 1, name: 'Oak 18mm', unit: 'metre' }],
      balances: [{ id: 1, name: 'Nile Timber', received: 1700, paid: 500, balance: 1200 }],
      status: null, statuses: require('../src/furniture/purchasing').STATUSES,
      err: 'no_lines', saved: false,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_purchase_detail: (lang) => {
    const fl = require('../src/furniture/flags');
    const pu = require('../src/furniture/purchasing');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    const items = [
      { id: 11, material_name: 'Oak 18mm', unit: 'metre', qty: 10, qty_received: 4, unit_cost: 300 },
      { id: 12, material_name: 'Lacquer', unit: 'litre', qty: 5, qty_received: 5, unit_cost: 100 },
    ];
    return {
      __file: 'furniture_admin/purchase_detail.ejs',
      tab: 'purchases',
      po: { id: 1, supplier_id: 1, supplier_name: 'Nile Timber', order_date: '2026-07-01',
        expected_delivery: '2026-07-10', status: 'partial' },
      items, payments: [{ pay_date: '2026-07-15', amount: 500, note: 'deposit' }],
      totals: pu.orderTotals(items),
      err: 'has_received', saved: false,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_sales: (lang) => {
    const fl = require('../src/furniture/flags');
    // التصنيع مفتوح في الحالة دي عشان بلوك «أوامر تصنيع مع الفاتورة» يتعرض —
    // الجزء اللي ورا علم قسم مقفول مابيتفحصش لو ماحدش فتحه في الاختبار.
    const flags = new Set([...fl.DEFAULT_ON, 'master', 'production']);
    return {
      __file: 'furniture_admin/sales.ejs', tab: 'sales',
      sales: [
        { id: 1, customer_name: 'Mohamed A.', sale_date: '2026-07-20', total: 51300, paid: 10000, status: 'open' },
        { id: 2, customer_name: null, sale_date: '2026-06-01', total: 9000, paid: 9000, status: 'paid' },
      ],
      customers: [{ id: 1, name: 'Mohamed A.' }],
      products: [{ id: 1, name: 'Classic bedroom', selling_price: 42000 }],
      // خيارات القطعة بأسعارها — محسوبة زي ما الراوت بيحسبها بالظبط، مش
      // مكتوبة بالإيد، عشان لو الحساب اتغيّر الشاشة تتعرض بالجديد.
      variantMap: {
        1: require('../src/furniture/variants').optionsFor(
          { selling_price: 42000 },
          [{ id: 7, name: 'زان', price_delta: 6000, is_active: true },
            { id: 8, name: 'بدون رخامة', price_delta: -2500, is_active: true }]
        ),
      },
      // One customer in credit, so the credit wording is exercised too.
      balances: [
        { id: 1, name: 'Mohamed A.', invoiced: 51300, paid: 10000, balance: 41300 },
        { id: 2, name: 'Nile Furnishings', invoiced: 0, paid: 5000, balance: -5000 },
      ],
      taxPercent: 14, status: null, err: 'no_lines', saved: false,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_sale_detail: (lang) => {
    const fl = require('../src/furniture/flags');
    const S = require('../src/furniture/sales');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    const sale = { id: 1, customer_id: 1, customer_name: 'Mohamed A.', sale_date: '2026-07-20',
      subtotal: 45000, tax: 6300, total: 51300, paid: 10000, status: 'open' };
    return {
      __file: 'furniture_admin/sale_detail.ejs', tab: 'sales',
      sale,
      items: [{ id: 1, product_name: 'Classic bedroom', qty: 1, unit_price: 42000, total: 42000 }],
      payments: [{ pay_date: '2026-07-20', amount: 10000, method: 'cash', note: 'deposit' }],
      deliveries: [
        { id: 1, kind: 'delivery', status: 'done', scheduled_date: '2026-07-25', crew: 'Sayed + van 2' },
        { id: 2, kind: 'install', status: 'failed', scheduled_date: '2026-07-26', crew: null },
      ],
      warranties: [
        { id: 1, product_name: 'Classic bedroom', months: 24, state: 'active', expiresOn: '2028-07-25' },
        { id: 2, product_name: 'Side table', months: 12, state: 'not_started', expiresOn: null },
      ],
      due: S.dueOf(sale), err: 'has_paid', saved: false,
      // اللينك متعمول هنا عشان الشكل التاني (زرار «اعمل لينك») يتعرض في
      // الشاشة التانية — الحالتين مختلفتين في الكلام مش في اللون.
      trackUrl: 'https://oscardevs.com/track/' + 'a'.repeat(64),
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_statement: (lang) => {
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    return {
      __file: 'furniture_admin/statement.ejs', tab: 'sales',
      customer: { id: 1, name: 'Mohamed A.', phone: '01000000010' },
      invoices: [{ id: 1, sale_date: '2026-07-20', total: 51300, paid: 10000, status: 'open' }],
      // One payment on account (no invoice), which the statement labels distinctly.
      payments: [
        { id: 1, sale_id: 1, amount: 10000, pay_date: '2026-07-20', method: 'cash' },
        { id: 2, sale_id: null, amount: 2000, pay_date: '2026-08-01', method: 'transfer' },
      ],
      returns: [{ id: 1, sale_id: 1, return_date: '2026-08-05', total: 4000, refunded: 1500, reason: null }],
      totals: { invoiced: 51300, paid: 12000, credited: 4000, refunded: 1500,
        fees: 350, feesPaid: 0, balance: 37150 },
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_returns: (lang) => {
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    return {
      __file: 'furniture_admin/returns.ejs', tab: 'returns',
      returns: [
        { id: 1, customer_name: 'Mohamed A.', return_date: '2026-08-05', total: 4000, refunded: 1500 },
        { id: 2, customer_name: null, return_date: '2026-07-02', total: 900, refunded: 900 },
      ],
      sales: [{ id: 1, sale_date: '2026-07-20', total: 51300, customer_name: 'Mohamed A.' }],
      customers: [{ id: 1, name: 'Mohamed A.' }],
      products: [{ id: 1, name: 'Classic bedroom', selling_price: 42000 }],
      err: 'over_return', saved: false,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_return_detail: (lang) => {
    const fl = require('../src/furniture/flags');
    const RT = require('../src/furniture/returns');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    const ret = { id: 1, sale_id: 1, customer_id: 1, customer_name: 'Mohamed A.',
      return_date: '2026-08-05', total: 4000, refunded: 1500, reason: 'Damaged in transit', note: null };
    return {
      __file: 'furniture_admin/return_detail.ejs', tab: 'returns',
      ret,
      items: [{ id: 1, product_name: 'Classic bedroom', qty: 1, unit_price: 4000, total: 4000 }],
      outstanding: RT.outstandingRefund(ret),
      err: 'refund', saved: false,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_delivery: (lang) => {
    const fl = require('../src/furniture/flags');
    const D = require('../src/furniture/delivery');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    const policy = 'prepaid';
    const jobs = [
        // One overdue with money still to collect, one failed trip, one clean
        // install — the three states whose wording is easiest to get wrong.
        // Overdue, unpaid and charged a fee: the blocked-dispatch wording.
        { id: 1, kind: 'delivery', status: 'scheduled', scheduled_date: '2020-01-01', slot: 'morning',
          customer_name: 'Mohamed A.', sale_id: 1, sale_total: 51300, sale_paid: 10000,
          address: '12 Gomhoria St', phone: '01000000010', crew: 'Sayed + van 2', note: null,
          fee: 350, fee_paid: 0 },
        { id: 2, kind: 'install', status: 'failed', scheduled_date: '2026-08-02', slot: 'evening',
          customer_name: 'Nile Furnishings', sale_id: null, sale_total: null, sale_paid: null,
          address: null, phone: null, crew: null, note: 'Lift too small', fee: 0, fee_paid: 0 },
        // Fee charged and settled, invoice settled: the "cleared to go" wording.
        { id: 3, kind: 'install', status: 'out', scheduled_date: '2030-01-01', slot: null,
          customer_name: null, sale_id: null, sale_total: null, sale_paid: null,
          address: null, phone: null, crew: null, note: null, fee: 200, fee_paid: 200 },
    ];
    return {
      __file: 'furniture_admin/delivery.ejs', tab: 'delivery',
      view: 'open', today: D.today(), policy,
      tally: { open: 3, today: 1, late: 1, fees_due: 350 },
      jobs,
      // Built by the same engine the route uses, so the fixture cannot drift
      // from the rule it is there to exercise.
      dispatch: Object.fromEntries(jobs.map((j) => [j.id, D.dispatchCheck(j, policy)])),
      sales: [{ id: 1, sale_date: '2026-07-20', total: 51300, customer_name: 'Mohamed A.' }],
      customers: [{ id: 1, name: 'Mohamed A.' }],
      err: 'unpaid', saved: false,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_warranty: (lang) => {
    const fl = require('../src/furniture/flags');
    const W = require('../src/furniture/warranty');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    const TODAY = '2026-08-03';
    const raw = [
      { id: 1, sale_id: 1, customer_name: 'Mohamed A.', product_name: 'Classic bedroom', months: 24, starts_on: '2026-05-01' },
      // Inside the 30-day window, so the "expiring soon" wording renders.
      { id: 2, sale_id: 2, customer_name: 'Nile Furnishings', product_name: 'Dining set', months: 12, starts_on: '2025-08-20' },
      { id: 3, sale_id: 3, customer_name: null, product_name: 'Side table', months: 6, starts_on: '2025-01-01' },
      // Sold but not delivered: the inline start form renders instead of a date.
      { id: 4, sale_id: 4, customer_name: 'Mohamed A.', product_name: 'Wardrobe', months: 24, starts_on: null },
    ];
    // Decorated by the same function the route uses, so the fixture cannot
    // drift from the rule it exists to exercise.
    const rows = raw.map((r) => ({ ...r, ...W.statusOf(r, TODAY) }));
    return {
      __file: 'furniture_admin/warranty.ejs', tab: 'warranty',
      view: 'all', views: ['all', 'active', 'expiring', 'expired', 'not_started'],
      rows, total: rows.length,
      tally: rows.reduce((a, x) => { a[x.state] = (a[x.state] || 0) + 1; return a; }, {}),
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  // The public showroom page — the only furniture page visitors see, so it is
  // held to the SEO rules (title <= 60, description 70-160, one h1).
  tenant_furniture: () => ({
    __file: 'tenant_furniture.ejs', __public: true,
    company: { id: 1, slug: 'demo-furniture', company_name: 'Mobilia Assiut', logo_url: null,
      description: 'A demo furniture showroom and workshop used to check the public page renders.' },
    furnitureSettings: {
      business_name: 'Mobilia Assiut', address: '5 Adly St, Assiut',
      phone: '0882000000', whatsapp: '201000000000', currency: 'EGP',
    },
    // One priced, one unpriced, one with no photo: the three states the
    // catalogue has to render without inventing a number.
    furnitureProducts: [
      { id: 1, name: 'Classic bedroom', category: 'Bedrooms', selling_price: 42000, notes: 'Solid beech, hand-finished.', image_path: '/uploads/a.jpg' },
      { id: 2, name: 'Dining set for eight', category: 'Dining', selling_price: 0, notes: null, image_path: '/uploads/b.jpg' },
      { id: 3, name: 'Wardrobe, made to measure', category: null, selling_price: 18500, notes: null, image_path: null },
    ],
    canonicalCompanyUrl: (slug) => 'https://' + slug + '.oscardevs.com/',
    noindex: false, showAds: false,
    siteOrigin: 'https://demo-furniture.oscardevs.com',
  }),

  // صفحة متابعة الطلب (العامة، بالتوكن): بتتعرض باللغتين زي أي صفحة بيشوفها
  // زبون، والحالة اللي أهم من غيرها هنا هي «التصنيع مش متتبّع» — لازم تبان
  // جملة، مش علامة رمادية بس.
  furniture_track: () => {
    const T = require('../src/furniture/tracking');
    const sale = { id: 41, sale_date: '2026-08-01', total: 51300, paid: 10000,
      company_name: 'Mobilia Assiut', company_slug: 'demo-furniture' };
    const deliveries = [
      { id: 2, status: 'failed', scheduled_date: '2026-08-14', done_at: null, receipt_code: null, receipt_confirmed_at: null, receipt_method: null },
      { id: 3, status: 'scheduled', scheduled_date: '2026-08-22', done_at: null, receipt_code: '408215', receipt_confirmed_at: null, receipt_method: null },
    ];
    return {
      // مش `__public`: الصفحة دي بيشوفها زبون، بس هي `noindex` بقرار — بيانات
      // طلب شخص واحد. تدقيق الميتا مبني على «بتتأرشف» مش على «بيشوفها ناس»،
      // وفحص تسريب العربي في النسخة الإنجليزية بيمشي عليها زي أي صفحة.
      __file: 'furniture_track.ejs',
      found: true, sale,
      items: [{ product_name: 'Classic bedroom', variant_name: 'Beech', qty: 1 }],
      steps: T.timelineFor({ sale, production: [], deliveries }),
      money: T.moneyFor(sale),
      code: T.activeCodeOf(deliveries),
      noindex: true, showAds: false,
      siteOrigin: 'https://demo-furniture.oscardevs.com',
    };
  },

  // ── Nutrition practice ─────────────────────────────────────────────────────
  nutrition_dashboard: () => ({
    __file: 'nutrition_admin/dashboard.ejs', tab: 'dashboard',
    tally: { active: 12, archived: 3 },
    lapsed: [{ id: 1, name: 'Mona S.', last_seen: '2026-05-01' }],
    never: [{ id: 2, name: 'Karim H.' }],
    total: 12,
  }),

  // شاشة المواعيد (البند ٨٤): يوم فيه خانة محجوزة وخانة فاضية، وحجز متأكّد
  // وحجز مستني وحجز ملغي — التلات حالات بكلامهم مش بلونهم بس.
  nutrition_appointments: () => {
    const NB = require('../src/nutrition/booking');
    const cfg = NB.settingsFrom({});
    const now = new Date('2026-08-19T09:00:00Z');
    const at = NB.slotAt('2026-08-20', '17:30');
    const rows = [
      { id: 1, patient_name: 'Mona S.', patient_phone: '01000000000', slot_at: at,
        note: 'First session', status: 'pending', patient_file_name: null },
      { id: 2, patient_name: 'Karim H.', patient_phone: '01111111111', slot_at: NB.slotAt('2026-08-20', '18:15'),
        note: null, status: 'confirmed', patient_file_name: 'Karim H.' },
      { id: 3, patient_name: 'Sara A.', patient_phone: '01222222222', slot_at: NB.slotAt('2026-08-22', '16:00'),
        note: null, status: 'cancelled', patient_file_name: null },
    ];
    return {
      __file: 'nutrition_admin/appointments.ejs', tab: 'appointments',
      settings: {}, cfg, today: NB.cairoDate(now),
      days: NB.daysAhead(cfg, rows, now, 7),
      rows: rows.map((r) => ({ ...r, ymd: NB.cairoDate(r.slot_at), hm: NB.hhmm(NB.cairoMinutes(r.slot_at)) })),
      err: 'taken', saved: false,
    };
  },

  nutrition_patients: () => {
    const E = require('../src/nutrition/engine');
    return {
      __file: 'nutrition_admin/patients.ejs', tab: 'patients',
      // Three engagement states (backlog 84): logging, gone quiet, never
      // started. The last two are the only reason this column exists.
      rows: [
        { id: 1, name: 'Mona S.', phone: '01000000010', goal: 'loss', last_weight: 84.2, last_seen: '2026-07-20',
          engagement: { state: 'active', days: 1 } },
        { id: 2, name: 'Karim H.', phone: null, goal: 'gain', last_weight: null, last_seen: null,
          engagement: { state: 'never', days: null } },
        { id: 3, name: 'Hoda A.', phone: null, goal: 'maintain', last_weight: 70, last_seen: '2026-07-01',
          engagement: { state: 'stale', days: 21 } },
      ],
      tally: { active: 12, archived: 3 }, archived: false, q: '',
      activities: E.ACTIVITY_KEYS, goals: E.GOAL_KEYS,
      saved: true, err: 'required',
    };
  },

  nutrition_patient: () => {
    const E = require('../src/nutrition/engine');
    const P = require('../src/nutrition/practice');
    const patient = {
      id: 1, name: 'Mona S.', phone: '01000000010', gender: 'female',
      birth_date: '1992-03-15', height_cm: 165, activity: 'moderate', goal: 'loss',
      protein_per_kg: null, fat_percent: null, target_weight_kg: 72, notes: '',
      allergies: 'peanut, nuts', avoid_foods: '', conditions: 'PCOS',
      medications: '', diet_style: 'vegetarian', stage: 'none', budget: '',
    };
    const measurements = [
      { id: 3, taken_on: '2026-07-20', weight_kg: 84.2, body_fat_pct: 33.1, waist_cm: 92, source: 'clinic' },
      { id: 2, taken_on: '2026-06-20', weight_kg: 86.0, body_fat_pct: null, waist_cm: null, source: 'patient' },
      { id: 1, taken_on: '2026-05-20', weight_kg: 88.5, body_fat_pct: 35.0, waist_cm: 96, source: 'clinic' },
    ];
    const series = measurements.slice().reverse()
      .map((m) => ({ on: String(m.taken_on), kg: Number(m.weight_kg) }));
    return {
      __file: 'nutrition_admin/patient.ejs', tab: 'patients',
      patient, measurements, series,
      labs: [{ id: 1, taken_on: '2026-07-01', title: 'Vitamin D', value: '18', unit: 'ng/mL' }],
      plans: [], login: { id: 1, login: '01000000010', is_active: true, last_login_at: '2026-08-01T09:00:00Z' },
      newPassword: 'Kd8fQ2xR', portalUrl: 'https://nutrio.oscardevs.com/portal',
      // The real engine, so a change to the calculation cannot silently pass
      // this check with a hand-written result that no longer matches.
      calc: E.compute(patient, measurements[0], { protein_per_kg: 1.8, fat_percent: 25 }),
      latest: measurements[0],
      progress: P.progress(series, patient.target_weight_kg),
      activities: E.ACTIVITY_KEYS, goals: E.GOAL_KEYS,
      // The medical profile (backlog 84), with a plan that clashes with it —
      // the state the screen exists to show.
      ...profileFixture({ allergies: 'peanut, nuts', diet_style: 'vegetarian' }, [
        { id: 1, name: 'Peanut butter toast' }, { id: 2, name: 'Oats with milk' },
      ]),
      saved: false, err: 'empty',
    };
  },

  // The same patient with almost nothing on file: the branch that has to say
  // WHICH inputs are missing rather than printing a dash.
  nutrition_patient_incomplete: () => {
    const E = require('../src/nutrition/engine');
    const patient = { id: 2, name: 'Karim H.', gender: null, birth_date: null,
      height_cm: null, activity: 'light', goal: 'gain', notes: '' };
    return {
      __file: 'nutrition_admin/patient.ejs', tab: 'patients',
      patient, measurements: [], series: [], labs: [], plans: [], login: null,
      newPassword: null, portalUrl: 'https://nutrio.oscardevs.com/portal',
      calc: E.compute(patient, null, {}), latest: null, progress: null,
      activities: E.ACTIVITY_KEYS, goals: E.GOAL_KEYS,
      // Nothing recorded to check against: the screen must say that, not draw
      // a green tick over an unchecked plan.
      ...profileFixture({}, []),
      saved: false, err: null,
    };
  },

  nutrition_foods: () => ({
    __file: 'nutrition_admin/foods.ejs', tab: 'foods',
    rows: [
      { id: 1, name: 'Cooked white rice', kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, category: 'grain', serving_g: 100, serving_desc: null },
      { id: 2, name: 'Grilled chicken breast', kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, category: 'protein', serving_g: 150, serving_desc: null },
    ],
    tally: { active: 22, archived: 1 }, edit: null, q: '', archived: false,
    saved: true, err: 'not_empty',
  }),

  // The empty state, which is the only place the starter-list offer renders.
  nutrition_foods_empty: () => ({
    __file: 'nutrition_admin/foods.ejs', tab: 'foods',
    rows: [], tally: { active: 0, archived: 0 }, edit: null, q: '', archived: false,
    saved: false, err: null,
  }),

  nutrition_plan: () => {
    const E = require('../src/nutrition/engine');
    const items = [
      { id: 1, meal: 'breakfast', food_name: 'Boiled egg', grams: 100, kcal: 155, protein_g: 13, carbs_g: 1.1, fat_g: 11, note: null },
      { id: 2, meal: 'breakfast', food_name: 'Baladi bread', grams: 60, kcal: 165, protein_g: 5.7, carbs_g: 33, fat_g: 1, note: null },
      { id: 3, meal: 'lunch', food_name: 'Grilled chicken breast', grams: 200, kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7.2, note: null },
      { id: 4, meal: 'lunch', food_name: 'Cooked white rice', grams: 150, kcal: 195, protein_g: 4.1, carbs_g: 42, fat_g: 0.5, note: null },
    ];
    const byMeal = {};
    E.MEALS.forEach((m) => { byMeal[m] = items.filter((i) => i.meal === m); });
    return {
      __file: 'nutrition_admin/plan.ejs', tab: 'patients',
      plan: { id: 1, pid: 1, patient_name: 'Mona S.', title: 'August plan',
        target_kcal: 1650, target_protein: 152, target_carbs: 132, target_fat: 46,
        start_date: '2026-08-01', is_active: true, notes: 'Water 2L a day.' },
      items, foods: [
        { id: 1, name: 'Cooked white rice', kcal: 130, serving_g: 150 },
        { id: 2, name: 'Grilled chicken breast', kcal: 165, serving_g: 200 },
      ],
      meals: E.MEALS, byMeal,
      // Real engine totals, so a change to the arithmetic cannot pass this
      // check against a hand-written figure that no longer matches.
      mealTotals: Object.fromEntries(E.MEALS.map((m) => [m, E.totals(byMeal[m])])),
      dayTotals: E.totals(items),
      // Substitutes, the shopping list and the profile clash (backlog 84) —
      // real functions, so a change to any of them shows up here.
      ...(function () {
        const SW = require('../src/nutrition/swaps');
        const SF = require('../src/nutrition/safety');
        const patient = { allergies: 'peanut', diet_style: 'none' };
        const foods = [
          { id: 1, name: 'Cooked white rice', kcal: 130, protein_g: 2.7, category: 'grain' },
          { id: 2, name: 'Grilled chicken breast', kcal: 165, protein_g: 31, category: 'protein' },
          { id: 3, name: 'Peanut butter', kcal: 588, protein_g: 25, category: 'protein' },
          // No energy figure: cannot be scaled, so it must not be offered.
          { id: 4, name: 'Mystery item', kcal: 0, protein_g: 0, category: null },
        ];
        const swapsByItem = {};
        for (const it of items) swapsByItem[it.id] = SW.candidates(it, foods, patient, { limit: 4 });
        return {
          swapsByItem,
          clashes: SF.scanPlan(items, patient),
          // One line with no weight, so the "not everything is in this list"
          // branch renders.
          shopping: SW.shoppingList(items.concat([{ food_name: '', grams: 0 }]), 7),
          shoppingDays: 7,
        };
      })(),
      saved: false, err: 'line',
    };
  },

  // The public practice page — the only nutrition page visitors see, so it is
  // held to the SEO rules (title <= 60, description 70-160, one h1).
  tenant_nutrition: () => ({
    __file: 'tenant_nutrition.ejs', __public: true,
    company: { id: 1, slug: 'nutrio', company_name: 'Nutrio Clinic', logo_url: null,
      description: 'A demo nutrition practice used to check the public page renders.' },
    nutritionSettings: {
      practice_name: 'Nutrio Clinic', about: 'Clinical nutrition follow-up for adults, with plans built on measurement rather than guesswork.',
      address: '5 Adly St, Assiut', phone: '0882000000', whatsapp: '201000000000',
      hours: 'Sat-Thu 4pm-10pm', booking_enabled: true,
    },
    canonicalCompanyUrl: (slug) => 'https://' + slug + '.oscardevs.com/',
    noindex: false, showAds: false,
    siteOrigin: 'https://nutrio.oscardevs.com',
  }),

  nutrition_report: () => {
    const E = require('../src/nutrition/engine');
    const P = require('../src/nutrition/practice');
    const patient = {
      id: 1, name: 'Mona S.', phone: '01000000010', gender: 'female',
      birth_date: '1992-03-15', height_cm: 165, activity: 'moderate', goal: 'loss',
      protein_per_kg: null, fat_percent: null, target_weight_kg: 72, notes: '',
    };
    const measurements = [
      { id: 3, taken_on: '2026-07-20', weight_kg: 84.2 },
      { id: 2, taken_on: '2026-06-20', weight_kg: 86.0 },
      { id: 1, taken_on: '2026-05-20', weight_kg: 88.5 },
    ];
    const series = measurements.slice().reverse()
      .map((m) => ({ on: String(m.taken_on), kg: Number(m.weight_kg) }));
    const items = [
      { id: 1, meal: 'breakfast', food_name: 'Boiled egg', grams: 100, kcal: 155, protein_g: 13, carbs_g: 1.1, fat_g: 11, note: null },
      { id: 2, meal: 'lunch', food_name: 'Grilled chicken breast', grams: 200, kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7.2, note: 'no skin' },
    ];
    const byMeal = {};
    E.MEALS.forEach((m) => { byMeal[m] = items.filter((i) => i.meal === m); });
    return {
      __file: 'nutrition_admin/report.ejs', tab: 'patients',
      patient, measurements, series, labs: [{ id: 1, taken_on: '2026-07-01', title: 'Vitamin D', value: '18', unit: 'ng/mL' }],
      plans: [], login: null, latest: measurements[0],
      settings: { practice_name: 'Nutrio Clinic', phone: '0882000000', address: '5 Adly St' },
      calc: E.compute(patient, measurements[0], { protein_per_kg: 1.8, fat_percent: 25 }),
      progress: P.progress(series, patient.target_weight_kg),
      plan: { id: 1, title: 'August plan', notes: 'Water 2L a day.', is_active: true },
      items, meals: E.MEALS, byMeal,
      dayTotals: E.totals(items),
      mealTotals: Object.fromEntries(E.MEALS.map((m) => [m, E.totals(byMeal[m])])),
      printedOn: '2026-08-04',
    };
  },

  // ── Patient portal ─────────────────────────────────────────────────────────
  // Rendered with `practice` rather than `company`, because the portal shell is
  // the only one served on the tenant's own subdomain.
  nutrition_portal_login: () => ({
    __file: 'nutrition_portal/login.ejs',
    practice: { id: 1, slug: 'nutrio', company_name: 'Nutrio Clinic' },
    err: 'bad',
  }),

  nutrition_portal_today: () => {
    const E = require('../src/nutrition/engine');
    const items = [
      { id: 1, meal: 'breakfast', food_name: 'Boiled egg', grams: 100, kcal: 155, protein_g: 13, carbs_g: 1.1, fat_g: 11, note: null },
      { id: 2, meal: 'breakfast', food_name: 'Baladi bread', grams: 60, kcal: 165, protein_g: 5.7, carbs_g: 33, fat_g: 1, note: 'half a loaf' },
      { id: 3, meal: 'lunch', food_name: 'Grilled chicken breast', grams: 200, kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7.2, note: null },
    ];
    const byMeal = {};
    E.MEALS.forEach((m) => { byMeal[m] = items.filter((i) => i.meal === m); });
    // One item ticked, so both the ticked and unticked rows render.
    const done = new Set([1]);
    return {
      __file: 'nutrition_portal/today.ejs',
      practice: { id: 1, slug: 'nutrio', company_name: 'Nutrio Clinic' },
      patient: { id: 1, name: 'Mona S.' },
      plan: { id: 1, title: 'August plan', target_kcal: 1650 },
      items, meals: E.MEALS, byMeal, done,
      planTotals: E.totals(items),
      eatenTotals: E.totals(items.filter((i) => done.has(i.id))),
      lastWeight: { weight_kg: 84.2, taken_on: '2026-07-20' },
      loggedToday: false, day: '2026-08-03',
      saved: false, err: 'weight',
      // The real diary (backlog 84): one entry with a food behind it and one
      // the patient typed, so the "not counted" state renders.
      ...diaryFixture([
        { id: 11, meal: 'breakfast', grams: 100, food_name: 'Boiled egg',
          food: { kcal: 155, protein_g: 13, carbs_g: 1.1, fat_g: 11 }, created_at: NOW },
        { id: 12, meal: 'lunch', grams: null, free_text: 'Koshari from outside'  /* patient's own words: kept Latin here so the English render is not flagged for text the PATIENT typed */, food: null, created_at: NOW },
      ], { water_glasses: 8, sleep_hours: 6.5, steps: null, mood: 'ok', note: null }),
    };
  },

  // The empty state: signed in, but the dietitian has not written a plan yet.
  nutrition_portal_no_plan: () => {
    const E = require('../src/nutrition/engine');
    const byMeal = {};
    E.MEALS.forEach((m) => { byMeal[m] = []; });
    return {
      __file: 'nutrition_portal/today.ejs',
      practice: { id: 1, slug: 'nutrio', company_name: 'Nutrio Clinic' },
      patient: { id: 2, name: 'Karim H.' },
      plan: null, items: [], meals: E.MEALS, byMeal, done: new Set(),
      planTotals: E.totals([]), eatenTotals: E.totals([]),
      lastWeight: null, loggedToday: false, day: '2026-08-03',
      saved: true, err: null,
      ...diaryFixture([]),
    };
  },

  nutrition_portal_progress: () => {
    const P = require('../src/nutrition/practice');
    const series = [
      { on: '2026-05-20', kg: 88.5 }, { on: '2026-06-20', kg: 86 }, { on: '2026-07-20', kg: 84.2 },
    ];
    return {
      __file: 'nutrition_portal/progress.ejs',
      practice: { id: 1, slug: 'nutrio', company_name: 'Nutrio Clinic' },
      patient: { id: 1, name: 'Mona S.', target_weight_kg: 72 },
      series,
      rows: [
        { taken_on: '2026-07-20', weight_kg: 84.2, source: 'clinic' },
        { taken_on: '2026-06-20', weight_kg: 86, source: 'patient' },
        { taken_on: '2026-05-20', weight_kg: 88.5, source: 'clinic' },
      ],
      progress: P.progress(series, 72),
    };
  },

  nutrition_settings: () => ({
    __file: 'nutrition_admin/settings.ejs', tab: 'settings',
    settings: { practice_name: 'Demo Nutrition', phone: '0882000000', whatsapp: '201000000000',
      hours: 'Sat-Thu 4pm-10pm', address: '5 Adly St', about: 'A demo practice.',
      booking_enabled: true, protein_per_kg: 1.8, fat_percent: 25 },
    saved: true,
  }),

  furniture_alerts: (lang) => {
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    return {
      __file: 'furniture_admin/alerts.ejs', tab: 'alerts',
      alerts: [
        { key: 'late_delivery', tone: 'red', href: '/furniture/delivery?view=late', count: 2 },
        { key: 'low_stock', tone: 'amber', href: '/furniture/master/materials', count: 1 },
        { key: 'warranty_ending', tone: 'amber', href: '/furniture/warranty?view=expiring', count: 1 },
        { key: 'open_orders', tone: 'blue', href: '/furniture/purchases', count: 3 },
      ],
      alertCount: 7,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_branches: (lang) => {
    const fl = require('../src/furniture/flags');
    const B = require('../src/furniture/branches');
    const flags = new Set([...fl.DEFAULT_ON, 'master', 'branches']);
    return {
      __file: 'furniture_admin/branches.ejs', tab: 'branches',
      branches: [
        { id: 1, name: 'Main showroom', kind: 'showroom', address: '5 Adly St', phone: '0882000000', is_active: true },
        { id: 2, name: 'Workshop', kind: 'workshop', address: null, phone: null, is_active: true },
        { id: 3, name: 'Old store', kind: 'store', address: null, phone: null, is_active: false },
      ],
      kinds: B.KINDS, scoped: B.SCOPED, saved: true, err: null,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_labels: (lang) => {
    const fl = require('../src/furniture/flags');
    const C = require('../src/lib/code128');
    const flags = new Set([...fl.DEFAULT_ON, 'master', 'labels']);
    const rows = [
      { id: 1, name: 'Classic bedroom', code: 'MOB-1024' },
      { id: 2, name: 'Dining set', code: 'MOB-2048' },
    ];
    return {
      __file: 'furniture_admin/labels.ejs', tab: 'labels',
      kind: 'products', copies: 2, kinds: ['products', 'materials'],
      labels: rows.flatMap((r) => [0, 1].map(() => ({ ...r, svg: C.svg(r.code, { module: 2, height: 48 }) }))),
      // Both refusal cases: no code at all, and a code the symbology cannot
      // carry — the second is the one that would otherwise print blank.
      missing: [{ id: 3, name: 'Side table' }, { id: 4, name: 'Wardrobe', bad: true }],
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_backup: (lang) => {
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    return {
      __file: 'furniture_admin/backup.ejs', tab: 'backup',
      tables: require('../src/routes/furniture_backup').TABLES.map((x) => x[0]),
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_activity: (lang) => {
    const fl = require('../src/furniture/flags');
    const A = require('../src/furniture/activity');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    return {
      __file: 'furniture_admin/activity.ejs', tab: 'activity',
      entity: null, entities: A.ENTITIES,
      rows: [
        { id: 3, created_at: '2026-08-03T09:12:00Z', actor: 'Sayed', action: 'sale.cancel', entity: 'sale', entity_id: 12, detail: '#12' },
        { id: 2, created_at: '2026-08-03T08:40:00Z', actor: 'owner', action: 'payroll.run', entity: 'payroll', entity_id: null, detail: '2026-08-01 → 2026-08-07 · 3 · 2565' },
        // An action with no translation yet, so the raw-key fallback is exercised.
        { id: 1, created_at: '2026-08-02T17:05:00Z', actor: 'owner', action: 'something.new', entity: null, entity_id: null, detail: null },
      ],
      more: true, limit: 100, offset: 100,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_bom: (lang) => {
    const fl = require('../src/furniture/flags');
    const B = require('../src/furniture/bom');
    const flags = new Set([...fl.DEFAULT_ON, 'master', 'bom']);
    const raw = [
      { id: 1, name: 'Classic bedroom', category: 'Bedrooms', selling_price: 42000,
        estimated_cost: 26000, component_count: 3, material_cost: 5010, unknown_count: 0 },
      // Costed but with a missing material, and one with no components at all —
      // both wordings ("incomplete", "typed estimate") get rendered.
      { id: 2, name: 'Dining table', category: null, selling_price: 9000,
        estimated_cost: 12000, component_count: 2, material_cost: 4000, unknown_count: 1 },
      { id: 3, name: 'Console', category: null, selling_price: 3000,
        estimated_cost: 1000, component_count: 0, material_cost: 0, unknown_count: 0 },
    ];
    return {
      __file: 'furniture_admin/bom.ejs', tab: 'bom',
      products: raw.map((p) => ({ ...p,
        ...B.marginOf(p.selling_price, p.component_count ? p.material_cost : p.estimated_cost, p.component_count > 0) })),
      err: null, saved: true,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_bom_product: (lang) => {
    const fl = require('../src/furniture/flags');
    const B = require('../src/furniture/bom');
    const flags = new Set([...fl.DEFAULT_ON, 'master', 'bom']);
    const components = [
      { id: 1, material_id: 1, material_name: 'Oak 18mm', unit: 'metre', qty_required: 12, avg_cost: 337.5, stock_qty: 100 },
      { id: 2, material_id: null, material_name: null, unit: null, qty_required: 4, avg_cost: null, stock_qty: null },
    ];
    const costed = B.costOf(components);
    const product = { id: 1, name: 'Classic bedroom', category: 'Bedrooms', selling_price: 42000, estimated_cost: 26000 };
    return {
      __file: 'furniture_admin/bom_product.ejs', tab: 'bom',
      product, materials: [{ id: 1, name: 'Oak 18mm', unit: 'metre', avg_cost: 337.5 }],
      costed, margin: B.marginOf(product.selling_price, costed.cost, true),
      err: 'unknown_material', saved: false,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_attendance: (lang) => {
    const fl = require('../src/furniture/flags');
    const P = require('../src/furniture/payroll');
    const flags = new Set([...fl.DEFAULT_ON, 'master', 'hr']);
    return {
      __file: 'furniture_admin/attendance.ejs', tab: 'hr',
      workers: [
        { id: 1, name: 'Sayed', job_title: 'Carpenter', pay_type: 'piece' },
        { id: 2, name: 'Ramadan', job_title: 'Finisher', pay_type: 'daily' },
      ],
      marks: { 2: { worker_id: 2, status: 'half', permission_hours: 2 } },
      day: '2026-08-03', statuses: P.STATUSES, saved: true,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_payroll: (lang) => {
    const fl = require('../src/furniture/flags');
    const P = require('../src/furniture/payroll');
    const flags = new Set([...fl.DEFAULT_ON, 'master', 'hr']);
    const att = [
      { status: 'present', permission_hours: 0 }, { status: 'present', permission_hours: 2 },
      { status: 'half', permission_hours: 0 }, { status: 'absent', permission_hours: 0 },
      { status: 'vacation', permission_hours: 0 },
    ];
    const rows = [
      P.computeRow({ id: 1, name: 'Ramadan', pay_type: 'daily', pay_rate: 300 }, att,
        [{ id: 1, adj_type: 'bonus', amount: 200 }, { id: 2, adj_type: 'advance', amount: 500 }],
        [{ id: 9, amount: 120, paid_cash: false }]),
      // A piece worker: the "enter the base yourself" wording must render.
      P.computeRow({ id: 2, name: 'Sayed', pay_type: 'piece', pay_rate: 250 }, att, [], []),
    ];
    return {
      __file: 'furniture_admin/payroll.ejs', tab: 'hr',
      rows, workers: [{ id: 1, name: 'Ramadan' }, { id: 2, name: 'Sayed' }],
      history: [{ id: 1, worker_name: 'Ramadan', period_start: '2026-07-01', period_end: '2026-07-07',
        base: 1275, bonuses: 200, deductions: 620, net: 855, paid: false }],
      start: '2026-07-28', end: '2026-08-03',
      weekDays: P.WEEK_DAYS, dayHours: P.DAY_HOURS,
      err: 'nobody', saved: false,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_canteen: (lang) => {
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master', 'canteen']);
    return {
      __file: 'furniture_admin/canteen.ejs', tab: 'canteen',
      workers: [{ id: 1, name: 'Sayed' }, { id: 2, name: 'Ramadan' }],
      // One of each state, so cash / on account / already-deducted all render.
      rows: [
        { id: 1, worker_name: 'Sayed', item: 'Tea', amount: 15, paid_cash: true, payroll_id: null, buy_date: '2026-08-01' },
        { id: 2, worker_name: 'Sayed', item: 'Lunch', amount: 60, paid_cash: false, payroll_id: null, buy_date: '2026-08-02' },
        { id: 3, worker_name: 'Ramadan', item: 'Lunch', amount: 60, paid_cash: false, payroll_id: 5, buy_date: '2026-07-20' },
      ],
      pending: [{ id: 1, name: 'Sayed', owed: 60 }],
      saved: true,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_expenses: (lang) => {
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master']);
    return {
      __file: 'furniture_admin/expenses.ejs', tab: 'expenses',
      rows: [
        { id: 1, category: 'rent', amount: 8000, spend_date: '2026-08-01', note: 'August' },
        // A category typed before the keys existed. Kept in Latin only so the
        // Arabic-leak check stays meaningful — real legacy data will be Arabic
        // and SHOULD render as Arabic on an English page, since it is the
        // workshop's own text and there is nothing to translate it from.
        { id: 2, category: 'sandpaper', amount: 250, spend_date: '2026-08-02', note: null },
      ],
      byCat: [{ category: 'rent', total: 8000, n: 1 }, { category: 'sandpaper', total: 250, n: 1 }],
      total: 8250, from: '2026-08-01', to: '2026-08-31',
      categories: require('../src/routes/furniture_expenses').CATEGORIES,
      saved: true,
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  furniture_reports: (lang) => {
    const fl = require('../src/furniture/flags');
    const flags = new Set([...fl.DEFAULT_ON, 'master', 'hr']);
    return {
      __file: 'furniture_admin/reports.ejs', tab: 'reports',
      from: '2026-08-01', to: '2026-08-31',
      // A negative difference too, so the loss styling and wording render.
      period: { invoiced: 51300, collected: 12000, received: 5010, payroll: 3400, expenses: 8250,
        returned: 4000, refunded: 1500, fees: 350, feesPaid: 0, netInvoiced: 47650, difference: -1000 },
      cash: { in: 12000, out: 11650, balance: 350 },
      stock: { value: 41200, lowCount: 1, low: [{ name: 'Oak 18mm', unit: 'metre', qty: 4, min_qty: 10 }] },
      customers: [{ id: 1, name: 'Mohamed A.', invoiced: 51300, paid: 10000, balance: 41300 }],
      suppliers: [{ id: 1, name: 'Nile Timber', received: 1700, paid: 500, balance: 1200 }],
      payroll: [{ id: 1, worker_name: 'Ramadan', period_start: '2026-08-01', period_end: '2026-08-07',
        base: 1275, bonuses: 200, deductions: 620, net: 855, paid: true }],
      expenses: [{ category: 'rent', total: 8000, n: 1 }, { category: 'sandpaper', total: 250, n: 1 }],
      byBranch: [
        { id: 1, name: 'Main showroom', invoiced: 44300, expenses: 6200 },
        { id: 2, name: 'Workshop', invoiced: 7000, expenses: 2050 },
      ],
      flags, furnitureNav: fl.localized(fl.FLAGS.filter((f) => flags.has(f.key)), (k) => t(k, lang)),
    };
  },

  appointments: () => ({
    tab: 'appointments',
    appts: [{
      id: 1, patient_name: patient.name, patient_phone: '01000000000',
      doctor_name: doctor.name, slot_at: NOW, status: 'pending', note: '',
      created_at: NOW,
    }],
    status: null, waReady: true,
  }),

  // An internal-medicine clinic: the dental module must not appear in the list
  // at all, and the page must say the list is filtered.
  modules: (lang) => {
    const spec = require('../src/clinic/specialties');
    const mods = require('../src/clinic/modules');
    const specialty = 'internal';
    return {
      tab: 'modules',
      modules: mods.modulesForSpecialty(specialty),
      enabled: mods.visibleModules(new Set(mods.MODULE_KEYS), specialty),
      bySpecialty: new Set(spec.modulesFor(specialty)),
      specialtyLabel: spec.labelFor(specialty, (k) => t(k, lang)),
      hiddenCount: mods.MODULES.length - mods.modulesForSpecialty(specialty).length,
      saved: false,
    };
  },

  addons: () => {
    const addons = require('../src/clinic/addons');
    const states = {};
    addons.ADDONS.forEach((a) => { states[a.key] = { enabled: false, used: 0, quota: a.quota || 0 }; });
    return { tab: 'addons', addons: addons.ADDONS, states, need: null, why: null, voiceReady: true };
  },

  mod_cashbox: () => ({
    tab: 'cashbox',
    day: null,
    dayRow: { note: '' },
    entries: [{ id: 1, direction: 'out', amount: 150, category: 'supplies', note: 'gloves', created_by: 'Nour', created_at: NOW }],
    opening: 500, patientsCash: 1200, cashIn: 100, cashOut: 150, expected: 1650, counted: 1650,
    diff: 0,
    categories: [
      { key: 'supplies', label: 'مستلزمات' }, { key: 'rent', label: 'إيجار' },
      { key: 'other', label: 'أخرى' },
    ],
    recent: [{ day: '2026-08-02', counted_close: 1400, expected: 1400 }],
  }),

  mod_branches: () => ({
    tab: 'branches',
    branches: [{ id: 1, name: 'Main branch', address: 'Street 5', phone: '0882000000' }],
  }),

  mod_calls: () => ({
    tab: 'callcenter',
    patients: [patient],
    calls: [{
      id: 1, patient_name: patient.name, phone: '01000000000', direction: 'out',
      purpose: 'reminder', outcome: 'answered', follow_up_at: '2026-08-10',
      note: 'call back', created_at: NOW,
    }],
    followups: [{ follow_up_at: '2026-08-10', patient_name: patient.name, phone: '', purpose: 'review' }],
  }),

  mod_insurance: () => ({
    tab: 'insurance',
    insurers: [{ id: 1, name: 'MedNet', coverage_pct: 80, phone: '0221000000' }],
    patients: [patient],
    claims: [{ id: 1, patient_name: patient.name, insurer_name: 'MedNet', amount: 500, status: 'pending' }],
  }),

  mod_integrations: () => ({
    tab: 'api',
    newToken: null,
    keys: [{ id: 1, label: 'WhatsApp integration', prefix: 'ocd_abc', created_at: NOW }],
    hooks: [{ id: 1, url: 'https://example.com/hook', event: 'invoice.paid' }],
  }),

  mod_inventory: () => ({
    tab: 'inventory',
    items: [{
      id: 1, name: 'Gloves', quantity: 20, unit: 'box', reorder_level: 25,
      price: 120, is_active: true,
    }],
    low: [{ name: 'Gloves' }],
    moves: [{ item_name: 'Gloves', reason: 'dispense', change: -2, unit: 'box', created_at: NOW }],
  }),

  mod_staff: () => ({
    tab: 'hr',
    ROLE_KEYS: require('../src/clinic/perms').ROLE_KEYS,
    saved: false, error: null,
    staff: [
      { id: 1, name: 'Nour', role: 'Reception', username: 'nour', perm_role: 'reception', login_enabled: true },
      { id: 2, name: 'Hana', role: 'Nurse' },
    ],
    openByStaff: { 1: { check_in: NOW } },
    today: [{ staff_name: 'Nour', check_in: NOW, check_out: null }],
  }),

  mod_whatsapp: (lang) => ({
    tab: 'whatsapp',
    w: { provider: 'cloud', phone_number_id: '', access_token: '', api_url: '', api_token: '', sender_number: '', active: true, auto_confirm: true },
    defConfirm: t('wa.tpl.confirm_default', lang),
    defReminder: t('wa.tpl.reminder_default', lang),
    saved: true, test: null,
  }),

  // The calendar, with a working-hours window, an appointment outside it, and
  // one booked with no time at all — the two rows a naive grid loses.
  calendar: () => {
    const cal = require('../src/clinic/calendar');
    const days = ['2026-08-19'];
    const grid = cal.layout({
      days,
      doctors: [{ id: doctor.id, name: doctor.name, room: '2' }],
      schedules: [{ doctor_id: doctor.id, day_of_week: cal.cairoWeekday(days[0]), start_time: '09:00', end_time: '17:00', is_active: true }],
      appointments: [
        { id: 1, doctor_id: doctor.id, slot_at: '2026-08-19T08:00:00Z', patient_name: patient.name, status: 'confirmed' },
        { id: 2, doctor_id: doctor.id, slot_at: '2026-08-19T18:30:00Z', patient_name: 'Mona Adel', status: 'pending' },
        { id: 3, doctor_id: null, slot_at: null, patient_name: 'Ali', status: 'pending', day_hint: days[0], doctor_name: null },
      ],
    });
    return { tab: 'calendar', grid, view: 'day', anchor: days[0], days, isEmptyDay: cal.isEmptyDay };
  },

  // The queue is grouped by doctor now (backlog 83), and the fixture carries a
  // visit in every state — including one that closed because it was moved, so
  // the "moved to" line is rendered rather than assumed.
  queue: () => {
    const q = require('../src/clinic/queue');
    const visits = [
      { id: 1, patient_id: 12, patient_name: patient.name, doctor_id: doctor.id, doctor_name: doctor.name,
        room: '2', status: 'waiting', arrival_at: NOW, is_urgent: true, visit_type_name: 'Consultation' },
      { id: 2, patient_id: null, patient_name: 'Mona Adel', doctor_id: doctor.id, doctor_name: doctor.name,
        room: '2', status: 'in_room', arrival_at: NOW, is_urgent: false },
      { id: 3, patient_id: null, patient_name: 'Ali', doctor_id: null, doctor_name: null,
        room: null, status: 'no_show', arrival_at: null, is_urgent: false },
      { id: 4, patient_id: null, patient_name: 'Hoda', doctor_id: null, doctor_name: null,
        room: null, status: 'cancelled', arrival_at: NOW, rescheduled_to: NOW },
    ];
    return {
      tab: 'queue',
      visits, doctors: [doctor], patients: [patient],
      visitTypes: [{ id: 1, name: 'Consultation', price: 150, duration_min: 20 }],
      groups: q.byDoctor(visits), actionsFor: q.actionsFor,
      date: '2026-08-03', saved: false, err: 'past',
    };
  },

  // The access log: rendered here because it is the one screen a clinic owner
  // opens when something went wrong, and a crash on it would be found then.
  audit: () => ({
    tab: 'audit',
    ENTITIES: ['patient', 'vitals', 'note', 'prescription', 'invoice',
      'measurement', 'lab', 'patient_login'],
    filters: { patient: '', entity: '' },
    rows: [
      { id: 2, created_at: NOW, actor_kind: 'company', actor_label: null,
        entity: 'prescription', entity_id: 91, patient_id: 12, action: 'delete', ip: '197.0.0.1' },
      { id: 1, created_at: NOW, actor_kind: 'staff', actor_label: 'Reception',
        entity: 'patient', entity_id: 12, patient_id: 12, action: 'view', ip: null },
    ],
  }),

  invoices: () => ({
    tab: 'invoices',
    summary: { today_collected: 1200, collected: 45000, outstanding: 3000, open_count: 4 },
    patients: [patient], doctors: [doctor],
    services: [{ id: 1, name: 'Radiograph', price: 200 }],
    invoices: [
      { id: 1, patient_name: patient.name, created_at: NOW, total_amount: 500, paid_amount: 200, status: 'partial' },
      { id: 2, patient_name: null, created_at: NOW, total_amount: 150, paid_amount: 150, status: 'paid' },
    ],
    status: null,
  }),

  invoice_detail: () => ({
    tab: 'invoices',
    company: { id: 1, company_name: 'Demo Clinic', name: 'Demo Clinic' },
    inv: {
      id: 1, patient_name: patient.name, patient_phone: '01000000000', created_at: NOW,
      subtotal: 600, discount_amount: 100, total_amount: 500, paid_amount: 200, status: 'partial',
    },
    items: [{ name: 'Radiograph', quantity: 1, unit_price: 200, total_price: 200 }],
    // A payment and a refund, so both readings of the ledger line render.
    payments: [
      { id: 9, created_at: NOW, method: 'cash', amount: 250 },
      { id: 10, created_at: NOW, method: 'cash', amount: -50 },
    ],
    maxRefund: 200,
    trail: [
      { created_at: NOW, actor_kind: 'company', actor_label: null, action: 'update', meta: { paid: 250 } },
      { created_at: NOW, actor_kind: 'staff', actor_label: 'Reception', action: 'refund', meta: { amount: 50, reason: 'cancelled procedure' } },
    ],
    trailOk: true, error: 'too_much', refunded: true, change: 20,
  }),

  // The receipt is its own page because it prints on its own.
  receipt: () => ({
    tab: 'invoices',
    company: { id: 1, company_name: 'Demo Clinic', name: 'Demo Clinic' },
    inv: { id: 1 },
    pay: { id: 9, created_at: NOW, method: 'cash', amount: 250, total_amount: 500,
      paid_amount: 200, status: 'partial', patient_name: patient.name, patient_phone: '01000000000' },
    isRefund: false,
  }),

  finance: () => ({
    tab: 'invoices',
    month: '2026-08',
    totals: { collected: 45000, billed: 48000, outstanding: 3000 },
    daily: [{ d: '2026-08-01', total: 1200 }, { d: '2026-08-02', total: 800 }],
    byDoctor: [{ name: doctor.name, invoices: 12, earnings: 9000 }],
    byMethod: [{ method: 'cash', n: 20, total: 30000 }, { method: 'card', n: 5, total: 15000 }],
    byService: [{ name: 'Radiograph', n: 18, revenue: 3600 }],
  }),

  services: () => ({
    tab: 'services',
    services: [{ id: 1, name: 'Radiograph', price: 200, doctor_pct: 60, is_active: true }],
    visitTypes: [{ id: 1, name: 'Consultation', price: 150, duration_min: 20 }],
  }),

  settings: (lang) => ({
    tab: 'settings',
    s: { specialty: 'dentistry', about: '', address: '', phone: '', whatsapp: '', hours: '', booking_enabled: true },
    customSpecialty: null,
    specialties: require('../src/clinic/specialties').SPECIALTIES.map((sp) => ({
      key: sp.key,
      label: require('../src/clinic/specialties').labelFor(sp.key, (k) => t(k, lang)),
    })),
  }),

  // The board answers questions now (backlog 83). The fixture carries all three
  // states on purpose — a card with something to do, one with nothing, and one
  // whose query failed — because the third is the one that used to be a 500.
  dashboard: () => {
    const board = require('../src/clinic/board');
    const cards = board.board({
      waiting: { ok: true, rows: [
        { id: 1, patient_name: patient.name, doctor_name: doctor.name, arrival_at: new Date(Date.now() - 35 * 60000), is_urgent: true },
        { id: 2, patient_name: 'Mona Adel', doctor_name: null, arrival_at: null, is_urgent: false },
      ] },
      unconfirmed: { ok: true, rows: [{ id: 3, patient_name: 'Sara', phone: '01000000000', slot_at: NOW, doctor_name: doctor.name }] },
      today: { ok: true, rows: [] },
      overdue: { ok: false },
      next: { ok: true, rows: [{ id: 4, patient_name: patient.name, slot_at: NOW, doctor_name: doctor.name }] },
    });
    for (const c of cards) {
      if (c.key !== 'waiting') continue;
      c.rows = c.rows.map((r) => {
        const mins = board.waitedMinutes(r.arrival_at, new Date());
        return Object.assign({}, r, { waited: mins, long_wait: board.isLongWait(mins) });
      });
    }
    return {
      tab: 'dashboard', cards, revenue: 4500,
      needsAttention: board.needsAttention(cards),
      anyUnknown: board.anyUnknown(cards),
    };
  },

  doctors: () => ({
    tab: 'doctors',
    edit: null,
    doctors: [
      Object.assign({}, doctor, { title: 'Consultant', fee: 300, photo_url: '', is_active: true }),
      { id: 2, name: 'Dr. Omar', title: '', specialty: '', fee: null, photo_url: '', is_active: false },
    ],
  }),

  // The file is tabbed now (backlog 83). Rendered once per tab below, so a
  // section that only appears on one of them is still exercised — and the
  // fixture carries an unreadable dataset, because "no prescriptions" and
  // "could not read the prescriptions" must not look the same.
  patient_file: (lang, tab) => ({
    tab: 'patients',
    fileTab: tab || 'summary',
    fileTabs: require('../src/clinic/file_tabs').TABS,
    state: { visits: 'has', vitals: 'has', notes: 'has', prescriptions: 'has',
      invoices: 'has', photos: 'has', labs: 'unknown' },
    invoices: [
      { id: 7, created_at: NOW, total_amount: 300, paid_amount: 100, status: 'partial' },
      { id: 6, created_at: NOW, total_amount: 150, paid_amount: 150, status: 'paid' },
    ],
    balance: { billed: 450, paid: 250, due: 200 },
    photos: [{ id: 1, image_url: '/uploads/x.jpg', caption: '', kind: 'xray', created_at: NOW }],
    labs: [],
    patient,
    doctors: [doctor],
    visits: [{
      id: 1, visit_date: '2026-07-01', doctor_name: doctor.name, visit_type_name: 'Consultation',
      status: 'done', diagnosis: 'URTI', notes: 'rest',
    }],
    vitals: [{ recorded_at: NOW, systolic: 120, diastolic: 80, heart_rate: 72, temperature: 37.1, weight: 72, spo2: 98 }],
    notes: [{ created_at: NOW, doctor_name: doctor.name, category: 'exam', title: '', content: 'chest clear' }],
    prescriptions: [{
      created_at: NOW, doctor_name: doctor.name, notes: 'after meals',
      meds: [{ name: 'Augmentin', dose: '1g', freq: 'bd', duration: '7 days' }],
    }],
    specVitals: require('../src/clinic/specialties').vitalsFor('general'),
    specExtra: [{ key: 'pain', label: lang === 'en' ? 'Pain score' : 'درجة الألم', type: 'scale' }],
    vitalsLabels: require('../src/clinic/specialties').vitalsLabels((k) => t(k, lang)),
    specialtyLabel: lang === 'en' ? 'General practice' : 'ممارسة عامة',
  }),

  patient_trends: (lang) => ({
    tab: 'patients',
    patient,
    specialtyLabel: lang === 'en' ? 'Obstetrics' : 'نساء وتوليد',
    pregnancy: { weeks: 24, days: 3, trimester: 2, edd: '2026-11-20', lmp: '2026-02-13' },
    // A real buildSeries run, so BMI derivation and its per-patient band are
    // exercised by the render check rather than hand-written into the fixture.
    series: require('../src/clinic/trends').buildSeries(
      [{ recorded_at: '2026-05-01', weight: 74, height: 168 },
       { recorded_at: '2026-06-01', weight: 73, height: 168 },
       { recorded_at: '2026-07-01', weight: 72, height: 168 }],
      [], 'nutrition', { birth_year: 1990 }, (k) => t(k, lang)
    ),
    verdictOf: (s) => (s.delta < 0 ? 'better' : s.delta > 0 ? 'worse' : 'flat'),
    // A boy with weight and height recorded: weight charts (table loaded),
    // height does not (his stature table only starts at 24 months and he is 18).
    growthAge: 18,
    growthCharts: (() => {
      const growth = require('../src/clinic/growth');
      const child = { gender: 'ذكر', birth_date: '2025-02-03' };
      const readings = [
        { recorded_at: '2025-08-03', weight: 8.6, height: 68 },
        { recorded_at: '2026-02-03', weight: 10.2, height: 76 },
        { recorded_at: '2026-08-03', weight: 11.1, height: 81 },
      ];
      return ['weight', 'height', 'head_circumference']
        .map((m) => growth.buildChart(m, child, readings))
        .filter(Boolean);
    })(),
  }),

  patient_vaccines: () => ({
    tab: 'patients',
    patient: Object.assign({}, patient, { birth_date: '2025-01-15' }),
    ageMonths: 18,
    schedule: [],
    card: [
      { id: 1, name: 'BCG', dose_label: 'At birth', age_months: 0, status: 'given', given_at: '2025-01-16', given_id: 9 },
      { id: 2, name: 'IPV', dose_label: 'Single dose', age_months: 4, status: 'overdue', due_on: '2025-05-15' },
      { id: 3, name: 'MMR', dose_label: '2nd dose', age_months: 18, status: 'due', due_on: '2026-07-15' },
      { id: 4, name: 'DTP', dose_label: 'Booster', age_months: 24, status: 'upcoming', due_on: '2027-01-15' },
    ],
  }),

  mod_growth: (lang) => ({
    tab: 'growth',
    company: { id: 1, company_name: 'Demo Clinic', name: 'Demo Clinic' },
    stats: { total_patients: 120, active_90: 45 },
    lapsed: [
      { id: 1, name: patient.name, phone: '01000000000', last_visit: '2025-09-01', days_since: 336, visits: 4 },
      { id: 2, name: 'Mona Adel', phone: '', last_visit: '2026-01-01', days_since: 214, visits: 1 },
    ],
    recent: [{ name: patient.name, ok: true, sent_at: NOW }, { name: 'Mona Adel', ok: false, sent_at: NOW }],
    days: 180, cooldown: 60, autoSendAvailable: true,
    template: t('gr.tpl_default', lang),
  }),

  mod_installments: () => ({
    tab: 'installments',
    today: '2026-08-03',
    invoices: [{ id: 7, patient_name: patient.name, total_amount: 3000, paid_amount: 500 }],
    due: [
      { id: 1, patient_name: patient.name, phone: '01000000000', seq: 2, amount: 500, due_date: '2026-07-20' },
      { id: 2, patient_name: patient.name, phone: '', seq: 3, amount: 500, due_date: '2026-08-06' },
    ],
    plans: [
      { invoice_id: 7, patient_name: patient.name, n: 5, n_paid: 2, total: 2500, paid: 1000, next_due: '2026-08-06' },
      { invoice_id: 8, patient_name: patient.name, n: 3, n_paid: 0, total: 900, paid: 0, next_due: '2026-09-01' },
    ],
  }),

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
// SEO limits the project records: a title Google/Bing will not truncate, a
// description in the range they actually show, and one h1 per page.
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;

function seoProblems(html) {
  const out = [];
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  if (!title) out.push('لا يوجد <title>');
  else if (title.length > TITLE_MAX) out.push(`العنوان ${title.length} حرف (الحد ${TITLE_MAX}): ${title}`);

  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!desc) out.push('لا يوجد meta description');
  else if (desc.length > DESC_MAX) out.push(`الوصف ${desc.length} حرف (الحد ${DESC_MAX})`);
  else if (desc.length < DESC_MIN) out.push(`الوصف ${desc.length} حرف — قصير جداً (الحد الأدنى ${DESC_MIN})`);

  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) out.push(`عدد <h1> = ${h1} (المفروض 1)`);
  return out;
}

function renderPage(name, lang, arg) {
  const page = FIXTURES[name](lang, arg);
  // Most pages live under clinic_admin/; the public clinic page sits in views/.
  const file = page.__file
    ? path.join(VIEWS, page.__file)
    : path.join(CLINIC, name + '.ejs');
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
    /* الصفحات المرسومة تتكتب على القرص لو حد طلب كده (`RENDER_DUMP_DIR`).
     * `check-tailwind-build` بيقرا منها كلاسات الـHTML الحقيقية ويتأكد إن
     * ملف الـCSS المبني فيه قاعدة لكل واحد — الفحص ده مستحيل من غير الـHTML
     * الفعلي، لأن الكلاس اللي بيتركّب في EJS مابيبانش في نص القالب. */
    if (process.env.RENDER_DUMP_DIR) {
      const dir = process.env.RENDER_DUMP_DIR;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name + '.ar.html'), ar);
      fs.writeFileSync(path.join(dir, name + '.en.html'), en);
    }
    // The tabbed patient file: every tab, not only the one that happens to be
    // the default — a section nobody renders is a section nobody tests.
    if (name === 'patient_file') {
      for (const tb of require('../src/clinic/file_tabs').TABS) {
        ar += renderPage(name, 'ar', tb);
        en += renderPage(name, 'en', tb);
      }
    }
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
  // Public pages are indexed, so they also carry the SEO rules the project
  // records: a title that is not truncated in results, a description in the
  // range search engines show, and exactly one h1. Back-office pages are
  // noindex and have no business carrying a meta description, so the audit is
  // keyed on __public rather than on merely living outside clinic_admin/.
  const seo = FIXTURES[name]().__public ? [ar, en].flatMap(seoProblems) : [];
  if (seo.length) {
    failed++;
    console.log(`❌ ${name} — ${seo.length} مخالفة SEO:`);
    seo.forEach((s) => console.log('   · ' + s));
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
