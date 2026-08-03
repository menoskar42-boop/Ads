// Structured specialties.
//
// `specialty` used to be a free-text label: a clinic could type "أسنان" and
// nothing in the system behaved differently — the dental module still had to be
// switched on by hand, and every specialty got the same generic visit form with
// blood pressure fields whether or not they meant anything.
//
// This registry makes the specialty mean something:
//   * `vitals`  — which of the existing clinic_vitals columns this specialty
//                 actually records, so a dentist is not asked for SpO2 and a
//                 chest clinic is not missing it.
//   * `extra`   — fields that have no vitals column, stored as JSON on the
//                 visit. Adding one is a line here, not a migration.
//   * `modules` — modules that switch themselves on when this specialty is
//                 chosen. This is what stops every specialty pack from needing
//                 a manual toggle.
//
// Backwards compatible on purpose: existing clinics hold arbitrary text in
// `specialty`, so anything not matching a key here is preserved and simply
// falls back to the general field set.
'use strict';

// Field types the visit form knows how to render.
//   num  — number input        text — short text
//   date — date input          scale— 1..10 selector
const SPECIALTIES = [
  {
    key: 'general', label: 'طب عام',
    vitals: ['systolic', 'diastolic', 'temperature'],
  },
  {
    key: 'internal', label: 'باطنة',
    vitals: ['systolic', 'diastolic', 'temperature', 'heart_rate'],
  },
  {
    key: 'family', label: 'طب أسرة',
    vitals: ['systolic', 'diastolic', 'weight'],
  },
  {
    key: 'pediatrics', label: 'أطفال',
    vitals: ['weight', 'height', 'temperature'],
    extra: [
      { key: 'head_circumference', label: 'محيط الرأس (سم)', type: 'num' },
      { key: 'feeding', label: 'التغذية', type: 'text' },
    ],
  },
  {
    key: 'cardiology', label: 'قلب وأوعية دموية',
    vitals: ['systolic', 'diastolic', 'heart_rate', 'spo2'],
    extra: [
      { key: 'ecg', label: 'قراءة رسم القلب', type: 'text' },
      { key: 'ef', label: 'كفاءة ضخ القلب EF (%)', type: 'num' },
    ],
  },
  {
    key: 'chest', label: 'صدر وجهاز تنفسي',
    vitals: ['spo2', 'temperature', 'heart_rate'],
    extra: [{ key: 'peak_flow', label: 'قياس التنفس Peak Flow', type: 'num' }],
  },
  {
    key: 'endocrine', label: 'غدد وسكر',
    vitals: ['weight', 'height', 'systolic', 'diastolic'],
    extra: [
      { key: 'blood_sugar', label: 'سكر الدم (mg/dL)', type: 'num' },
      { key: 'hba1c', label: 'السكر التراكمي HbA1c (%)', type: 'num' },
    ],
  },
  {
    key: 'nutrition', label: 'تغذية علاجية',
    vitals: ['weight', 'height'],
    extra: [
      { key: 'waist', label: 'محيط الخصر (سم)', type: 'num' },
      { key: 'body_fat', label: 'نسبة الدهون (%)', type: 'num' },
      { key: 'target_weight', label: 'الوزن المستهدف (كجم)', type: 'num' },
    ],
  },
  {
    key: 'dermatology', label: 'جلدية وتجميل',
    vitals: [],
    extra: [
      { key: 'lesion_site', label: 'المنطقة المصابة', type: 'text' },
      { key: 'lesion_type', label: 'نوع الآفة', type: 'text' },
    ],
  },
  {
    key: 'obgyn', label: 'نساء وتوليد',
    vitals: ['systolic', 'diastolic', 'weight'],
    extra: [
      { key: 'lmp', label: 'آخر دورة شهرية', type: 'date' },
      { key: 'gravida_para', label: 'عدد الحمل/الولادات (G/P)', type: 'text' },
      { key: 'fundal_height', label: 'ارتفاع الرحم (سم)', type: 'num' },
    ],
  },
  {
    key: 'ophthalmology', label: 'رمد وعيون',
    vitals: [],
    extra: [
      { key: 'va_right', label: 'حدة الإبصار — يمين', type: 'text' },
      { key: 'va_left', label: 'حدة الإبصار — شمال', type: 'text' },
      { key: 'iop', label: 'ضغط العين (mmHg)', type: 'text' },
    ],
  },
  {
    key: 'orthopedics', label: 'عظام',
    vitals: [],
    extra: [
      { key: 'affected_joint', label: 'المفصل/الطرف المصاب', type: 'text' },
      { key: 'rom', label: 'نطاق الحركة (درجة)', type: 'num' },
      { key: 'pain_scale', label: 'مقياس الألم', type: 'scale' },
    ],
  },
  {
    key: 'pain', label: 'علاج الألم',
    vitals: ['systolic', 'diastolic'],
    extra: [
      { key: 'pain_site', label: 'موضع الألم', type: 'text' },
      { key: 'pain_scale', label: 'مقياس الألم', type: 'scale' },
    ],
  },
  {
    key: 'psychiatry', label: 'نفسية',
    vitals: [],
    extra: [
      { key: 'phq9', label: 'اكتئاب PHQ-9 (0–27)', type: 'num' },
      { key: 'gad7', label: 'قلق GAD-7 (0–21)', type: 'num' },
    ],
  },
  {
    key: 'neurology', label: 'مخ وأعصاب',
    vitals: ['systolic', 'diastolic', 'heart_rate'],
    extra: [{ key: 'gcs', label: 'مستوى الوعي GCS (3–15)', type: 'num' }],
  },
  {
    key: 'urology', label: 'مسالك بولية',
    vitals: ['systolic', 'diastolic'],
    extra: [{ key: 'psa', label: 'PSA', type: 'num' }],
  },
  {
    key: 'ent', label: 'أنف وأذن وحنجرة',
    vitals: ['temperature'],
    extra: [{ key: 'affected_side', label: 'الجهة المصابة', type: 'text' }],
  },
  {
    key: 'geriatrics', label: 'مسنين',
    vitals: ['systolic', 'diastolic', 'temperature', 'heart_rate', 'weight'],
  },
  {
    key: 'emergency', label: 'طوارئ',
    vitals: ['systolic', 'diastolic', 'heart_rate', 'temperature', 'spo2'],
    extra: [{ key: 'triage', label: 'درجة الخطورة (فرز)', type: 'text' }],
  },
  {
    key: 'physio', label: 'علاج طبيعي',
    vitals: [],
    extra: [
      { key: 'affected_area', label: 'المنطقة المعالَجة', type: 'text' },
      { key: 'rom', label: 'نطاق الحركة (درجة)', type: 'num' },
      { key: 'pain_scale', label: 'مقياس الألم', type: 'scale' },
      { key: 'session_no', label: 'رقم الجلسة', type: 'num' },
    ],
  },
  {
    key: 'dentistry', label: 'أسنان',
    vitals: [],
    // Choosing "أسنان" is the whole reason the dental module exists — it should
    // not also require an admin to find and flip a switch.
    modules: ['dental'],
  },
  {
    key: 'orthodontics', label: 'تقويم أسنان',
    vitals: [],
    modules: ['dental'],
  },
  {
    key: 'multi', label: 'متعددة التخصصات',
    vitals: ['systolic', 'diastolic', 'temperature', 'heart_rate', 'weight', 'height', 'spo2'],
  },
];

// Labels for the vitals columns, so the form can render only the relevant ones.
const VITALS_LABELS = {
  systolic: 'الضغط الانقباضي',
  diastolic: 'الضغط الانبساطي',
  heart_rate: 'النبض',
  temperature: 'الحرارة (°م)',
  weight: 'الوزن (كجم)',
  height: 'الطول (سم)',
  spo2: 'الأكسجين SpO₂ (%)',
};

const BY_KEY = new Map(SPECIALTIES.map((s) => [s.key, s]));

// Anything unrecognised (including the free text existing clinics already have)
// falls back to the general field set rather than showing nothing.
function getSpecialty(key) {
  return BY_KEY.get(String(key || '').trim()) || null;
}

function vitalsFor(key) {
  const s = getSpecialty(key);
  if (!s) return Object.keys(VITALS_LABELS);   // unknown → offer everything
  return s.vitals || [];
}

function extraFor(key) {
  const s = getSpecialty(key);
  return (s && s.extra) || [];
}

function modulesFor(key) {
  const s = getSpecialty(key);
  return (s && s.modules) || [];
}

// Human label for display — falls back to whatever text the clinic had saved.
// `t` is res.locals.t when the caller has it; without it the Arabic default is
// used, so nothing ever renders a raw key.
function labelFor(key, t) {
  const s = getSpecialty(key);
  if (!s) return key || '';
  if (typeof t === 'function') {
    const k = 'spec.' + s.key, tr = t(k);
    if (tr && tr !== k) return tr;
  }
  return s.label;
}

// Same idea for the extra visit fields, so an English clinic sees "LMP (last
// menstrual period)" rather than the Arabic default.
function localizeFields(fields, t) {
  if (typeof t !== 'function') return fields;
  return (fields || []).map((f) => {
    const k = 'fld.' + f.key, tr = t(k);
    return (tr && tr !== k) ? { ...f, label: tr } : f;
  });
}

// Vitals labels in the requested language, keyed the same way.
function vitalsLabels(t) {
  if (typeof t !== 'function') return VITALS_LABELS;
  const out = {};
  for (const k of Object.keys(VITALS_LABELS)) {
    const key = 'vit.' + k, tr = t(key);
    out[k] = (tr && tr !== key) ? tr : VITALS_LABELS[k];
  }
  return out;
}

module.exports = {
  SPECIALTIES, VITALS_LABELS,
  getSpecialty, vitalsFor, extraFor, modulesFor, labelFor,
  localizeFields, vitalsLabels,
};
