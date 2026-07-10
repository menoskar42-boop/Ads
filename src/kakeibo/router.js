// Kakeibo web app router (served on kakeibo.oscardevs.com). Runs after the
// shared session middleware, but bypasses all OscarDevs tenant/ads pipeline —
// it is its own product. Session key: req.session.kkbUserId (host-only cookie,
// so it never mixes with the merchant session on oscardevs.com).
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Pool } = require('pg');
const { makeT, normLang } = require('./i18n');
const { CATEGORIES, CATEGORY_KEYS, PAYMENT_METHODS } = require('./categories');
const stats = require('./stats');
const ai = require('./ai');
let compressImage = null;
try { compressImage = require('../lib/media').compressImage; } catch (e) { /* optional */ }

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Receipt uploads (optional). Reuse the shared public/uploads dir.
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const uploadReceipt = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, 'kkb-' + (req.session.kkbUserId || 'x') + '-' + Date.now() + path.extname(file.originalname || '').toLowerCase().slice(0, 6)),
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => /^image\//.test(file.mimetype) ? cb(null, true) : cb(null, false),
}).single('receipt');
function withReceipt(req, res, next) { uploadReceipt(req, res, () => next()); }
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
  const cur = res.locals.profile ? res.locals.profile.currency : 'EGP';
  const loc = lang === 'ar' ? 'ar-EG' : 'en-US';
  res.locals.money = (v) => { const n = Number(v) || 0; return n.toLocaleString(loc, { maximumFractionDigits: 2 }) + ' ' + cur; };
  res.locals.num = (v) => (Number(v) || 0).toLocaleString(loc, { maximumFractionDigits: 0 });
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
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + (wk < 10 ? '0' + wk : wk);
}

router.get('/onboarding', requireKkb, (req, res) => {
  // Doubles as the salary/holidays editor once onboarded (prefilled from profile).
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

// Guard: must be onboarded to reach the app screens.
function requireOnboarded(req, res, next) {
  if (!req.session.kkbUserId) return res.redirect('/');
  if (!res.locals.profile || !res.locals.profile.onboarded) return res.redirect('/onboarding');
  next();
}
const APP_LOCALS = { CATEGORIES, PAYMENT_METHODS };

/* ─── Dashboard ────────────────────────────────────────── */
router.get('/app', requireOnboarded, async (req, res) => {
  try {
    const uid = req.session.kkbUserId;
    const data = await stats.dashboard(pool, uid, res.locals.profile);
    // Personalized daily insight + challenge — cached per day (max 2 calls/day, or none).
    let insight = null, challenge = null;
    if (ai.isEnabled() && data.recent.length) {
      const now = new Date();
      const topCats = await stats.categoryBreakdown(pool, uid, stats.ymd(new Date(now.getFullYear(), now.getMonth(), 1)), stats.ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1)));
      const ctx = ai.financeContext(res.locals.profile, data, topCats);
      insight = await ai.cachedText(pool, uid, 'insight', stats.ymd(now), [
        { role: 'system', content: ai.coachSystem(res.locals.lang) },
        { role: 'user', content: 'My finances: ' + ctx + '. Give me ONE short insight (max 2 sentences) about my spending right now — specific and useful.' },
      ], 140);
      challenge = await ai.cachedText(pool, uid, 'challenge', stats.ymd(now), [
        { role: 'system', content: ai.coachSystem(res.locals.lang) },
        { role: 'user', content: 'My finances: ' + ctx + '. Give me ONE tiny, concrete money-saving challenge for TODAY (max 12 words, actionable, no intro).' },
      ], 40);
    }
    res.render('kakeibo/dashboard', Object.assign({ data, insight, challenge }, APP_LOCALS));
  } catch (e) { console.error('[kkb dashboard]', e.message); res.status(500).send('Error.'); }
});

/* ─── AI: categorize a description (local-first, cached) ── */
router.post('/ai/categorize', requireOnboarded, async (req, res) => {
  const desc = String((req.body && req.body.description) || '').slice(0, 120);
  if (!desc.trim()) return res.json({ category: null });
  try {
    const out = await ai.categorize(pool, req.session.kkbUserId, desc, res.locals.lang);
    res.json({ category: out.category, label: res.locals.t('cat.' + out.category) });
  } catch (e) { res.json({ category: null }); }
});

/* ─── AI: voice → expense fields (local-first) ─────────── */
router.post('/ai/voice', requireOnboarded, async (req, res) => {
  const text = String((req.body && req.body.text) || '').slice(0, 200);
  if (!text.trim()) return res.json({ ok: false });
  try {
    const out = await ai.parseVoice(pool, req.session.kkbUserId, text, res.locals.lang);
    res.json({ ok: true, amount: out.amount, description: out.description, category: out.category, label: res.locals.t('cat.' + out.category) });
  } catch (e) { res.json({ ok: false }); }
});

/* ─── AI: OCR a receipt image → expense fields ─────────── */
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }).single('image');
function withMemImage(req, res, next) { uploadMem(req, res, () => next()); }
router.post('/ai/ocr', requireOnboarded, withMemImage, async (req, res) => {
  if (!ai.isEnabled()) return res.json({ ok: false, disabled: true });
  if (!req.file || !req.file.buffer) return res.json({ ok: false });
  try {
    const dataUrl = 'data:' + (req.file.mimetype || 'image/jpeg') + ';base64,' + req.file.buffer.toString('base64');
    const out = await ai.ocrReceipt(dataUrl, res.locals.lang);
    if (!out) return res.json({ ok: false });
    res.json({ ok: true, amount: out.amount, date: out.date, merchant: out.merchant, category: out.category, label: res.locals.t('cat.' + out.category) });
  } catch (e) { console.error('[kkb ocr route]', e.message); res.json({ ok: false }); }
});

/* ─── Add / edit / delete expense ──────────────────────── */
router.get('/add', requireOnboarded, (req, res) => {
  res.render('kakeibo/add', Object.assign({ error: null, today: stats.ymd(new Date()), aiEnabled: ai.isEnabled() }, APP_LOCALS));
});
router.post('/add', requireOnboarded, withReceipt, async (req, res) => {
  const b = req.body || {};
  const amount = toNum(b.amount, NaN);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.render('kakeibo/add', Object.assign({ error: res.locals.t('add.err'), today: stats.ymd(new Date()), aiEnabled: ai.isEnabled() }, APP_LOCALS));
  }
  const category = CATEGORY_KEYS.includes(String(b.category)) ? b.category : 'other';
  const method = PAYMENT_METHODS.includes(String(b.payment_method)) ? b.payment_method : 'cash';
  const desc = String(b.description || '').trim().slice(0, 200);
  const spentOn = /^\d{4}-\d{2}-\d{2}$/.test(String(b.spent_on || '')) ? b.spent_on : stats.ymd(new Date());
  let receiptUrl = null;
  if (req.file) { receiptUrl = '/uploads/' + req.file.filename; if (compressImage) { try { await compressImage(req.file.path); } catch (e) {} } }
  try {
    await pool.query(
      `INSERT INTO kkb_expenses (user_id, amount, description, category, payment_method, receipt_url, spent_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.session.kkbUserId, amount, desc || null, category, method, receiptUrl, spentOn]
    );
    res.redirect('/app');
  } catch (e) { console.error('[kkb add]', e.message); res.render('kakeibo/add', Object.assign({ error: res.locals.t('add.err'), today: stats.ymd(new Date()), aiEnabled: ai.isEnabled() }, APP_LOCALS)); }
});
router.post('/expense/:id/delete', requireOnboarded, async (req, res) => {
  await pool.query('DELETE FROM kkb_expenses WHERE id=$1 AND user_id=$2', [toInt(req.params.id, null), req.session.kkbUserId]);
  res.redirect(req.get('Referrer') && /\/expenses/.test(req.get('Referrer')) ? '/expenses' : '/app');
});
router.get('/expenses', requireOnboarded, async (req, res) => {
  const rows = (await pool.query('SELECT * FROM kkb_expenses WHERE user_id=$1 ORDER BY spent_on DESC, id DESC LIMIT 200', [req.session.kkbUserId])).rows;
  res.render('kakeibo/expenses', Object.assign({ rows }, APP_LOCALS));
});

/* ─── Reports ──────────────────────────────────────────── */
router.get('/reports', requireOnboarded, async (req, res) => {
  try {
    const uid = req.session.kkbUserId;
    const now = new Date();
    const mStart = stats.ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const mEnd = stats.ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    const [byCat, monthly, weekly] = await Promise.all([
      stats.categoryBreakdown(pool, uid, mStart, mEnd),
      stats.monthlySeries(pool, uid, 6),
      stats.weeklySeries(pool, uid, 7),
    ]);
    // AI weekly report + saving suggestions — cached per ISO week.
    let weeklyReport = null, suggestions = null;
    if (ai.isEnabled() && byCat.length) {
      const wk = isoWeekKey(now);
      const catCtx = byCat.slice(0, 4).map((c) => c.key + '=' + Math.round(c.total)).join(', ');
      const thisWk = weekly.length ? Math.round(weekly[weekly.length - 1].total) : 0;
      const prevWk = weekly.length > 1 ? Math.round(weekly[weekly.length - 2].total) : 0;
      weeklyReport = await ai.cachedText(pool, uid, 'weekly', wk, [
        { role: 'system', content: ai.coachSystem(res.locals.lang) },
        { role: 'user', content: 'This week spent=' + thisWk + ', last week=' + prevWk + ', top categories(' + (res.locals.profile.currency) + '): ' + catCtx + '. Write a 2-sentence weekly summary + one concrete tip.' },
      ], 150);
      const sg = await ai.cachedText(pool, uid, 'suggestions', wk, [
        { role: 'system', content: ai.coachSystem(res.locals.lang) + ' Reply as JSON {"tips":["...","..."]}.' },
        { role: 'user', content: 'Top categories(' + res.locals.profile.currency + '): ' + catCtx + '. Give 2 specific saving suggestions, each ≤ 12 words.' },
      ], 90);
      if (sg) { try { const j = JSON.parse(sg); if (Array.isArray(j.tips)) suggestions = j.tips.slice(0, 3); } catch (e) { suggestions = [sg]; } }
    }
    res.render('kakeibo/reports', Object.assign({ byCat, monthly, weekly, weeklyReport, suggestions }, APP_LOCALS));
  } catch (e) { console.error('[kkb reports]', e.message); res.status(500).send('Error.'); }
});

/* ─── Monthly review ───────────────────────────────────── */
router.get('/review', requireOnboarded, async (req, res) => {
  try {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth();
    const q = String(req.query.ym || '');
    if (/^\d{4}-\d{1,2}$/.test(q)) { const [yy, mm] = q.split('-').map(Number); y = yy; m = Math.min(11, Math.max(0, mm - 1)); }
    const uid = req.session.kkbUserId;
    const review = await stats.monthReview(pool, uid, res.locals.profile, y, m);
    const cur = new Date(y, m, 1);
    const prev = new Date(y, m - 1, 1), next = new Date(y, m + 1, 1);
    const monthName = cur.toLocaleDateString(res.locals.lang === 'en' ? 'en-US' : 'ar-EG', { month: 'long', year: 'numeric' });
    // AI monthly narrative — cached per month (only for months with data).
    let narrative = null;
    if (ai.isEnabled() && review.spent > 0) {
      const catCtx = (review.cats || []).slice(0, 4).map((c) => c.key + '=' + Math.round(c.total)).join(', ');
      narrative = await ai.cachedText(pool, uid, 'monthly', y + '-' + (m + 1), [
        { role: 'system', content: ai.coachSystem(res.locals.lang) },
        { role: 'user', content: 'Month: earned=' + Math.round(review.income) + ', spent=' + Math.round(review.spent) + ', saved=' + Math.round(review.saved) + ', rate=' + review.rate + '%, top(' + res.locals.profile.currency + '): ' + catCtx + '. Write a 2–3 sentence review with one takeaway.' },
      ], 170);
    }
    res.render('kakeibo/review', Object.assign({
      review, monthName, narrative,
      prevYm: prev.getFullYear() + '-' + (prev.getMonth() + 1),
      nextYm: (next <= now ? next.getFullYear() + '-' + (next.getMonth() + 1) : null),
    }, APP_LOCALS));
  } catch (e) { console.error('[kkb review]', e.message); res.status(500).send('Error.'); }
});

/* ─── Profile / settings ───────────────────────────────── */
router.get('/profile', requireOnboarded, (req, res) => {
  res.render('kakeibo/profile', Object.assign({ currencies: CURRENCIES, saved: req.query.saved === '1' }, APP_LOCALS));
});
router.post('/profile', requireOnboarded, async (req, res) => {
  const b = req.body || {};
  const income = toNum(b.monthly_income, res.locals.profile.monthly_income);
  const goal = toNum(b.saving_goal, res.locals.profile.saving_goal);
  const currency = CURRENCIES.includes(String(b.currency)) ? b.currency : res.locals.profile.currency;
  try {
    await pool.query('UPDATE kkb_profiles SET monthly_income=$1, saving_goal=$2, currency=$3 WHERE user_id=$4',
      [Math.max(0, income), Math.max(0, goal), currency, req.session.kkbUserId]);
  } catch (e) { console.error('[kkb profile]', e.message); }
  res.redirect('/profile?saved=1');
});

/* ─── PWA (manifest + service worker) ──────────────────── */
router.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json').json({
    name: 'Kakeibo', short_name: 'Kakeibo', start_url: '/', display: 'standalone',
    background_color: '#f6f2ea', theme_color: '#c0392b', lang: 'ar', dir: 'rtl',
    icons: [{ src: '/kkb-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  });
});
router.get('/kkb-icon.svg', (req, res) => {
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=604800').send(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="#c0392b"/><text x="96" y="128" font-size="96" text-anchor="middle" fill="#fff" font-family="sans-serif">家</text></svg>'
  );
});
router.get('/sw.js', (req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-cache').send(
    "const C='kkb-v1';self.addEventListener('install',e=>self.skipWaiting());" +
    "self.addEventListener('activate',e=>self.clients.claim());" +
    "self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;" +
    "e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r})" +
    ".catch(()=>caches.match(e.request)))});"
  );
});

module.exports = router;
