// Optional features of the furniture system, one independent toggle each.
//
// The spec's requirement is that every optional feature works whether its
// toggle is on or off. That only holds if the toggle is the single gate: the
// sidebar reads this list, and so does the route guard, so a feature can never
// be reachable by URL after it has been hidden.
//
// `core: true` marks the parts a showroom cannot run without — they are listed
// so the settings page can show them, but they are not switchable.
'use strict';

const FLAGS = [
  { key: 'master',     label: 'البيانات الأساسية', icon: '📇', path: '/furniture/master/suppliers', core: true,
    desc: 'الموردين والعملاء والخامات والعمالة والمنتجات.' },
  { key: 'purchases',  label: 'المشتريات',        icon: '🧾', path: '/furniture/purchases',
    desc: 'أوامر شراء للموردين، استلام كلي أو جزئي، وحساب كل مورد.' },
  { key: 'inventory',  label: 'المخزون',          icon: '📦', path: '/furniture/master/materials',
    desc: 'أرصدة الخامات، الحد الأدنى، وحركة الصرف والوارد.' },
  { key: 'sales',      label: 'المبيعات',         icon: '🛒', path: '/furniture/sales',
    desc: 'فواتير بمقدّم ودفعات، والمتبقّي وكشف حساب العميل.' },
  { key: 'quotes',     label: 'العملاء المحتملين وعروض الأسعار', icon: '📝', path: '/furniture/quotes',
    desc: 'اللي سأل وماشتراش لسه، وعرض السعر اللي اتقاله — وبصلاحيته، وبيتحوّل لفاتورة مرة واحدة.' },
  { key: 'returns',    label: 'المرتجعات',        icon: '↩️', path: '/furniture/returns',
    desc: 'إشعار خصم للقطعة الراجعة، ورد الفلوس كله أو جزء منه.' },
  { key: 'delivery',   label: 'التسليم والتركيب', icon: '🚚', path: '/furniture/delivery',
    desc: 'مواعيد التسليم والتركيب، الطاقم، والمتأخّر — والرحلة اللي فشلت متسجّلة.' },
  { key: 'bom',        label: 'مكوّنات المنتج',    icon: '🪚', path: '/furniture/bom',
    desc: 'خامات كل قطعة، تكلفتها المحسوبة تلقائياً، والربح المتوقّع.' },
  { key: 'production', label: 'أوامر التصنيع',    icon: '🔨', path: '/furniture/production',
    desc: 'اللي بيتصنّع دلوقتي وبيتسلّم امتى، وصرف خامات القطعة من المخزن مرة واحدة.' },
  { key: 'hr',         label: 'الحضور والمرتّبات', icon: '👷', path: '/furniture/hr/attendance',
    desc: 'حضور وانصراف، ومرتّبات بالخصومات والمكافآت والجزاءات والسلف.' },
  { key: 'canteen',    label: 'الكانتين',         icon: '🍵', path: '/furniture/canteen',
    desc: 'مشتريات العمالة نقداً أو على الحساب — واللي على الحساب بيتخصم في المرتّب.' },
  { key: 'expenses',   label: 'المصروفات',        icon: '💸', path: '/furniture/expenses',
    desc: 'مصروفات الورشة والمعرض بالتصنيف.' },
  { key: 'reports',    label: 'التقارير',         icon: '📊', path: '/furniture/reports',
    desc: 'مبيعات ومشتريات ومخزون وأرصدة وأرباح، بطباعة وتصدير.' },
  { key: 'warranty',   label: 'الضمان',           icon: '🛡️', path: '/furniture/warranty',
    desc: 'ضمان كل قطعة، وبيبدأ يوم التسليم مش يوم الفاتورة، وتنبيه قبل ما يخلص.' },
  { key: 'alerts',     label: 'التنبيهات',         icon: '🔔', path: '/furniture/alerts',
    desc: 'اللي محتاج انتباهك دلوقتي — بيتحسب لحظياً، مفيش تنبيه بايت ولا زرار تجاهل.' },
  { key: 'branches',   label: 'الفروع',            icon: '🏬', path: '/furniture/branches',
    desc: 'معرض وورشة ومخزن — الفلوس والمواعيد لكل فرع، والخامات والكتالوج مشتركين.' },
  { key: 'labels',     label: 'الباركود والملصقات', icon: '🏷️', path: '/furniture/labels',
    desc: 'كود لكل قطعة وخامة، وورقة ملصقات بباركود جاهزة للطباعة.' },
  { key: 'backup',     label: 'نسخة احتياطية',     icon: '💾', path: '/furniture/backup',
    desc: 'كل بياناتك في ملف إكسل واحد تنزّله وتحتفظ بيه.' },
  { key: 'activity',   label: 'سجل النشاط',       icon: '🕵️', path: '/furniture/activity',
    desc: 'مين عمل إيه وامتى. التسجيل شغّال دايماً — القسم بيخفي الصفحة بس.' },
];

const FLAG_KEYS = FLAGS.map((f) => f.key);

/**
 * The flag list in the caller's language. The labels above are Arabic defaults;
 * without this an English showroom reads its own menu in Arabic — the exact leak
 * the clinic had to be corrected for after the fact.
 */
function localized(list, t) {
  if (typeof t !== 'function') return list;
  const tr = (key, fallback) => { const v = t(key); return v && v !== key ? v : fallback; };
  return list.map((f) => Object.assign({}, f, {
    label: tr('fn2.flag.' + f.key, f.label),
    desc: tr('fn2.flagdesc.' + f.key, f.desc),
  }));
}
const OPTIONAL_KEYS = FLAGS.filter((f) => !f.core).map((f) => f.key);

// Features a new showroom starts with. Everything a furniture business does on
// day one is on; the rest it turns on when it needs it.
const DEFAULT_ON = new Set(['purchases', 'inventory', 'sales', 'returns', 'delivery',
  'warranty', 'expenses', 'reports', 'backup', 'alerts', 'activity']);

/**
 * Enabled flags for one showroom. Core features are always in the set.
 * Never throws — on any error the showroom simply sees the core only, which is
 * a usable system rather than a broken page.
 */
async function getFlags(pool, companyId) {
  const on = new Set(FLAGS.filter((f) => f.core).map((f) => f.key));
  try {
    const r = await pool.query(
      'SELECT flag_key, enabled FROM furniture_flags WHERE company_id=$1', [companyId]
    );
    if (!r.rows.length) {
      // Never configured: fall back to the defaults rather than showing nothing.
      DEFAULT_ON.forEach((k) => on.add(k));
      return on;
    }
    const seen = new Set();
    for (const row of r.rows) {
      seen.add(row.flag_key);
      if (row.enabled) on.add(row.flag_key);
    }
    // A flag added to the code after this showroom saved its settings has no
    // row yet; give it its default instead of leaving it silently off.
    for (const k of OPTIONAL_KEYS) if (!seen.has(k) && DEFAULT_ON.has(k)) on.add(k);
    return on;
  } catch (e) {
    return on;
  }
}

/** Persist the chosen set. Core flags are ignored — they are not switchable. */
async function saveFlags(pool, companyId, wanted) {
  for (const key of OPTIONAL_KEYS) {
    await pool.query(
      `INSERT INTO furniture_flags (company_id, flag_key, enabled, updated_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (company_id, flag_key)
       DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
      [companyId, key, wanted.has(key)]
    );
  }
}

module.exports = { FLAGS, FLAG_KEYS, OPTIONAL_KEYS, DEFAULT_ON, getFlags, saveFlags, localized };
