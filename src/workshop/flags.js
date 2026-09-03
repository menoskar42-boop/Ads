// Optional features of the workshop system, one independent toggle each.
//
// Same contract as src/furniture/flags.js: the sidebar reads this list and so
// does the route guard, so a feature can never be reachable by URL after it has
// been hidden. `core: true` marks what a workshop cannot run without — shown on
// the settings page, but not switchable.
'use strict';

const FLAGS = [
  { key: 'jobs', label: 'أوامر الشغل', icon: '🧾', path: '/workshop/jobs', core: true,
    desc: 'استلام العربية، الشكوى، التشخيص، الشغل اللي اتعمل، والتسليم.' },
  { key: 'board', label: 'لوحة التشغيل', icon: '▦', path: '/workshop/board',
    desc: 'صورة لحظية لكل عربية: جديدة، في الفحص، تحت الشغل، جاهزة أو متأخرة.' },
  { key: 'appointments', label: 'المواعيد', icon: '◷', path: '/workshop/appointments',
    desc: 'جدول استقبال منظم وربط الموعد بأمر الشغل بدون إعادة إدخال البيانات.' },
  { key: 'vehicles', label: 'العربيات والعملاء', icon: '🚗', path: '/workshop/vehicles', core: true,
    desc: 'ملف كل عربية بتاريخها الكامل — تدوّر بالرقم وتلاقي كل حاجة اتعملت فيها.' },
  { key: 'customers', label: 'العملاء', icon: '👥', path: '/workshop/customers', core: true,
    desc: 'بيانات العملاء وحالة الحساب مع الحفاظ على تاريخ العربيات وأوامر الشغل.' },
  { key: 'crm', label: 'CRM والمتابعة', icon: '◎', path: '/workshop/crm',
    desc: 'مراحل العملاء المحتملين، تصنيف العملاء، ومواعيد المتابعة في لوحة واحدة.' },
  { key: 'parts', label: 'قطع الغيار', icon: '🔩', path: '/workshop/parts',
    desc: 'مخزون القطع بمتوسط تكلفة متحرّك، والحد الأدنى، وحركة الصرف.' },
  { key: 'purchasing', label: 'الموردون والشراء', icon: '▤', path: '/workshop/purchasing',
    desc: 'موردون وأوامر شراء واستلام جزئي يحدّث المخزون والتكلفة بدقة.' },
  { key: 'reminders', label: 'تذكير الصيانة', icon: '⏰', path: '/workshop/reminders',
    desc: 'العربيات اللي جه معادها — بالكيلومترات وبالشهور. دي اللي بترجّع العميل.' },
  { key: 'technicians', label: 'الفنّيين', icon: '👨‍🔧', path: '/workshop/technicians',
    desc: 'الفنّيين وتخصّصاتهم، ومستحقاتهم باليومية أو بنسبة من المصنعية.' },
  { key: 'photos', label: 'صور قبل وبعد', icon: '📷', path: '/workshop/jobs',
    desc: 'صور العربية وهي داخلة وخارجة — بتقفل أي خلاف على خربوشة.' },
  { key: 'inspections', label: 'الفحص الرقمي', icon: '✓', path: '/workshop/jobs',
    desc: 'قائمة فحص موحدة، ملاحظات وصور، وتحويل العيوب إلى بنود عرض سعر.' },
  { key: 'customer_portal', label: 'رابط العميل', icon: '↗', path: '/workshop/jobs',
    desc: 'العميل يتابع حالة عربيته ويوافق على العرض من رابط آمن على موبايله.' },
  { key: 'audit', label: 'سجل النشاط', icon: '≡', path: '/workshop/jobs',
    desc: 'سجل واضح للموافقات وتغييرات الحالة والمدفوعات داخل كل أمر شغل.' },
  { key: 'invoices', label: 'الفواتير والتحصيل', icon: '💵', path: '/workshop/invoices',
    desc: 'إجمالي كل أمر شغل، المدفوع والمتبقّي، وكشف حساب العميل.' },
  { key: 'expenses', label: 'المصروفات', icon: '💸', path: '/workshop/expenses',
    desc: 'مصروفات الورشة بالتصنيف.' },
  { key: 'reports', label: 'التقارير', icon: '📊', path: '/workshop/reports',
    desc: 'الإيراد والمصنعية وقطع الغيار والربح، وأكتر الأعطال تكراراً.' },
  { key: 'warranty', label: 'الضمان', icon: '🛡️', path: '/workshop/warranty',
    desc: 'ضمان الشغل، وبيبدأ يوم تسليم العربية مش يوم الفاتورة.' },
  { key: 'change_orders', label: 'موافقات إضافية', icon: '✍️', path: '/workshop/change-orders',
    desc: 'اعرض أي إصلاح إضافي على العميل وسجّل موافقته قبل التنفيذ.' },
  { key: 'floor', label: 'الفنيون والرافعات', icon: '🧰', path: '/workshop/floor',
    desc: 'توزيع العربيات على الرافعات وتسجيل وقت الفني الفعلي.' },
  { key: 'communications', label: 'رسائل العملاء', icon: '💬', path: '/workshop/communications',
    desc: 'رسائل جاهزة عبر WhatsApp مع سجل واضح لما تم إرساله.' },
  { key: 'warranty_claims', label: 'مطالبات الضمان', icon: '↩️', path: '/workshop/warranty-claims',
    desc: 'تسجيل عودة السيارة لنفس المشكلة وتحليل أسباب الـ comeback.' },
];

const FLAG_KEYS = FLAGS.map((f) => f.key);
// Everything the owner can switch off. The core pair stays on always.
const OPTIONAL_KEYS = FLAGS.filter((f) => !f.core).map((f) => f.key);
// A new workshop starts with the parts that make the product obviously useful
// on day one; the rest are opt-in so the sidebar is not a wall.
const DEFAULT_ON = [
  'parts', 'purchasing', 'reminders', 'invoices', 'board', 'appointments',
  'inspections', 'customer_portal', 'audit', 'change_orders', 'floor',
  'communications', 'warranty_claims', 'barcodes', 'crm',
];

/** Feature keys enabled for a company, as a Set. Core keys are always in it. */
async function getFlags(pool, companyId) {
  const on = new Set(FLAGS.filter((f) => f.core).map((f) => f.key));
  // New workflow features are enabled for existing workshops too. An explicit
  // saved false still wins, so owners retain control from Settings.
  DEFAULT_ON.forEach((k) => on.add(k));
  try {
    const r = await pool.query(
      'SELECT flag_key, enabled FROM workshop_flags WHERE company_id = $1', [companyId]
    );
    for (const row of r.rows) {
      if (row.enabled && FLAG_KEYS.includes(row.flag_key)) on.add(row.flag_key);
      if (!row.enabled) on.delete(row.flag_key);
    }
  } catch (e) {
    // A flags read that fails must not lock the owner out of their own
    // workshop: fall back to the defaults rather than an empty sidebar.
    DEFAULT_ON.forEach((k) => on.add(k));
  }
  return on;
}

/** Persist the toggles. Core keys are ignored — they cannot be switched off. */
async function saveFlags(pool, companyId, wanted) {
  const set = new Set(Array.isArray(wanted) ? wanted : []);
  for (const key of OPTIONAL_KEYS) {
    await pool.query(
      `INSERT INTO workshop_flags (company_id, flag_key, enabled) VALUES ($1,$2,$3)
       ON CONFLICT (company_id, flag_key) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [companyId, key, set.has(key)]
    );
  }
}

/**
 * Sidebar entries for the enabled features, translated.
 * `photos` is deliberately excluded: it has no page of its own — it lives
 * inside the job card — so listing it would give the sidebar a dead link.
 */
function localized(flags, t) {
  return flags
    .filter((f) => !['photos', 'inspections', 'customer_portal', 'audit'].includes(f.key))
    .map((f) => ({
      key: f.key,
      path: f.path,
      icon: f.icon,
      label: (typeof t === 'function' && t('wsh.nav.' + f.key) !== 'wsh.nav.' + f.key)
        ? t('wsh.nav.' + f.key) : f.label,
    }));
}

module.exports = { FLAGS, FLAG_KEYS, OPTIONAL_KEYS, DEFAULT_ON, getFlags, saveFlags, localized };
