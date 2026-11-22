'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const { pool, initDealsDb } = require('./db');
const { listProviders, assertProviderAllowed } = require('./providers');
const { checkAffiliateUrl } = require('./affiliate');
const {
  decorateProduct,
  getSyncDashboard,
  syncAmazonCatalog,
  syncStatusLabel,
} = require('./catalog_sync');
// وحدتين مشتركتين من المنصّة الأساسية. Deals عملية مستقلة، بس هي جوّه نفس
// الريبو — فمفيش سبب تعيد كتابة قراية العنوان ولا فحص بايتات الملف، خصوصاً إن
// النسختين اللي كانت هنا كانوا فيهم نفس الغلطتين اللي المنصّة صلّحتهم.
const uploads = require('../src/lib/uploads');
const { clientIp } = require('../src/middleware/rateLimit');

const app = express();
const PORT = Number(process.env.DEALS_PORT || 5002);
const BASE_URL = String(process.env.DEALS_PUBLIC_URL || 'https://deals.oscardevs.com').replace(/\/+$/, '');
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'");
  if (req.path.startsWith('/admin')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(session({
  name: 'deals.sid',
  secret: process.env.DEALS_SESSION_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.DEALS_COOKIE_SECURE === 'true', maxAge: 8 * 60 * 60 * 1000 },
}));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

const loginAttempts = new Map();
app.use((req, res, next) => {
  if (!req.session.dealsCsrfToken) req.session.dealsCsrfToken = crypto.randomBytes(24).toString('hex');
  if (req.path.startsWith('/admin') && req.method === 'POST') {
    // المقارنة بالبايتات مش بالحروف: نص فيه حرف عربي واحد طوله حرف واحد
    // لكن بايتاته اتنين، و timingSafeEqual بترمي RangeError لو الطولين
    // مختلفين — يعني توكن مزوّد بحروف عربية كان بيطلّع 500 بدل 403.
    const submitted = Buffer.from(String(req.body?._csrf || req.get('x-csrf-token') || ''));
    const expected = Buffer.from(String(req.session.dealsCsrfToken));
    if (!submitted.length || submitted.length !== expected.length ||
        !crypto.timingSafeEqual(submitted, expected)) {
      return res.status(403).render('error', common(req, { status: 403, message: 'انتهت صلاحية النموذج. أعد تحميل الصفحة وحاول مرة أخرى.' }));
    }
  }
  next();
});

// الرفع: الامتداد من **النوع اللي اتفحص**، والملف نفسه بيتقرا من بايتاته.
//
// الشكل القديم كان بياخد الامتداد من `file.originalname` والنوع من
// `file.mimetype` — والاتنين بيكتبهم اللي بيرفع. يعني ملف مش صورة يتحفظ في
// `/uploads` باسم وامتداد يخلّي المتصفّح يتعامل معاه غلط. `uploads.guard`
// بيقرا أول بايتات الملف ويرفض اللي نوعه مش نوعه.
const upload = uploads.guard(multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${uploads.extname(file, '.bin')}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpeg|jpg|gif|webp)$/.test(file.mimetype)),
}).single('image_file'), 'image');

const txt = (v, max) => {
  const value = String(v == null ? '' : v).trim();
  return value ? value.slice(0, max) : null;
};
const slugify = (v) => {
  const value = String(v || '').trim().toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return value || `item-${Date.now()}`;
};
const safeUrl = (v) => {
  const value = txt(v, 1200);
  return value && /^https?:\/\//i.test(value) ? value : null;
};
const bool = (v) => v === '1' || v === 'on' || v === 'true';
const numberOrNull = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const integerOrNull = (v) => {
  const n = numberOrNull(v);
  return n == null || !Number.isInteger(n) ? null : n;
};
const metaText = (value, fallback = '') => String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 160);
const jsonLd = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const publicAssetUrl = (value) => {
  if (!value) return null;
  return /^https?:\/\//i.test(String(value)) ? String(value) : `${BASE_URL}/${String(value).replace(/^\/+/, '')}`;
};

function common(req, extra = {}) {
  return {
    site: req.app.locals.settings || { site_name: 'Deals', site_description: 'اختيارات شراء موصى بها', theme_color: '#0f766e' },
    baseUrl: BASE_URL,
    providers: listProviders(),
    csrfToken: req.session?.dealsCsrfToken || '',
    metaDescription: metaText(extra.metaDescription, req.app.locals.settings?.site_description || 'اختيارات شراء موصى بها من Deals'),
    noindex: false,
    structuredData: [],
    jsonLd,
    ...extra,
  };
}

// خطأ إدخال ≠ خطأ سيرفر.
//
// كان `throw new Error('العنوان ورابط Affiliate مطلوبان')` بيروح لـ `next(e)`
// وبيطلع صفحة 500 مكتوب فيها "حدث خطأ مؤقت. حاول مرة أخرى" — يعني النظام
// بيكدب على الأدمن: ده مش خطأ مؤقت وإعادة المحاولة مش هتصلّح حاجة.
function badInput(req, res, message) {
  return res.status(400).render('error', common(req, { status: 400, message }));
}

function requireAdmin(req, res, next) {
  if (!req.session.dealsAdmin) return res.redirect('/admin/login');
  next();
}

async function loadSettings() {
  const row = (await pool.query('SELECT * FROM deals_settings WHERE id = 1')).rows[0];
  return row;
}

app.use(async (req, _res, next) => {
  try { req.app.locals.settings = await loadSettings(); } catch (e) { console.error('[deals settings]', e.message); }
  next();
});

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'deals', database: 'ok' });
  } catch (e) {
    res.status(503).json({ ok: false, service: 'deals', database: 'unavailable' });
  }
});
app.get('/favicon.ico', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'logo.svg')));

app.get('/', async (req, res, next) => {
  try {
    const products = (await pool.query(
      `SELECT p.*, c.name AS category_name FROM deals_catalog_products p
       LEFT JOIN deals_categories c ON c.id = p.category_id
       WHERE p.is_published = true ORDER BY p.is_featured DESC, p.created_at DESC`
    )).rows.map(decorateProduct);
    const articles = (await pool.query(
      `SELECT * FROM deals_articles WHERE is_published = true
       ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 3`
    )).rows;
    res.render('home', common(req, {
      products, articles, title: req.app.locals.settings.site_name,
      metaDescription: 'اختيارات منتجات وأدلة شراء مختصرة تساعدك على المقارنة واتخاذ قرار أذكى.',
      structuredData: [{
        '@context': 'https://schema.org', '@type': 'WebSite', name: req.app.locals.settings.site_name,
        url: BASE_URL, inLanguage: 'ar', potentialAction: { '@type': 'SearchAction', target: `${BASE_URL}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
      }, {
        '@context': 'https://schema.org', '@type': 'ItemList', name: 'منتجات مختارة',
        itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${BASE_URL}/product/${encodeURIComponent(p.slug)}`, name: p.title })),
      }],
    }));
  } catch (e) { next(e); }
});

app.get('/category/:slug', async (req, res, next) => {
  try {
    const category = (await pool.query('SELECT * FROM deals_categories WHERE slug = $1 AND is_published = true', [req.params.slug])).rows[0];
    if (!category) return res.status(404).render('error', common(req, { status: 404, message: 'التصنيف غير موجود' }));
    const products = (await pool.query(
      `SELECT p.*, c.name AS category_name FROM deals_catalog_products p
       LEFT JOIN deals_categories c ON c.id = p.category_id
       WHERE p.category_id = $1 AND p.is_published = true
       ORDER BY p.is_featured DESC, p.created_at DESC`, [category.id]
    )).rows.map(decorateProduct);
    res.render('listing', common(req, {
      products, heading: category.name, description: category.description, title: `${category.name} — ${req.app.locals.settings.site_name}`,
      canonicalPath: `/category/${encodeURIComponent(category.slug)}`, metaDescription: metaText(category.description, `منتجات مختارة في تصنيف ${category.name}.`),
      structuredData: [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: BASE_URL },
        { '@type': 'ListItem', position: 2, name: category.name, item: `${BASE_URL}/category/${encodeURIComponent(category.slug)}` },
      ] }, { '@context': 'https://schema.org', '@type': 'ItemList', name: category.name, itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${BASE_URL}/product/${encodeURIComponent(p.slug)}`, name: p.title })) }],
    }));
  } catch (e) { next(e); }
});

app.get('/search', async (req, res, next) => {
  try {
    const q = txt(req.query.q, 100) || '';
    const products = q ? (await pool.query(
      `SELECT p.*, c.name AS category_name FROM deals_catalog_products p
       LEFT JOIN deals_categories c ON c.id = p.category_id
       WHERE p.is_published = true AND (p.title ILIKE $1 OR p.short_description ILIKE $1 OR p.brand ILIKE $1)
       ORDER BY p.is_featured DESC, p.created_at DESC`, [`%${q}%`]
    )).rows.map(decorateProduct) : [];
    res.render('listing', common(req, { products, heading: q ? `نتائج البحث: ${q}` : 'بحث', description: '', title: `بحث — ${req.app.locals.settings.site_name}`, canonicalPath: '/search', noindex: true, metaDescription: 'ابحث في المنتجات المختارة على Deals.' }));
  } catch (e) { next(e); }
});

app.get('/product/:slug', async (req, res, next) => {
  try {
    const product = decorateProduct((await pool.query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM deals_catalog_products p
       LEFT JOIN deals_categories c ON c.id = p.category_id
       WHERE p.slug = $1 AND p.is_published = true`, [req.params.slug]
    )).rows[0]);
    if (!product) return res.status(404).render('error', common(req, { status: 404, message: 'المنتج غير موجود' }));
    // ── السكيمة: السعر مش بيظهر إلا بعد تحديث رسمي حديث ───────────────────
    //
    // `offers.price` كان بيتنشر لجوجل من سعر **متكتوب بالإيد** في اللوحة،
    // أمازون بتشترط إن سعرها يتعرض من بياناتها ويتحدّث أو يتشال في ٢٤ ساعة،
    // وجوجل بتعامل `offers` على إنه **ادعاء** — لذلك لا نضعه إلا مع
    // `product.show_price` الذي يحرس بيانات API الحديثة.
    //
    // و`aggregateRating` كان بياخد تقييم أمازون ويقدّمه على إنه تقييم
    // **موقعنا**. مرفوض من الاتنين: أمازون بتمنع إعادة نشر محتوى التقييمات،
    // وجوجل بتشترط إن التقييم يكون لمحتوى مستضاف عندك.
    //
    // السعر الرسمي الحديث يتعرض للقارئ ولجوجل معًا؛ أما البيانات القديمة
    // فتظل خارج الصفحة والسكيمة إلى أن تنجح مزامنة جديدة.
    const productSchema = {
      '@context': 'https://schema.org', '@type': 'Product', name: product.title,
      description: metaText(product.short_description || product.full_description, product.title),
      url: `${BASE_URL}/product/${encodeURIComponent(product.slug)}`,
      image: product.image_url ? [publicAssetUrl(product.image_url)] : undefined,
      brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
      category: product.category_name || undefined,
      offers: product.show_price ? {
        '@type': 'Offer',
        price: Number(product.current_price).toFixed(2),
        priceCurrency: product.currency || 'EGP',
        url: product.affiliate_url,
        availability: product.availability
          ? (/out|unavailable|غير متاح/i.test(product.availability)
            ? 'https://schema.org/OutOfStock'
            : 'https://schema.org/InStock')
          : undefined,
      } : undefined,
    };
    Object.keys(productSchema).forEach((key) => productSchema[key] === undefined && delete productSchema[key]);
     res.render('product', common(req, {
       product,
       title: metaText(product.seo_title, `${product.title} — ${req.app.locals.settings.site_name}`),
       metaDescription: metaText(product.meta_description || product.short_description || product.full_description, `${product.title} — تفاصيل ومعلومات قبل الشراء.`),
       ogDescription: metaText(product.meta_description || product.short_description || product.full_description, `${product.title} — تفاصيل ومعلومات قبل الشراء.`),
       ogImage: publicAssetUrl(product.image_url),
       structuredData: [productSchema, { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'الرئيسية', item: BASE_URL }, ...(product.category_name ? [{ '@type': 'ListItem', position: 2, name: product.category_name, item: `${BASE_URL}/category/${encodeURIComponent(product.category_slug)}` }] : []), { '@type': 'ListItem', position: product.category_name ? 3 : 2, name: product.title, item: `${BASE_URL}/product/${encodeURIComponent(product.slug)}` }] }] }));
  } catch (e) { next(e); }
});

app.get('/article/:slug', async (req, res, next) => {
  try {
    const article = (await pool.query('SELECT * FROM deals_articles WHERE slug = $1 AND is_published = true', [req.params.slug])).rows[0];
    if (!article) return res.status(404).render('error', common(req, { status: 404, message: 'المقال غير موجود' }));
    res.render('article', common(req, { article, title: `${article.title} — ${req.app.locals.settings.site_name}`, metaDescription: metaText(article.excerpt, article.title), structuredData: [{ '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: metaText(article.excerpt, article.title), url: `${BASE_URL}/article/${encodeURIComponent(article.slug)}`, datePublished: article.published_at || article.created_at, dateModified: article.updated_at || article.created_at, image: article.cover_image_url ? [article.cover_image_url] : undefined, author: { '@type': 'Organization', name: req.app.locals.settings.site_name } }] }));
  } catch (e) { next(e); }
});

// الصفحات السياسية: **تتأرشف**، وكل واحدة كانونيكال لنفسها.
//
// كانت كلها `noindex` وكانت كلها `canonicalPath: ''` — يعني الخمس صفحات
// بيقولوا لجوجل "الأصل بتاعي هو الصفحة الرئيسية". ده غلطين مع بعض:
// إفصاح الأفيلييت اللي أمازون بتطلبه ظاهر وواضح كان محجوب عن الفهرس،
// وسياسة الخصوصية اللي أدسنس بتشترطها كمان. والكانونيكال الغلط بيخلّي
// جوجل يشيل الصفحات دي من الفهرس أصلاً ويعتبرها نسخة من الرئيسية.
const LEGAL_PAGES = {
  '/about': {
    title: 'عن Deals — من نحن وكيف نختار',
    heading: 'عن Deals',
    metaDescription: 'Deals منصة محتوى ومقارنة منتجات: نراجع ونرشّح من زاوية الاستخدام والقيمة، والشراء نفسه يتم لدى المتجر الخارجي. لا بيع ولا دفع ولا شحن ولا مرتجعات داخل الموقع.',
    body: [
      'Deals منصة محتوى واكتشاف منتجات. مهمتنا أن نختصر عليك وقت المقارنة: نجمع المنتج مع وصف عملي ونقاط المقارنة التي تهم فعلًا في الاستخدام اليومي، ثم نحيلك إلى المتجر الخارجي لإتمام الشراء.',
      'نحن لا نبيع المنتجات، ولا ننفذ الدفع أو الشحن أو المرتجعات، ولا نملك مخزونًا. أي عملية شراء تتم بالكامل لدى المتجر الخارجي وتخضع لشروطه وسياساته.',
      'المحتوى مكتوب من زاوية الاستخدام والقيمة، ولا يُكتب مقابل مقال مدفوع. الأسعار والتوافر مملوكان للمتجر الخارجي وقد يتغيران في أي وقت، لذلك التفاصيل النهائية تُراجع هناك قبل الشراء.',
    ],
  },
  '/affiliate-disclosure': {
    title: 'إفصاح Affiliate — Deals',
    heading: 'إفصاح Affiliate',
    metaDescription: 'إفصاح كامل عن روابط الأفيلييت في Deals: بعض الروابط تحقق لنا عمولة عند الشراء من المتجر الخارجي، دون أي تكلفة إضافية عليك ودون أي تأثير على ما نرشّحه.',
    body: [
      'As an Amazon Associate I earn from qualifying purchases.',
      'بعض الروابط في Deals روابط تابعة (affiliate). إذا اشتريت منتجًا عبر أحد هذه الروابط فقد نحصل على عمولة من المتجر الخارجي، دون أي تكلفة إضافية عليك ودون أي فرق في السعر الذي تدفعه.',
      'العمولة لا تغيّر ما نرشّحه: الترتيب والاختيار يعتمدان على مدى مناسبة المنتج للاستخدام، لا على نسبة العمولة. وكل رابط تابع في الموقع يحمل السمة rel="sponsored" ليكون واضحًا للمتصفح ولمحركات البحث.',
      'Deals لا يبيع المنتجات ولا يتولى الدفع أو الشحن أو المرتجعات. البيع والدعم بعد الشراء مسؤولية المتجر الخارجي وحده.',
    ],
  },
  '/privacy': {
    title: 'سياسة الخصوصية — Deals',
    heading: 'سياسة الخصوصية',
    metaDescription: 'ما الذي يجمعه Deals ولماذا: بيانات تشغيل أساسية فقط، بدون بيانات دفع وبدون أي عملية شراء داخل الموقع، مع شرح الكوكيز والجهات الخارجية وكيفية التواصل معنا.',
    body: [
      'نجمع الحد الأدنى اللازم لتشغيل الموقع: بيانات الزيارة الفنية (نوع المتصفح، الصفحة المطلوبة، وقت الطلب) وكوكي جلسة تقني لتشغيل لوحة الإدارة. لا نطلب بيانات دفع ولا تُنفَّذ أي عملية شراء داخل Deals.',
      'لا نبيع بياناتك ولا نشاركها لأغراض تسويقية. عند الضغط على رابط منتج تنتقل إلى موقع المتجر الخارجي، ومن تلك اللحظة تسري سياسة خصوصية ذلك المتجر — بما في ذلك ما يسجّله من زيارتك عبر الرابط التابع.',
      'قد نستخدم أدوات قياس أو إعلانات من جهات خارجية، وهذه الجهات قد تستخدم كوكيز خاصة بها. يمكنك ضبط الكوكيز أو حظرها من إعدادات متصفحك، وقد يؤثر ذلك على بعض وظائف الموقع.',
      'لأي استفسار عن بياناتك أو طلب حذف، استخدم صفحة تواصل معنا.',
    ],
  },
  '/terms': {
    title: 'الشروط والأحكام — Deals',
    heading: 'الشروط والأحكام',
    metaDescription: 'شروط استخدام Deals: الموقع للمحتوى والمقارنة والإحالة فقط، والأسعار والتوافر مملوكة للمتجر الخارجي وقد تتغير، والشراء نفسه يخضع لشروط ذلك المتجر وحده.',
    body: [
      'استخدامك لـ Deals يعني موافقتك على هذه الشروط. الموقع مخصص للمحتوى والمقارنة والإحالة فقط، ولا يتم داخله أي بيع أو دفع أو شحن أو استرجاع.',
      'الأسعار والتوافر والمواصفات مملوكة للمتجر الخارجي وقد تتغير في أي وقت دون إشعار. ما يظهر على Deals قد لا يكون محدَّثًا لحظيًا، والتفاصيل النهائية المعتمدة هي المعروضة على صفحة المنتج لدى البائع وقت الشراء.',
      'نبذل جهدًا معقولًا لدقة المحتوى، لكننا لا نضمن خلوّه من الأخطاء ولا نتحمل مسؤولية قرار شراء اتُّخذ بناءً عليه. أي نزاع يخص المنتج أو التسليم أو الإرجاع يُحلّ مع المتجر الخارجي.',
      'محتوى الموقع مملوك لـ Deals ما لم يُذكر غير ذلك. إذا لاحظت خطأ أو محتوى يحتاج تصحيحًا، أبلغنا عبر صفحة تواصل معنا وسنراجعه.',
    ],
  },
  '/contact': {
    title: 'تواصل معنا — Deals',
    heading: 'تواصل معنا',
    metaDescription: 'كيف تراسل فريق Deals: تصحيح معلومة عن منتج، رابط لم يعد يعمل، سؤال يخص الخصوصية، أو ملاحظة على المحتوى — وما يفيد إرساله في الرسالة لتسريع الرد عليك.',
    body: [
      'نرحّب بأي ملاحظة على المحتوى: سعر أو مواصفة تحتاج تصحيحًا، رابط لم يعد يعمل، أو منتج ترى أنه يستحق المراجعة.',
      'لتسريع الرد، أرسل رابط الصفحة على Deals وما لاحظته تحديدًا. لطلبات الخصوصية (استفسار أو حذف بيانات) اذكر ذلك صراحة في الرسالة.',
      'للتواصل: contact@deals.oscardevs.com — ننظر في الرسائل ونصحّح ما يثبت أنه خطأ. لا نتلقى طلبات شراء أو استفسارات عن شحن أو إرجاع، فهذه تُوجَّه إلى المتجر الخارجي الذي أتممت الشراء لديه.',
    ],
  },
};
Object.entries(LEGAL_PAGES).forEach(([routePath, page]) => {
  app.get(routePath, (req, res) => res.render('legal', common(req, {
    title: page.title,
    heading: page.heading,
    body: page.body,
    canonicalPath: routePath,
    noindex: false,
    metaDescription: page.metaDescription,
  })));
});

app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${BASE_URL}/sitemap.xml\n`));
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const [products, categories, articles] = await Promise.all([
      pool.query('SELECT slug, updated_at FROM deals_catalog_products WHERE is_published = true'),
      pool.query('SELECT slug FROM deals_categories WHERE is_published = true'),
      pool.query('SELECT slug, updated_at FROM deals_articles WHERE is_published = true'),
    ]);
    const escapeXml = (value) => String(value).replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char]));
    const urls = [
      { path: '', updatedAt: null },
      ...products.rows.map((p) => ({ path: `product/${encodeURIComponent(p.slug)}`, updatedAt: p.updated_at })),
      ...categories.rows.map((c) => ({ path: `category/${encodeURIComponent(c.slug)}`, updatedAt: null })),
      ...articles.rows.map((a) => ({ path: `article/${encodeURIComponent(a.slug)}`, updatedAt: a.updated_at || a.published_at })),
      // الصفحات السياسية بقت تتأرشف، فلازم تكون في السايت‌ماب — سايت‌ماب
      // فيه صفحة noindex غلطة، وصفحة index مش في السايت‌ماب فرصة ضايعة.
      ...Object.keys(LEGAL_PAGES).map((routePath) => ({ path: routePath.replace(/^\//, ''), updatedAt: null })),
    ];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${escapeXml(`${BASE_URL}/${u.path}`)}</loc>${u.updatedAt ? `<lastmod>${new Date(u.updatedAt).toISOString()}</lastmod>` : ''}</url>`).join('')}</urlset>`);
  } catch (e) { next(e); }
});

app.get('/admin/login', (req, res) => {
  if (req.session.dealsAdmin) return res.redirect('/admin');
  res.render('admin/login', common(req, { title: 'دخول إدارة Deals', error: null }));
});
app.post('/admin/login', async (req, res, next) => {
  try {
    // العنوان من القراية المشتركة، مش `req.ip`.
    //
    // `trust proxy` مفتوح فوق، يعني `req.ip` بيتقرا من `X-Forwarded-For` —
    // واللي بيكتبه هو **اللي بيحاول**. فبدل خمس محاولات كل ربع ساعة، كان
    // بيبعت هيدر مختلف كل مرة ويجرّب كلمات السر بلا حد.
    const ip = clientIp(req) || 'unknown';
    const now = Date.now();
    // وسقف للخريطة نفسها: من غيره اللي بينتحل العنوان بيملاها.
    if (loginAttempts.size > 5000) loginAttempts.clear();
    const recent = (loginAttempts.get(ip) || []).filter((time) => now - time < 15 * 60 * 1000);
    if (recent.length >= 5) {
      res.setHeader('Retry-After', '900');
      return res.status(429).render('admin/login', common(req, { title: 'دخول إدارة Deals', error: 'محاولات كثيرة. حاول بعد دقائق.' }));
    }
    const email = txt(req.body.email, 240)?.toLowerCase();
    const configuredEmail = String(process.env.DEALS_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').toLowerCase();
    const configuredPassword = process.env.DEALS_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
    const submittedPassword = Buffer.from(String(req.body.password || ''));
    const expectedPassword = Buffer.from(String(configuredPassword || ''));
    const passwordMatches = /^\$2[aby]\$\d{2}\$/.test(String(configuredPassword || ''))
      ? bcrypt.compareSync(String(req.body.password || ''), String(configuredPassword))
      : expectedPassword.length > 0
      && submittedPassword.length === expectedPassword.length
      && crypto.timingSafeEqual(submittedPassword, expectedPassword);
    if (!email || !configuredEmail || email !== configuredEmail || !passwordMatches) {
      recent.push(now);
      loginAttempts.set(ip, recent);
      return res.status(401).render('admin/login', common(req, { title: 'دخول إدارة Deals', error: 'بيانات الدخول غير صحيحة.' }));
    }
    loginAttempts.delete(ip);
    req.session.dealsAdmin = { email };
    res.redirect('/admin');
  } catch (e) { next(e); }
});
app.post('/admin/logout', requireAdmin, (req, res) => req.session.destroy(() => res.redirect('/admin/login')));

app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const [products, categories, articles, sync] = await Promise.all([
      pool.query('SELECT p.*, c.name AS category_name FROM deals_catalog_products p LEFT JOIN deals_categories c ON c.id=p.category_id ORDER BY p.created_at DESC'),
      pool.query('SELECT * FROM deals_categories ORDER BY name'),
      pool.query('SELECT * FROM deals_articles ORDER BY created_at DESC'),
      getSyncDashboard(),
    ]);
    const notice = {
      success: 'تم تحديث كتالوج Amazon بنجاح.',
      partial: 'اكتمل التحديث جزئيًا؛ راجع حالات المنتجات.',
      failed: 'فشل تحديث كتالوج Amazon؛ لم نحتفظ بسعر أو توافر قديم.',
      skipped: 'تم تخطي التحديث لأن المصدر غير مهيأ أو توجد مزامنة أخرى.',
    }[req.query.sync];
    res.render('admin/dashboard', common(req, { products: products.rows, categories: categories.rows, articles: articles.rows, sync, syncStatusLabel, notice, title: 'إدارة Deals' }));
  } catch (e) { next(e); }
});

app.post('/admin/amazon-sync', requireAdmin, async (req, res, next) => {
  try {
    const result = await syncAmazonCatalog({ triggeredBy: 'admin' });
    res.redirect(`/admin?sync=${encodeURIComponent(result.status)}`);
  } catch (e) { next(e); }
});

app.post('/admin/settings', requireAdmin, async (req, res, next) => {
  try {
    await pool.query(`UPDATE deals_settings SET site_name=$1, site_description=$2, logo_url=$3, theme_color=$4, updated_at=now() WHERE id=1`,
      [txt(req.body.site_name, 120) || 'Deals', txt(req.body.site_description, 300) || 'اختيارات شراء موصى بها', safeUrl(req.body.logo_url), /^#[0-9a-f]{6}$/i.test(req.body.theme_color || '') ? req.body.theme_color : '#0f766e']);
    res.redirect('/admin');
  } catch (e) { next(e); }
});

app.post('/admin/categories', requireAdmin, async (req, res, next) => {
  try {
    const name = txt(req.body.name, 120);
    if (name) await pool.query('INSERT INTO deals_categories (name, slug, description) VALUES ($1,$2,$3) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description', [name, slugify(req.body.slug || name), txt(req.body.description, 300)]);
    res.redirect('/admin');
  } catch (e) { next(e); }
});

app.post('/admin/categories/:id/delete', requireAdmin, async (req, res, next) => {
  try { await pool.query('DELETE FROM deals_categories WHERE id=$1', [req.params.id]); res.redirect('/admin'); } catch (e) { next(e); }
});

app.post('/admin/products', requireAdmin, upload, async (req, res, next) => {
  try {
    assertProviderAllowed(req.body.source || 'MANUAL');
    const title = txt(req.body.title, 180);
    const link = checkAffiliateUrl(req.body.affiliate_url);
    if (!title) return badInput(req, res, 'عنوان المنتج مطلوب.');
    if (!link.ok) return badInput(req, res, link.error);
    const affiliateUrl = link.url;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : safeUrl(req.body.image_url);
    const price = numberOrNull(req.body.current_price);
    const originalPrice = numberOrNull(req.body.original_price);
    await pool.query(
      `INSERT INTO deals_catalog_products
       (source, external_id, title, slug, short_description, full_description, brand, category_id,
        image_url, current_price, currency, original_price, amazon_product_url, affiliate_url,
         rating, review_count, availability, is_featured, is_published, seo_title, meta_description, image_alt)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [req.body.source || 'MANUAL', txt(req.body.external_id, 80), title, slugify(req.body.slug || title),
         txt(req.body.short_description, 400), txt(req.body.full_description, 8000), txt(req.body.brand, 120),
         req.body.category_id || null, imageUrl, price, txt(req.body.currency, 8) || 'EGP',
         originalPrice, safeUrl(req.body.amazon_product_url), affiliateUrl,
         numberOrNull(req.body.rating), integerOrNull(req.body.review_count),
         txt(req.body.availability, 120), bool(req.body.is_featured), bool(req.body.is_published),
          txt(req.body.seo_title, 60), txt(req.body.meta_description, 160), txt(req.body.image_alt, 180)],
    );
    res.redirect('/admin');
  } catch (e) { next(e); }
});

app.post('/admin/products/:id/toggle', requireAdmin, async (req, res, next) => {
  try { await pool.query('UPDATE deals_catalog_products SET is_published=NOT is_published, updated_at=now() WHERE id=$1', [req.params.id]); res.redirect('/admin'); } catch (e) { next(e); }
});
app.get('/admin/products/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const [product, categories] = await Promise.all([
      pool.query('SELECT * FROM deals_catalog_products WHERE id=$1', [req.params.id]),
      pool.query('SELECT * FROM deals_categories ORDER BY name'),
    ]);
    if (!product.rows[0]) return res.redirect('/admin');
    res.render('admin/edit_product', common(req, { product: product.rows[0], categories: categories.rows, title: 'تعديل منتج' }));
  } catch (e) { next(e); }
});
app.post('/admin/products/:id/edit', requireAdmin, upload, async (req, res, next) => {
  try {
    const current = (await pool.query('SELECT * FROM deals_catalog_products WHERE id=$1', [req.params.id])).rows[0];
    if (!current) return res.redirect('/admin');
    const title = txt(req.body.title, 180);
    const link = checkAffiliateUrl(req.body.affiliate_url);
    if (!title) return badInput(req, res, 'عنوان المنتج مطلوب.');
    if (!link.ok) return badInput(req, res, link.error);
    const affiliateUrl = link.url;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : (safeUrl(req.body.image_url) || current.image_url);
    const price = numberOrNull(req.body.current_price);
    await pool.query(
      `UPDATE deals_catalog_products SET title=$1,slug=$2,short_description=$3,full_description=$4,
       brand=$5,category_id=$6,image_url=$7,current_price=$8,currency=$9,original_price=$10,
        amazon_product_url=$11,affiliate_url=$12,availability=$13,is_featured=$14,is_published=$15,
        seo_title=$16,meta_description=$17,image_alt=$18,updated_at=now()
        WHERE id=$19`,
      [title, slugify(req.body.slug || title), txt(req.body.short_description, 400), txt(req.body.full_description, 8000),
         txt(req.body.brand, 120), req.body.category_id || null, imageUrl, price,
         txt(req.body.currency, 8) || 'EGP', numberOrNull(req.body.original_price),
        safeUrl(req.body.amazon_product_url), affiliateUrl, txt(req.body.availability, 120),
         bool(req.body.is_featured), bool(req.body.is_published), txt(req.body.seo_title, 60),
         txt(req.body.meta_description, 160), txt(req.body.image_alt, 180), req.params.id]
    );
    res.redirect('/admin');
  } catch (e) { next(e); }
});
app.post('/admin/products/:id/delete', requireAdmin, async (req, res, next) => {
  try { await pool.query('DELETE FROM deals_catalog_products WHERE id=$1', [req.params.id]); res.redirect('/admin'); } catch (e) { next(e); }
});

app.post('/admin/articles', requireAdmin, async (req, res, next) => {
  try {
    const title = txt(req.body.title, 180);
    const body = txt(req.body.body, 30000);
    if (title && body) await pool.query(
      `INSERT INTO deals_articles (title,slug,excerpt,body,is_published,published_at)
       VALUES ($1,$2,$3,$4,$5,CASE WHEN $5 THEN now() ELSE NULL END)
       ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title,excerpt=EXCLUDED.excerpt,body=EXCLUDED.body,is_published=EXCLUDED.is_published,published_at=EXCLUDED.published_at,updated_at=now()`,
      [title, slugify(req.body.slug || title), txt(req.body.excerpt, 400), body, bool(req.body.is_published)]
    );
    res.redirect('/admin');
  } catch (e) { next(e); }
});
app.post('/admin/articles/:id/delete', requireAdmin, async (req, res, next) => {
  try { await pool.query('DELETE FROM deals_articles WHERE id=$1', [req.params.id]); res.redirect('/admin'); } catch (e) { next(e); }
});

// أي مسار مجهول = ٤٠٤ بصفحة الموقع.
//
// مكانه هنا مقصود: **بعد** كل الراوتس وقبل معالج الأخطاء. من غيره كان
// Express بيردّ بصفحته الافتراضية «Cannot GET /whatever» — نص إنجليزي خام
// بلا هيدر ولا فوتر ولا لغة الموقع، وبيكشف إن ورا ده Express. واختبار QA
// الحي مسكها بالظبط كده على `/nothing-here`.
app.use((req, res) => {
  res.status(404).render('error', common(req, {
    status: 404,
    message: 'الصفحة اللي بتدوّر عليها مش موجودة على Deals.',
  }));
});

app.use((err, req, res, _next) => {
  console.error('[deals]', err.stack || err.message);
  if (res.headersSent) return;
  res.status(500).render('error', common(req, { status: 500, message: 'حدث خطأ مؤقت. حاول مرة أخرى.' }));
});

initDealsDb()
  .then(() => app.listen(PORT, '127.0.0.1', () => console.log(`Deals app running on 127.0.0.1:${PORT}`)))
  .catch((err) => { console.error('[deals] database init failed:', err.stack || err.message); process.exitCode = 1; });

module.exports = app;