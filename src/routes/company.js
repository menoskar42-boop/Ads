const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const uploads = require('../lib/uploads');
const QRCode = require('qrcode');
const { Pool } = require('pg');
const requireLogin = require('../middleware/auth');
const demoMode = require('../lib/demo_mode');
const orderReversal = require('../lib/order_reversal');
const money = require('../lib/money');
const codes = require('../lib/codes');

/* Error codes, not error sentences.
 *
 * These pages rendered `req.query.error` straight into the banner, so a link
 * could put any text in front of a merchant inside their own admin, under
 * their own branding — and one of them reflected `err.message`, handing the
 * page whatever the database said. The server owns the wording; the URL only
 * gets to name one of these. */
const PAGE_ERRORS = {
  giftcards:  { amount: 'القيمة غير صحيحة', save: 'تعذّر إنشاء الكرت' },
  currencies: { invalid: 'بيانات غير صحيحة', save: 'تعذّر الحفظ' },
  stock:      { zero: 'اكتب كمية تغيير مش صفر.',
                negative: 'مش ممكن تطبّق التغيير (المخزون هيبقى سالب أو المنتج مش موجود).',
                save: 'تعذّر حفظ التغيير.' },
};
const pageError = (page, code) => PAGE_ERRORS[page][String(code || '')] || null;

const { canonicalCompanyUrl } = require('../lib/urls');
const { PROFESSIONS, getPreset } = require('../lib/portfolio_presets');
const { compressImage, compressVideo } = require('../lib/media');
const shopFeatures = require('../lib/shop_features');
const push = require('../lib/push');
const indexnow = require('../lib/indexnow');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Profession list available to all company dashboard views (e.g. profile).
router.use((req, res, next) => { res.locals.professions = PROFESSIONS; next(); });

const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// SVG excluded on purpose: it is active content (can carry <script>) — see the
// /uploads CSP sandbox in server.js. Only passive raster formats are accepted.
const imageMimeRegex = /^image\/(png|jpeg|jpg|gif|webp)$/;
const videoMimeRegex = /^video\/(mp4|quicktime|webm|x-matroska|x-msvideo|mpeg|3gpp|3gpp2)$/;

function makeUploader(prefix) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      // The extension comes from the declared type the fileFilter already
      // vetted, never from `originalname` — that string is the client's, and it
      // is how a file lands in public/uploads called `product-7-1699.html`.
      const ext = uploads.extname(file, '.bin');
      cb(null, `${prefix}-${req.session.companyId}-${Date.now()}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (imageMimeRegex.test(file.mimetype)) cb(null, true);
      else cb(new Error('Only image files (PNG, JPEG, GIF, WEBP) are allowed.'));
    },
  });
}

/**
 * Delete an upload this company no longer references.
 *
 * Only files we wrote, under uploadDir, and only by basename — a stored value
 * is merchant input, so `/uploads/../../server.js` must not resolve anywhere
 * near the app. A pasted external URL is not ours and is left alone.
 */
function removeUpload(url) {
  const val = String(url || '');
  if (!val.startsWith('/uploads/')) return;
  const name = path.basename(val);
  if (!name || name === '.' || name === '..') return;
  const full = path.join(uploadDir, name);
  if (path.dirname(full) !== path.resolve(uploadDir)) return;
  fs.unlink(full, (err) => {
    if (err && err.code !== 'ENOENT') console.error('[removeUpload]', name, err.message);
  });
}

/**
 * The optional case-study half of a portfolio item.
 *
 * A blank field is stored as NULL, not '', so "did the merchant write this?"
 * is one question in SQL and in the template. project_url is http(s)-only for
 * the same reason as the payment link: it ends up in an href a visitor clicks.
 */
function caseStudyFields(body) {
  const txt = (v, max) => {
    const t = String(v == null ? '' : v).trim();
    return t ? t.slice(0, max) : null;
  };
  const link = txt(body.project_url, 500);
  return {
    image_alt:   txt(body.image_alt, 160),
    project_url: link && /^https?:\/\//i.test(link) ? link : null,
    category:    txt(body.category, 60),
    client_name: txt(body.client_name, 120),
    problem:     txt(body.problem, 1200),
    solution:    txt(body.solution, 1200),
    result:      txt(body.result, 1200),
    is_featured: body.is_featured === 'on' || body.is_featured === '1' || body.is_featured === 'true',
  };
}

// Product form accepts one image + one (larger) video. Each field is validated
// against its own MIME allowlist; uploads are compressed after they land.
function makeMediaUploader(prefix) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const kind = file.fieldname === 'video_file' ? `${prefix}-video` : prefix;
      cb(null, `${kind}-${req.session.companyId}-${Date.now()}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // up to 100MB raw video; compressed afterwards
    fileFilter: (req, file, cb) => {
      if (file.fieldname === 'video_file') {
        if (videoMimeRegex.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only video files (MP4, MOV, WEBM, MKV, AVI) are allowed.'));
      } else {
        if (imageMimeRegex.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files (PNG, JPEG, GIF, WEBP) are allowed.'));
      }
    },
  });
}

const uploadLogo = uploads.guard(makeUploader('logo').single('logo_file'), 'image');
const uploadItemImage = uploads.guard(makeUploader('item').single('image_file'), 'image');
const uploadProductImage = uploads.guard(makeUploader('product').single('image_file'), 'image');
const uploadProductMedia = uploads.guard(makeMediaUploader('product').fields([
  { name: 'image_file', maxCount: 1 },
  { name: 'video_file', maxCount: 1 },
]), 'media');

const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

// Pharmacy staff (non-owner) may not use the owner's company pages — redirect
// them to their scoped /pharmacy area. Login/logout/push stay open.
router.use((req, res, next) => {
  const open = req.path === '/login' || req.path === '/logout' || req.path.startsWith('/push/');
  if (req.session && req.session.staffId) {
    if (open) return next();
    return res.redirect('/pharmacy');
  }
  // Same rule for clinic staff: the owner's company pages hold the billing and
  // the page settings, and a receptionist has no business in either.
  if (req.session && req.session.clinicStaffId) {
    if (open) return next();
    return res.redirect('/clinic');
  }
  // And the restaurant's shift staff: the owner's pages hold the billing and
  // the page settings, and a rider has no business in either.
  if (req.session && req.session.foodStaffId) {
    if (open) return next();
    return res.redirect('/food');
  }
  // Same for the dietitian's assistant.
  if (req.session && req.session.nutriStaffId) {
    if (open) return next();
    return res.redirect('/nutrition');
  }
  next();
});

router.use(async (req, res, next) => {
  res.locals.unreadCount = 0;
  res.locals.pendingOrdersCount = 0;
  res.locals.companyPageType = 'portfolio';
  if (req.session.companyId) {
    try {
      const r = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM contact_messages WHERE company_id = $1 AND is_read = false AND is_spam = false) AS unread,
           (SELECT COUNT(*) FROM orders WHERE company_id = $1 AND status = 'pending') AS pending_orders,
           (SELECT page_type FROM companies WHERE id = $1) AS page_type`,
        [req.session.companyId]
      );
      res.locals.unreadCount = parseInt(r.rows[0].unread, 10);
      res.locals.pendingOrdersCount = parseInt(r.rows[0].pending_orders, 10);
      res.locals.companyPageType = r.rows[0].page_type || 'portfolio';
    } catch (e) { /* non-critical */ }
  }
  next();
});

async function requireShop(req, res, next) {
  if (!req.session.companyId) return res.redirect('/company/login');
  try {
    const r = await pool.query('SELECT page_type FROM companies WHERE id = $1', [req.session.companyId]);
    if (!r.rows.length || r.rows[0].page_type !== 'shop') {
      return res.status(404).render('404', { subdomain: null });
    }
    next();
  } catch (err) {
    console.error('requireShop error:', err);
    res.status(500).send('Error.');
  }
}

/* ─── LOGIN ─────────────────────────────────────────────── */
router.get('/login', (req, res) => {
  if (req.session.companyId) return res.redirect('/company/dashboard');
  res.render('company/login', { error: null, notice: null });
});

/* One sentence for every failed login, whatever the reason. The moment the
   wording varies by cause, the form starts answering questions nobody
   authenticated to ask. The hint about tracking an application is part of the
   constant on purpose — shown to everyone, it tells a stranger nothing. */
/* A real bcrypt hash of a value nothing can match, compared against when no
   account was found — see the note at the failure branch. Generated once at
   boot; the cost has to match the real hashes or it measures differently. */
const DUMMY_HASH = bcrypt.hashSync('oscardevs-no-such-account', 10);

const LOGIN_FAILED = 'البريد الإلكتروني أو كلمة المرور غير صحيحة. '
  + 'لو لسه مستني الموافقة على طلبك، تابعه من صفحة «متابعة الطلب».';

const { loginLimiter } = require('../middleware/rateLimit');
router.post('/login', loginLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const renderLogin = (opts) => res.render('company/login', Object.assign({ error: null, notice: null }, opts));
  // An empty password is never a valid credential, whatever the database says.
  // bcrypt.compare('', hashOf('')) is TRUE — and a seed script that hashed an
  // unset env var actually shipped such an account, which made this login
  // accept a blank password until the audit caught it. Reject before comparing.
  if (!email || !password) {
    return renderLogin({ error: LOGIN_FAILED });
  }
  try {
    const result = await pool.query(
      `SELECT cu.*, c.company_name, c.theme_color, c.slug
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.email = $1 AND c.is_active = true`,
      [email]
    );
    if (!result.rows.length) {
      // Pharmacy staff account? (pharmacist / cashier / delivery) — they log in
      // with a username and land in the /pharmacy area with a scoped role.
      const staffR = await pool.query(
        `SELECT ps.*, c.company_name, c.theme_color, c.slug
         FROM pharmacy_staff ps JOIN companies c ON c.id = ps.company_id
         WHERE lower(ps.username) = $1 AND ps.is_active = true AND c.is_active = true`,
        [email]
      );
      if (staffR.rows.length) {
        const st = staffR.rows[0];
        const ok = st.password_hash && await bcrypt.compare(password, st.password_hash);
        if (!ok) return renderLogin({ error: LOGIN_FAILED });
        req.session.companyId = st.company_id;
        demoMode.endDemo(req);
        req.session.staffId = st.id;
        req.session.staffRole = st.role || 'cashier';
        req.session.staffName = st.name || st.username;
        req.session.canSeeFinance = st.can_see_finance === true;
        req.session.companyName = st.company_name;
        req.session.themeColor = st.theme_color;
        req.session.companySlug = st.slug;
        req.session.adminLang = 'ar';
        return res.redirect('/pharmacy');
      }
      // Clinic staff account (reception / doctor / accountant / manager /
      // call centre). Same door as everyone else — the scope comes from the
      // row, not from a different login page.
      const clinicR = await pool.query(
        `SELECT cs.*, c.company_name, c.theme_color, c.slug
         FROM clinic_staff cs JOIN companies c ON c.id = cs.company_id
         WHERE lower(cs.username) = $1 AND cs.login_enabled = true
           AND cs.is_active = true AND c.is_active = true`,
        [email]
      );
      if (clinicR.rows.length) {
        const st = clinicR.rows[0];
        const ok = st.password_hash && await bcrypt.compare(password, st.password_hash);
        if (!ok) return renderLogin({ error: LOGIN_FAILED });
        req.session.companyId = st.company_id;
        demoMode.endDemo(req);
        // Named differently from the pharmacy's staffId on purpose: one session
        // must never be read as the other's role.
        req.session.clinicStaffId = st.id;
        req.session.clinicRole = st.perm_role || 'reception';
        req.session.staffName = st.name || st.username;
        req.session.companyName = st.company_name;
        req.session.themeColor = st.theme_color;
        req.session.companySlug = st.slug;
        req.session.adminLang = 'ar';
        return res.redirect('/clinic');
      }
      // Restaurant shift staff (cashier / shift manager / kitchen / delivery).
      // Same door again — the scope comes from the row.
      const foodR = await pool.query(
        `SELECT fs.*, c.company_name, c.theme_color, c.slug
         FROM food_staff fs JOIN companies c ON c.id = fs.company_id
         WHERE lower(fs.username) = $1 AND fs.login_enabled = true
           AND fs.is_active = true AND c.is_active = true`,
        [email]
      );
      if (foodR.rows.length) {
        const st = foodR.rows[0];
        const ok = st.password_hash && await bcrypt.compare(password, st.password_hash);
        if (!ok) return renderLogin({ error: LOGIN_FAILED });
        req.session.companyId = st.company_id;
        demoMode.endDemo(req);
        // Its own name, like the clinic's: one staff session must never be read
        // as another system's role.
        req.session.foodStaffId = st.id;
        req.session.foodRole = st.perm_role || 'cashier';
        req.session.staffName = st.name || st.username;
        req.session.companyName = st.company_name;
        req.session.themeColor = st.theme_color;
        req.session.companySlug = st.slug;
        req.session.adminLang = 'ar';
        // /food picks the landing screen from the role — the kitchen tablet
        // may not open the orders list at all.
        return res.redirect('/food');
      }
      // The dietitian's practice staff (assistant / reception).
      const nutriR = await pool.query(
        `SELECT ns.*, c.company_name, c.theme_color, c.slug
         FROM nutrition_staff ns JOIN companies c ON c.id = ns.company_id
         WHERE lower(ns.username) = $1 AND ns.login_enabled = true
           AND ns.is_active = true AND c.is_active = true`,
        [email]
      );
      if (nutriR.rows.length) {
        const st = nutriR.rows[0];
        const ok = st.password_hash && await bcrypt.compare(password, st.password_hash);
        if (!ok) return renderLogin({ error: LOGIN_FAILED });
        req.session.companyId = st.company_id;
        demoMode.endDemo(req);
        req.session.nutriStaffId = st.id;
        req.session.nutriRole = st.perm_role || 'reception';
        req.session.staffName = st.name || st.username;
        req.session.companyName = st.company_name;
        req.session.themeColor = st.theme_color;
        req.session.companySlug = st.slug;
        req.session.adminLang = 'ar';
        return res.redirect('/nutrition');
      }

      // No active account. The login form used to look the email up in
      // signup_applications and answer — including, on a rejection, the
      // reviewer's own `admin_notes` verbatim. That is an internal note about
      // a business ("no licence", "complaint from a customer") handed to
      // anybody who types the address, with no password and no token. And even
      // the polite "your application is under review" confirms that this exact
      // email applied, which is an enumeration oracle on our applicant list.
      //
      // /apply/track/:token already answers this question, to the person
      // holding the token, and deliberately does NOT select admin_notes. A
      // login form's job is to say whether these credentials work.
      //
      // The pointer to that page is shown to EVERYONE who fails to log in, so
      // it guides the waiting applicant without telling a stranger anything.
      //
      // One hash against a throwaway digest before answering: a known email
      // costs a bcrypt round and an unknown one used to cost none, and that
      // difference is measurable over a few requests. Same wording AND
      // roughly the same time, or the wording was the only thing hidden.
      await bcrypt.compare(password, DUMMY_HASH);
      return renderLogin({ error: LOGIN_FAILED });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return renderLogin({ error: LOGIN_FAILED });
    }
    req.session.companyId = user.company_id;
    demoMode.endDemo(req);
    req.session.companyUserId = user.id;
    req.session.companyName = user.company_name;
    req.session.themeColor = user.theme_color;
    req.session.companySlug = user.slug;
    req.session.adminLang = user.lang || 'ar';
    res.redirect('/company/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    renderLogin({ error: 'حدث خطأ ما. حاول مرة أخرى.' });
  }
});

/* ─── LOGOUT ─────────────────────────────────────────────── */
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/company/login'));
});

/* ─── WEB PUSH (mobile notifications) ────────────────────── */
// Expose the VAPID public key + whether push is enabled + the merchant's
// per-type preferences, for the client.
router.get('/push/config', requireLogin, async (req, res) => {
  let prefs = { messages: true, orders: true };
  try {
    const r = await pool.query('SELECT notify_messages, notify_orders FROM companies WHERE id = $1', [req.session.companyId]);
    if (r.rows.length) prefs = { messages: r.rows[0].notify_messages !== false, orders: r.rows[0].notify_orders !== false };
  } catch (err) { console.error('[push/config] prefs error:', err.message); }
  res.json({ enabled: push.isEnabled(), publicKey: push.publicKey(), prefs });
});

// Save per-type notification preferences (messages / orders).
router.post('/push/prefs', requireLogin, async (req, res) => {
  try {
    const messages = !!(req.body && req.body.messages);
    const orders = !!(req.body && req.body.orders);
    await pool.query('UPDATE companies SET notify_messages = $1, notify_orders = $2 WHERE id = $3',
      [messages, orders, req.session.companyId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[push/prefs] error:', err.message);
    res.status(500).json({ ok: false });
  }
});

router.post('/push/subscribe', requireLogin, async (req, res) => {
  try {
    const ok = await push.saveSubscription(req.session.companyId, req.body && req.body.subscription);
    res.json({ ok });
  } catch (err) {
    console.error('[push/subscribe] error:', err.message);
    res.status(500).json({ ok: false });
  }
});

router.post('/push/unsubscribe', requireLogin, async (req, res) => {
  try {
    await push.removeSubscription(req.body && req.body.endpoint);
    res.json({ ok: true });
  } catch (err) {
    console.error('[push/unsubscribe] error:', err.message);
    res.status(500).json({ ok: false });
  }
});

/* ─── DASHBOARD ──────────────────────────────────────────── */
router.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    // Pharmacy tenants have their own admin area with inventory/POS/orders.
    if (result.rows.length && result.rows[0].page_type === 'pharmacy') {
      return res.redirect('/pharmacy');
    }
    // Orders (restaurant/supermarket) tenants have their own menu/orders admin.
    if (result.rows.length && result.rows[0].page_type === 'orders') {
      return res.redirect('/food');
    }
    const portfolioCount = await pool.query(
      'SELECT COUNT(*) FROM portfolio_items WHERE company_id = $1', [req.session.companyId]
    );
    const company = result.rows[0];
    // Absolute public URL of this tenant's page, encoded into a QR code the
    // owner can download and print (works for both shop and portfolio pages).
    let publicUrl = canonicalCompanyUrl(company.slug, req);
    if (publicUrl.startsWith('/')) {
      publicUrl = (process.env.SITE_ORIGIN || 'https://oscardevs.com') + publicUrl;
    }
    let qrDataUrl = null;
    try {
      qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 512, margin: 2, errorCorrectionLevel: 'M' });
    } catch (e) {
      console.error('[dashboard] QR generation failed:', e.message);
    }
    // Referral: the client's own invite link plus how many signups it has
    // already brought in — the count is what makes sharing it feel worthwhile.
    const origin = process.env.SITE_ORIGIN || 'https://oscardevs.com';
    const referralUrl = company.referral_code ? `${origin}/apply?ref=${company.referral_code}` : null;
    let referralCount = 0;
    try {
      const rc = await pool.query('SELECT COUNT(*)::int AS n FROM companies WHERE referred_by = $1', [company.id]);
      referralCount = rc.rows[0].n;
    } catch (e) {
      console.error('[dashboard] referral count failed:', e.message);
    }

    res.render('company/dashboard', {
      company,
      portfolioCount: parseInt(portfolioCount.rows[0].count),
      session: req.session,
      publicUrl,
      qrDataUrl,
      referralUrl,
      referralCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading dashboard.');
  }
});

/* ─── PROFILE ────────────────────────────────────────────── */
router.get('/profile', requireLogin, async (req, res) => {
  const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
  res.render('company/profile', { company: result.rows[0], session: req.session, success: null, error: null });
});

router.post('/profile', requireLogin, (req, res) => {
  uploadLogo(req, res, async (uploadErr) => {
    const renderError = async (message) => {
      try {
        const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
        return res.render('company/profile', {
          company: result.rows[0] || {},
          session: req.session,
          success: null,
          error: message,
        });
      } catch (renderErr) {
        console.error('[POST /profile] render fallback failed:', renderErr);
        return res.status(500).send(message);
      }
    };

    if (uploadErr) {
      console.error('[POST /profile] multer error:', uploadErr);
      return renderError(`Upload failed: ${uploadErr.message}`);
    }

    console.log('[POST /profile] file:', req.file?.filename, 'body:', Object.keys(req.body));
    const {
      company_name, description, theme_color, logo_url, currency,
      promo_text, hero_headline, hero_subtext, hero_cta_text,
      contact_phone, contact_whatsapp, contact_email, contact_address,
    } = req.body;
    const finalLogoUrl = req.file ? `/uploads/${req.file.filename}` : (logo_url || null);
    if (req.file) { await compressImage(req.file.path); }
    const clean = (v) => { const s = (v || '').trim(); return s || null; };
    const hex = (v) => (/^#[0-9a-fA-F]{6}$/.test((v || '').trim()) ? v.trim() : null);
    const on = (v) => v === 'on' || v === 'true';
    const safeTheme = hex(theme_color) || '#5B3FED';
    const colorAccent = hex(req.body.color_accent);
    const heroCard1Color = hex(req.body.hero_card1_color);
    const heroCard2Color = hex(req.body.hero_card2_color);
    const heroTextColor = hex(req.body.hero_text_color);
    const heroBtnBg = hex(req.body.hero_btn_bg);
    const heroBtnText = hex(req.body.hero_btn_text);
    const url = (v) => {
      const s = (v || '').trim();
      if (!s) return null;
      if (s.length > 300) return null;
      if (!/^https?:\/\/[^\s<>"']+$/i.test(s)) return null;
      return s;
    };
    const socialFacebook = url(req.body.social_facebook);
    const socialInstagram = url(req.body.social_instagram);
    const socialLinkedin = url(req.body.social_linkedin);
    const socialTwitter = url(req.body.social_twitter);
    const socialTiktok = url(req.body.social_tiktok);
    const socialYoutube = url(req.body.social_youtube);
    const socialThreads = url(req.body.social_threads);
    const socialWebsite = url(req.body.social_website);
    const showTrustBar = on(req.body.show_trust_bar);
    const showPromoBar = on(req.body.show_promo_bar);
    const showHeroCards = on(req.body.show_hero_cards);
    const showBanners = on(req.body.show_banners);
    const showCategories = on(req.body.show_categories);
    const showContact = on(req.body.show_contact);
    const showAbout = on(req.body.show_about);
    const showServices = on(req.body.show_services);
    const showPortfolio = on(req.body.show_portfolio);
    const svc = (k) => clean(req.body[k]);

    try {
      await pool.query(
        `UPDATE companies SET
           company_name=$1, description=$2, theme_color=$3, logo_url=$4, currency=$5,
           promo_text=$6, hero_headline=$7, hero_subtext=$8, hero_cta_text=$9,
           contact_phone=$10, contact_whatsapp=$11, contact_email=$12, contact_address=$13,
           show_trust_bar=$14, show_promo_bar=$16, show_hero_cards=$17, show_banners=$18,
           show_categories=$19, show_contact=$20,
           color_accent=$21, hero_card1_color=$22, hero_card2_color=$23,
           show_about=$24, show_services=$25, show_portfolio=$26,
           service1_title=$27, service1_desc=$28, service2_title=$29, service2_desc=$30,
           service3_title=$31, service3_desc=$32,
           hero_text_color=$33, hero_btn_bg=$34, hero_btn_text=$35,
           social_facebook=$36, social_instagram=$37, social_linkedin=$38, social_twitter=$39,
           social_tiktok=$40, social_youtube=$41, social_threads=$42, social_website=$43,
           profession=$44
         WHERE id=$15`,
        [
          company_name, description, safeTheme, finalLogoUrl, clean(currency) || 'EGP',
          clean(promo_text), clean(hero_headline), clean(hero_subtext), clean(hero_cta_text),
          clean(contact_phone), clean(contact_whatsapp), clean(contact_email), clean(contact_address),
          showTrustBar, req.session.companyId,
          showPromoBar, showHeroCards, showBanners, showCategories, showContact,
          colorAccent, heroCard1Color, heroCard2Color,
          showAbout, showServices, showPortfolio,
          svc('service1_title'), svc('service1_desc'), svc('service2_title'), svc('service2_desc'),
          svc('service3_title'), svc('service3_desc'),
          heroTextColor, heroBtnBg, heroBtnText,
          socialFacebook, socialInstagram, socialLinkedin, socialTwitter,
          socialTiktok, socialYoutube, socialThreads, socialWebsite,
          clean(req.body.profession) || null,
        ]
      );
      req.session.companyName = company_name;
      req.session.themeColor = safeTheme;
      const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
      console.log('[POST /profile] success');
      return res.render('company/profile', {
        company: result.rows[0],
        session: req.session,
        success: 'Profile updated successfully.',
        error: null,
      });
    } catch (dbErr) {
      console.error('[POST /profile] db error:', dbErr);
      return renderError(`Failed to update profile: ${dbErr.message}`);
    }
  });
});

/* ─── PAGE CONTENT EDITOR (portfolio sections) ───────────── */
router.get('/content', requireLogin, async (req, res) => {
  const r = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
  const company = r.rows[0];
  if (company.page_type === 'shop') return res.redirect('/company/profile');
  const preset = getPreset(company.profession);
  const pc = company.page_content || {};
  const pick = (k) => (Array.isArray(pc[k]) && pc[k].length ? pc[k] : preset[k]);
  const content = { stats: pick('stats'), testimonials: pick('testimonials'), process: pick('process'), faq: pick('faq') };
  res.render('company/content', { company, content, session: req.session, success: req.query.saved ? 'تم حفظ المحتوى بنجاح.' : null });
});

router.post('/content', requireLogin, async (req, res) => {
  const b = req.body;
  const clean = (s) => (s == null ? '' : String(s).trim());
  const collect = (fields) => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const obj = {}; let any = false;
      for (const [key, src] of fields) { const v = clean(b[src + '_' + i]); obj[key] = v; if (v) any = true; }
      if (any) out.push(obj);
    }
    return out;
  };
  const stats = collect([['n', 'stat_n'], ['label', 'stat_label']])
    .map((s) => { const o = { n: s.n, label: s.label }; if (String(s.n).includes('.')) o.decimals = 1; return o; });
  const testimonials = collect([['quote', 'testi_quote'], ['name', 'testi_name'], ['role', 'testi_role']]);
  const process = collect([['title', 'proc_title'], ['desc', 'proc_desc']]);
  const faq = collect([['q', 'faq_q'], ['a', 'faq_a']]);
  const page_content = { stats, testimonials, process, faq };
  await pool.query('UPDATE companies SET page_content = $1 WHERE id = $2', [JSON.stringify(page_content), req.session.companyId]);
  res.redirect('/company/content?saved=1');
});

/* ─── PORTFOLIO ──────────────────────────────────────────── */
router.get('/portfolio', requireLogin, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM portfolio_items WHERE company_id = $1 ORDER BY order_index, created_at DESC',
    [req.session.companyId]
  );
  const ERRORS = {
    upload: 'فشل رفع الصورة. تأكد إن الصيغة مدعومة (PNG/JPG/GIF/WEBP) وأقل من 5 ميجا.',
    title: 'العنوان مطلوب وما يزيدش عن ١٢٠ حرف.',
  };
  res.render('company/portfolio', {
    items: result.rows, session: req.session,
    error: ERRORS[req.query.error] || null,
    saved: req.query.saved === '1',
  });
});

router.get('/portfolio/add', requireLogin, (req, res) => res.redirect('/company/portfolio'));
router.get('/categories/add', requireLogin, (req, res) => res.redirect('/company/categories'));

router.post('/portfolio/add', requireLogin, (req, res) => {
  uploadItemImage(req, res, async (uploadErr) => {
    const renderError = async (message) => {
      try {
        const result = await pool.query(
          'SELECT * FROM portfolio_items WHERE company_id = $1 ORDER BY order_index, created_at DESC',
          [req.session.companyId]
        );
        return res.render('company/portfolio', {
          items: result.rows,
          session: req.session,
          error: message,
          saved: false,
        });
      } catch (renderErr) {
        console.error('[POST /portfolio/add] render fallback failed:', renderErr);
        return res.status(500).send(message);
      }
    };

    if (uploadErr) {
      console.error('[POST /portfolio/add] multer error:', uploadErr);
      return renderError(`Upload failed: ${uploadErr.message}`);
    }

    console.log('[POST /portfolio/add] file:', req.file?.filename, 'body:', Object.keys(req.body));
    const { description, image_url, order_index } = req.body;
    // `required` in the form is a hint to a browser, not a rule. A direct POST
    // (or a browser with JS disabled on a patched form) was storing items with
    // an empty title, which the public page then rendered as "Untitled".
    const title = String(req.body.title || '').trim();
    if (!title) return renderError('العنوان مطلوب — العمل من غير عنوان بيظهر في صفحتك باسم Untitled.');
    if (title.length > 120) return renderError('العنوان طويل — خلّيه ١٢٠ حرف على الأكثر.');
    const finalImageUrl = req.file ? `/uploads/${req.file.filename}` : (image_url || null);
    if (req.file) { await compressImage(req.file.path); }

    try {
      const cs = caseStudyFields(req.body);
      await pool.query(
        `INSERT INTO portfolio_items (company_id, title, description, image_url, order_index,
           image_alt, project_url, category, client_name, problem, solution, result, is_featured)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [req.session.companyId, title, description, finalImageUrl, parseInt(order_index) || 0,
          cs.image_alt, cs.project_url, cs.category, cs.client_name, cs.problem, cs.solution,
          cs.result, cs.is_featured]
      );
      console.log('[POST /portfolio/add] success');
      return res.redirect('/company/portfolio');
    } catch (dbErr) {
      console.error('[POST /portfolio/add] db error:', dbErr);
      return renderError(`Failed to add item: ${dbErr.message}`);
    }
  });
});

router.post('/portfolio/delete/:id', requireLogin, async (req, res) => {
  // RETURNING so the file can go with the row. Deleting the record alone left
  // the upload on disk forever — invisible, and growing with every correction
  // a merchant makes (which was the only way to fix a typo before /edit).
  const gone = await pool.query(
    'DELETE FROM portfolio_items WHERE id = $1 AND company_id = $2 RETURNING image_url',
    [req.params.id, req.session.companyId]
  );
  if (gone.rows.length) removeUpload(gone.rows[0].image_url);
  res.redirect('/company/portfolio');
});

/* ─── PORTFOLIO: edit / hide / reorder ──────────────────────
 * Adding and deleting were the only two operations. A typo in a title meant
 * deleting the item and uploading the image again, and there was no way to take
 * a project down for a while without losing it.
 */
router.post('/portfolio/edit/:id', requireLogin, (req, res) => {
  uploadItemImage(req, res, async (uploadErr) => {
    const back = (q) => res.redirect('/company/portfolio' + (q || ''));
    if (uploadErr) return back('?error=upload');

    const title = String(req.body.title || '').trim();
    if (!title || title.length > 120) return back('?error=title');

    // Same tenant rule as everywhere else: the id is filtered by company_id in
    // the same statement, so a guessed id belonging to another company matches
    // nothing rather than being fetched and then checked.
    const cur = await pool.query(
      'SELECT image_url FROM portfolio_items WHERE id = $1 AND company_id = $2',
      [req.params.id, req.session.companyId]
    );
    if (!cur.rows.length) return res.status(404).redirect('/company/portfolio');

    let imageUrl = cur.rows[0].image_url;
    const pasted = String(req.body.image_url || '').trim();
    if (req.file) {
      await compressImage(req.file.path);
      const old = imageUrl;
      imageUrl = `/uploads/${req.file.filename}`;
      removeUpload(old);                       // replaced, so the old file is dead
    } else if (pasted && pasted !== imageUrl) {
      const old = imageUrl;
      imageUrl = pasted;
      removeUpload(old);
    }

    const cs = caseStudyFields(req.body);
    await pool.query(
      `UPDATE portfolio_items SET title=$1, description=$2, image_url=$3, order_index=$4,
         image_alt=$5, project_url=$6, category=$7, client_name=$8, problem=$9,
         solution=$10, result=$11, is_featured=$12
       WHERE id=$13 AND company_id=$14`,
      [title, req.body.description || null, imageUrl, parseInt(req.body.order_index) || 0,
        cs.image_alt, cs.project_url, cs.category, cs.client_name, cs.problem, cs.solution,
        cs.result, cs.is_featured, req.params.id, req.session.companyId]
    );
    return back('?saved=1');
  });
});

// Hide keeps the work; delete loses it. Two different intentions that used to
// share one button.
router.post('/portfolio/toggle/:id', requireLogin, async (req, res) => {
  await pool.query(
    'UPDATE portfolio_items SET is_hidden = NOT COALESCE(is_hidden, false) WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/portfolio');
});

// Ordering was a number the merchant typed on every item. Two buttons instead:
// swap order_index with the neighbour in the requested direction.
router.post('/portfolio/move/:id', requireLogin, async (req, res) => {
  const dir = req.body.dir === 'up' ? 'up' : 'down';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const all = await client.query(
      `SELECT id, order_index FROM portfolio_items WHERE company_id = $1
       ORDER BY order_index, created_at DESC FOR UPDATE`,
      [req.session.companyId]
    );
    const rows = all.rows;
    const i = rows.findIndex((r) => String(r.id) === String(req.params.id));
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < rows.length) {
      // The stored indexes can be equal (everything defaults to 0), so the
      // positions are rewritten from the visible order rather than swapped —
      // swapping two zeros changes nothing.
      const order = rows.map((r) => r.id);
      order.splice(j, 0, order.splice(i, 1)[0]);
      for (let k = 0; k < order.length; k++) {
        await client.query('UPDATE portfolio_items SET order_index = $1 WHERE id = $2 AND company_id = $3',
          [k, order[k], req.session.companyId]);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[POST /portfolio/move] ', e.message);
  } finally {
    client.release();
  }
  res.redirect('/company/portfolio');
});

/* ─── MESSAGES ───────────────────────────────────────────── */
router.get('/messages', requireLogin, async (req, res) => {
  const folder = req.query.folder === 'spam' ? 'spam' : 'inbox';
  const wantSpam = folder === 'spam';
  try {
    const result = await pool.query(
      'SELECT * FROM contact_messages WHERE company_id = $1 AND is_spam = $2 ORDER BY created_at DESC',
      [req.session.companyId, wantSpam]
    );
    const counts = (await pool.query(
      `SELECT COUNT(*) FILTER (WHERE is_spam = false)::int AS inbox,
              COUNT(*) FILTER (WHERE is_spam = true)::int AS spam
       FROM contact_messages WHERE company_id = $1`,
      [req.session.companyId]
    )).rows[0];
    res.render('company/messages', { messages: result.rows, folder, counts, session: req.session });
  } catch (err) {
    console.error('[GET /messages] error:', err);
    res.status(500).send('Error loading messages.');
  }
});

router.post('/messages/:id/read', requireLogin, async (req, res) => {
  await pool.query(
    'UPDATE contact_messages SET is_read = true WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect(req.body.folder === 'spam' ? '/company/messages?folder=spam' : '/company/messages');
});

// Move a message to the spam folder (or back to the inbox).
router.post('/messages/:id/spam', requireLogin, async (req, res) => {
  await pool.query(
    'UPDATE contact_messages SET is_spam = true WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/messages');
});

router.post('/messages/:id/not-spam', requireLogin, async (req, res) => {
  await pool.query(
    'UPDATE contact_messages SET is_spam = false, is_read = false WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/messages?folder=spam');
});

router.post('/messages/:id/delete', requireLogin, async (req, res) => {
  await pool.query(
    'DELETE FROM contact_messages WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect(req.body.folder === 'spam' ? '/company/messages?folder=spam' : '/company/messages');
});

async function fetchCategories(companyId) {
  const r = await pool.query(
    'SELECT * FROM product_categories WHERE company_id = $1 ORDER BY order_index, name',
    [companyId]
  );
  return r.rows;
}

/* ─── CATEGORIES (shop only) ─────────────────────────────── */
router.get('/categories', requireLogin, requireShop, async (req, res) => {
  const categories = await fetchCategories(req.session.companyId);
  res.render('company/categories', { categories, session: req.session, error: null });
});

router.post('/categories/add', requireLogin, requireShop, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.redirect('/company/categories');
  try {
    await pool.query(
      'INSERT INTO product_categories (company_id, name) VALUES ($1, $2)',
      [req.session.companyId, name]
    );
  } catch (err) { console.error('[POST /categories/add] error:', err); }
  res.redirect('/company/categories');
});

router.post('/categories/:id/rename', requireLogin, requireShop, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (name) {
    await pool.query(
      'UPDATE product_categories SET name = $1 WHERE id = $2 AND company_id = $3',
      [name, req.params.id, req.session.companyId]
    );
  }
  res.redirect('/company/categories');
});

router.post('/categories/:id/delete', requireLogin, requireShop, async (req, res) => {
  // Orphan products in this category — set their category_id to NULL
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE products SET category_id = NULL WHERE category_id = $1 AND company_id = $2',
      [req.params.id, req.session.companyId]
    );
    await client.query(
      'DELETE FROM product_categories WHERE id = $1 AND company_id = $2',
      [req.params.id, req.session.companyId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /categories/:id/delete] error:', err);
  } finally { client.release(); }
  res.redirect('/company/categories');
});

/* ─── PRODUCTS (shop only) ───────────────────────────────── */
router.get('/products', requireLogin, requireShop, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN product_categories c ON c.id = p.category_id
       WHERE p.company_id = $1 ORDER BY p.created_at DESC`,
      [req.session.companyId]
    );
    const company = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    res.render('company/products', {
      products: result.rows,
      company: company.rows[0],
      session: req.session,
    });
  } catch (err) {
    console.error('[GET /products] error:', err);
    res.status(500).send('Error loading products.');
  }
});

router.get('/products/add', requireLogin, requireShop, async (req, res) => {
  const company = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
  const categories = await fetchCategories(req.session.companyId);
  res.render('company/product_form', {
    product: null,
    company: company.rows[0],
    categories,
    images: [],
    session: req.session,
    error: null,
  });
});

router.post('/products/add', requireLogin, requireShop, (req, res) => {
  uploadProductMedia(req, res, async (uploadErr) => {
    const renderError = async (message) => {
      const company = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
      const categories = await fetchCategories(req.session.companyId);
      return res.render('company/product_form', {
        product: req.body,
        company: company.rows[0],
        categories,
        images: [],
        session: req.session,
        error: message,
      });
    };
    if (uploadErr) return renderError(`Upload failed: ${uploadErr.message}`);
    const { name, description, price, stock, image_url } = req.body;
    if (!name || price === undefined) return renderError('Name and price are required.');
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) return renderError('Invalid price.');
    const stockNum = parseInt(stock, 10);
    if (isNaN(stockNum) || stockNum < 0) return renderError('Invalid stock.');
    let categoryId = parseInt(req.body.category_id, 10);
    if (!Number.isFinite(categoryId)) categoryId = null;
    if (categoryId !== null) {
      const c = await pool.query(
        'SELECT id FROM product_categories WHERE id = $1 AND company_id = $2',
        [categoryId, req.session.companyId]
      );
      if (!c.rows.length) categoryId = null;
    }
    const imageFile = req.files && req.files.image_file && req.files.image_file[0];
    const videoFile = req.files && req.files.video_file && req.files.video_file[0];
    let finalImageUrl = imageFile ? `/uploads/${imageFile.filename}` : (image_url || null);
    let finalVideoUrl = null;
    if (imageFile) { await compressImage(imageFile.path); }
    if (videoFile) {
      const outPath = await compressVideo(videoFile.path);
      finalVideoUrl = `/uploads/${path.basename(outPath)}`;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const name_ar = (req.body.name_ar || '').trim() || null;
      const name_en = (req.body.name_en || '').trim() || null;
      const description_ar = (req.body.description_ar || '').trim() || null;
      const description_en = (req.body.description_en || '').trim() || null;
      const finalName = name || name_ar || name_en || '';
      const ins = await client.query(
        `INSERT INTO products (company_id, name, description, price, image_url, stock, is_active, category_id, name_ar, name_en, description_ar, description_en, sale_type, sizes, weight_unit, video_url)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [req.session.companyId, finalName, description || null, priceNum, finalImageUrl, stockNum, categoryId, name_ar, name_en, description_ar, description_en,
         (['unit','size','weight'].includes(req.body.sale_type) ? req.body.sale_type : 'unit'),
         (req.body.sale_type === 'size' ? ((req.body.sizes || '').trim() || null) : null),
         (req.body.sale_type === 'weight' ? (req.body.weight_unit === 'جم' ? 'جم' : 'كجم') : null),
         finalVideoUrl]
      );
      if (stockNum > 0) {
        await client.query(
          `INSERT INTO stock_movements (product_id, company_id, change_amount, reason, notes)
           VALUES ($1, $2, $3, 'restock', 'Initial stock on creation')`,
          [ins.rows[0].id, req.session.companyId, stockNum]
        );
      }
      await client.query('COMMIT');
      // Tell IndexNow about the new product so Bing crawls it fast (best-effort).
      try {
        const co = await pool.query(
          "SELECT slug FROM companies WHERE id = $1 AND is_active = true AND page_type = 'shop'",
          [req.session.companyId]
        );
        if (co.rows.length) {
          const slug = co.rows[0].slug;
          indexnow.ping([
            indexnow.SITE_ORIGIN + '/shop/' + slug + '/product/' + ins.rows[0].id,
            indexnow.SITE_ORIGIN.replace('://', '://' + slug + '.') + '/',
          ]);
        }
      } catch (_) { /* IndexNow is best-effort */ }
      res.redirect('/company/products');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[POST /products/add] db error:', err);
      return renderError(`Failed to add product: ${err.message}`);
    } finally { client.release(); }
  });
});

router.get('/products/:id/edit', requireLogin, requireShop, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM products WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  if (!result.rows.length) return res.redirect('/company/products');
  const company = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
  const categories = await fetchCategories(req.session.companyId);
  const images = await pool.query(
    'SELECT * FROM product_images WHERE product_id = $1 ORDER BY order_index, created_at',
    [req.params.id]
  );
  const variants = await pool.query(
    'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY sort_order, id', [req.params.id]
  );
  res.render('company/product_form', {
    product: result.rows[0],
    company: company.rows[0],
    categories,
    images: images.rows,
    variants: variants.rows,
    session: req.session,
    error: null,
  });
});

/* ─── DEALS (phase 10) ───────────────────────────────────── */
router.get('/deals', requireLogin, requireShop, async (req, res) => {
  try {
    const cid = req.session.companyId;
    const [rows, products] = await Promise.all([
      pool.query(`SELECT d.*, p.name AS product_name FROM deals d JOIN products p ON p.id=d.product_id
                  WHERE d.company_id=$1 ORDER BY d.created_at DESC`, [cid]),
      pool.query('SELECT id, name, name_ar, price FROM products WHERE company_id=$1 AND is_active=true ORDER BY name', [cid]),
    ]);
    res.render('company/deals', { deals: rows.rows, products: products.rows, session: req.session });
  } catch (e) { console.error('[deals]', e.message); res.redirect('/company/dashboard'); }
});
router.post('/deals/add', requireLogin, requireShop, async (req, res) => {
  const b = req.body || {};
  const pid = parseInt(b.product_id, 10);
  const pct = Math.max(1, Math.min(90, parseInt(b.discount_pct, 10) || 0));
  const ends = b.ends_at && !isNaN(Date.parse(b.ends_at)) ? new Date(b.ends_at).toISOString() : null;
  try {
    const owns = (await pool.query('SELECT 1 FROM products WHERE id=$1 AND company_id=$2', [pid, req.session.companyId])).rowCount;
    if (owns && pct) await pool.query('INSERT INTO deals (company_id, product_id, discount_pct, ends_at) VALUES ($1,$2,$3,$4)', [req.session.companyId, pid, pct, ends]);
  } catch (e) { console.error('[deal add]', e.message); }
  res.redirect('/company/deals');
});
router.post('/deals/:id/delete', requireLogin, requireShop, async (req, res) => {
  try { await pool.query('DELETE FROM deals WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.session.companyId]); } catch (e) { console.error(e.message); }
  res.redirect('/company/deals');
});

/* ─── COUPONS (phase 11) ─────────────────────────────────── */
router.get('/coupons', requireLogin, requireShop, async (req, res) => {
  try {
    const rows = (await pool.query('SELECT * FROM coupons WHERE company_id=$1 ORDER BY created_at DESC', [req.session.companyId])).rows;
    res.render('company/coupons', { coupons: rows, session: req.session });
  } catch (e) { console.error('[coupons]', e.message); res.redirect('/company/dashboard'); }
});
router.post('/coupons/add', requireLogin, requireShop, async (req, res) => {
  const b = req.body || {};
  const code = String(b.code || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 40);
  const type = b.discount_type === 'fixed' ? 'fixed' : 'percent';
  const num = (v, d) => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : d);
  const exp = b.expires_at && !isNaN(Date.parse(b.expires_at)) ? new Date(b.expires_at).toISOString() : null;
  try {
    if (code) await pool.query(
      `INSERT INTO coupons (company_id, code, discount_type, discount_value, min_order_amount, max_uses, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (company_id, code) DO NOTHING`,
      // A "percent" coupon saved at 150 is not a discount, it is the shop
      // paying the customer. The checkout clamps what it takes, but a row that
      // cannot exist is one fewer thing the checkout has to survive.
      [req.session.companyId, code, type,
       type === 'percent' ? money.percent(b.discount_value, 0) : money.positive(b.discount_value, 0),
       money.positive(b.min_order_amount, 0), parseInt(b.max_uses, 10) || null, exp]
    );
  } catch (e) { console.error('[coupon add]', e.message); }
  res.redirect('/company/coupons');
});
router.post('/coupons/:id/delete', requireLogin, requireShop, async (req, res) => {
  try { await pool.query('DELETE FROM coupons WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.session.companyId]); } catch (e) { console.error(e.message); }
  res.redirect('/company/coupons');
});

/* ─── CSV PRODUCT IMPORT (competitor phase 28) ───────────── */
// Tolerant CSV line parser (handles quoted fields containing commas).
function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
router.get('/products/import', requireLogin, requireShop, (req, res) => {
  res.render('company/import', { session: req.session, result: req.query.done ? { added: parseInt(req.query.done, 10) || 0 } : null });
});
router.post('/products/import', requireLogin, requireShop, async (req, res) => {
  const text = String(req.body.csv || '').trim();
  if (!text) return res.redirect('/company/products/import');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  // Optional header row: detect if first row is non-numeric price.
  let start = 0;
  if (lines.length) { const f = parseCsvLine(lines[0]); if (f[1] && isNaN(Number(f[1]))) start = 1; }
  let added = 0;
  for (let i = start; i < lines.length && added < 1000; i++) {
    const cols = parseCsvLine(lines[i]); // name, price, stock, description, name_en
    const name = (cols[0] || '').slice(0, 200);
    const price = Number(cols[1]);
    if (!name || !isFinite(price)) continue;
    try {
      await pool.query(
        `INSERT INTO products (company_id, name, name_ar, price, stock, description, is_active)
         VALUES ($1,$2,$2,$3,$4,$5,true)`,
        [req.session.companyId, name, price, parseInt(cols[2], 10) || 0, (cols[3] || '').slice(0, 2000) || null]
      );
      added++;
    } catch (e) { /* skip bad row */ }
  }
  res.redirect('/company/products/import?done=' + added);
});

/* ─── MARKETING: PIXELS + FEED (phase 24) ────────────────── */
router.get('/marketing', requireLogin, requireShop, async (req, res) => {
  try {
    const c = (await pool.query('SELECT slug, fb_pixel_id, tiktok_pixel_id, ga4_id, whatsapp_number FROM companies WHERE id=$1', [req.session.companyId])).rows[0];
    res.render('company/marketing', { company: c, session: req.session,
      saved: req.query.saved === '1', saveError: req.query.error === 'save' });
  } catch (e) { console.error('[marketing]', e.message); res.redirect('/company/dashboard'); }
});
router.post('/marketing', requireLogin, requireShop, async (req, res) => {
  const b = req.body || {};
  const clean = (v) => String(v || '').trim().slice(0, 60).replace(/[^\w.\-]/g, '') || null;
  // WhatsApp order number (phase 27): keep digits only (with optional leading +),
  // stored in international format so wa.me links work.
  const cleanPhone = (v) => {
    const digits = String(v || '').replace(/[^\d]/g, '').slice(0, 18);
    return digits || null;
  };
  try {
    await pool.query('UPDATE companies SET fb_pixel_id=$1, tiktok_pixel_id=$2, ga4_id=$3, whatsapp_number=$4 WHERE id=$5',
      [clean(b.fb_pixel_id), clean(b.tiktok_pixel_id), clean(b.ga4_id), cleanPhone(b.whatsapp_number), req.session.companyId]);
  } catch (e) {
    // Was: log it and redirect to ?saved=1 anyway. A merchant would paste a
    // pixel id, be told it saved, and wonder for a week why no events arrived.
    console.error('[marketing save]', e.message);
    return res.redirect('/company/marketing?error=save');
  }
  res.redirect('/company/marketing?saved=1');
});

/* ─── GIFT CARDS (phase 31) ──────────────────────────────── */
// Merchant creates gift-card codes with a set value; a customer redeems a code
// into their wallet and later pays with the wallet balance at checkout.
router.get('/giftcards', requireLogin, requireShop, async (req, res) => {
  try {
    const cards = (await pool.query(
      `SELECT g.*, c.full_name AS redeemer_name
         FROM gift_cards g LEFT JOIN customers c ON c.id = g.redeemed_by
        WHERE g.company_id=$1 ORDER BY g.created_at DESC LIMIT 200`,
      [req.session.companyId]
    )).rows;
    res.render('company/giftcards', { cards, session: req.session, saved: req.query.saved === '1', error: pageError('giftcards', req.query.error) });
  } catch (e) { console.error('[giftcards]', e.message); res.redirect('/company/dashboard'); }
});
router.post('/giftcards', requireLogin, requireShop, async (req, res) => {
  const b = req.body || {};
  const amount = Math.max(1, Math.min(100000, parseFloat(b.amount) || 0));
  // Code: uppercase alnum, generated if not supplied. The generated one is the
  // card's entire security — see src/lib/codes.js for why Math.random was not
  // an option here.
  let code = String(b.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
  if (!code) code = codes.giftCode();
  if (!amount) return res.redirect('/company/giftcards?error=amount');
  try {
    await pool.query(
      'INSERT INTO gift_cards (company_id, code, amount) VALUES ($1,$2,$3) ON CONFLICT (company_id, code) DO NOTHING',
      [req.session.companyId, code, amount]
    );
    res.redirect('/company/giftcards?saved=1');
  } catch (e) {
    console.error('[giftcard create]', e.message);
    res.redirect('/company/giftcards?error=save');
  }
});
router.post('/giftcards/:id/toggle', requireLogin, requireShop, async (req, res) => {
  try {
    await pool.query(
      'UPDATE gift_cards SET is_active = NOT is_active WHERE id=$1 AND company_id=$2 AND redeemed_by IS NULL',
      [parseInt(req.params.id, 10), req.session.companyId]
    );
  } catch (e) { console.error('[giftcard toggle]', e.message); }
  res.redirect('/company/giftcards');
});

/* ─── STORE ANALYTICS (phase 29) ─────────────────────────── */
router.get('/analytics', requireLogin, requireShop, async (req, res) => {
  try {
    const analytics = require('../lib/store_analytics');
    const days = parseInt(req.query.days, 10) || 30;
    const data = await analytics.summary(req.session.companyId, days);
    res.render('company/analytics', { data, days: data.days, session: req.session });
  } catch (e) { console.error('[analytics]', e.message); res.redirect('/company/dashboard'); }
});

/* ─── SUBSCRIPTIONS (phase 32) ───────────────────────────── */
router.get('/subscriptions', requireLogin, requireShop, async (req, res) => {
  try {
    const subs = (await pool.query(
      `SELECT s.*, p.name AS product_name, c.full_name AS customer_name, c.phone AS customer_phone
         FROM subscriptions s
         JOIN products p ON p.id = s.product_id
         LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.company_id=$1 ORDER BY (s.status='active') DESC, s.next_renewal LIMIT 300`,
      [req.session.companyId]
    )).rows;
    res.render('company/subscriptions', { subs, session: req.session });
  } catch (e) { console.error('[company subscriptions]', e.message); res.redirect('/company/dashboard'); }
});

/* ─── LANDING PAGES (phase 30) ───────────────────────────── */
router.get('/landing', requireLogin, requireShop, async (req, res) => {
  try {
    const company = (await pool.query('SELECT slug FROM companies WHERE id=$1', [req.session.companyId])).rows[0] || {};
    const products = (await pool.query(
      'SELECT id, name, price, image_url, is_active FROM products WHERE company_id=$1 AND is_active=true ORDER BY created_at DESC LIMIT 200',
      [req.session.companyId]
    )).rows;
    res.render('company/landing', { company, products, session: req.session });
  } catch (e) { console.error('[landing list]', e.message); res.redirect('/company/dashboard'); }
});

/* ─── MULTI-CURRENCY DISPLAY (phase 33) ──────────────────── */
router.get('/currencies', requireLogin, requireShop, async (req, res) => {
  try {
    const company = (await pool.query('SELECT currency FROM companies WHERE id=$1', [req.session.companyId])).rows[0] || {};
    const rows = (await pool.query('SELECT * FROM store_currencies WHERE company_id=$1 ORDER BY sort_order, id', [req.session.companyId])).rows;
    res.render('company/currencies', { base: company.currency || 'EGP', currencies: rows, session: req.session, saved: req.query.saved === '1', error: pageError('currencies', req.query.error) });
  } catch (e) { console.error('[currencies]', e.message); res.redirect('/company/dashboard'); }
});
router.post('/currencies', requireLogin, requireShop, async (req, res) => {
  const b = req.body || {};
  const code = String(b.code || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  const symbol = String(b.symbol || '').trim().slice(0, 8);
  const rate = parseFloat(b.rate);
  if (!code || !symbol || !(rate > 0)) return res.redirect('/company/currencies?error=invalid');
  try {
    await pool.query(
      `INSERT INTO store_currencies (company_id, code, symbol, rate) VALUES ($1,$2,$3,$4)
       ON CONFLICT (company_id, code) DO UPDATE SET symbol=EXCLUDED.symbol, rate=EXCLUDED.rate, is_active=true`,
      [req.session.companyId, code, symbol, rate]
    );
    res.redirect('/company/currencies?saved=1');
  } catch (e) { console.error('[currency add]', e.message); res.redirect('/company/currencies?error=save'); }
});
router.post('/currencies/:id/delete', requireLogin, requireShop, async (req, res) => {
  try { await pool.query('DELETE FROM store_currencies WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.session.companyId]); }
  catch (e) { console.error('[currency del]', e.message); }
  res.redirect('/company/currencies');
});

/* ─── ABANDONED CHECKOUTS (phase 26) ─────────────────────── */
// Carts that reached checkout but never converted. The merchant sees who + what,
// and gets a ready WhatsApp reminder link (uses their store whatsapp_number).
router.get('/abandoned', requireLogin, requireShop, async (req, res) => {
  try {
    const company = (await pool.query('SELECT slug, whatsapp_number FROM companies WHERE id=$1', [req.session.companyId])).rows[0] || {};
    // Only surface carts idle for 30+ minutes (give the buyer time to finish).
    const rows = (await pool.query(
      `SELECT a.*, c.email AS customer_email
         FROM abandoned_carts a LEFT JOIN customers c ON c.id = a.customer_id
        WHERE a.company_id=$1 AND a.updated_at < now() - interval '30 minutes'
        ORDER BY a.updated_at DESC LIMIT 100`,
      [req.session.companyId]
    )).rows;
    res.render('company/abandoned', { carts: rows, company, session: req.session });
  } catch (e) { console.error('[abandoned]', e.message); res.redirect('/company/dashboard'); }
});

/* ─── SALES REPORTS (phase 22) ───────────────────────────── */
router.get('/reports', requireLogin, requireShop, async (req, res) => {
  const cid = req.session.companyId;
  try {
    const [totals, byStatus, daily, topProducts] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(total_amount) FILTER (WHERE status <> 'cancelled'),0) AS revenue,
           COUNT(*) FILTER (WHERE status <> 'cancelled') AS orders,
           COALESCE(SUM(total_amount) FILTER (WHERE status <> 'cancelled' AND created_at::date = CURRENT_DATE),0) AS today,
           COALESCE(SUM(total_amount) FILTER (WHERE status <> 'cancelled' AND created_at >= date_trunc('month', CURRENT_DATE)),0) AS month
         FROM orders WHERE company_id=$1`, [cid]),
      pool.query("SELECT status, COUNT(*)::int n FROM orders WHERE company_id=$1 GROUP BY status", [cid]),
      pool.query(
        `SELECT created_at::date AS d, COALESCE(SUM(total_amount),0) AS total FROM orders
         WHERE company_id=$1 AND status<>'cancelled' AND created_at >= CURRENT_DATE - INTERVAL '29 days'
         GROUP BY d ORDER BY d`, [cid]),
      pool.query(
        `SELECT oi.product_name, SUM(oi.quantity)::int qty, COALESCE(SUM(oi.unit_price*oi.quantity),0) revenue
         FROM order_items oi JOIN orders o ON o.id=oi.order_id
         WHERE o.company_id=$1 AND o.status<>'cancelled'
         GROUP BY oi.product_name ORDER BY revenue DESC LIMIT 10`, [cid]),
    ]);
    res.render('company/reports', {
      totals: totals.rows[0], byStatus: byStatus.rows, daily: daily.rows, topProducts: topProducts.rows, session: req.session,
    });
  } catch (e) { console.error('[reports]', e.message); res.redirect('/company/dashboard'); }
});

/* ─── PRODUCT Q&A + RETURNS (phases 17, 20) ──────────────── */
router.get('/questions', requireLogin, requireShop, async (req, res) => {
  try {
    const [qs, rets] = await Promise.all([
      pool.query(`SELECT q.*, p.name AS product_name FROM product_questions q JOIN products p ON p.id=q.product_id
                  WHERE q.company_id=$1 ORDER BY (q.answer IS NULL) DESC, q.created_at DESC LIMIT 100`, [req.session.companyId]),
      pool.query(`SELECT r.*, o.customer_name FROM return_requests r JOIN orders o ON o.id=r.order_id
                  WHERE r.company_id=$1 ORDER BY (r.status='pending') DESC, r.created_at DESC LIMIT 100`, [req.session.companyId]),
    ]);
    res.render('company/questions', { questions: qs.rows, returns: rets.rows, session: req.session });
  } catch (e) { console.error('[questions]', e.message); res.redirect('/company/dashboard'); }
});
router.post('/questions/:id/answer', requireLogin, requireShop, async (req, res) => {
  const ans = String(req.body.answer || '').trim().slice(0, 1000);
  try {
    if (ans) await pool.query('UPDATE product_questions SET answer=$1, answered_at=now() WHERE id=$2 AND company_id=$3', [ans, parseInt(req.params.id, 10), req.session.companyId]);
  } catch (e) { console.error(e.message); }
  res.redirect('/company/questions');
});
router.post('/returns/:id/status', requireLogin, requireShop, async (req, res) => {
  const st = ['pending', 'approved', 'rejected', 'refunded'].includes(req.body.status) ? req.body.status : null;
  try {
    if (st) await pool.query('UPDATE return_requests SET status=$1, admin_notes=$2 WHERE id=$3 AND company_id=$4',
      [st, String(req.body.admin_notes || '').slice(0, 300) || null, parseInt(req.params.id, 10), req.session.companyId]);
  } catch (e) { console.error(e.message); }
  res.redirect('/company/questions');
});

/* ─── SHIPPING ZONES (phase 12) ──────────────────────────── */
router.get('/shipping', requireLogin, requireShop, async (req, res) => {
  try {
    const couriers = require('../lib/shipping_providers');
    const rows = (await pool.query('SELECT * FROM shipping_zones WHERE company_id=$1 ORDER BY governorate', [req.session.companyId])).rows;
    const integration = await couriers.loadIntegration(req.session.companyId);
    res.render('company/shipping', {
      zones: rows, session: req.session,
      integration, courierProviders: couriers.PROVIDERS,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[shipping]', e.message); res.redirect('/company/dashboard'); }
});
// Save the merchant's courier integration (provider + their own API key).
router.post('/shipping/integration', requireLogin, requireShop, async (req, res) => {
  try { await require('../lib/shipping_providers').saveIntegration(req.session.companyId, req.body || {}); }
  catch (e) {
    // A courier API key that did not save, reported as saved, means orders
    // silently stop reaching Bosta.
    console.error('[courier save]', e.message);
    return res.redirect('/company/shipping?error=save');
  }
  res.redirect('/company/shipping?saved=1');
});
router.post('/shipping/add', requireLogin, requireShop, async (req, res) => {
  const b = req.body || {};
  const gov = String(b.governorate || '').trim().slice(0, 60);
  const num = (v, d) => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : d);
  try {
    if (gov) await pool.query(
      `INSERT INTO shipping_zones (company_id, governorate, cost, free_over, eta_days) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (company_id, governorate) DO UPDATE SET cost=EXCLUDED.cost, free_over=EXCLUDED.free_over, eta_days=EXCLUDED.eta_days`,
      [req.session.companyId, gov, num(b.cost, 0), num(b.free_over, null), String(b.eta_days || '').slice(0, 40) || null]
    );
  } catch (e) { console.error('[shipping add]', e.message); }
  res.redirect('/company/shipping');
});
router.post('/shipping/:id/delete', requireLogin, requireShop, async (req, res) => {
  try { await pool.query('DELETE FROM shipping_zones WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.session.companyId]); } catch (e) { console.error(e.message); }
  res.redirect('/company/shipping');
});

/* ─── STORE FEATURE FLAGS (phase 21) ─────────────────────── */
router.get('/features', requireLogin, requireShop, async (req, res) => {
  try {
    const flags = await shopFeatures.getFeatures(req.session.companyId);
    res.render('company/features', {
      features: shopFeatures.FEATURES, flags, session: req.session, saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[features]', e.message); res.redirect('/company/dashboard'); }
});
router.post('/features', requireLogin, requireShop, async (req, res) => {
  try { await shopFeatures.setFeatures(req.session.companyId, req.body || {}); }
  catch (e) {
    console.error('[features save]', e.message);
    return res.redirect('/company/features?error=save');
  }
  res.redirect('/company/features?saved=1');
});

/* ─── PRODUCT VARIANTS (phase 8) ─────────────────────────── */
router.post('/products/:id/variants/add', requireLogin, requireShop, async (req, res) => {
  const pid = parseInt(req.params.id, 10);
  const b = req.body || {};
  const label = String(b.label || '').trim().slice(0, 120);
  const num = (v, d) => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : d);
  try {
    const owns = (await pool.query('SELECT id FROM products WHERE id=$1 AND company_id=$2', [pid, req.session.companyId])).rowCount;
    if (owns && label) {
      await pool.query(
        'INSERT INTO product_variants (product_id, company_id, label, sku, price_delta, stock) VALUES ($1,$2,$3,$4,$5,$6)',
        [pid, req.session.companyId, label, String(b.sku || '').slice(0, 60) || null, num(b.price_delta, 0), parseInt(b.stock, 10) || 0]
      );
    }
  } catch (e) { console.error('[variant add]', e.message); }
  res.redirect('/company/products/' + pid + '/edit');
});
router.post('/products/:id/variants/:vid/delete', requireLogin, requireShop, async (req, res) => {
  const pid = parseInt(req.params.id, 10);
  try {
    await pool.query(
      'DELETE FROM product_variants WHERE id=$1 AND product_id=$2 AND company_id=$3',
      [parseInt(req.params.vid, 10), pid, req.session.companyId]
    );
  } catch (e) { console.error('[variant delete]', e.message); }
  res.redirect('/company/products/' + pid + '/edit');
});

router.post('/products/:id/edit', requireLogin, requireShop, (req, res) => {
  uploadProductMedia(req, res, async (uploadErr) => {
    const renderError = async (message) => {
      const result = await pool.query(
        'SELECT * FROM products WHERE id = $1 AND company_id = $2',
        [req.params.id, req.session.companyId]
      );
      const company = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
      const categories = await fetchCategories(req.session.companyId);
      const images = await pool.query(
        'SELECT * FROM product_images WHERE product_id = $1 ORDER BY order_index, created_at',
        [req.params.id]
      );
      return res.render('company/product_form', {
        product: result.rows[0] || req.body,
        company: company.rows[0],
        categories,
        images: images.rows,
        session: req.session,
        error: message,
      });
    };
    if (uploadErr) return renderError(`Upload failed: ${uploadErr.message}`);
    const { name, description, price, stock, image_url } = req.body;
    if (!name || price === undefined) return renderError('Name and price are required.');
    const priceNum = parseFloat(price);
    const stockNum = parseInt(stock, 10);
    if (isNaN(priceNum) || priceNum < 0) return renderError('Invalid price.');
    if (isNaN(stockNum) || stockNum < 0) return renderError('Invalid stock.');
    let categoryId = parseInt(req.body.category_id, 10);
    if (!Number.isFinite(categoryId)) categoryId = null;
    if (categoryId !== null) {
      const c = await pool.query(
        'SELECT id FROM product_categories WHERE id = $1 AND company_id = $2',
        [categoryId, req.session.companyId]
      );
      if (!c.rows.length) categoryId = null;
    }
    const imageFile = req.files && req.files.image_file && req.files.image_file[0];
    const videoFile = req.files && req.files.video_file && req.files.video_file[0];
    const finalImageUrl = imageFile ? `/uploads/${imageFile.filename}` : (image_url || null);
    if (imageFile) { await compressImage(imageFile.path); }
    let newVideoUrl = null;
    if (videoFile) {
      const outPath = await compressVideo(videoFile.path);
      newVideoUrl = `/uploads/${path.basename(outPath)}`;
    }
    const removeVideo = req.body.remove_video === '1';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const before = await client.query('SELECT stock, video_url FROM products WHERE id = $1 AND company_id = $2', [req.params.id, req.session.companyId]);
      const beforeStock = before.rows.length ? before.rows[0].stock : 0;
      // Keep existing video unless a new one was uploaded or the merchant chose to remove it.
      let finalVideoUrl = before.rows.length ? before.rows[0].video_url : null;
      if (newVideoUrl) finalVideoUrl = newVideoUrl;
      else if (removeVideo) finalVideoUrl = null;
      const name_ar = (req.body.name_ar || '').trim() || null;
      const name_en = (req.body.name_en || '').trim() || null;
      const description_ar = (req.body.description_ar || '').trim() || null;
      const description_en = (req.body.description_en || '').trim() || null;
      const finalName = name || name_ar || name_en || '';
      // Subscriptions (phase 32): allow marking a product as recurring.
      const subscribable = String(req.body.subscribable) === '1';
      const subInterval = Math.max(1, Math.min(365, parseInt(req.body.sub_interval_days, 10) || 30));
      const subDiscount = Math.max(0, Math.min(90, parseFloat(req.body.sub_discount_pct) || 0));
      await client.query(
        `UPDATE products SET name=$1, description=$2, price=$3, image_url=$4, stock=$5, category_id=$6,
         name_ar=$7, name_en=$8, description_ar=$9, description_en=$10,
         sale_type=$13, sizes=$14, weight_unit=$15, video_url=$16,
         subscribable=$17, sub_interval_days=$18, sub_discount_pct=$19
         WHERE id=$11 AND company_id=$12`,
        [finalName, description || null, priceNum, finalImageUrl, stockNum, categoryId,
         name_ar, name_en, description_ar, description_en, req.params.id, req.session.companyId,
         (['unit','size','weight'].includes(req.body.sale_type) ? req.body.sale_type : 'unit'),
         (req.body.sale_type === 'size' ? ((req.body.sizes || '').trim() || null) : null),
         (req.body.sale_type === 'weight' ? (req.body.weight_unit === 'جم' ? 'جم' : 'كجم') : null),
         finalVideoUrl, subscribable, subInterval, subDiscount]
      );
      const diff = stockNum - beforeStock;
      if (diff !== 0) {
        await client.query(
          `INSERT INTO stock_movements (product_id, company_id, change_amount, reason, notes)
           VALUES ($1, $2, $3, 'adjustment', 'Adjusted via product edit')`,
          [req.params.id, req.session.companyId, diff]
        );
      }
      await client.query('COMMIT');
      // Re-submit the updated product to IndexNow when it's publicly visible.
      try {
        const co = await pool.query(
          `SELECT c.slug FROM companies c JOIN products p ON p.company_id = c.id
           WHERE c.id = $1 AND p.id = $2 AND c.is_active = true AND c.page_type = 'shop' AND p.is_active = true`,
          [req.session.companyId, req.params.id]
        );
        if (co.rows.length) {
          const slug = co.rows[0].slug;
          indexnow.ping([
            indexnow.SITE_ORIGIN + '/shop/' + slug + '/product/' + req.params.id,
            indexnow.SITE_ORIGIN.replace('://', '://' + slug + '.') + '/',
          ]);
        }
      } catch (_) { /* IndexNow is best-effort */ }
      res.redirect('/company/products');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[POST /products/:id/edit] db error:', err);
      return renderError(`Failed to update product: ${err.message}`);
    } finally { client.release(); }
  });
});

router.post('/products/:id/toggle-active', requireLogin, requireShop, async (req, res) => {
  await pool.query(
    'UPDATE products SET is_active = NOT is_active WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/products');
});

router.post('/products/:id/delete', requireLogin, requireShop, async (req, res) => {
  await pool.query(
    'DELETE FROM products WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/products');
});

/* ─── ORDERS (shop only) ─────────────────────────────────── */
router.get('/orders', requireLogin, requireShop, async (req, res) => {
  const status = req.query.status && ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
  const params = [req.session.companyId];
  let where = 'WHERE company_id = $1';
  if (status) { where += ' AND status = $2'; params.push(status); }
  const result = await pool.query(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC`,
    params
  );
  res.render('company/orders', {
    orders: result.rows,
    currentStatus: status || '',
    statuses: ORDER_STATUSES,
    session: req.session,
  });
});

router.get('/orders/:id', requireLogin, requireShop, async (req, res) => {
  const orderResult = await pool.query(
    'SELECT * FROM orders WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  if (!orderResult.rows.length) return res.redirect('/company/orders');
  const itemsResult = await pool.query(
    'SELECT * FROM order_items WHERE order_id = $1',
    [req.params.id]
  );
  const courierIntegration = await require('../lib/shipping_providers').loadIntegration(req.session.companyId);
  res.render('company/order_detail', {
    order: orderResult.rows[0],
    items: itemsResult.rows,
    statuses: ORDER_STATUSES,
    courierIntegration,
    shipped: req.query.shipped === '1',
    shipError: req.query.shiperror || null,
    session: req.session,
  });
});

router.post('/orders/:id/status', requireLogin, requireShop, async (req, res) => {
  const { status } = req.body;
  const orderId = parseInt(req.params.id, 10);
  const back = `/company/orders/${req.params.id}`;
  if (!ORDER_STATUSES.includes(status)) return res.redirect(back);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      'UPDATE orders SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING id',
      [status, orderId, req.session.companyId]
    );
    if (!upd.rows.length) { await client.query('ROLLBACK'); return res.redirect(back); }

    /* Cancelling has to give back what placing it took: the wallet money, the
     * redeemed points, the points earned for a purchase that is not happening,
     * and the stock. All of it inside the same transaction as the status — a
     * refunded wallet with the status un-changed is a worse state than either.
     */
    let undone = null;
    if (orderReversal.isReversing(status)) {
      undone = await orderReversal.reverse(client, req.session.companyId, orderId);
    }

    // Record in the tracking timeline (phase 15).
    const note = String(req.body.note || '').slice(0, 200) || null;
    await client.query('INSERT INTO order_status_history (order_id, status, note) VALUES ($1,$2,$3)',
      [orderId, status, note]);
    if (undone && undone.done && (undone.wallet || undone.pointsBack || undone.items)) {
      // Said out loud on the order's own timeline: a refund nobody can see is
      // the same silence this fixed.
      const parts = [];
      if (undone.wallet) parts.push(`رجع للمحفظة ${undone.wallet}`);
      if (undone.pointsBack) parts.push(`رجعت ${undone.pointsBack} نقطة`);
      if (undone.pointsTaken) parts.push(`اتشالت ${undone.pointsTaken} نقطة مكافأة`);
      if (undone.items) parts.push(`رجع ${undone.items} صنف للمخزون`);
      await client.query('INSERT INTO order_status_history (order_id, status, note) VALUES ($1,$2,$3)',
        [orderId, status, parts.join(' · ').slice(0, 200)]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[order status]', e.message);
    return res.redirect(back + '?error=save');
  } finally { client.release(); }
  res.redirect(back);
});

// Create a shipment / assign an AWB for an order (phase 25). For an automatic
// provider (Bosta) this calls the courier API with the merchant's key; for the
// manual provider it records the AWB the merchant typed. Marks the order shipped.
router.post('/orders/:id/ship', requireLogin, requireShop, async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const back = `/company/orders/${orderId}`;
  try {
    const couriers = require('../lib/shipping_providers');
    const company = { id: req.session.companyId };
    const o = (await pool.query('SELECT * FROM orders WHERE id=$1 AND company_id=$2', [orderId, req.session.companyId])).rows[0];
    if (!o) return res.redirect(back);
    const result = await couriers.createShipment(company, {
      orderId,
      name: o.customer_name, phone: o.customer_phone, address: o.shipping_address,
      city: o.shipping_zone || undefined,
      total: Number(o.total_amount),
      codAmount: (o.payment_status === 'paid') ? 0 : Number(o.total_amount),
    }, { manualAwb: req.body.awb, manualTrackingUrl: req.body.tracking_url });
    await pool.query(
      "UPDATE orders SET awb=$1, shipment_provider=$2, shipment_status=$3, shipment_tracking_url=$4, status = CASE WHEN status IN ('pending','confirmed','preparing') THEN 'shipped' ELSE status END WHERE id=$5 AND company_id=$6",
      [result.awb, result.provider, result.status, result.trackingUrl || null, orderId, req.session.companyId]
    );
    await pool.query('INSERT INTO order_status_history (order_id, status, note) VALUES ($1,$2,$3)',
      [orderId, 'shipped', 'بوليصة شحن: ' + result.awb]).catch(() => {});
    res.redirect(back + '?shipped=1');
  } catch (e) {
    console.error('[order ship]', e.message);
    res.redirect(back + '?shiperror=' + encodeURIComponent(e.message));
  }
});

/* ─── STOCK MOVEMENTS ────────────────────────────────────── */
router.get('/products/:id/stock', requireLogin, requireShop, async (req, res) => {
  const product = await pool.query(
    'SELECT * FROM products WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  if (!product.rows.length) return res.redirect('/company/products');
  const movements = await pool.query(
    'SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC LIMIT 200',
    [req.params.id]
  );
  res.render('company/product_stock', {
    product: product.rows[0],
    movements: movements.rows,
    session: req.session,
    error: pageError('stock', req.query.error),
  });
});

router.post('/products/:id/stock', requireLogin, requireShop, async (req, res) => {
  const change = parseInt(req.body.change_amount, 10);
  const reason = ['restock', 'adjustment', 'return'].includes(req.body.reason) ? req.body.reason : 'adjustment';
  if (!Number.isFinite(change) || change === 0) {
    return res.redirect(`/company/products/${req.params.id}/stock?error=zero`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE products SET stock = stock + $1
       WHERE id = $2 AND company_id = $3 AND (stock + $1) >= 0
       RETURNING stock`,
      [change, req.params.id, req.session.companyId]
    );
    if (!upd.rows.length) {
      await client.query('ROLLBACK');
      return res.redirect(`/company/products/${req.params.id}/stock?error=negative`);
    }
    await client.query(
      `INSERT INTO stock_movements (product_id, company_id, change_amount, reason, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, req.session.companyId, change, reason, req.body.notes || null]
    );
    await client.query('COMMIT');
    res.redirect(`/company/products/${req.params.id}/stock`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /products/:id/stock] error:', err);
    // Never `err.message`: that is the database talking to a web page.
    res.redirect(`/company/products/${req.params.id}/stock?error=save`);
  } finally { client.release(); }
});

/* ─── PRODUCT IMAGES (gallery) ───────────────────────────── */
router.post('/products/:id/images/add', requireLogin, requireShop, (req, res) => {
  uploadProductImage(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.redirect(`/company/products/${req.params.id}/edit`);
    }
    const product = await pool.query(
      'SELECT id FROM products WHERE id = $1 AND company_id = $2',
      [req.params.id, req.session.companyId]
    );
    if (!product.rows.length || !req.file) {
      return res.redirect(`/company/products/${req.params.id}/edit`);
    }
    await compressImage(req.file.path);
    await pool.query(
      `INSERT INTO product_images (product_id, image_url) VALUES ($1, $2)`,
      [req.params.id, `/uploads/${req.file.filename}`]
    );
    res.redirect(`/company/products/${req.params.id}/edit`);
  });
});

router.post('/products/:id/images/:imgId/delete', requireLogin, requireShop, async (req, res) => {
  await pool.query(
    `DELETE FROM product_images
     WHERE id = $1 AND product_id IN (SELECT id FROM products WHERE id = $2 AND company_id = $3)`,
    [req.params.imgId, req.params.id, req.session.companyId]
  );
  res.redirect(`/company/products/${req.params.id}/edit`);
});

/* ─── BANNERS (slider) — shop or portfolio ───────────────── */
router.get('/banners', requireLogin, async (req, res) => {
  const banners = await pool.query(
    'SELECT * FROM banner_slides WHERE company_id = $1 ORDER BY order_index, created_at',
    [req.session.companyId]
  );
  let error = null;
  const code = req.query.err;
  if (code === 'too_large') error = 'الصورة أكبر من 5 ميجابايت — جرّب صورة أصغر.';
  else if (code === 'no_file') error = 'لم يتم اختيار صورة. اختر ملفاً واضغط رفع.';
  else if (code === 'upload') error = 'فشل رفع الصورة. تأكد إن الصيغة مدعومة (PNG/JPEG/WebP/GIF).';
  else if (code === 'save') error = 'تم رفع الصورة لكن لم تُحفظ في قاعدة البيانات. حاول مرة أخرى.';
  res.render('company/banners', { banners: banners.rows, session: req.session, error });
});

// Direct-navigating to /banners/add (e.g. from a stale link or after a
// rejected upload) is harmless — bounce back to the manager instead of
// letting the edge proxy serve a bare 403/404.
router.get('/banners/add', requireLogin, (req, res) => res.redirect('/company/banners'));

router.post('/banners/add', requireLogin, (req, res) => {
  uploadProductImage(req, res, async (uploadErr) => {
    if (uploadErr) {
      const code = uploadErr.code === 'LIMIT_FILE_SIZE' ? 'too_large' : 'upload';
      console.error('[banners/add] upload error:', uploadErr.message);
      return res.redirect('/company/banners?err=' + code);
    }
    if (!req.file) return res.redirect('/company/banners?err=no_file');
    await compressImage(req.file.path);
    try {
      const target_url = require('../lib/safeUrl').cleanUrlForStore(req.body.target_url);
      const caption = (req.body.caption || '').trim() || null;
      const validSlots = ['section', 'hero1', 'hero2'];
      const slot = validSlots.includes(req.body.slot) ? req.body.slot : 'section';
      await pool.query(
        `INSERT INTO banner_slides (company_id, image_url, target_url, caption, slot, order_index)
         VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(order_index)+1 FROM banner_slides WHERE company_id = $1), 0))`,
        [req.session.companyId, `/uploads/${req.file.filename}`, target_url, caption, slot]
      );
      res.redirect('/company/banners');
    } catch (err) {
      console.error('[banners/add] db error:', err);
      res.redirect('/company/banners?err=save');
    }
  });
});

router.post('/banners/:id/delete', requireLogin, async (req, res) => {
  await pool.query(
    'DELETE FROM banner_slides WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/banners');
});

router.post('/banners/:id/toggle', requireLogin, async (req, res) => {
  await pool.query(
    'UPDATE banner_slides SET is_active = NOT is_active WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/banners');
});

router.post('/banners/:id/move', requireLogin, async (req, res) => {
  const direction = req.body.direction === 'up' ? 'up' : 'down';
  const op = direction === 'up' ? '<' : '>';
  const ord = direction === 'up' ? 'DESC' : 'ASC';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const me = await client.query(
      'SELECT id, order_index FROM banner_slides WHERE id = $1 AND company_id = $2',
      [req.params.id, req.session.companyId]
    );
    if (!me.rows.length) { await client.query('ROLLBACK'); return res.redirect('/company/banners'); }
    const neighbour = await client.query(
      `SELECT id, order_index FROM banner_slides
       WHERE company_id = $1 AND order_index ${op} $2
       ORDER BY order_index ${ord} LIMIT 1`,
      [req.session.companyId, me.rows[0].order_index]
    );
    if (neighbour.rows.length) {
      await client.query('UPDATE banner_slides SET order_index = $1 WHERE id = $2',
        [neighbour.rows[0].order_index, me.rows[0].id]);
      await client.query('UPDATE banner_slides SET order_index = $1 WHERE id = $2',
        [me.rows[0].order_index, neighbour.rows[0].id]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[banner move] error:', err);
  } finally { client.release(); }
  res.redirect('/company/banners');
});

/* ─── LANGUAGE TOGGLE ────────────────────────────────────── */
router.post('/lang/:lang', async (req, res) => {
  const lang = req.params.lang === 'en' ? 'en' : 'ar';
  if (req.session && req.session.companyUserId) {
    req.session.adminLang = lang;
    try {
      await pool.query('UPDATE company_users SET lang = $1 WHERE id = $2', [lang, req.session.companyUserId]);
    } catch (e) { console.error(e); }
  }
  res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.redirect(req.get('Referrer') || '/company/dashboard');
});

module.exports = router;
