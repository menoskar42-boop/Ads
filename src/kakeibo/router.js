// Kakeibo web app router (served on kakeibo.oscardevs.com). Runs after the
// shared session middleware, but bypasses all OscarDevs tenant/ads pipeline —
// it is its own product. Session key: req.session.kkbUserId (host-only cookie,
// so it never mixes with the merchant session on oscardevs.com).
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { makeT, normLang } = require('./i18n');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Attach lang/dir/t + current user to every request.
router.use(async (req, res, next) => {
  if (req.query.lang) req.session.kkbLang = normLang(req.query.lang);
  const lang = normLang(req.session.kkbLang || 'ar');
  res.locals.lang = lang;
  res.locals.dir = lang === 'ar' ? 'rtl' : 'ltr';
  res.locals.t = makeT(lang);
  res.locals.user = null;
  res.locals.profile = null;
  if (req.session.kkbUserId) {
    try {
      const u = (await pool.query('SELECT id, email, display_name, is_guest FROM kkb_users WHERE id=$1', [req.session.kkbUserId])).rows[0];
      if (u) {
        res.locals.user = u;
        res.locals.profile = (await pool.query('SELECT * FROM kkb_profiles WHERE user_id=$1', [u.id])).rows[0] || null;
      } else { req.session.kkbUserId = null; }
    } catch (e) { console.error('[kkb user load]', e.message); }
  }
  next();
});

function requireKkb(req, res, next) {
  if (!req.session.kkbUserId) return res.redirect('/');
  next();
}

async function createUser({ email, password, name, guest }) {
  const hash = password ? await bcrypt.hash(password, 10) : null;
  const u = (await pool.query(
    `INSERT INTO kkb_users (email, password_hash, display_name, is_guest) VALUES ($1,$2,$3,$4) RETURNING id`,
    [email || null, hash, name || null, !!guest]
  )).rows[0];
  await pool.query('INSERT INTO kkb_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [u.id]);
  return u.id;
}

function afterAuthRedirect(res, profile) {
  return res.redirect(profile && profile.onboarded ? '/app' : '/onboarding');
}

/* ─── Landing / auth ───────────────────────────────────── */
router.get('/', (req, res) => {
  if (res.locals.user) return afterAuthRedirect(res, res.locals.profile);
  res.render('kakeibo/login', { mode: req.query.mode === 'signup' ? 'signup' : 'login', error: null });
});

router.post('/signup', async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const name = String(b.name || '').trim().slice(0, 80);
  const t = res.locals.t;
  if (!EMAIL_RE.test(email)) return res.render('kakeibo/login', { mode: 'signup', error: t('auth.err_email') });
  if (password.length < 6) return res.render('kakeibo/login', { mode: 'signup', error: t('auth.err_pass') });
  try {
    const exists = (await pool.query('SELECT 1 FROM kkb_users WHERE lower(email)=$1', [email])).rows.length;
    if (exists) return res.render('kakeibo/login', { mode: 'signup', error: t('auth.err_exists') });
    const id = await createUser({ email, password, name });
    req.session.kkbUserId = id;
    return res.redirect('/onboarding');
  } catch (e) { console.error('[kkb signup]', e.message); res.render('kakeibo/login', { mode: 'signup', error: t('auth.err_email') }); }
});

router.post('/login', async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const t = res.locals.t;
  try {
    const u = (await pool.query('SELECT * FROM kkb_users WHERE lower(email)=$1', [email])).rows[0];
    if (!u || !u.password_hash || !(await bcrypt.compare(password, u.password_hash))) {
      return res.render('kakeibo/login', { mode: 'login', error: t('auth.err_invalid') });
    }
    req.session.kkbUserId = u.id;
    const profile = (await pool.query('SELECT * FROM kkb_profiles WHERE user_id=$1', [u.id])).rows[0];
    return afterAuthRedirect(res, profile);
  } catch (e) { console.error('[kkb login]', e.message); res.render('kakeibo/login', { mode: 'login', error: t('auth.err_invalid') }); }
});

router.post('/guest', async (req, res) => {
  try {
    const id = await createUser({ guest: true, name: 'Guest' });
    req.session.kkbUserId = id;
    return res.redirect('/onboarding');
  } catch (e) { console.error('[kkb guest]', e.message); res.redirect('/'); }
});

router.post('/logout', (req, res) => { req.session.kkbUserId = null; res.redirect('/'); });

/* ─── Onboarding ───────────────────────────────────────── */
const CURRENCIES = ['EGP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'USD', 'EUR', 'GBP', 'MAD', 'DZD', 'TND'];
function toNum(v, d) { const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : d; }
function toInt(v, d) { const n = parseInt(String(v).replace(/[^\d\-]/g, ''), 10); return Number.isFinite(n) ? n : d; }

router.get('/onboarding', requireKkb, (req, res) => {
  // Already onboarded? straight to the app.
  if (res.locals.profile && res.locals.profile.onboarded) return res.redirect('/app');
  res.render('kakeibo/onboarding', { currencies: CURRENCIES, countries: COUNTRIES, error: null });
});

const { COUNTRIES } = require('./holidays');
const SALARY_TYPES = ['fixed', 'last', 'before_last'];
const WEEKENDS = ['fri_sat', 'fri', 'sat_sun', 'sun', 'none'];

router.post('/onboarding', requireKkb, async (req, res) => {
  const b = req.body || {};
  const income = toNum(b.monthly_income, NaN);
  const goal = toNum(b.saving_goal, NaN);
  const day = Math.min(31, Math.max(1, toInt(b.salary_day, 1)));
  const currency = CURRENCIES.includes(String(b.currency)) ? b.currency : 'EGP';
  const salaryType = SALARY_TYPES.includes(String(b.salary_type)) ? b.salary_type : 'fixed';
  const weekend = WEEKENDS.includes(String(b.weekend)) ? b.weekend : 'fri_sat';
  const country = COUNTRIES.includes(String(b.country)) ? b.country : 'EG';
  if (!Number.isFinite(income) || income < 0 || !Number.isFinite(goal) || goal < 0) {
    return res.render('kakeibo/onboarding', { currencies: CURRENCIES, countries: COUNTRIES, error: res.locals.t('onb.err') });
  }
  try {
    await pool.query(
      `UPDATE kkb_profiles SET monthly_income=$1, saving_goal=$2, salary_day=$3, salary_type=$4, weekend=$5, country=$6, currency=$7, lang=$8, onboarded=true WHERE user_id=$9`,
      [income, goal, day, salaryType, weekend, country, currency, res.locals.lang, req.session.kkbUserId]
    );
    res.redirect('/app');
  } catch (e) { console.error('[kkb onboarding]', e.message); res.render('kakeibo/onboarding', { currencies: CURRENCIES, countries: COUNTRIES, error: res.locals.t('onb.err') }); }
});

/* ─── Placeholder (built in the next step) ─────────────── */
router.get('/app', requireKkb, (req, res) => {
  if (!res.locals.profile || !res.locals.profile.onboarded) return res.redirect('/onboarding');
  res.render('kakeibo/placeholder', { title: 'Dashboard', note: 'الخطوة الجاية: لوحة المعلومات.' });
});

module.exports = router;
