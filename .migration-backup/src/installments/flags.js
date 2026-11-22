// Optional sections of قسّطلي.
//
// Deliberately few. This is the cheapest product on the list and its whole
// argument is that it does one thing without asking the shop to learn a system:
// who owes what, and a message ready to send. Anything that makes the first
// screen busier makes it worse.
'use strict';

const FLAGS = [
  { key: 'plans', label: 'الأقساط', icon: '🧾', path: '/qastly/plans', core: true,
    desc: 'كل عملية بالتقسيط: المبلغ، المقدّم، عدد الأقساط، وجدول بتواريخه.' },
  { key: 'customers', label: 'العملاء', icon: '👤', path: '/qastly/customers', core: true,
    desc: 'ملف العميل بضامنه ورقمه — وكل عمليّاته في مكان واحد.' },
  { key: 'due', label: 'المستحق', icon: '📅', path: '/qastly/due',
    desc: 'مين المفروض يدفع النهاردة والأيام الجاية، قبل ما يتأخر.' },
  { key: 'late', label: 'المتأخرين', icon: '📲', path: '/qastly/late',
    desc: 'اللي فات عليه الميعاد، ومعاه رسالة واتساب مكتوبة جاهزة.' },
  { key: 'summary', label: 'الملخّص', icon: '📊', path: '/qastly/summary',
    desc: 'المحصّل والمتبقّي والمتأخر شهر بشهر.' },
];

const FLAG_KEYS = FLAGS.map((f) => f.key);
const OPTIONAL_KEYS = FLAGS.filter((f) => !f.core).map((f) => f.key);
const DEFAULT_ON = ['due', 'late', 'summary'];

async function getFlags(pool, companyId) {
  const on = new Set(FLAGS.filter((f) => f.core).map((f) => f.key));
  try {
    const r = await pool.query('SELECT flag_key, enabled FROM inst_flags WHERE company_id=$1', [companyId]);
    if (!r.rows.length) { DEFAULT_ON.forEach((k) => on.add(k)); return on; }
    for (const row of r.rows) if (row.enabled && FLAG_KEYS.includes(row.flag_key)) on.add(row.flag_key);
  } catch (e) { DEFAULT_ON.forEach((k) => on.add(k)); }
  return on;
}

async function saveFlags(pool, companyId, wanted) {
  const set = new Set(Array.isArray(wanted) ? wanted : []);
  for (const key of OPTIONAL_KEYS) {
    await pool.query(
      `INSERT INTO inst_flags (company_id, flag_key, enabled) VALUES ($1,$2,$3)
       ON CONFLICT (company_id, flag_key) DO UPDATE SET enabled=EXCLUDED.enabled`,
      [companyId, key, set.has(key)]);
  }
}

function localized(flags) {
  return flags.map((f) => ({ key: f.key, path: f.path, icon: f.icon, label: f.label }));
}

module.exports = { FLAGS, FLAG_KEYS, OPTIONAL_KEYS, DEFAULT_ON, getFlags, saveFlags, localized };
