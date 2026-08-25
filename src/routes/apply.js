const express = require('express');
const router = express.Router();

// Public, unauthenticated, and both of these write rows or send mail — so both
// are throttled. Per-instance only (Autoscale runs several), but that still
// raises the cost of a spam run by orders of magnitude.
const { rateLimit , clientIp } = require('../middleware/rateLimit');
const applyLimiter = rateLimit({ name: 'apply', windowMs: 60 * 60000, max: 5 });
// The status lookup is the sharper one: it answers a question about somebody
// else's application from an email address alone, so it is capped hard enough
// that walking a list of addresses is not worth doing.
const statusLimiter = rateLimit({ name: 'apply-status', windowMs: 15 * 60000, max: 8 });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { sendApplicationReceived, sendAdminNewApplication, sendApplicationTrackLink } = require('../lib/mailer');
const { canonicalCompanyUrl } = require('../lib/urls');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TERMS_VERSION = '1.0';

// The definition of what a customer may request, and the source
// scripts/check-page-types.js reads to verify every other place that offers a
// type agrees with it. It used to be written out twice — once for the ?type=
// prefill and once for the POST validation — so a vertical could be accepted on
// submit but impossible to arrive pre-selected, or the reverse, with nothing to
// notice. One list, both uses.
const BUSINESS_TYPES = ['shop', 'portfolio', 'pharmacy', 'orders', 'clinic', 'gym',
  'furniture', 'nutrition', 'workshop', 'hall', 'nursery', 'installments'];

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
// القايمة المشتركة — كانت هنا نسخة، وواحدة أقصر في `admin.js`، وكل واحدة
// بتحمي من اللي التانية بتسيبه.
const { isReserved } = require('../lib/reserved_slugs');

// Referral codes are short, uppercase and unambiguous — they get typed and read
// aloud, so keep the accepted shape narrow.
// crypto.randomBytes, never Math.random: Math.random is seeded from a value an
// attacker can often narrow down and its output is reproducible from a handful
// of samples — fine for shuffling a list, useless as a secret.
const crypto = require('crypto');
const TRACK_TTL_DAYS = 90;
const newTrackToken = () => crypto.randomBytes(32).toString('hex');
const TRACK_RE = /^[a-f0-9]{64}$/;

const REF_RE = /^[A-Z0-9]{4,12}$/;
const cleanRef = (s) => {
  const v = String(s || '').trim().toUpperCase().slice(0, 12);
  return REF_RE.test(v) ? v : '';
};

router.get('/apply', (req, res) => {
  res.locals.showAds = false; // a form is not content — AdSense policy
  const preType = BUSINESS_TYPES.includes(req.query.type) ? req.query.type : '';
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
  // Honeypot + timing, matching /contact. A bot that fills the hidden field or
  // submits in under two and a half seconds gets a success page and no record:
  // answering "ok" stops it retrying, and answering "rejected" teaches it what
  // to avoid next time.
  const bot = String((req.body || {}).website || '').trim()
    || (Number((req.body || {}).ft) && Date.now() - Number(req.body.ft) < 2500);
  if (bot) return res.redirect('/apply/success');

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
  if (!BUSINESS_TYPES.includes(values.business_type)) return render('اختر نوع الموقع.');
  if (!SLUG_RE.test(values.preferred_slug) || isReserved(values.preferred_slug)) {
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
    // نفس القراية المشتركة: العنوان المتسجّل على الطلب لازم يكون اللي إحنا
    // شفناه، مش اللي المُرسِل كتبه في هيدر.
    const ip = String(clientIp(req) || '').slice(0, 80);
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);

    const trackToken = newTrackToken();
    await pool.query(
      `INSERT INTO signup_applications
         (full_name, email, phone, country, business_name, business_type, preferred_slug,
          description, password_hash, accepted_terms_version, accepted_ip, user_agent, referral_code,
          track_token, track_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now() + ($15 || ' days')::interval)`,
      [
        values.full_name, values.email, values.phone, values.country || null,
        values.business_name, values.business_type, values.preferred_slug,
        values.description || null, passwordHash, TERMS_VERSION, ip, ua,
        values.referral_code || null,
        trackToken, String(TRACK_TTL_DAYS),
      ]
    );
    // Notification emails (fire-and-forget, fail-open). The tracking link goes
    // in this one — it is the only place the applicant ever receives it.
    sendApplicationReceived({
      to: values.email, fullName: values.full_name, businessName: values.business_name,
      country: values.country, trackUrl: trackUrlFor(res, trackToken),
    }).catch((e) => console.error('[apply] received-email error:', e.message));
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
      : values.business_type === 'workshop' ? 'ورش سيارات'
      : values.business_type === 'hall' ? 'قاعات أفراح'
      : values.business_type === 'nursery' ? 'حضانات/مراكز دروس'
      : values.business_type === 'installments' ? 'بيع بالتقسيط' : 'بورتفوليو';
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
  if (!SLUG_RE.test(slug) || isReserved(slug)) {
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
// A form page: no ad unit, and no reason to be indexed.
function statusPage(res, locals) {
  res.locals.showAds = false;
  return res.render('apply/status', Object.assign({ result: null, email: '', error: null, sent: false }, locals));
}
function trackUrlFor(res, token) {
  return (res.locals.siteOrigin || '') + '/apply/track/' + token;
}

router.get('/apply/status', (req, res) => statusPage(res, {}));

// The email form no longer ANSWERS — it sends. Whatever the address, the page
// says the same sentence and the response costs the same work, so the reply
// itself reveals nothing. Previously "no application with this email" and "under
// review" were two different screens, which turned the form into an oracle:
// anyone with a list of addresses could learn who had applied here and how it
// went. The rate limit slowed that down; it did not stop it.
router.post('/apply/status', statusLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 150);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return statusPage(res, { email, error: 'اكتب بريداً إلكترونياً صحيحاً.' });
  }
  try {
    // Runs for every address, found or not, so the timing does not separate the
    // two cases either. A token is minted for older rows that predate the
    // column, otherwise their owners could never be sent a link.
    const r = await pool.query(
      `UPDATE signup_applications
          SET track_token = COALESCE(track_token, $2),
              track_expires_at = now() + ($3 || ' days')::interval
        WHERE id = (SELECT id FROM signup_applications WHERE email = $1
                    ORDER BY created_at DESC LIMIT 1)
        RETURNING track_token, full_name, country`,
      [email, newTrackToken(), String(TRACK_TTL_DAYS)]
    );
    if (r.rows.length) {
      const row = r.rows[0];
      sendApplicationTrackLink({
        to: email, fullName: row.full_name, country: row.country,
        trackUrl: trackUrlFor(res, row.track_token),
      }).catch((e) => console.error('[apply] track-link email error:', e.message));
    }
  } catch (err) {
    // Even a failure answers the same way. An error page for one address and a
    // success page for another is the same leak wearing a different hat.
    console.error('[POST /apply/status] error:', err);
  }
  return statusPage(res, { email, sent: true });
});

/* ─── FOLLOW A REQUEST BY TOKEN ──────────────────────────── */
// The token is the credential: 32 random bytes, emailed to the applicant, and
// nothing else is needed. An unknown or expired one renders the same "not found"
// card rather than a 404, so probing tokens tells an attacker nothing either.
router.get('/apply/track/:token', statusLimiter, async (req, res) => {
  const token = String(req.params.token || '');
  if (!TRACK_RE.test(token)) return statusPage(res, { result: { status: 'none' } });
  try {
    const r = await pool.query(
      // Still not selecting admin_notes: the token proves who the applicant is,
      // not that they are entitled to read the team's internal notes about them.
      `SELECT sa.status, sa.created_at, sa.business_name, c.slug AS company_slug
         FROM signup_applications sa
         LEFT JOIN companies c ON c.id = sa.approved_company_id
        WHERE sa.track_token = $1
          AND (sa.track_expires_at IS NULL OR sa.track_expires_at > now())`,
      [token]
    );
    const row = r.rows[0];
    // The live link the page offers must be the canonical subdomain, not the
    // /view/ path that redirects to it.
    if (row && row.company_slug) row.site_url = canonicalCompanyUrl(row.company_slug, req);
    return statusPage(res, { result: row || { status: 'none' } });
  } catch (err) {
    console.error('[GET /apply/track] error:', err);
    return statusPage(res, { result: { status: 'none' } });
  }
});

module.exports = router;
module.exports.TERMS_VERSION = TERMS_VERSION;
