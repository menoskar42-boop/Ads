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
const health = require('./health');
const gamify = require('./gamify');
const twin = require('./twin');
const kpush = require('./push');
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
  res.render('kakeibo/login', { mode: req.query.mode === 'signup' ? 'signup' : 'login', error: req.query.err === 'oauth' ? res.locals.t('auth.err_invalid') : null, googleAuth: googleConfigured() });
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

/* ─── Google Sign-In (real OAuth 2.0) ──────────────────── */
const KKB_ORIGIN = process.env.KAKEIBO_ORIGIN || 'https://kakeibo.oscardevs.com';
function googleConfigured() { return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }
router.get('/auth/google', (req, res) => {
  if (!googleConfigured()) return res.redirect('/');
  const state = require('crypto').randomBytes(16).toString('hex');
  req.session.kkbOauthState = state;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: KKB_ORIGIN + '/auth/google/callback',
    response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});
router.get('/auth/google/callback', async (req, res) => {
  if (!googleConfigured()) return res.redirect('/');
  const { code, state } = req.query;
  if (!code || !state || state !== req.session.kkbOauthState) return res.redirect('/?err=oauth');
  req.session.kkbOauthState = null;
  try {
    const tok = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: KKB_ORIGIN + '/auth/google/callback', grant_type: 'authorization_code' }),
    });
    const tj = await tok.json();
    if (!tj.access_token) return res.redirect('/?err=oauth');
    const ui = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tj.access_token } });
    const uj = await ui.json();
    const email = String(uj.email || '').toLowerCase();
    if (!email) return res.redirect('/?err=oauth');
    let u = (await pool.query('SELECT * FROM kkb_users WHERE lower(email)=$1', [email])).rows[0];
    if (!u) { const id = await createUser({ email, name: uj.name || uj.given_name || null }); u = { id }; }
    req.session.kkbUserId = u.id;
    const profile = (await pool.query('SELECT * FROM kkb_profiles WHERE user_id=$1', [u.id])).rows[0];
    return afterAuthRedirect(res, profile);
  } catch (e) { console.error('[kkb google]', e.message); res.redirect('/?err=oauth'); }
});

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
    const now = new Date();
    const monthCats = await stats.categoryBreakdown(pool, uid, stats.ymd(new Date(now.getFullYear(), now.getMonth(), 1)), stats.ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1)));
    const hs = health.score(res.locals.profile, data, monthCats);
    const goals = (await pool.query('SELECT * FROM kkb_goals WHERE user_id=$1 ORDER BY id DESC LIMIT 3', [uid])).rows;
    const gam = await gamify.compute(pool, uid, res.locals.profile, data);
    const twinData = await twin.detect(pool, uid);
    // Smart notice: this week vs last week (local, week-over-week).
    let smart = null;
    const w2 = await stats.weeklySeries(pool, uid, 2);
    if (w2.length === 2 && Number(w2[0].total) > 0) {
      const prev = Number(w2[0].total), cur = Number(w2[1].total);
      const pct = Math.round((cur - prev) / prev * 100);
      if (Math.abs(pct) >= 10) smart = { up: pct > 0, pct: Math.abs(pct) };
    }
    // Personalized daily insight + challenge — cached per day (max 2 calls/day, or none).
    let insight = null, challenge = null;
    if (ai.isEnabled() && data.recent.length) {
      const topCats = monthCats;
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
    res.render('kakeibo/dashboard', Object.assign({ data, insight, challenge, hs, goals, gam, smart, twin: twinData, aiEnabled: ai.isEnabled() }, APP_LOCALS));
  } catch (e) { console.error('[kkb dashboard]', e.message); res.status(500).send('Error.'); }
});

/* ─── Financial Twin (recurring prediction) ────────────── */
router.get('/twin', requireOnboarded, async (req, res) => {
  const t = await twin.detect(pool, req.session.kkbUserId);
  res.render('kakeibo/twin', Object.assign({ twin: t }, APP_LOCALS));
});

/* ─── Investment tracking ──────────────────────────────── */
const ASSET_TYPES = ['stock', 'fund', 'etf', 'gold', 'crypto', 'real_estate', 'other'];
router.get('/investments', requireOnboarded, async (req, res) => {
  const rows = (await pool.query('SELECT * FROM kkb_investments WHERE user_id=$1 ORDER BY amount DESC', [req.session.kkbUserId])).rows;
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const yearGain = rows.reduce((s, r) => s + Number(r.amount) * Number(r.expected_return) / 100, 0);
  const wReturn = total > 0 ? (yearGain / total * 100) : 0;
  // Projected value 1y / 5y (compound at each holding's own rate).
  const proj = (yrs) => rows.reduce((s, r) => s + Number(r.amount) * Math.pow(1 + Number(r.expected_return) / 100, yrs), 0);
  res.render('kakeibo/investments', Object.assign({
    rows, assetTypes: ASSET_TYPES, total, yearGain, wReturn,
    proj1: proj(1), proj5: proj(5),
  }, APP_LOCALS));
});
router.post('/investments/add', requireOnboarded, async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  const type = ASSET_TYPES.includes(String(b.asset_type)) ? b.asset_type : 'stock';
  const amount = toNum(b.amount, 0);
  const ret = toNum(b.expected_return, 0);
  if (name && amount > 0) {
    await pool.query('INSERT INTO kkb_investments (user_id, name, asset_type, amount, expected_return) VALUES ($1,$2,$3,$4,$5)',
      [req.session.kkbUserId, name, type, amount, ret]);
  }
  res.redirect('/investments');
});
router.post('/investments/:id/delete', requireOnboarded, async (req, res) => {
  await pool.query('DELETE FROM kkb_investments WHERE id=$1 AND user_id=$2', [toInt(req.params.id, null), req.session.kkbUserId]);
  res.redirect('/investments');
});

/* ─── Family / shared budget ───────────────────────────── */
function inviteCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return require('crypto').randomBytes(6).reduce((s, b) => s + a[b % a.length], '');
}
async function loadFamily(userId) {
  const m = (await pool.query('SELECT * FROM kkb_family_members WHERE user_id=$1', [userId])).rows[0];
  if (!m) return null;
  const family = (await pool.query('SELECT * FROM kkb_families WHERE id=$1', [m.family_id])).rows[0];
  if (!family) return null;
  return { family, role: m.role, memberId: m.id };
}

router.get('/family', requireOnboarded, async (req, res) => {
  const uid = req.session.kkbUserId;
  const fam = await loadFamily(uid);
  if (!fam) return res.render('kakeibo/family', Object.assign({ family: null }, APP_LOCALS));
  const now = new Date();
  const mStart = stats.ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const mEnd = stats.ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const members = (await pool.query(
    `SELECT u.id, u.display_name, u.email, u.is_guest, m.role, m.id AS member_id,
            COALESCE(p.monthly_income,0) AS income,
            COALESCE((SELECT SUM(amount) FROM kkb_expenses e WHERE e.user_id=u.id AND e.spent_on >= $2 AND e.spent_on < $3),0)::numeric AS spent
     FROM kkb_family_members m JOIN kkb_users u ON u.id=m.user_id LEFT JOIN kkb_profiles p ON p.user_id=u.id
     WHERE m.family_id=$1 ORDER BY (m.role='owner') DESC, m.joined_at`,
    [fam.family.id, mStart, mEnd]
  )).rows;
  const totalIncome = members.reduce((s, x) => s + Number(x.income), 0);
  const totalSpent = members.reduce((s, x) => s + Number(x.spent), 0);
  const rate = totalIncome > 0 ? Math.round((totalIncome - totalSpent) / totalIncome * 100) : 0;
  res.render('kakeibo/family', Object.assign({
    family: fam.family, myRole: fam.role, members, totalIncome, totalSpent, rate,
    isOwner: fam.role === 'owner',
  }, APP_LOCALS));
});

router.post('/family/create', requireOnboarded, async (req, res) => {
  const uid = req.session.kkbUserId;
  if (await loadFamily(uid)) return res.redirect('/family');
  const name = String((req.body && req.body.name) || '').trim().slice(0, 60) || (res.locals.lang === 'en' ? 'My family' : 'عائلتي');
  try {
    let code, tries = 0;
    do { code = inviteCode(); tries++; } while (tries < 5 && (await pool.query('SELECT 1 FROM kkb_families WHERE invite_code=$1', [code])).rows.length);
    const f = (await pool.query('INSERT INTO kkb_families (owner_id, name, invite_code) VALUES ($1,$2,$3) RETURNING id', [uid, name, code])).rows[0];
    await pool.query('INSERT INTO kkb_family_members (family_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING', [f.id, uid, 'owner']);
  } catch (e) { console.error('[kkb family create]', e.message); }
  res.redirect('/family');
});

router.post('/family/join', requireOnboarded, async (req, res) => {
  const uid = req.session.kkbUserId;
  if (await loadFamily(uid)) return res.redirect('/family');
  const code = String((req.body && req.body.code) || '').trim().toUpperCase().slice(0, 12);
  try {
    const f = (await pool.query('SELECT id FROM kkb_families WHERE invite_code=$1', [code])).rows[0];
    if (f) {
      const role = req.body && req.body.role === 'child' ? 'child' : 'member';
      await pool.query('INSERT INTO kkb_family_members (family_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING', [f.id, uid, role]);
    } else { return res.redirect('/family?err=code'); }
  } catch (e) { console.error('[kkb family join]', e.message); }
  res.redirect('/family');
});

router.post('/family/leave', requireOnboarded, async (req, res) => {
  const uid = req.session.kkbUserId;
  const fam = await loadFamily(uid);
  if (fam && fam.role !== 'owner') await pool.query('DELETE FROM kkb_family_members WHERE user_id=$1', [uid]);
  res.redirect('/family');
});
router.post('/family/delete', requireOnboarded, async (req, res) => {
  const uid = req.session.kkbUserId;
  const fam = await loadFamily(uid);
  if (fam && fam.role === 'owner') await pool.query('DELETE FROM kkb_families WHERE id=$1 AND owner_id=$2', [fam.family.id, uid]);
  res.redirect('/family');
});
router.post('/family/member/:mid/remove', requireOnboarded, async (req, res) => {
  const uid = req.session.kkbUserId;
  const fam = await loadFamily(uid);
  if (fam && fam.role === 'owner') {
    await pool.query('DELETE FROM kkb_family_members WHERE id=$1 AND family_id=$2 AND role<>$3', [toInt(req.params.mid, null), fam.family.id, 'owner']);
  }
  res.redirect('/family');
});

/* ─── Financial goals ──────────────────────────────────── */
const GOAL_ICONS = ['🎯', '🚗', '🏠', '💍', '✈️', '🎓', '📱', '💻', '🛡️', '👶'];
router.get('/goals', requireOnboarded, async (req, res) => {
  const rows = (await pool.query('SELECT * FROM kkb_goals WHERE user_id=$1 ORDER BY id DESC', [req.session.kkbUserId])).rows;
  res.render('kakeibo/goals', Object.assign({ goals: rows, icons: GOAL_ICONS }, APP_LOCALS));
});
router.post('/goals/add', requireOnboarded, async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 80);
  const target = toNum(b.target_amount, 0);
  const icon = GOAL_ICONS.includes(String(b.icon)) ? b.icon : '🎯';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.target_date || '')) ? b.target_date : null;
  if (title && target > 0) {
    await pool.query('INSERT INTO kkb_goals (user_id, title, icon, target_amount, saved_amount, target_date) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.session.kkbUserId, title, icon, target, toNum(b.saved_amount, 0), date]);
  }
  res.redirect('/goals');
});
router.post('/goals/:id/contribute', requireOnboarded, async (req, res) => {
  const amt = toNum(req.body && req.body.amount, 0);
  if (amt !== 0) {
    await pool.query('UPDATE kkb_goals SET saved_amount = GREATEST(0, saved_amount + $1) WHERE id=$2 AND user_id=$3',
      [amt, toInt(req.params.id, null), req.session.kkbUserId]);
  }
  res.redirect('/goals');
});
router.post('/goals/:id/delete', requireOnboarded, async (req, res) => {
  await pool.query('DELETE FROM kkb_goals WHERE id=$1 AND user_id=$2', [toInt(req.params.id, null), req.session.kkbUserId]);
  res.redirect('/goals');
});
// AI plan for a goal — concrete steps to hit the target by the date. Cached/month.
router.post('/goals/:id/plan', requireOnboarded, async (req, res) => {
  if (!ai.isEnabled()) return res.json({ ok: false, disabled: true });
  const uid = req.session.kkbUserId;
  const g = (await pool.query('SELECT * FROM kkb_goals WHERE id=$1 AND user_id=$2', [toInt(req.params.id, null), uid])).rows[0];
  if (!g) return res.json({ ok: false });
  try {
    const target = Number(g.target_amount) || 0, saved = Number(g.saved_amount) || 0, gap = Math.max(0, target - saved);
    let monthsLeft = null;
    if (g.target_date) { const t = new Date(g.target_date), n = new Date(); monthsLeft = Math.max(1, (t.getFullYear() - n.getFullYear()) * 12 + (t.getMonth() - n.getMonth())); }
    const cats = await stats.avgCategoryMonthly(pool, uid, 3);
    const catCtx = cats.slice(0, 4).map((c) => c.key + '=' + c.monthly).join(', ');
    const now = new Date();
    const plan = await ai.cachedText(pool, uid, 'plan', g.id + '-' + now.getFullYear() + '-' + (now.getMonth() + 1), [
      { role: 'system', content: ai.coachSystem(res.locals.lang) },
      { role: 'user', content: 'Goal "' + g.title + '": need ' + gap + ' ' + res.locals.profile.currency + (monthsLeft ? ' in ' + monthsLeft + ' months' : '') + '. My avg monthly spend by category(' + res.locals.profile.currency + '): ' + (catCtx || 'unknown') + ', income=' + Math.round(Number(res.locals.profile.monthly_income) || 0) + '. Give a short realistic plan: how much to save monthly and which 1–2 categories to trim (with amounts). Max 3 sentences.' },
    ], 180);
    res.json({ ok: !!plan, plan: plan });
  } catch (e) { console.error('[kkb plan]', e.message); res.json({ ok: false }); }
});

/* ─── Budget simulator ("what-if") — client-side, free ─── */
router.get('/simulator', requireOnboarded, async (req, res) => {
  const cats = await stats.avgCategoryMonthly(pool, req.session.kkbUserId, 3);
  res.render('kakeibo/simulator', Object.assign({ cats, income: Math.round(Number(res.locals.profile.monthly_income) || 0) }, APP_LOCALS));
});

/* ─── AI Coach chat (personalized, cost-limited) ───────── */
const coachRate = new Map();
function coachAllowed(uid) {
  const now = Date.now();
  const arr = (coachRate.get(uid) || []).filter((t) => now - t < 3600000);
  if (arr.length >= 25) { coachRate.set(uid, arr); return false; }
  arr.push(now); coachRate.set(uid, arr);
  if (coachRate.size > 4000) coachRate.clear();
  return true;
}
router.get('/coach', requireOnboarded, (req, res) => {
  res.render('kakeibo/coach', Object.assign({ aiEnabled: ai.isEnabled() }, APP_LOCALS));
});
router.post('/coach/ask', requireOnboarded, async (req, res) => {
  if (!ai.isEnabled()) return res.json({ ok: false, disabled: true });
  const uid = req.session.kkbUserId;
  const msg = String((req.body && req.body.message) || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!msg) return res.json({ ok: false });
  if (!coachAllowed(uid)) return res.json({ ok: false, limited: true });
  try {
    const data = await stats.dashboard(pool, uid, res.locals.profile);
    const now = new Date();
    const topCats = await stats.categoryBreakdown(pool, uid, stats.ymd(new Date(now.getFullYear(), now.getMonth(), 1)), stats.ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1)));
    const ctx = ai.financeContext(res.locals.profile, data, topCats);
    let history = [];
    try { const h = req.body && req.body.history; if (Array.isArray(h)) history = h.slice(-6).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 300) })); } catch (e) {}
    const messages = [
      { role: 'system', content: ai.coachSystem(res.locals.lang) + ' You are the user\'s personal money coach. Their current numbers: ' + ctx + '. Answer their question using these numbers; be practical and encouraging. Keep it to 2–4 sentences.' },
      ...history,
      { role: 'user', content: msg },
    ];
    const { text, tokens } = await ai.chat(messages, { maxTokens: 220, temperature: 0.6 });
    ai.setCache(pool, uid, 'coach', ai.hash(msg + Date.now()), { text }, tokens).catch(() => {});
    res.json({ ok: true, reply: text });
  } catch (e) { console.error('[kkb coach]', e.message); res.json({ ok: false }); }
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

/* ─── Category budgets (core Kakeibo) ──────────────────── */
router.get('/budgets', requireOnboarded, async (req, res) => {
  const uid = req.session.kkbUserId;
  const now = new Date();
  const mStart = stats.ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const mEnd = stats.ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const limits = {};
  (await pool.query('SELECT category, monthly_limit FROM kkb_category_budgets WHERE user_id=$1', [uid])).rows.forEach((r) => { limits[r.category] = Number(r.monthly_limit); });
  const spentRows = await stats.categoryBreakdown(pool, uid, mStart, mEnd);
  const spent = {}; spentRows.forEach((r) => { spent[r.key] = r.total; });
  res.render('kakeibo/budgets', Object.assign({ limits, spent, saved: req.query.saved === '1' }, APP_LOCALS));
});
router.post('/budgets/save', requireOnboarded, async (req, res) => {
  const uid = req.session.kkbUserId;
  const b = req.body || {};
  for (const c of CATEGORY_KEYS) {
    const val = toNum(b['limit_' + c], 0);
    if (val > 0) {
      await pool.query(
        `INSERT INTO kkb_category_budgets (user_id, category, monthly_limit) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, category) DO UPDATE SET monthly_limit=EXCLUDED.monthly_limit`, [uid, c, val]);
    } else {
      await pool.query('DELETE FROM kkb_category_budgets WHERE user_id=$1 AND category=$2', [uid, c]);
    }
  }
  res.redirect('/budgets?saved=1');
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
  res.render('kakeibo/profile', Object.assign({ currencies: CURRENCIES, saved: req.query.saved === '1', pushEnabled: kpush.isEnabled(), pushKey: kpush.publicKey() }, APP_LOCALS));
});

/* ─── Push notifications ───────────────────────────────── */
router.post('/push/subscribe', requireOnboarded, async (req, res) => {
  try { await kpush.saveSub(req.session.kkbUserId, req.body && req.body.subscription); res.json({ ok: true }); }
  catch (e) { console.error('[kkb push sub]', e.message); res.json({ ok: false }); }
});
router.post('/push/unsubscribe', requireOnboarded, async (req, res) => {
  try { await kpush.removeSub(req.body && req.body.endpoint); res.json({ ok: true }); } catch (e) { res.json({ ok: false }); }
});
router.post('/push/test', requireOnboarded, async (req, res) => {
  const n = await kpush.sendToUser(req.session.kkbUserId, { title: 'Kakeibo', body: res.locals.lang === 'en' ? 'Notifications are on ✓' : 'الإشعارات اشتغلت ✓', url: '/app' });
  res.json({ ok: n > 0, sent: n });
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

/* ─── Data export (own your data) ──────────────────────── */
function csvCell(v) { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
router.get('/export/expenses.csv', requireOnboarded, async (req, res) => {
  const rows = (await pool.query('SELECT spent_on, amount, category, payment_method, description FROM kkb_expenses WHERE user_id=$1 ORDER BY spent_on DESC', [req.session.kkbUserId])).rows;
  const header = ['date', 'amount', 'category', 'payment_method', 'description'];
  const lines = [header.join(',')].concat(rows.map((r) => [stats.ymd(new Date(r.spent_on)), Number(r.amount), r.category, r.payment_method, r.description || ''].map(csvCell).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kakeibo-expenses.csv"');
  res.send('﻿' + lines.join('\r\n') + '\r\n');
});
router.get('/export/data.json', requireOnboarded, async (req, res) => {
  const uid = req.session.kkbUserId;
  const [profile, expenses, goals, investments] = await Promise.all([
    pool.query('SELECT monthly_income, saving_goal, salary_day, salary_type, weekend, country, currency FROM kkb_profiles WHERE user_id=$1', [uid]),
    pool.query('SELECT spent_on, amount, category, payment_method, description FROM kkb_expenses WHERE user_id=$1 ORDER BY spent_on', [uid]),
    pool.query('SELECT title, target_amount, saved_amount, target_date FROM kkb_goals WHERE user_id=$1', [uid]),
    pool.query('SELECT name, asset_type, amount, expected_return FROM kkb_investments WHERE user_id=$1', [uid]),
  ]);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kakeibo-data.json"');
  res.send(JSON.stringify({ app: 'Kakeibo', exported_at: new Date().toISOString(), profile: profile.rows[0] || null, expenses: expenses.rows, goals: goals.rows, investments: investments.rows }, null, 2));
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
    ".catch(()=>caches.match(e.request)))});" +
    "self.addEventListener('push',e=>{let d={};try{d=e.data.json()}catch(_){}" +
    "e.waitUntil(self.registration.showNotification(d.title||'Kakeibo',{body:d.body||'',icon:'/kkb-icon.svg',badge:'/kkb-icon.svg',data:{url:d.url||'/app'}}))});" +
    "self.addEventListener('notificationclick',e=>{e.notification.close();var u=(e.notification.data&&e.notification.data.url)||'/app';" +
    "e.waitUntil(clients.matchAll({type:'window'}).then(cs=>{for(const c of cs){if('focus'in c)return c.focus();}return clients.openWindow(u);}))});"
  );
});

module.exports = router;
