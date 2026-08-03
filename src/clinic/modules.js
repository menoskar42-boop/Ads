// Central registry of the clinic's optional (enterprise) modules.
// Each module is toggled per-clinic from the OscarDevs super-admin
// (/admin/companies/:id/modules). The clinic admin only shows tabs +
// serves routes for modules that are enabled for that clinic.
//
// Keep this list the single source of truth: the super-admin toggle page,
// the clinic nav, and the requireModule() guard all read from it.

const MODULES = [
  { key: 'inventory',  label: 'المخزون',        icon: '📦', path: '/clinic/inventory',  desc: 'أصناف ومستلزمات العيادة، الكميات، وحركة الصرف والإضافة.' },
  { key: 'insurance',  label: 'التأمين',        icon: '🛡️', path: '/clinic/insurance',  desc: 'شركات التأمين ونسب التغطية ومطالبات التأمين للمرضى.' },
  { key: 'branches',   label: 'الفروع',         icon: '🏢', path: '/clinic/branches',   desc: 'إدارة فروع العيادة المتعددة (لو أكثر من مقر).' },
  { key: 'hr',         label: 'الموظفون',       icon: '👥', path: '/clinic/staff',      desc: 'بيانات الموظفين وتسجيل الحضور والانصراف.' },
  { key: 'callcenter', label: 'مركز الاتصال',   icon: '📞', path: '/clinic/calls',      desc: 'سجل المكالمات والمتابعات مع المرضى وحجز المكالمات القادمة.' },
  { key: 'whatsapp',   label: 'واتساب',         icon: '💬', path: '/clinic/whatsapp',   desc: 'ربط رقم واتساب العيادة (Cloud API أو مزوّد خارجي) لإرسال تأكيدات وتذكير المواعيد. كل عيادة تضع مفتاحها الخاص.' },
  { key: 'api',        label: 'API والمكاملات', icon: '🔌', path: '/clinic/integrations', desc: 'مفاتيح API وويب-هوكس لربط العيادة بأنظمة خارجية.' },
  { key: 'dental',     label: 'الأسنان',        icon: '🦷', path: '/clinic/dental',     desc: 'خريطة الأسنان (FDI)، خطة علاج لكل سن، طلبات المعمل، وصور قبل/بعد. لعيادات الأسنان فقط.' },
  { key: 'cashbox',    label: 'الخزنة',         icon: '💰', path: '/clinic/cashbox',    desc: 'رصيد أول اليوم، المقبوضات والمصروفات النثرية، وتقفيل الخزنة بالفرق بين المحسوب والمعدود.' },
  { key: 'installments', label: 'التقسيط',      icon: '🧾', path: '/clinic/installments', desc: 'تقسيط الفاتورة على دفعات بمواعيد، ومتابعة المستحق والمتأخر — وكل دفعة بتتسجّل كتحصيل عادي.' },
  { key: 'homevisits', label: 'زيارات منزلية',  icon: '🏠', path: '/clinic/home-visits', desc: 'طلبات الكشف في المنزل: العنوان والمنطقة، الطبيب، رسوم الكشف والانتقال، ومتابعة الحالة حتى التحصيل.' },
];

const MODULE_KEYS = MODULES.map((m) => m.key);

// Returns a Set of enabled module keys for a clinic. Never throws — on any
// error returns an empty set (all optional modules simply hidden).
async function getEnabledModules(pool, companyId) {
  try {
    const r = await pool.query(
      'SELECT module_key FROM clinic_modules WHERE company_id=$1 AND enabled=true',
      [companyId]
    );
    return new Set(r.rows.map((x) => x.module_key));
  } catch (e) {
    return new Set();
  }
}

module.exports = { MODULES, MODULE_KEYS, getEnabledModules };
