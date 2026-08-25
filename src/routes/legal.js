const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { rateLimit } = require('../middleware/rateLimit');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TERMS_VERSION = '1.0';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://oscardevs.com';
// Bare base domain (e.g. "oscardevs.com") for building the production subdomain
// URLs that tenant pages canonicalize to — so the sitemap lists the same URLs.
const BASE_DOMAIN = SITE_ORIGIN.replace(/^https?:\/\//, '').replace(/\/$/, '');

// Legal pages are real content — allow AdSense.
router.use((req, res, next) => { res.locals.showAds = true; next(); });

router.get('/privacy', (req, res) => {
  res.render('legal/privacy');
});

router.get('/terms', (req, res) => {
  res.render('legal/terms', { termsVersion: TERMS_VERSION });
});

router.get('/about', (req, res) => {
  res.render('legal/about');
});

router.get('/faq', (req, res) => {
  res.render('legal/faq');
});

router.get('/help', (req, res) => {
  res.render('legal/help');
});

router.get('/our-work', (req, res) => {
  res.render('legal/our_work');
});

// ── Sector landing pages ─────────────────────────────────────────────────────
//
// One page per vertical instead of a card on a crowded home page. The dental
// one is first because it needed no development at all: the module has been
// shipped for months and simply had nowhere to be sold from.
router.get('/dental', (req, res) => {
  res.render('landing/dental');
});

// Sector landing page: car workshops. Codex's external review called this the
// strongest sales opportunity on the site and said to give it a full page of
// its own rather than a card among twelve — the argument every workshop has
// ("I never agreed to that") is a message that sells itself.
router.get('/workshop', (req, res) => {
  res.render('landing/workshop');
});

// A reference page per system: /pharmacy-management-egypt and its eight
// siblings. The GEO review's point was that twelve systems shared one crowded
// home page, so a question like "أفضل برنامج إدارة صيدلية في مصر" had nothing
// on this site to match — a card cannot be cited. /dental and /workshop
// already worked this way; these are the rest, driven by one content module so
// the words per sector stay that sector's own.
const { SECTORS, othersOf } = require('../lib/sector_landings');
for (const slug of Object.keys(SECTORS)) {
  router.get('/' + slug, (req, res) => {
    const sector = Object.assign({ slug }, SECTORS[slug]);
    res.render('landing/sector', {
      sector,
      others: othersOf(slug),
      demoUrl: 'https://' + sector.demo + '.' + BASE_DOMAIN + '/',
    });
  });
}

// One page a model can quote a fact off. The external GEO review scored our
// entity clarity 7/10 and "likely to be cited" 4/10: everything about us was
// spread across marketing copy, so answering "where are they, what do they
// sell, what does it cost" meant inference. Inference is what an assistant
// hedges about.
router.get('/company-facts', (req, res) => {
  res.render('legal/company_facts');
});

/* ── «اشتراك ثابت ولا عمولة؟» (البند ٦٤) ─────────────────────────────────
 *
 * القاعدة المكتوبة في الخطة على البند ده: **كل رقم لازم يتأكّد من الكود
 * والأسعار الفعلية قبل النشر**. فالصفحة مابتكتبش رقم بإيدها — بتقرا
 * `pricing.js`، نفس الملف اللي الاتناشر صفحة قطاع بيسعّروا منه.
 *
 * وقرار تاني مقصود: **مافيش اسم منافس ولا سعر منافس على الصفحة.** أسعار
 * المنصّات بتتغيّر، ونشر رقم عن شركة تانية ممكن يكون غلط النهاردة أو بكرة —
 * وده ادعاء مضلّل عند أدسنس، وحاجة القارئ اللي بيقارن مش بيصدّقها أصلاً.
 * فالمقارنة بين **نماذج التسعير**، والقارئ بيحسب بأرقامه هو. (نفس صيغة
 * مقالات «أفضل برنامج» في البند ٩٥.)
 */
const SYSTEM_LABELS = {
  portfolio: 'بورتفوليو', shop: 'متجر إلكتروني', pharmacy: 'صيدلية',
  clinic: 'عيادة', orders: 'مطعم وطلبات', gym: 'جيم', nutrition: 'عيادة تغذية',
  furniture: 'معرض موبيليا', workshop: 'ورشة سيارات', hall: 'قاعة أفراح',
  nursery: 'حضانة', installments: 'تقسيط',
};
router.get('/compare', (req, res) => {
  const { PRICES, FREE_MONTHS, arabicNumber } = require('../lib/pricing');
  const rows = Object.keys(PRICES)
    .map((k) => ({ key: k, label: SYSTEM_LABELS[k] || k, ...PRICES[k] }))
    .sort((a, b) => a.monthly - b.monthly);
  const monthly = rows.map((r) => r.monthly);
  const buys = rows.map((r) => r.buy);
  res.render('legal/compare', {
    rows, arabicNumber, FREE_MONTHS,
    systemCount: rows.length,
    minMonthly: Math.min(...monthly), maxMonthly: Math.max(...monthly),
    minBuy: Math.min(...buys), maxBuy: Math.max(...buys),
  });
});

router.get('/contact', (req, res) => {
  // Ads off on /contact. It is a form and a phone number — under the word count
  // AdSense expects on a monetised page — and leaving the loader in would let
  // Auto Ads place a unit there anyway. Still indexable, just not monetised.
  res.locals.showAds = false;
  res.render('legal/contact', { sent: req.query.sent === '1', error: req.query.error || null });
});

// Public form → abuse-prone. Cap submissions per IP (5 / 15 min).
const contactLimiter = rateLimit({ name: 'contact', windowMs: 15 * 60000, max: 5 });

router.post('/contact', contactLimiter, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  const email = String(req.body.email || '').trim().slice(0, 150);
  const phone = String(req.body.phone || '').trim().slice(0, 30);
  const message = String(req.body.message || '').trim().slice(0, 5000);
  // Honeypot: a hidden field real users never fill. If a bot fills it, pretend
  // success (so it won't retry) but drop the message silently.
  if (String(req.body.website || '').trim()) return res.redirect('/contact?sent=1');
  // Link-flood: legitimate enquiries rarely contain 3+ URLs; spam almost always does.
  const linkCount = (message.match(/https?:\/\/|www\.|\bmega\.nz\b|t\.me\//gi) || []).length;
  if (linkCount >= 3) return res.redirect('/contact?sent=1');
  if (!name || !message) return res.redirect('/contact?error=' + encodeURIComponent('الاسم والرسالة مطلوبان'));
  try {
    // Repeat-sender spam: a bot walks past the honeypot and the link filter by
    // sending short, link-free "what's your price" notes from one address every
    // few days — spaced far enough apart that the 15-minute IP cap never fires.
    // Cap any single address at 2 messages per 30 days. A real prospect who
    // needs a third follow-up has our phone and WhatsApp on the same page;
    // burying their enquiry under bot noise costs us far more than this does.
    if (email) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM contact_messages
          WHERE lower(sender_email) = lower($1) AND created_at > NOW() - INTERVAL '30 days'`,
        [email]
      );
      if (rows[0] && rows[0].n >= 2) {
        console.warn('[POST /contact] repeat sender throttled:', email);
        return res.redirect('/contact?sent=1'); // look successful so the bot stops retrying
      }
    }
    await pool.query(
      `INSERT INTO contact_messages (company_id, sender_name, sender_email, sender_phone, message)
       VALUES (NULL, $1, $2, $3, $4)`,
      [name, email || null, phone || null, message]
    );
    res.redirect('/contact?sent=1');
  } catch (err) {
    console.error('[POST /contact] error:', err);
    res.redirect('/contact?error=' + encodeURIComponent('حدث خطأ، حاول مرة أخرى لاحقاً.'));
  }
});

const { ARTICLES } = require('./blog_articles');
const indexnow = require('../lib/indexnow');
const { INDEXNOW_KEY } = indexnow;

if (INDEXNOW_KEY) {
  router.get('/' + INDEXNOW_KEY + '.txt', (req, res) => {
    res.type('text/plain').send(INDEXNOW_KEY);
  });
}

router.get('/admin/seo/ping-indexnow', async (req, res) => {
  if (!req.session || !req.session.adminId) return res.status(401).send('Unauthorized');
  if (!INDEXNOW_KEY) return res.status(400).send('INDEXNOW_KEY env var not set');
  const urls = [
    SITE_ORIGIN + '/',
    SITE_ORIGIN + '/about',
    SITE_ORIGIN + '/company-facts',
    ...Object.keys(SECTORS).map((slug) => SITE_ORIGIN + '/' + slug),
    SITE_ORIGIN + '/contact',
    SITE_ORIGIN + '/faq',
    SITE_ORIGIN + '/help',
    SITE_ORIGIN + '/blog',
    ...ARTICLES.map(a => SITE_ORIGIN + '/blog/' + a.slug),
  ];
  try {
    const c = await pool.query("SELECT slug FROM companies WHERE is_active = true");
    for (const row of c.rows) urls.push('https://' + row.slug + '.' + BASE_DOMAIN + '/');
    const p = await pool.query(
      `SELECT c.slug, p.id FROM products p
       JOIN companies c ON c.id = p.company_id
       WHERE p.is_active = true AND c.is_active = true AND c.page_type = 'shop'`
    );
    for (const row of p.rows) urls.push(SITE_ORIGIN + '/shop/' + row.slug + '/product/' + row.id);
  } catch (_) { /* DB optional — still ping static + articles */ }
  const r = await indexnow.submit(urls);
  res.type('text/plain').send(`IndexNow status ${r.status}\n${r.body}\n\nPinged ${urls.length} URLs.`);
});

// Format a DB timestamp as YYYY-MM-DD for <lastmod>, falling back to today
// when the value is missing/invalid so the sitemap never emits a bad date.
function ymd(value) {
  const d = value ? new Date(value) : null;
  return (d && !isNaN(d)) ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

router.get('/sitemap.xml', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: '/',         priority: '1.0', changefreq: 'weekly',  lastmod: today },
    { loc: '/about',    priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/contact',  priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/blog',     priority: '0.9', changefreq: 'weekly',  lastmod: today },
    { loc: '/apply',    priority: '0.7', changefreq: 'monthly', lastmod: today },
    { loc: '/faq',      priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/help',     priority: '0.7', changefreq: 'monthly', lastmod: today },
    { loc: '/our-work', priority: '0.7', changefreq: 'monthly', lastmod: today },
    { loc: '/company-facts', priority: '0.7', changefreq: 'monthly', lastmod: today },
    { loc: '/compare', priority: '0.7', changefreq: 'monthly', lastmod: today },
    ...Object.keys(SECTORS).map((slug) => ({ loc: '/' + slug, priority: '0.8', changefreq: 'monthly', lastmod: today })),
    { loc: '/dental',   priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/workshop', priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/research', priority: '0.7', changefreq: 'monthly', lastmod: today },
    { loc: '/radiology', priority: '0.6', changefreq: 'monthly', lastmod: today }, // OncoScan public landing (index,follow)
    // Standalone "من أعمالنا" apps on their own subdomains — both are fully
    // index-ready (index,follow, canonical, description, OG, JSON-LD) but were
    // absent from every sitemap, so nothing pointed crawlers at them.
    { loc: 'https://adhd.' + BASE_DOMAIN + '/',  priority: '0.6', changefreq: 'monthly', lastmod: today }, // NeuroPilot
    { loc: 'https://mykid.' + BASE_DOMAIN + '/', priority: '0.6', changefreq: 'monthly', lastmod: today }, // Safari Kids
    // privacy + terms are noindex,follow (boilerplate legal) → intentionally NOT
    // listed here: a sitemap must only contain indexable (200, index) URLs.
    // Kakeibo + Sokro stay out: their public roots are noindex login-gated apps.
  ];
  for (const a of ARTICLES) {
    urls.push({ loc: '/blog/' + a.slug, priority: '0.7', changefreq: 'monthly', lastmod: a.date });
  }
  try {
    // Only list tenant pages that pass the same indexing quality gate used in
    // tenant.js, so the sitemap never points crawlers at noindex'd thin pages.
    const r = await pool.query(
      `SELECT c.slug, c.created_at, c.page_type,
        (SELECT COUNT(*) FROM products p WHERE p.company_id = c.id AND p.is_active = true) AS prod_count,
        (SELECT COUNT(*) FROM portfolio_items pi WHERE pi.company_id = c.id) AS pf_count,
        (SELECT COUNT(*) FROM pharmacy_inventory piv WHERE piv.company_id = c.id) AS stock_count,
        (SELECT COUNT(*) FROM clinic_doctors cd WHERE cd.company_id = c.id AND cd.is_active = true) AS doc_count,
        (SELECT COUNT(*) FROM gym_plans gp WHERE gp.company_id = c.id AND gp.is_active = true) AS plan_count,
        (SELECT COALESCE(char_length(trim(ns.about)), 0) FROM nutrition_settings ns
          WHERE ns.company_id = c.id) AS nutri_about_len,
        (SELECT COALESCE(char_length(trim(ws.about)), 0) FROM workshop_settings ws
          WHERE ws.company_id = c.id) AS wsh_about_len,
        (SELECT COALESCE(char_length(trim(hs.about)), 0) FROM hall_settings hs
          WHERE hs.company_id = c.id) AS hall_about_len,
        (SELECT COALESCE(char_length(trim(nu.about)), 0) FROM nursery_settings nu
          WHERE nu.company_id = c.id) AS nursery_about_len,
        (SELECT COALESCE(char_length(trim(iq.about)), 0) FROM inst_settings iq
          WHERE iq.company_id = c.id) AS inst_about_len,
        (SELECT COUNT(*) FROM furniture_products fp
          WHERE fp.company_id = c.id AND fp.is_active) AS furn_count,
        COALESCE(char_length(trim(c.description)), 0) AS desc_len
       FROM companies c WHERE c.is_active = true ORDER BY c.slug`
    );
    const indexableShops = new Set();
    for (const row of r.rows) {
      // Same quality gate tenant.js uses, per page type, so the sitemap never
      // points crawlers at a page that renders noindex.
      // Demo tenants (slug === page_type) are samples — never list them.
      if (row.page_type === 'pharmacy' && row.slug === 'pharmacy') continue;
      if (row.page_type === 'clinic' && row.slug === 'clinic') continue;
      if (row.page_type === 'orders' && row.slug === 'orders') continue;
      if (row.page_type === 'gym' && row.slug === 'gym') continue;
      if (row.page_type === 'nutrition' && row.slug === 'nutrition') continue;
      if (row.page_type === 'furniture' && row.slug === 'furniture') continue;
      if (row.page_type === 'workshop' && row.slug === 'workshop') continue;
      if (row.page_type === 'hall' && row.slug === 'hall') continue;
      if (row.page_type === 'nursery' && row.slug === 'nursery') continue;
      if (row.page_type === 'installments' && row.slug === 'installments') continue;
      const ok = row.page_type === 'shop'
        ? Number(row.prod_count) >= 3
        : row.page_type === 'pharmacy'
        ? Number(row.stock_count) >= 3
        : row.page_type === 'clinic'
        ? (Number(row.doc_count) >= 1 && Number(row.desc_len) >= 40)
        : row.page_type === 'gym'
        ? (Number(row.plan_count) >= 1 && Number(row.desc_len) >= 40)
        // Must mirror tenant.js exactly, or the sitemap and the page disagree
        // about whether the page should be in the index.
        : row.page_type === 'nutrition'
        ? (Number(row.desc_len) >= 40 || Number(row.nutri_about_len) >= 60)
        // Mirrors tenant.js exactly. It used to be excluded outright because
        // there was no furniture page at all; there is one now.
        : row.page_type === 'furniture'
        ? Number(row.furn_count) >= 3
        // Mirrors tenant.js: a workshop has no catalogue to count, so the gate
        // is whether the page says anything at all.
        : row.page_type === 'workshop'
        ? (Number(row.desc_len) >= 40 || Number(row.wsh_about_len) >= 60)
        // Mirrors tenant.js.
        : row.page_type === 'hall'
        ? (Number(row.desc_len) >= 40 || Number(row.hall_about_len) >= 60)
        // Mirrors tenant.js.
        : row.page_type === 'nursery'
        ? (Number(row.desc_len) >= 40 || Number(row.nursery_about_len) >= 60)
        // Mirrors tenant.js.
        : row.page_type === 'installments'
        ? (Number(row.desc_len) >= 40 || Number(row.inst_about_len) >= 60)
        : (Number(row.pf_count) >= 2 || Number(row.desc_len) >= 120);
      if (!ok) continue;
      urls.push({ loc: 'https://' + row.slug + '.' + BASE_DOMAIN + '/', priority: '0.6', changefreq: 'weekly', lastmod: ymd(row.created_at) });
      if (row.page_type === 'shop') indexableShops.add(row.slug);
    }
    // Active products of indexable shops — helps Google index product pages.
    const p = await pool.query(
      `SELECT c.slug, p.id, p.created_at FROM products p
       JOIN companies c ON c.id = p.company_id
       WHERE p.is_active = true AND c.is_active = true AND c.page_type = 'shop'
       ORDER BY c.slug, p.id`
    );
    for (const row of p.rows) {
      if (!indexableShops.has(row.slug)) continue;
      urls.push({ loc: '/shop/' + row.slug + '/product/' + row.id, priority: '0.5', changefreq: 'weekly', lastmod: ymd(row.created_at) });
    }
  } catch (_) { /* DB optional for sitemap */ }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u =>
      `  <url>\n    <loc>${u.loc.startsWith('http') ? u.loc : SITE_ORIGIN + u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    ).join('\n') +
    '\n</urlset>\n'
  );
});

// llms.txt — curated, AI-friendly map of the site (llmstxt.org standard).
// Lets LLMs (ChatGPT, Gemini, Perplexity, Claude…) discover and cite our key pages.
router.get('/llms.txt', (req, res) => {
  const lines = [];
  lines.push('# OscarDevs');
  lines.push('');
  // The blockquote is the line a model quotes when asked what OscarDevs is, so
  // the count and the list have to agree with each other AND with the twelve
  // systems below. It said "تسعة" while listing twelve — a source that
  // contradicts itself in its own summary is one an assistant learns to hedge
  // about, and the three unlisted verticals never got mentioned at all.
  lines.push('> منصّة حلول رقمية متكاملة للمشاريع الصغيرة والمتوسطة في مصر والعالم العربي: مواقع ومتاجر إلكترونية، و**اتناشر نظام إدارة جاهز** (بورتفوليو، متجر، صيدلية، عيادة، مطاعم وطلبات، جيم، عيادة تغذية، معرض ومصنع موبيليا، ورشة سيارات، قاعة أفراح، حضانة ومركز دروس، وتحصيل أقساط)، وتطبيقات ويب وموبايل — تسليم سريع، أسعار مناسبة، وSEO جاهز.');
  lines.push('');
  lines.push('## الأنظمة الجاهزة');
  lines.push('- **موقع بورتفوليو**: هوية رقمية لأصحاب المهن والحرف مع معرض أعمال ونموذج تواصل.');
  lines.push('- **متجر إلكتروني**: منتجات وسلة وطلبات وكوبونات وتقارير مبيعات.');
  // "تنبيهات صلاحية" was here while nothing in the code did it — the expiry date
  // was stored and never looked at. The claim was pulled, then the feature was
  // built (EXPIRY_SOON_DAYS in pharmacy_admin.js: 60 days, counters, filter and
  // ordering), so it is back and now true. scripts/check-pharmacy-expiry.js
  // fails if this sentence outlives the screen it describes.
  lines.push('- **نظام إدارة الصيدليات**: مخزون مربوط بكتالوج أدوية (أكتر من ٢٥ ألف صنف)، كمية متاحة تلقائية (الإجمالي ناقص المحجوز)، تنبيه نقص ونفاد الأصناف، تنبيهات صلاحية (بيوريك اللي انتهى واللي فاضله أقل من ٦٠ يوم)، وطلبات أونلاين.');
  lines.push('- **نظام إدارة العيادات**: حجز مواعيد، ملفات مرضى، روشتات، أقساط، وزيارات منزلية.');
  lines.push('- **نظام المطاعم والطلبات**: منيو وأصناف وإضافات وطلبات أونلاين واستقبال ذكي.');
  lines.push('- **نظام إدارة الجيم**: اشتراكات ومدرّبين وحضور وخطط تمرين.');
  lines.push('- **نظام إدارة عيادة التغذية**: قياسات وتحاليل وحساب سعرات وماكروز وخطط غذائية وحساب لكل مريض.');
  lines.push('- **نظام إدارة معرض ومصنع الموبيليا**: كتالوج ومخزون وفواتير وتوصيل وتركيب وضمان ومرتجعات وفروع.');
  lines.push('- **نظام إدارة ورش السيارات**: ملف لكل عربية، أمر شغل بعرض سعر موافَق عليه، قطع غيار، وتذكير صيانة بالكيلومترات وبالشهور.');
  lines.push('- **نظام قاعات الأفراح والمناسبات**: تقويم بقفل حقيقي يمنع حجز اليوم مرتين، متابعة استفسارات بميعاد، باقات وسعر للفرد، وعرابين وأقساط.');
  lines.push('- **نظام الحضانات ومراكز الدروس**: فاتورة شهرية لكل طفل، كشف متأخرات بالشهور، تذكيرات واتساب مهذّبة، حضور وغياب، ومصرّح لهم الاستلام.');
  lines.push('- **قسّطلي — تحصيل الأقساط**: جدول أقساط بتواريخ مضبوطة، سداد الأقدم أولاً، لينك كشف حساب خاص لكل عميل، وتذكير قبل الميعاد.');
  lines.push('');
  // A reference page per system. These are the pages that answer "أفضل برنامج
  // إدارة صيدلية في مصر" — the home page only ever had a card.
  lines.push('## صفحات الأنظمة (صفحة مرجعية لكل نظام)');
  for (const [slug, sec] of Object.entries(SECTORS)) {
    lines.push(`- [${sec.title.split('—')[0].trim()}](${SITE_ORIGIN}/${slug}): ${sec.desc}`);
  }
  lines.push('');
  lines.push('## صفحات أساسية');
  lines.push(`- [الرئيسية](${SITE_ORIGIN}/): نظرة عامة على حلول OscarDevs الرقمية وأنظمة الإدارة الجاهزة.`);
  lines.push(`- [من نحن](${SITE_ORIGIN}/about): قصة OscarDevs ورؤيتها.`);
  // The page to quote a fact off: name, city, phone, the twelve systems, what
  // each includes, how pricing is decided, and who owns the domain and data.
  lines.push(`- [حقائق عن OscarDevs](${SITE_ORIGIN}/company-facts): بيانات موجزة — الاسم والمقر (أسيوط، مصر) ورقم التواصل والأنظمة الاثنا عشر وما يشمله كل نظام وكيف تُحدَّد الأسعار وملكية الموقع والدومين والبيانات.`);
  lines.push(`- [اطلب موقعك](${SITE_ORIGIN}/apply): تقديم طلب إنشاء موقع أو نظام إدارة — بورتفوليو، متجر إلكتروني، صيدلية، مطعم/طلبات، عيادة، جيم، معرض وورشة موبيليا، عيادة تغذية، ورشة سيارات، قاعة أفراح، حضانة ومركز دروس، أو بيع بالتقسيط.`);
  lines.push(`- [الأسئلة الشائعة](${SITE_ORIGIN}/faq): إجابات عن أكثر الأسئلة تكراراً.`);
  lines.push(`- [دليل الاستخدام](${SITE_ORIGIN}/help): خطوات الاشتراك والتفعيل وشرح لوحة التحكم لكل نوع صفحة.`);
  lines.push(`- [نظام عيادات الأسنان](${SITE_ORIGIN}/dental): صفحة النظام المتخصّص لعيادات الأسنان — خريطة أسنان FDI، خطط علاج لكل سن، مخطط لثة، تعليق على الأشعة، تقسيط وتذكير واتساب.`);
  lines.push(`- [نظام ورش السيارات](${SITE_ORIGIN}/workshop): صفحة النظام المتخصّص لورش السيارات — ملف لكل عربية، أمر شغل بعرض سعر يوافق عليه العميل قبل التنفيذ، قطع غيار وعمالة بالتكلفة، وتذكير صيانة بالكيلومترات وبالشهور.`);
  lines.push(`- [من أعمالنا](${SITE_ORIGIN}/our-work): تطبيقات ويب وموبايل طوّرها فريق OscarDevs.`);
  // Individual, citable entries for each showcased app — an LLM gets a real URL
  // + description per app instead of names buried in one line.
  lines.push(`- [OncoScan — دعم قرار الأشعة](${SITE_ORIGIN}/radiology): أداة ذكاء اصطناعي لدعم قرار الأشعة (CT/MRI) — رفع DICOM وعرض في المتصفح وتقرير منظّم ثنائي اللغة. غير تشخيصية.`);
  lines.push(`- [مدقّق بيانات الأبحاث](${SITE_ORIGIN}/research): أداة ذكاء اصطناعي تراجع بيانات الأبحاث الطبية (Excel/CSV) قبل التحليل الإحصائي — نقص وتكرارات وقيم مستحيلة وأخطاء وحدات ومعادلات وقيم شاذّة، مع تقرير جودة.`);
  lines.push(`- [NeuroPilot — مؤقّت تركيز لأصحاب ADHD](https://adhd.${BASE_DOMAIN}/): تطبيق مؤقّت تركيز (Pomodoro) مصمّم لأصحاب فرط الحركة وتشتّت الانتباه.`);
  lines.push(`- [Safari Kids — عالم الاستكشاف السحري](https://mykid.${BASE_DOMAIN}/): تطبيق تعليمي تفاعلي للأطفال مع شخصية «ميزو».`);
  lines.push(`- [Sokro — وكيل ذكاء اصطناعي عربي](https://sokro.${BASE_DOMAIN}/): وكيل ذكاء اصطناعي عربي يبحث ويلخّص ويكتب تقارير، بالصوت والنص.`);
  lines.push(`- [Kakeibo — مدرّب مالي](https://kakeibo.${BASE_DOMAIN}/): تطبيق إدارة مصاريف وميزانية بأسلوب «كاكيبو» الياباني.`);
  lines.push(`- [تواصل معنا](${SITE_ORIGIN}/contact): طرق التواصل مع الفريق.`);
  lines.push('');
  lines.push('## المدوّنة (أدلة عملية أصلية)');
  for (const a of ARTICLES) {
    lines.push(`- [${a.title}](${SITE_ORIGIN}/blog/${a.slug}): ${a.metaDescription || a.excerpt || ''}`);
  }
  lines.push('');
  lines.push('## قانوني');
  lines.push(`- [سياسة الخصوصية](${SITE_ORIGIN}/privacy)`);
  lines.push(`- [الشروط والأحكام](${SITE_ORIGIN}/terms)`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(lines.join('\n') + '\n');
});

module.exports = router;