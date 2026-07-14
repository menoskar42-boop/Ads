// Per-store feature flags (Amazon roadmap phase 21). Every storefront feature
// can be switched on/off by the store owner from /company/features. Defaults are
// ON, so existing stores are unaffected until the owner turns something off.
// Only overrides are persisted (company_features); absence = default.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const FEATURES = [
  { key: 'search',          label: 'البحث اللحظي',        desc: 'اقتراحات فورية أثناء الكتابة في خانة البحث.', default: true },
  { key: 'filters',         label: 'الفلترة والترتيب',    desc: 'شريط فلترة بالسعر/التوفّر وترتيب النتائج.', default: true },
  { key: 'reviews',         label: 'تقييمات العملاء',      desc: 'نجوم ومراجعات المنتج (بعد الشراء).', default: true },
  { key: 'recommendations', label: 'منتجات مقترحة',        desc: 'قسم «قد يعجبك أيضاً» في صفحة المنتج.', default: true },
  { key: 'recently_viewed', label: 'شوهدت مؤخراً',         desc: 'عرض آخر المنتجات اللي زارها الزائر.', default: true },
  { key: 'wishlist',        label: 'قائمة المفضّلة',       desc: 'زر القلب لحفظ المنتجات للشراء لاحقاً.', default: true },
  { key: 'variants',        label: 'خيارات المنتج',        desc: 'اختيار مقاس/لون بمخزون وسعر مختلف.', default: true },
  { key: 'zoom',            label: 'تكبير الصور',          desc: 'فتح صورة المنتج بملء الشاشة مع تكبير.', default: true },
];

const KEYS = FEATURES.map((f) => f.key);
const DEFAULTS = FEATURES.reduce((o, f) => { o[f.key] = f.default; return o; }, {});

// Resolve a company's effective feature map (defaults merged with overrides).
// Never throws — on error returns the defaults (features on).
async function getFeatures(companyId) {
  const out = Object.assign({}, DEFAULTS);
  if (!companyId) return out;
  try {
    const r = await pool.query('SELECT feature_key, enabled FROM company_features WHERE company_id=$1', [companyId]);
    r.rows.forEach((row) => { if (row.feature_key in out) out[row.feature_key] = row.enabled; });
  } catch (e) { /* fall back to defaults */ }
  return out;
}

// Persist the full set from an admin form (checkbox present = on).
async function setFeatures(companyId, body) {
  for (const k of KEYS) {
    const on = String(body['feat_' + k]) === '1';
    await pool.query(
      `INSERT INTO company_features (company_id, feature_key, enabled) VALUES ($1,$2,$3)
       ON CONFLICT (company_id, feature_key) DO UPDATE SET enabled=EXCLUDED.enabled`,
      [companyId, k, on]
    );
  }
}

module.exports = { FEATURES, KEYS, DEFAULTS, getFeatures, setFeatures };
