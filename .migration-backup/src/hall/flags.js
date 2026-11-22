// Optional sections of the hall system. Same contract as the other verticals:
// the sidebar and the route guard read the same Set, so a hidden section is a
// closed URL rather than a link somebody removed.
'use strict';

const FLAGS = [
  { key: 'enquiries', label: 'الاستفسارات', icon: '📥', path: '/hall/enquiries', core: true,
    desc: 'كل استفسار بتاريخ المناسبة وعدد المدعوين والميزانية — ومتابعة ليه ميعاد.' },
  { key: 'calendar', label: 'التقويم والحجوزات', icon: '📅', path: '/hall/bookings', core: true,
    desc: 'اليوم المحجوز مقفول فعلاً — النظام بيرفض حجزه مرتين.' },
  { key: 'packages', label: 'الباقات', icon: '🎁', path: '/hall/packages',
    desc: 'باقات بسعر أساسي وسعر للفرد، وإيه اللي داخل في كل باقة.' },
  { key: 'payments', label: 'العرابين والأقساط', icon: '💵', path: '/hall/payments',
    desc: 'العربون، الأقساط لحد يوم المناسبة، والمتبقّي على كل حجز.' },
  { key: 'venues', label: 'القاعات', icon: '🏛️', path: '/hall/venues',
    desc: 'أكتر من قاعة في نفس المكان، كل واحدة بتقويمها.' },
  { key: 'reports', label: 'التقارير', icon: '📊', path: '/hall/reports',
    desc: 'الاستفسارات اللي اتحوّلت لحجوزات، والإيراد، ومتوسط الحجز.' },
];

const FLAG_KEYS = FLAGS.map((f) => f.key);
const OPTIONAL_KEYS = FLAGS.filter((f) => !f.core).map((f) => f.key);
const DEFAULT_ON = ['packages', 'payments'];

async function getFlags(pool, companyId) {
  const on = new Set(FLAGS.filter((f) => f.core).map((f) => f.key));
  try {
    const r = await pool.query('SELECT flag_key, enabled FROM hall_flags WHERE company_id=$1', [companyId]);
    if (!r.rows.length) { DEFAULT_ON.forEach((k) => on.add(k)); return on; }
    for (const row of r.rows) if (row.enabled && FLAG_KEYS.includes(row.flag_key)) on.add(row.flag_key);
  } catch (e) { DEFAULT_ON.forEach((k) => on.add(k)); }
  return on;
}

async function saveFlags(pool, companyId, wanted) {
  const set = new Set(Array.isArray(wanted) ? wanted : []);
  for (const key of OPTIONAL_KEYS) {
    await pool.query(
      `INSERT INTO hall_flags (company_id, flag_key, enabled) VALUES ($1,$2,$3)
       ON CONFLICT (company_id, flag_key) DO UPDATE SET enabled=EXCLUDED.enabled`,
      [companyId, key, set.has(key)]);
  }
}

function localized(flags) {
  return flags.map((f) => ({ key: f.key, path: f.path, icon: f.icon, label: f.label }));
}

module.exports = { FLAGS, FLAG_KEYS, OPTIONAL_KEYS, DEFAULT_ON, getFlags, saveFlags, localized };
