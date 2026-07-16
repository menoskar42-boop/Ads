// Gym owner admin area (mounted at /gym). Reuses the shared company session.
// Every route requires a logged-in company whose page_type is 'gym'. All pages
// are behind login → noindex + no ads.
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const requireLogin = require('../middleware/auth');
const push = require('../lib/push');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function slugify(s, fallback) {
  const base = String(s || '').toLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return base || (fallback || 'trainer');
}
const num = (v, d) => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : d);

async function requireGym(req, res, next) {
  try {
    const r = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    if (!r.rows.length || r.rows[0].page_type !== 'gym' || r.rows[0].is_active === false) {
      return res.redirect('/company/login');
    }
    req.company = r.rows[0];
    res.locals.noindex = true;
    next();
  } catch (e) { console.error('[gym admin]', e.message); res.redirect('/company/login'); }
}
router.use(requireLogin, requireGym);

/* ── Dashboard: active / expiring / expired + revenue ──────────────────────── */
router.get('/', async (req, res) => {
  const cid = req.company.id;
  try {
    const [stats, expiring] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='active' AND end_date >= CURRENT_DATE) AS active,
          COUNT(*) FILTER (WHERE status='active' AND end_date >= CURRENT_DATE AND end_date <= CURRENT_DATE + 7) AS expiring,
          COUNT(*) FILTER (WHERE status='active' AND end_date < CURRENT_DATE) AS expired,
          COALESCE(SUM(price) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)),0) AS month_revenue
        FROM gym_memberships WHERE company_id=$1`, [cid]),
      // Members expiring within 7 days OR already expired — the money-saving list.
      pool.query(`
        SELECT DISTINCT ON (m.member_id) m.*, mem.name, mem.phone
        FROM gym_memberships m JOIN gym_members mem ON mem.id = m.member_id
        WHERE m.company_id=$1 AND m.status='active' AND m.end_date <= CURRENT_DATE + 7
        ORDER BY m.member_id, m.end_date DESC`, [cid]),
    ]);
    res.render('gym_admin/dashboard', {
      company: req.company, tab: 'dashboard',
      stats: stats.rows[0], expiring: expiring.rows,
    });
  } catch (e) { console.error('[gym dashboard]', e.message); res.status(500).send('error'); }
});

/* ── Members + memberships ─────────────────────────────────────────────────── */
router.get('/members', async (req, res) => {
  const cid = req.company.id;
  const q = String(req.query.q || '').trim();
  try {
    const params = [cid]; let where = 'm.company_id=$1';
    if (q) { where += ' AND (m.name ILIKE $2 OR m.phone ILIKE $2)'; params.push('%' + q + '%'); }
    const members = (await pool.query(`
      SELECT m.*,
        (SELECT row_to_json(x) FROM (
           SELECT ms.end_date, ms.status, ms.plan_name FROM gym_memberships ms
           WHERE ms.member_id=m.id ORDER BY ms.end_date DESC LIMIT 1) x) AS latest
      FROM gym_members m WHERE ${where} ORDER BY m.created_at DESC LIMIT 300`, params)).rows;
    const plans = (await pool.query('SELECT id, name, price, duration_days FROM gym_plans WHERE company_id=$1 AND is_active=true ORDER BY sort_order, id', [cid])).rows;
    res.render('gym_admin/members', { company: req.company, tab: 'members', members, plans, q, saved: req.query.saved === '1' });
  } catch (e) { console.error('[gym members]', e.message); res.status(500).send('error'); }
});
router.post('/members/add', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  if (!name) return res.redirect('/gym/members');
  try {
    await pool.query('INSERT INTO gym_members (company_id, name, phone, code, notes) VALUES ($1,$2,$3,$4,$5)',
      [req.company.id, name, String(b.phone || '').trim().slice(0, 20) || null,
       String(b.code || '').trim().slice(0, 30) || null, String(b.notes || '').trim().slice(0, 300) || null]);
  } catch (e) { console.error('[gym member add]', e.message); }
  res.redirect('/gym/members?saved=1');
});
// Sell / renew a membership: sets end_date = (later of today or current end) + plan duration.
router.post('/members/:id/subscribe', async (req, res) => {
  const memberId = parseInt(req.params.id, 10);
  const planId = parseInt(req.body.plan_id, 10);
  try {
    const member = (await pool.query('SELECT id FROM gym_members WHERE id=$1 AND company_id=$2', [memberId, req.company.id])).rows[0];
    const plan = (await pool.query('SELECT * FROM gym_plans WHERE id=$1 AND company_id=$2', [planId, req.company.id])).rows[0];
    if (member && plan) {
      // Renew from the current end date if still active, else from today, so a
      // renewal stacks onto the remaining days instead of throwing them away.
      const cur = (await pool.query(
        "SELECT MAX(end_date) AS e FROM gym_memberships WHERE member_id=$1 AND status='active' AND end_date >= CURRENT_DATE", [memberId]
      )).rows[0].e;
      const base = [req.company.id, memberId, plan.id, plan.name, plan.price, plan.duration_days];
      if (cur) {
        await pool.query(
          `INSERT INTO gym_memberships (company_id, member_id, plan_id, plan_name, price, start_date, end_date, status)
           VALUES ($1,$2,$3,$4,$5, $7::date, ($7::date + ($6 || ' days')::interval)::date, 'active')`,
          [...base, cur]
        );
      } else {
        await pool.query(
          `INSERT INTO gym_memberships (company_id, member_id, plan_id, plan_name, price, start_date, end_date, status)
           VALUES ($1,$2,$3,$4,$5, CURRENT_DATE, (CURRENT_DATE + ($6 || ' days')::interval)::date, 'active')`,
          base
        );
      }
    }
  } catch (e) { console.error('[gym subscribe]', e.message); }
  res.redirect('/gym/members?saved=1');
});
router.post('/members/:id/freeze', async (req, res) => {
  try {
    await pool.query(
      "UPDATE gym_memberships SET status = CASE WHEN status='frozen' THEN 'active' ELSE 'frozen' END WHERE member_id=$1 AND company_id=$2 AND end_date >= CURRENT_DATE",
      [parseInt(req.params.id, 10), req.company.id]);
  } catch (e) { console.error('[gym freeze]', e.message); }
  res.redirect('/gym/members');
});

/* ── Plans ─────────────────────────────────────────────────────────────────── */
router.get('/plans', async (req, res) => {
  const plans = (await pool.query('SELECT * FROM gym_plans WHERE company_id=$1 ORDER BY sort_order, id', [req.company.id])).rows;
  res.render('gym_admin/plans', { company: req.company, tab: 'plans', plans, saved: req.query.saved === '1' });
});
router.post('/plans/add', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 60);
  if (name) try {
    await pool.query('INSERT INTO gym_plans (company_id, name, price, duration_days, features, is_popular, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.company.id, name, num(b.price, 0), Math.max(1, parseInt(b.duration_days, 10) || 30),
       String(b.features || '').slice(0, 500) || null, String(b.is_popular) === '1', parseInt(b.sort_order, 10) || 0]);
  } catch (e) { console.error('[gym plan add]', e.message); }
  res.redirect('/gym/plans?saved=1');
});
router.post('/plans/:id/delete', async (req, res) => {
  try { await pool.query('DELETE FROM gym_plans WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); }
  catch (e) { console.error('[gym plan del]', e.message); }
  res.redirect('/gym/plans');
});

/* ── Trainers ──────────────────────────────────────────────────────────────── */
router.get('/trainers', async (req, res) => {
  const trainers = (await pool.query('SELECT * FROM gym_trainers WHERE company_id=$1 ORDER BY sort_order, id', [req.company.id])).rows;
  res.render('gym_admin/trainers', { company: req.company, tab: 'trainers', trainers, saved: req.query.saved === '1' });
});
router.post('/trainers/add', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  if (name) try {
    await pool.query('INSERT INTO gym_trainers (company_id, slug, name, specialty, bio, photo_url, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (company_id, slug) DO NOTHING',
      [req.company.id, slugify(b.name, 'trainer-' + Date.now().toString(36)), name,
       String(b.specialty || '').slice(0, 80) || null, String(b.bio || '').slice(0, 500) || null,
       String(b.photo_url || '').slice(0, 300) || null, parseInt(b.sort_order, 10) || 0]);
  } catch (e) { console.error('[gym trainer add]', e.message); }
  res.redirect('/gym/trainers?saved=1');
});
router.post('/trainers/:id/delete', async (req, res) => {
  try { await pool.query('DELETE FROM gym_trainers WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); }
  catch (e) { console.error('[gym trainer del]', e.message); }
  res.redirect('/gym/trainers');
});

/* ── Classes ───────────────────────────────────────────────────────────────── */
router.get('/classes', async (req, res) => {
  const [classes, trainers] = await Promise.all([
    pool.query(`SELECT c.*, t.name AS trainer_name FROM gym_classes c LEFT JOIN gym_trainers t ON t.id=c.trainer_id WHERE c.company_id=$1 ORDER BY c.day_of_week, c.sort_order, c.id`, [req.company.id]),
    pool.query('SELECT id, name FROM gym_trainers WHERE company_id=$1 AND is_active=true ORDER BY sort_order, id', [req.company.id]),
  ]);
  res.render('gym_admin/classes', { company: req.company, tab: 'classes', classes: classes.rows, trainers: trainers.rows, saved: req.query.saved === '1' });
});
router.post('/classes/add', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 60);
  if (name) try {
    await pool.query('INSERT INTO gym_classes (company_id, name, day_of_week, start_time, duration_min, trainer_id, capacity, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [req.company.id, name, Math.max(0, Math.min(6, parseInt(b.day_of_week, 10) || 0)),
       String(b.start_time || '').slice(0, 10) || null, Math.max(1, parseInt(b.duration_min, 10) || 60),
       parseInt(b.trainer_id, 10) || null, Math.max(1, parseInt(b.capacity, 10) || 20), parseInt(b.sort_order, 10) || 0]);
  } catch (e) { console.error('[gym class add]', e.message); }
  res.redirect('/gym/classes?saved=1');
});
router.post('/classes/:id/delete', async (req, res) => {
  try { await pool.query('DELETE FROM gym_classes WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); }
  catch (e) { console.error('[gym class del]', e.message); }
  res.redirect('/gym/classes');
});

/* ── Settings ──────────────────────────────────────────────────────────────── */
router.get('/settings', async (req, res) => {
  const s = (await pool.query('SELECT * FROM gym_settings WHERE company_id=$1', [req.company.id])).rows[0] || {};
  res.render('gym_admin/settings', { company: req.company, tab: 'settings', s, saved: req.query.saved === '1' });
});
router.post('/settings', async (req, res) => {
  const b = req.body || {};
  const clean = (v, n) => String(v || '').trim().slice(0, n) || null;
  try {
    await pool.query(
      `INSERT INTO gym_settings (company_id, tagline, about, address, phone, whatsapp, hours, booking_enabled, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (company_id) DO UPDATE SET tagline=EXCLUDED.tagline, about=EXCLUDED.about, address=EXCLUDED.address,
         phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp, hours=EXCLUDED.hours, booking_enabled=EXCLUDED.booking_enabled, updated_at=now()`,
      [req.company.id, clean(b.tagline, 120), clean(b.about, 1000), clean(b.address, 200),
       clean(b.phone, 30), (String(b.whatsapp || '').replace(/[^0-9]/g, '').slice(0, 18) || null),
       clean(b.hours, 100), String(b.booking_enabled) === '1']
    );
  } catch (e) { console.error('[gym settings]', e.message); }
  res.redirect('/gym/settings?saved=1');
});

module.exports = router;
