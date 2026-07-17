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
    await pool.query('INSERT INTO gym_trainers (company_id, slug, name, specialty, bio, photo_url, commission_pct, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (company_id, slug) DO NOTHING',
      [req.company.id, slugify(b.name, 'trainer-' + Math.abs((name.length * 2654435761) % 1e9).toString(36)), name,
       String(b.specialty || '').slice(0, 80) || null, String(b.bio || '').slice(0, 500) || null,
       String(b.photo_url || '').slice(0, 300) || null, Math.max(0, Math.min(90, parseFloat(b.commission_pct) || 0)),
       parseInt(b.sort_order, 10) || 0]);
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

/* ── POS: products + sales + trainer commissions (phase 5) ─────────────────── */
router.get('/pos', async (req, res) => {
  const cid = req.company.id;
  try {
    const [products, trainers, members, sales, commissions] = await Promise.all([
      pool.query('SELECT * FROM gym_products WHERE company_id=$1 AND is_active=true ORDER BY name', [cid]),
      pool.query('SELECT id, name, commission_pct FROM gym_trainers WHERE company_id=$1 AND is_active=true ORDER BY sort_order, id', [cid]),
      pool.query('SELECT id, name FROM gym_members WHERE company_id=$1 ORDER BY name LIMIT 500', [cid]),
      pool.query(`SELECT s.*, t.name AS trainer_name FROM gym_sales s LEFT JOIN gym_trainers t ON t.id=s.trainer_id
                  WHERE s.company_id=$1 ORDER BY s.created_at DESC LIMIT 50`, [cid]),
      // Commission owed per trainer this month.
      pool.query(`SELECT t.name, COALESCE(SUM(s.commission),0) AS owed
                  FROM gym_sales s JOIN gym_trainers t ON t.id=s.trainer_id
                  WHERE s.company_id=$1 AND s.created_at >= date_trunc('month', CURRENT_DATE)
                  GROUP BY t.name ORDER BY owed DESC`, [cid]),
    ]);
    const todayTotal = (await pool.query(
      "SELECT COALESCE(SUM(total),0) AS t FROM gym_sales WHERE company_id=$1 AND created_at::date=(now() AT TIME ZONE 'Africa/Cairo')::date", [cid]
    )).rows[0].t;
    res.render('gym_admin/pos', {
      company: req.company, tab: 'pos',
      products: products.rows, trainers: trainers.rows, members: members.rows,
      sales: sales.rows, commissions: commissions.rows, todayTotal, saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[gym pos]', e.message); res.status(500).send('error'); }
});
router.post('/pos/product/add', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  if (name) try {
    await pool.query('INSERT INTO gym_products (company_id, name, price, stock) VALUES ($1,$2,$3,$4)',
      [req.company.id, name, num(b.price, 0), parseInt(b.stock, 10) || 0]);
  } catch (e) { console.error('[gym product add]', e.message); }
  res.redirect('/gym/pos?saved=1');
});
router.post('/pos/product/:id/delete', async (req, res) => {
  try { await pool.query('DELETE FROM gym_products WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); }
  catch (e) { console.error('[gym product del]', e.message); }
  res.redirect('/gym/pos');
});
// Record a sale: decrements stock, computes the trainer's commission.
router.post('/pos/sell', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const qty = Math.max(1, parseInt(b.quantity, 10) || 1);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prod = (await client.query('SELECT * FROM gym_products WHERE id=$1 AND company_id=$2 AND is_active=true FOR UPDATE', [parseInt(b.product_id, 10), cid])).rows[0];
    if (!prod) { await client.query('ROLLBACK'); return res.redirect('/gym/pos'); }
    // Decrement stock only if tracked (>0); allow overselling to 0 gracefully.
    if (prod.stock > 0) await client.query('UPDATE gym_products SET stock = GREATEST(0, stock - $1) WHERE id=$2', [qty, prod.id]);
    const total = +(Number(prod.price) * qty).toFixed(2);
    let commission = 0, trainerId = parseInt(b.trainer_id, 10) || null;
    if (trainerId) {
      const tr = (await client.query('SELECT commission_pct FROM gym_trainers WHERE id=$1 AND company_id=$2', [trainerId, cid])).rows[0];
      if (tr) commission = +(total * Number(tr.commission_pct || 0) / 100).toFixed(2); else trainerId = null;
    }
    await client.query(
      `INSERT INTO gym_sales (company_id, product_id, member_id, trainer_id, item_name, unit_price, quantity, total, commission)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [cid, prod.id, parseInt(b.member_id, 10) || null, trainerId, prod.name, prod.price, qty, total, commission]
    );
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); console.error('[gym sell]', e.message); }
  finally { client.release(); }
  res.redirect('/gym/pos?saved=1');
});

/* ── Reports & retention (phase 4) ─────────────────────────────────────────── */
router.get('/reports', async (req, res) => {
  const cid = req.company.id;
  try {
    const [revenue, retention, attendance, topClasses] = await Promise.all([
      // Revenue per month (memberships sold), last 6 months.
      pool.query(`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
               COALESCE(SUM(price),0) AS revenue, COUNT(*) AS sold
        FROM gym_memberships
        WHERE company_id=$1 AND created_at >= date_trunc('month', CURRENT_DATE) - interval '5 months'
        GROUP BY 1 ORDER BY 1`, [cid]),
      // Retention: members with an active membership vs total members ever.
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM gym_members WHERE company_id=$1) AS total_members,
          (SELECT COUNT(DISTINCT member_id) FROM gym_memberships
             WHERE company_id=$1 AND status='active' AND end_date >= CURRENT_DATE) AS active_members,
          (SELECT COUNT(DISTINCT member_id) FROM gym_memberships
             WHERE company_id=$1 AND status='active' AND end_date < CURRENT_DATE) AS lapsed_members`, [cid]),
      // Attendance per day, last 14 days.
      pool.query(`
        SELECT checked_in_at::date AS day, COUNT(*)::int AS n
        FROM gym_attendance WHERE company_id=$1 AND checked_in_at >= CURRENT_DATE - 13
        GROUP BY 1 ORDER BY 1`, [cid]),
      // Most-booked classes (last 30 days).
      pool.query(`
        SELECT c.name, COUNT(*)::int AS n FROM gym_bookings b
        JOIN gym_classes c ON c.id=b.class_id
        WHERE b.company_id=$1 AND b.created_at >= CURRENT_DATE - 30 AND b.status<>'cancelled'
        GROUP BY c.name ORDER BY n DESC LIMIT 8`, [cid]),
    ]);
    const ret = retention.rows[0];
    const renewalRate = Number(ret.total_members) > 0
      ? Math.round(Number(ret.active_members) / Number(ret.total_members) * 100) : 0;
    res.render('gym_admin/reports', {
      company: req.company, tab: 'reports',
      revenue: revenue.rows, retention: ret, renewalRate,
      attendance: attendance.rows, topClasses: topClasses.rows,
    });
  } catch (e) { console.error('[gym reports]', e.message); res.status(500).send('error'); }
});

/* ── Member detail + progress measurements (phase 6) ───────────────────────── */
router.get('/members/:id', async (req, res) => {
  const cid = req.company.id, mid = parseInt(req.params.id, 10);
  try {
    const member = (await pool.query('SELECT * FROM gym_members WHERE id=$1 AND company_id=$2', [mid, cid])).rows[0];
    if (!member) return res.redirect('/gym/members');
    const [history, measures] = await Promise.all([
      pool.query('SELECT * FROM gym_memberships WHERE member_id=$1 ORDER BY end_date DESC LIMIT 20', [mid]),
      pool.query('SELECT * FROM gym_measurements WHERE member_id=$1 ORDER BY measured_on DESC, id DESC LIMIT 50', [mid]),
    ]);
    res.render('gym_admin/member', {
      company: req.company, tab: 'members', member,
      history: history.rows, measures: measures.rows, saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[gym member]', e.message); res.redirect('/gym/members'); }
});
router.post('/members/:id/measure', async (req, res) => {
  const b = req.body || {}, mid = parseInt(req.params.id, 10);
  const numOrNull = (v) => (v !== '' && v != null && isFinite(Number(v)) ? Number(v) : null);
  try {
    const owns = (await pool.query('SELECT 1 FROM gym_members WHERE id=$1 AND company_id=$2', [mid, req.company.id])).rowCount;
    if (owns) await pool.query(
      `INSERT INTO gym_measurements (company_id, member_id, measured_on, weight, body_fat, chest, waist, arm, notes, photo_url)
       VALUES ($1,$2, COALESCE($3::date, CURRENT_DATE), $4,$5,$6,$7,$8,$9,$10)`,
      [req.company.id, mid, b.measured_on || null, numOrNull(b.weight), numOrNull(b.body_fat),
       numOrNull(b.chest), numOrNull(b.waist), numOrNull(b.arm),
       String(b.notes || '').slice(0, 300) || null, String(b.photo_url || '').slice(0, 300) || null]
    );
  } catch (e) { console.error('[gym measure]', e.message); }
  res.redirect('/gym/members/' + mid + '?saved=1');
});

/* ── Attendance (check-in log) ─────────────────────────────────────────────── */
router.get('/attendance', async (req, res) => {
  const cid = req.company.id;
  try {
    const [today, recent] = await Promise.all([
      pool.query("SELECT COUNT(*)::int n FROM gym_attendance WHERE company_id=$1 AND checked_in_at::date = (now() AT TIME ZONE 'Africa/Cairo')::date", [cid]),
      pool.query(`SELECT a.checked_in_at, m.name, m.phone FROM gym_attendance a
                  JOIN gym_members m ON m.id=a.member_id WHERE a.company_id=$1
                  ORDER BY a.checked_in_at DESC LIMIT 100`, [cid]),
    ]);
    res.render('gym_admin/attendance', { company: req.company, tab: 'attendance', todayCount: today.rows[0].n, recent: recent.rows });
  } catch (e) { console.error('[gym attendance]', e.message); res.status(500).send('error'); }
});

/* ── Class bookings ────────────────────────────────────────────────────────── */
router.get('/bookings', async (req, res) => {
  const cid = req.company.id;
  try {
    const rows = (await pool.query(`
      SELECT b.*, c.name AS class_name FROM gym_bookings b
      JOIN gym_classes c ON c.id=b.class_id
      WHERE b.company_id=$1 AND b.booking_date >= CURRENT_DATE AND b.status <> 'cancelled'
      ORDER BY b.booking_date, c.name, b.created_at LIMIT 300`, [cid])).rows;
    res.render('gym_admin/bookings', { company: req.company, tab: 'bookings', bookings: rows });
  } catch (e) { console.error('[gym bookings]', e.message); res.status(500).send('error'); }
});

module.exports = router;
