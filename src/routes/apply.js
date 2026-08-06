const express = require('express');
const router = express.Router();

// Public, unauthenticated, and both of these write rows or send mail — so both
// are throttled. Per-instance only (Autoscale runs several), but that still
// raises the cost of a spam run by orders of magnitude.
const { rateLimit } = require('../middleware/rateLimit');
const applyLimiter = rateLimit({ name: 'apply', windowMs: 60 * 60000, max: 5 });
// The status lookup is the sharper one: it answers a question about somebody
// else's application from an email address alone, so it is capped hard enough
// that walking a list of addresses is not worth doing.
const statusLimiter = rateLimit({ name: 'apply-status', windowMs: 15 * 60000, max: 8 });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { sendApplicationReceived, sendAdminNewApplication } = require('../lib/mailer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TERMS_VERSION = '1.0';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'apply', 'company', 'customer', 'shop', 'view',
  'public', 'css', 'js', 'uploads', 'legal', 'login', 'logout',
  'dashboard', 'settings', 'www', 'mail', 'root', 'static', 'assets',
]);

// Referral codes are short, uppercase and unambiguous — they get typed and read
// aloud, so keep the accepted shape narrow.
const REF_RE = /^[A-Z0-9]{4,12}$/;
const cleanRef = (s) => {
  const v = String(s || '').trim().toUpperCase().slice(0, 12);
  return REF_RE.test(v) ? v : '';
};

router.get('/apply', (req, res) => {
  const preType = ['shop', 'portfolio', 'pharmacy', 'orders', 'clinic', 'gym', 'furniture', 'nutrition', 'workshop'].includes(req.query.type) ? req.query.type : '';
  const ref = cleanRef(req.query.ref);
  const values = {};
  if (preType) values.business_type = preType;
  if (ref) values.referral_code = ref;
  res.render('apply/form', {
    error: null,
    values,
    termsVersion: TERMS_VERSION,
    ogImage: res.locals.siteOrigin + '/og-default.png',
  });
});

router.post('/apply', applyLimiter, async (req, res) => {
  const v = (k, max = 200) => String(req.body[k] || '').trim().slice(0, max);
  const values = {
    full_name: v('full_name', 100),
    email: v('email', 150).toLowerCase(),
    phone: v('phone', 30),
    country: v('country', 60),
    business_name: v('business_name', 100),
    business_type: v('business_type', 20),
    preferred_slug: v('preferred_slug', 40).toLowerCase(),
    description: v('description', 1000),
    referral_code: cleanRef(req.body.referral_code),
  };
  const password = String(req.body.password || '');
  const acceptedTerms = req.body.accept_terms === 'on';
  const acceptedPrivacy = req.body.accept_privacy === 'on';
  const acceptedTruth = req.body.accept_truth === 'on';

  const render = (error) => res.render('apply/form', { error, values, termsVersion: TERMS_VERSION });

  if (!values.full_name || values.full_name.length < 3) return render('الاسم الكامل مطلوب (3 أحرف على الأقل).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return render('بريد إلكتروني غير صالح.');
  if (!values.phone || values.phone.length < 6) return render('رقم الهاتف مطلوب.');
  if (!values.business_name || values.business_name.length < 2) return render('اسم النشاط/الموقع مطلوب.');
  if (!['shop', 'portfolio', 'pharmacy', 'orders', 'clinic', 'gym', 'furniture', 'nutrition', 'workshop'].includes(values.business_type)) return render('اختر نوع الموقع.');
  if (!SLUG_RE.test(values.preferred_slug) || RESERVED_SLUGS.has(values.preferred_slug)) {
    return render('الاسم المختصر للرابط غير صالح (حروف إنجليزية صغيرة وأرقام و"-" فقط، ولا يكون من الأسماء المحجوزة).');
  }
  if (password.length < 8) return render('كلمة المرور يجب ألا تقل عن 8 أحرف.');
  if (!acceptedTerms || !acceptedPrivacy || !acceptedTruth) {
    return render('يجب الموافقة على الشروط والأحكام، سياسة الخصوصية، وإقرار صحة البيانات للمتابعة.');
  }

  try {
    const [dupEmail, dupSlug, dupCompany] = await Promise.all([
      pool.query('SELECT 1 FROM signup_applications WHERE email = $1 AND status <> $2', [values.email, 'rejected']),
      pool.query('SELECT 1 FROM signup_applications WHERE preferred_slug = $1 AND status <> $2', [values.preferred_slug, 'rejected']),
      pool.query('SELECT 1 FROM companies WHERE slug = $1', [values.preferred_slug]),
    ]);
    if (dupEmail.rows.length) return render('فيه طلب سابق بنفس البريد الإلكتروني — تواصل معنا لو طلبك متأخر.');
    if (dupSlug.rows.length || dupCompany.rows.length) return render('الاسم المختصر للرابط محجوز أو قيد المراجعة — اختر اسماً آخر.');

    const passwordHash = await bcrypt.hash(password, 10);
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 80);
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);

    await pool.query(
      `INSERT INTO signup_applications
         (full_name, email, phone, country, business_name, business_type, preferred_slug,
          description, password_hash, accepted_terms_version, accepted_ip, user_agent, referral_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        values.full_name, values.email, values.phone, values.country || null,
        values.business_name, values.business_type, values.preferred_slug,
        values.description || null, passwordHash, TERMS_VERSION, ip, ua,
        values.referral_code || null,
      ]
    );
    // Notification emails (fire-and-forget, fail-open).
    sendApplicationReceived({ to: values.email, fullName: values.full_name, businessName: values.business_name, country: values.country })
      .catch((e) => console.error('[apply] received-email error:', e.message));
    sendAdminNewApplication({
      fullName: values.full_name, email: values.email, phone: values.phone, country: values.country,
      businessName: values.business_name, businessType: values.business_type,
      slug: values.preferred_slug, description: values.description,
    }).catch((e) => console.error('[apply] admin-notify error:', e.message));

    // أضِف مقدّم الطلب تلقائياً للـCRM كعميل «مهتم» (متابعة النهارده) — fire-and-forget
    // ولا يعطّل الطلب. dedup بالرقم عشان ما يتكرّرش لو موجود.
    const crmCategory = values.business_type === 'shop' ? 'متجر'
      : values.business_type === 'pharmacy' ? 'صيدلية'
      : values.business_type === 'clinic' ? 'عيادة'
      : values.business_type === 'orders' ? 'مطاعم/طلبات'
      : values.business_type === 'gym' ? 'جيم/لياقة'
      : values.business_type === 'furniture' ? 'موبيليا/ورشة'
      : values.business_type === 'nutrition' ? 'تغذية علاجية'
      : values.business_type === 'workshop' ? 'ورش سيارات' : 'بورتفوليو';
    pool.query(
      `INSERT INTO crm_leads (name, phone, email, business_name, category, source, status, notes, next_followup)
       SELECT $1, $2, $3, $4, $5, 'طلب تسجيل', 'interested', $6, CURRENT_DATE
       WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE phone = $2)`,
      [values.full_name, values.phone, values.email, values.business_name, crmCategory,
       `قدّم طلب تسجيل (${values.business_type}) — الرابط المطلوب: ${values.preferred_slug}`]
    ).catch((e) => console.error('[apply] crm-insert error:', e.message));

    res.redirect('/apply/success');
  } catch (err) {
    console.error('[POST /apply] error:', err);
    render('حدث خطأ غير متوقع. حاول مرة أخرى لاحقاً.');
  }
});

router.get('/apply/success', (req, res) => {
  res.render('apply/success');
});

/* ─── LIVE SLUG AVAILABILITY CHECK ───────────────────────── */
router.get('/apply/check-slug', async (req, res) => {
  const slug = String(req.query.slug || '').trim().toLowerCase().slice(0, 40);
  if (!slug) return res.json({ available: false, reason: 'empty' });
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) {
    return res.json({ available: false, reason: 'invalid' });
  }
  try {
    const [c, a] = await Promise.all([
      pool.query('SELECT 1 FROM companies WHERE slug = $1', [slug]),
      pool.query('SELECT 1 FROM signup_applications WHERE preferred_slug = $1 AND status <> $2', [slug, 'rejected']),
    ]);
    const taken = c.rows.length || a.rows.length;
    res.json({ available: !taken, reason: taken ? 'taken' : 'ok' });
  } catch (err) {
    console.error('[GET /apply/check-slug] error:', err.message);
    res.json({ available: false, reason: 'error' });
  }
});

/* ─── SELF-SERVICE STATUS CHECK ──────────────────────────── */
router.get('/apply/status', (req, res) => {
  res.render('apply/status', { result: null, email: '', error: null });
});

router.post('/apply/status', statusLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 150);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.render('apply/status', { result: null, email, error: 'اكتب بريداً إلكترونياً صحيحاً.' });
  }
  try {
    const r = await pool.query(
      // Deliberately NOT selecting admin_notes or business_name. This endpoint
      // answers to an email address with no login and no token, so anyone who
      // guesses an address could read the notes the team wrote about that
      // applicant. The status and the live link are what the applicant already
      // knows or is entitled to; internal notes are not.
      `SELECT sa.status, sa.created_at, c.slug AS company_slug
       FROM signup_applications sa
       LEFT JOIN companies c ON c.id = sa.approved_company_id
       WHERE sa.email = $1
       ORDER BY sa.created_at DESC LIMIT 1`,
      [email]
    );
    const result = r.rows.length ? r.rows[0] : { status: 'none' };
    res.render('apply/status', { result, email, error: null });
  } catch (err) {
    console.error('[POST /apply/status] error:', err);
    res.render('apply/status', { result: null, email, error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' });
  }
});

module.exports = router;
module.exports.TERMS_VERSION = TERMS_VERSION;
