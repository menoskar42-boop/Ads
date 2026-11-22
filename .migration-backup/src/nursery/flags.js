// Optional sections of the nursery system.
//
// Two are core and cannot be switched off: the children and the fees. A nursery
// without a fee ledger is a spreadsheet with extra steps, and that is exactly
// the thing this replaces.
'use strict';

const FLAGS = [
  // labelCenter is the word a tutoring centre uses instead. Without it the
  // sidebar kept saying "الأطفال" to a centre teaching سنة ثالثة ثانوي while
  // every screen behind it said "الطلاب" — the kind of half-translation that
  // makes a product feel like it was built for somebody else.
  { key: 'children', label: 'الأطفال', labelCenter: 'الطلاب', icon: '🧒', path: '/nursery/children', core: true,
    desc: 'ملف كل طفل: ولي الأمر، المجموعة، الحساسية، ومين مصرّح له يستلمه.' },
  { key: 'fees', label: 'المصاريف', icon: '💰', path: '/nursery/fees', core: true,
    desc: 'فاتورة شهرية لكل طفل، ومين متأخر وكام — من غير ما حد يفتكر.' },
  { key: 'attendance', label: 'الحضور', icon: '✅', path: '/nursery/attendance',
    desc: 'نداء الحضور بضغطة، وإخطار ولي الأمر لو الطفل مجاش.' },
  { key: 'reminders', label: 'التذكيرات', icon: '📲', path: '/nursery/reminders',
    desc: 'رسالة واتساب مهذّبة جاهزة لكل ولي أمر متأخر — إنت بتضغط بس.' },
  { key: 'groups', label: 'المجموعات', icon: '👥', path: '/nursery/groups',
    desc: 'الفصول أو مجموعات الدروس: المدرّس، المواعيد، والسعة.' },
  { key: 'reports', label: 'الأخبار اليومية', icon: '📝', path: '/nursery/reports',
    desc: 'أكل ونوم ومزاج — السطرين اللي ولي الأمر بيستناهم كل يوم.' },
  { key: 'staff', label: 'المدرّسين', icon: '👩‍🏫', path: '/nursery/staff',
    desc: 'المدرّسين والمشرفين وأرقامهم.' },
  { key: 'enquiries', label: 'طلبات التحاق', labelCenter: 'طلبات اشتراك', icon: '📥', path: '/nursery/enquiries',
    desc: 'اللي بيسأل من الصفحة العامة — بمتابعة ليها ميعاد.' },
  { key: 'summary', label: 'الملخّص', icon: '📊', path: '/nursery/summary',
    desc: 'التحصيل والمتأخرات ونسبة الحضور شهر بشهر.' },
];

const FLAG_KEYS = FLAGS.map((f) => f.key);
const OPTIONAL_KEYS = FLAGS.filter((f) => !f.core).map((f) => f.key);
const DEFAULT_ON = ['attendance', 'reminders', 'groups', 'enquiries', 'summary'];

async function getFlags(pool, companyId) {
  const on = new Set(FLAGS.filter((f) => f.core).map((f) => f.key));
  try {
    const r = await pool.query('SELECT flag_key, enabled FROM nursery_flags WHERE company_id=$1', [companyId]);
    if (!r.rows.length) { DEFAULT_ON.forEach((k) => on.add(k)); return on; }
    for (const row of r.rows) if (row.enabled && FLAG_KEYS.includes(row.flag_key)) on.add(row.flag_key);
  } catch (e) { DEFAULT_ON.forEach((k) => on.add(k)); }
  return on;
}

async function saveFlags(pool, companyId, wanted) {
  const set = new Set(Array.isArray(wanted) ? wanted : []);
  for (const key of OPTIONAL_KEYS) {
    await pool.query(
      `INSERT INTO nursery_flags (company_id, flag_key, enabled) VALUES ($1,$2,$3)
       ON CONFLICT (company_id, flag_key) DO UPDATE SET enabled=EXCLUDED.enabled`,
      [companyId, key, set.has(key)]);
  }
}

/** @param centre true for a tutoring centre, so the nav matches the screens. */
function localized(flags, centre) {
  return flags.map((f) => ({
    key: f.key, path: f.path, icon: f.icon,
    label: (centre && f.labelCenter) ? f.labelCenter : f.label,
  }));
}

module.exports = { FLAGS, FLAG_KEYS, OPTIONAL_KEYS, DEFAULT_ON, getFlags, saveFlags, localized };
