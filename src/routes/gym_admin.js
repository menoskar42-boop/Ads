// Gym owner admin area (mounted at /gym). Reuses the shared company session.
// Every route requires a logged-in company whose page_type is 'gym'. All pages
// are behind login → noindex + no ads.
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const uploads = require('../lib/uploads');
const { ref } = require('../lib/tenant_scope');
const { Pool } = require('pg');
const requireLogin = require('../middleware/auth');
const push = require('../lib/push');
const { compressImage } = require('../lib/media');
const DESK = require('../gym/desk');
const gymPerms = require('../gym/perms');
const bcrypt = require('bcryptjs');
const staffScope = require('../lib/staff_scope');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Image uploads land in the same public/uploads sandbox as the rest of the app.
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const imageMimeRegex = /^image\/(png|jpe?g|gif|webp)$/;
function gymUploader(prefix) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `gym-${prefix}-${req.session.companyId}-${Date.now()}${uploads.extname(file, '.bin')}`),
  });
  return multer({
    storage, limits: { fileSize: 6 * 1024 * 1024 },
    fileFilter: (req, file, cb) => imageMimeRegex.test(file.mimetype) ? cb(null, true) : cb(new Error('صور فقط (PNG/JPEG/WEBP).')),
  });
}
const uploadHero = uploads.guard(gymUploader('hero').single('hero_file'), 'image');
const uploadGallery = uploads.guard(gymUploader('gal').single('image_file'), 'image');
const uploadTrainer = uploads.guard(gymUploader('trainer').single('photo_file'), 'image');
async function compressSafe(file) {
  if (!file) return null;
  try { await compressImage(file.path); } catch (e) { /* keep original on failure */ }
  return '/uploads/' + file.filename;
}

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
    // Who is asking, and what that role may reach. Computed once here so every
    // page and every guard read the same answer.
    const perms = gymPerms.permsFor(req.session);
    req.perms = perms;
    res.locals.perms = perms;
    next();
  } catch (e) { console.error('[gym admin]', e.message); res.redirect('/company/login'); }
}
// One guard for the whole router: the permission comes from the PATH PREFIX
// (see src/gym/perms.js), so a route added under /gym/reports next year is
// covered by where it lives rather than by somebody remembering an `if`.
router.use(requireLogin, staffScope.only('/gym'), requireGym, gymPerms.guard());

// The first screen depends on the role: a trainer may not open the desk, so a
// fixed redirect would greet them with a locked door on every sign-in.
router.get('/home', (req, res) => res.redirect(gymPerms.homeFor(req.perms)));

/* ── Dashboard: active / expiring / expired + revenue ──────────────────────── */
router.get('/', async (req, res) => {
  const cid = req.company.id;
  try {
    const [stats, expiring] = await Promise.all([
      /* These cards say "members", so they have to count PEOPLE.
       *
       * They counted rows in gym_memberships. A member who has renewed three
       * times is three rows, so a gym of 40 read as 120 active — and the same
       * person appeared in "active" AND in "expired" at once, because the old
       * subscription is still sitting there beside the current one. Every
       * number on the screen was inflated, and the more loyal the member the
       * more they inflated it.
       *
       * One row per member — the latest subscription — and then classify that.
       * A cancelled subscription is not a state a member is in; it is a
       * decision, so it does not stand in for their current one.
       *
       * `frozen` is counted and shown rather than dropped: a frozen member is
       * neither active nor expired, and leaving them out of all three cards
       * would make people disappear from the gym's own headcount.
       */
      pool.query(`
        WITH latest AS (
          SELECT DISTINCT ON (member_id) member_id, status, end_date
            FROM gym_memberships
           WHERE company_id=$1 AND status <> 'cancelled'
           ORDER BY member_id, end_date DESC, id DESC
        )
        SELECT
          (SELECT COUNT(*) FROM latest WHERE status='active' AND end_date >= CURRENT_DATE) AS active,
          (SELECT COUNT(*) FROM latest WHERE status='active' AND end_date >= CURRENT_DATE
             AND end_date <= CURRENT_DATE + 7) AS expiring,
          (SELECT COUNT(*) FROM latest WHERE status='active' AND end_date < CURRENT_DATE) AS expired,
          (SELECT COUNT(*) FROM latest WHERE status='frozen') AS frozen,
          -- Revenue is money, not people: every subscription sold this month
          -- counts, renewals included. Cancelled ones never were revenue.
          (SELECT COALESCE(SUM(price),0) FROM gym_memberships
            WHERE company_id=$1 AND status <> 'cancelled'
              AND created_at >= date_trunc('month', CURRENT_DATE)) AS month_revenue`, [cid]),
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
/* ── The front desk ─────────────────────────────────────────────────────────
 *
 * One box, one answer, three buttons. Somebody is standing there and the queue
 * is behind them: the desk types (or scans) whatever they have — a code, a
 * phone, a name — and the screen says whether this person may come in, in a
 * colour readable from across a counter.
 *
 * The undo matters as much as the check-in. A mis-scan at a busy desk is
 * normal; making the fix require the reports screen is what teaches people to
 * ignore the software.
 */
router.get('/desk', async (req, res) => {
  const cid = req.company.id;
  const term = String(req.query.q || '').trim();
  const what = DESK.classify(term);
  try {
    let members = [];
    if (what.kind !== 'empty') {
      const withStatus = `
        SELECT m.*,
          (SELECT row_to_json(x) FROM (
             SELECT ms.end_date, ms.status, ms.plan_name, ms.frozen_at FROM gym_memberships ms
             WHERE ms.member_id=m.id AND ms.company_id=m.company_id
             ORDER BY (ms.status='active') DESC, ms.end_date DESC LIMIT 1) x) AS latest,
          (SELECT row_to_json(y) FROM (
             SELECT a.id, a.checked_in_at FROM gym_attendance a
             WHERE a.member_id=m.id AND a.company_id=m.company_id
               AND a.day = (now() AT TIME ZONE 'Africa/Cairo')::date
             ORDER BY a.id DESC LIMIT 1) y) AS today
        FROM gym_members m WHERE m.company_id=$1 AND `;
      if (what.kind === 'code') {
        members = (await pool.query(withStatus + 'lower(btrim(m.code))=lower(btrim($2)) LIMIT 8', [cid, what.value])).rows;
        // A scanner and a keyboard produce the same string; if the code matched
        // nothing, the same characters might still be a name or a phone.
        if (!members.length) {
          members = (await pool.query(withStatus + "(m.name ILIKE $2 OR regexp_replace(coalesce(m.phone,''),'[^0-9]','','g') = $3) LIMIT 8",
            [cid, '%' + what.value + '%', DESK.digits(what.value)])).rows;
        }
      } else if (what.kind === 'phone') {
        members = (await pool.query(withStatus + "regexp_replace(coalesce(m.phone,''),'[^0-9]','','g') = $2 LIMIT 8", [cid, what.value])).rows;
      } else {
        members = (await pool.query(withStatus + 'm.name ILIKE $2 ORDER BY m.name LIMIT 8', [cid, '%' + what.value + '%'])).rows;
      }
    }
    const now = new Date();
    const rows = members.map((m) => {
      const status = DESK.statusOf(m.latest, now);
      return {
        member: m, status, alert: DESK.alertFor(status), mayEnter: DESK.mayEnter(status),
        today: m.today || null, canUndo: DESK.canUndo(m.today, now),
      };
    });
    res.render('gym_admin/desk', {
      company: req.company, tab: 'desk', q: term, rows,
      // Codes the server chose — this screen echoes nothing from the address bar.
      UNDO_MINUTES: DESK.UNDO_MINUTES,
      done: ['in', 'already', 'undone'].includes(req.query.done) ? req.query.done : null,
      err: ['expired', 'gone', 'late'].includes(req.query.err) ? req.query.err : null,
    });
  } catch (e) { console.error('[gym desk]', e.message); res.status(500).send('error'); }
});

router.post('/desk/checkin', async (req, res) => {
  const cid = req.company.id;
  const id = parseInt((req.body || {}).member_id, 10);
  const back = '/gym/desk?q=' + encodeURIComponent(String((req.body || {}).q || ''));
  if (!Number.isInteger(id)) return res.redirect(back);
  try {
    // The membership decides, not the button: a page left open while somebody's
    // subscription lapsed must not let them in on a stale render.
    const m = (await pool.query(
      `SELECT ms.end_date, ms.status, ms.frozen_at FROM gym_memberships ms
        JOIN gym_members mm ON mm.id = ms.member_id AND mm.company_id = ms.company_id
        WHERE ms.member_id=$1 AND ms.company_id=$2
        ORDER BY (ms.status='active') DESC, ms.end_date DESC LIMIT 1`, [id, cid])).rows[0];
    if (!DESK.mayEnter(DESK.statusOf(m, new Date()))) return res.redirect(back + '&err=expired');
    // One row per member per day, decided by the index — two taps of the same
    // card are one visit, and the second tap says so instead of failing.
    const ins = await pool.query(
      `INSERT INTO gym_attendance (company_id, member_id, day)
       SELECT $1,$2,(now() AT TIME ZONE 'Africa/Cairo')::date
        WHERE EXISTS (SELECT 1 FROM gym_members WHERE id=$2 AND company_id=$1)
       ON CONFLICT (company_id, member_id, day) DO NOTHING RETURNING id`, [cid, id]);
    return res.redirect(back + '&done=' + (ins.rows[0] ? 'in' : 'already'));
  } catch (e) {
    console.error('[gym desk checkin]', e.message);
    return res.redirect(back + '&err=gone');
  }
});

router.post('/desk/undo', async (req, res) => {
  const cid = req.company.id;
  const id = parseInt((req.body || {}).attendance_id, 10);
  const back = '/gym/desk?q=' + encodeURIComponent(String((req.body || {}).q || ''));
  if (!Number.isInteger(id)) return res.redirect(back);
  try {
    // Only the tap that just happened, and only this gym's row. Past that
    // window it is not an undo, it is editing attendance history.
    const del = await pool.query(
      `DELETE FROM gym_attendance
        WHERE id=$1 AND company_id=$2
          AND checked_in_at >= now() - ($3 || ' minutes')::interval
        RETURNING id`, [id, cid, DESK.UNDO_MINUTES]);
    return res.redirect(back + (del.rows[0] ? '&done=undone' : '&err=late'));
  } catch (e) {
    console.error('[gym desk undo]', e.message);
    return res.redirect(back + '&err=gone');
  }
});

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
      // A FROZEN membership still has days on it — they are paused, not gone.
      // Leaving it out here meant renewing while frozen silently threw the
      // remaining days away, which is the same loss the freeze fix closes.
      const cur = (await pool.query(
        `SELECT MAX(end_date) AS e FROM gym_memberships
          WHERE member_id=$1 AND status IN ('active','frozen') AND end_date >= CURRENT_DATE`, [memberId]
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
/* Freeze / unfreeze — and give the days back.
 *
 * Freezing used to flip a status and nothing else. The end date kept running,
 * so a member who paid for thirty days and froze for ten came back to twenty:
 * the gym sold days and took them away again, for the one reason a member is
 * most likely to ask about. `frozen_at` records when the pause started and the
 * unfreeze pushes the end date out by exactly that many days.
 *
 * All three columns are set in ONE statement on purpose. Every CASE reads the
 * row as it was BEFORE the update, so `status='frozen'` means "was frozen"
 * throughout — and a status that moved without its date moving is precisely the
 * bug being fixed, so the two must not be able to happen separately.
 *
 * The row is picked, not matched: a member with three old subscriptions had
 * every one of them flipped. And a membership that expired WHILE frozen can
 * still be unfrozen — otherwise the days it is owed are lost by the passage of
 * the very time the freeze was meant to stop.
 */
router.post('/members/:id/freeze', async (req, res) => {
  try {
    await pool.query(
      `UPDATE gym_memberships
          SET status    = CASE WHEN status='frozen' THEN 'active' ELSE 'frozen' END,
              end_date  = CASE WHEN status='frozen'
                               THEN end_date + (CURRENT_DATE - COALESCE(frozen_at, CURRENT_DATE))
                               ELSE end_date END,
              frozen_at = CASE WHEN status='frozen' THEN NULL ELSE CURRENT_DATE END
        WHERE id = (
          SELECT id FROM gym_memberships
           WHERE member_id=$1 AND company_id=$2
             AND status IN ('active','frozen')
             AND (status='frozen' OR end_date >= CURRENT_DATE)
           ORDER BY end_date DESC, id DESC LIMIT 1)`,
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
router.post('/trainers/add', (req, res) => {
  uploadTrainer(req, res, async () => {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 80);
    if (name) try {
      const photo = (await compressSafe(req.file)) || (String(b.photo_url || '').slice(0, 300) || null);
      await pool.query('INSERT INTO gym_trainers (company_id, slug, name, specialty, bio, photo_url, commission_pct, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (company_id, slug) DO NOTHING',
        [req.company.id, slugify(b.name, 'trainer-' + Math.abs((name.length * 2654435761) % 1e9).toString(36)), name,
         String(b.specialty || '').slice(0, 80) || null, String(b.bio || '').slice(0, 500) || null,
         photo, Math.max(0, Math.min(90, parseFloat(b.commission_pct) || 0)), parseInt(b.sort_order, 10) || 0]);
    } catch (e) { console.error('[gym trainer add]', e.message); }
    res.redirect('/gym/trainers?saved=1');
  });
});

/* ── Media: hero image + gallery ───────────────────────────────────────────── */
router.get('/media', async (req, res) => {
  try {
    const s = (await pool.query('SELECT hero_url FROM gym_settings WHERE company_id=$1', [req.company.id])).rows[0] || {};
    const gallery = (await pool.query('SELECT * FROM gym_gallery WHERE company_id=$1 ORDER BY sort_order, id', [req.company.id])).rows;
    res.render('gym_admin/media', { company: req.company, tab: 'media', hero: s.hero_url || null, gallery, saved: req.query.saved === '1' });
  } catch (e) { console.error('[gym media]', e.message); res.redirect('/gym'); }
});
router.post('/media/hero', (req, res) => {
  uploadHero(req, res, async () => {
    try {
      const url = await compressSafe(req.file);
      if (url) await pool.query(
        `INSERT INTO gym_settings (company_id, hero_url) VALUES ($1,$2)
         ON CONFLICT (company_id) DO UPDATE SET hero_url=EXCLUDED.hero_url`, [req.company.id, url]);
    } catch (e) { console.error('[gym hero]', e.message); }
    res.redirect('/gym/media?saved=1');
  });
});
router.post('/media/gallery/add', (req, res) => {
  uploadGallery(req, res, async () => {
    try {
      const url = await compressSafe(req.file);
      if (url) await pool.query('INSERT INTO gym_gallery (company_id, url) VALUES ($1,$2)', [req.company.id, url]);
    } catch (e) { console.error('[gym gallery add]', e.message); }
    res.redirect('/gym/media?saved=1');
  });
});
router.post('/media/gallery/:id/delete', async (req, res) => {
  try { await pool.query('DELETE FROM gym_gallery WHERE id=$1 AND company_id=$2', [parseInt(req.params.id, 10), req.company.id]); }
  catch (e) { console.error('[gym gallery del]', e.message); }
  res.redirect('/gym/media');
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
       // HH:MM or nothing. It was stored as any ten characters, so "بعد
       // الظهر" was a valid start time — and the booking page has to compare it
       // with a clock to know whether today's class has already run.
       (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.start_time || '').trim())
         ? String(b.start_time).trim() : null),
       Math.max(1, parseInt(b.duration_min, 10) || 60),
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
      /* A code the server knows plus one number — never text from the URL. */
      err: String(req.query.err || '') === 'stock' ? 'stock' : null,
      errHave: Math.max(0, parseInt(req.query.have, 10) || 0),
    });
  } catch (e) { console.error('[gym pos]', e.message); res.status(500).send('error'); }
});
router.post('/pos/product/add', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  if (name) try {
    // A typed number means "count this" — including a typed zero. Leaving the
    // field blank means "do not count it", which is what the label promises and
    // what the till now honours.
    const typed = String(b.stock || '').trim() !== '';
    await pool.query(
      'INSERT INTO gym_products (company_id, name, price, stock, track_stock) VALUES ($1,$2,$3,$4,$5)',
      [req.company.id, name, num(b.price, 0), Math.max(0, parseInt(b.stock, 10) || 0), typed]);
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
    /* "Allow overselling to 0 gracefully" was the old comment, and it did
     * something else: `GREATEST(0, stock - qty)` sold five off a shelf of two,
     * recorded five in the takings, and left the stock at zero. The gym's
     * report then says it sold product it never had.
     *
     * And the old test was `prod.stock > 0`, which made SOLD OUT and NOT
     * COUNTED the same state — so a product became untracked at the exact
     * moment it ran out, and everything after that oversold silently. That is
     * what `track_stock` now answers.
     */
    if (prod.track_stock) {
      const took = await client.query(
        'UPDATE gym_products SET stock = stock - $1 WHERE id=$2 AND company_id=$3 AND stock >= $1 RETURNING id',
        [qty, prod.id, cid]
      );
      if (!took.rows.length) {
        await client.query('ROLLBACK');
        return res.redirect(`/gym/pos?err=stock&have=${Math.max(0, Number(prod.stock) || 0)}`);
      }
    }
    const total = +(Number(prod.price) * qty).toFixed(2);
    let commission = 0, trainerId = parseInt(b.trainer_id, 10) || null;
    if (trainerId) {
      const tr = (await client.query('SELECT commission_pct FROM gym_trainers WHERE id=$1 AND company_id=$2', [trainerId, cid])).rows[0];
      if (tr) commission = +(total * Number(tr.commission_pct || 0) / 100).toFixed(2); else trainerId = null;
    }
    await client.query(
      // member_id arrives from the POS form. Scoped in the statement, so a
      // number belonging to another gym files as NULL rather than putting this
      // sale on their member's account.
      `INSERT INTO gym_sales (company_id, product_id, member_id, trainer_id, item_name, unit_price, quantity, total, commission)
       VALUES ($1,$2,${ref('gym_members', '$3', '$1')},$4,$5,$6,$7,$8,$9)`,
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

/* ── The shift: reception, the till, a trainer ──────────────────────────────
 *
 * Same screen as the restaurant's, deliberately: one idea to learn. A row here
 * is a person on the rota; a row WITH a username is an account. Those are two
 * different things and the screen keeps them apart, because most staff never
 * need to sign in at all.
 */
router.get('/staff', async (req, res) => {
  try {
    const staff = (await pool.query(
      `SELECT id, name, username, perm_role, phone, login_enabled, is_active
         FROM gym_staff WHERE company_id=$1 ORDER BY is_active DESC, id`, [req.company.id])).rows;
    res.render('gym_admin/staff', {
      company: req.company, tab: 'staff', staff,
      roles: gymPerms.ROLE_KEYS, ROLES: gymPerms.ROLES,
      saved: req.query.saved === '1',
      // Known codes only — this page never prints the address bar's words.
      err: ['no_name', 'save', 'username'].includes(req.query.err) ? req.query.err : null,
    });
  } catch (e) { console.error('[gym staff]', e.message); res.status(500).send('error'); }
});

router.post('/staff/add', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 120);
  if (!name) return res.redirect('/gym/staff?err=no_name');
  const role = gymPerms.ROLE_KEYS.includes(b.perm_role) ? b.perm_role : 'reception';
  try {
    await pool.query('INSERT INTO gym_staff (company_id, name, perm_role, phone) VALUES ($1,$2,$3,$4)',
      [req.company.id, name, role, String(b.phone || '').trim().slice(0, 30) || null]);
  } catch (e) {
    console.error('[gym staff add]', e.message);
    return res.redirect('/gym/staff?err=save');
  }
  res.redirect('/gym/staff?saved=1');
});

// Give a row a login, change its role, or take the login away again.
router.post('/staff/:id(\\d+)/login', async (req, res) => {
  const cid = req.company.id, sid = parseInt(req.params.id, 10);
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase().slice(0, 60);
  const role = gymPerms.ROLE_KEYS.includes(b.perm_role) ? b.perm_role : 'reception';
  const enabled = b.login_enabled === '1';
  try {
    if (!username) {
      // No username means no account. The row stays as a name on the rota.
      await pool.query(
        'UPDATE gym_staff SET username=NULL, password_hash=NULL, login_enabled=false, perm_role=$1 WHERE id=$2 AND company_id=$3',
        [role, sid, cid]);
      return res.redirect('/gym/staff?saved=1');
    }
    const password = String(b.password || '');
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE gym_staff SET username=$1, password_hash=$2, perm_role=$3, login_enabled=$4 WHERE id=$5 AND company_id=$6',
        [username, hash, role, enabled, sid, cid]);
    } else {
      // A blank password keeps the old one — moving somebody from the till to
      // reception should not require knowing their password.
      await pool.query(
        'UPDATE gym_staff SET username=$1, perm_role=$2, login_enabled=$3 WHERE id=$4 AND company_id=$5',
        [username, role, enabled, sid, cid]);
    }
    res.redirect('/gym/staff?saved=1');
  } catch (e) {
    console.error('[gym staff login]', e.message);
    // The unique index is the only realistic failure here.
    res.redirect('/gym/staff?err=username');
  }
});

router.post('/staff/:id(\\d+)/delete', async (req, res) => {
  try {
    await pool.query('DELETE FROM gym_staff WHERE id=$1 AND company_id=$2',
      [parseInt(req.params.id, 10), req.company.id]);
  } catch (e) {
    console.error('[gym staff delete]', e.message);
    return res.redirect('/gym/staff?err=save');
  }
  res.redirect('/gym/staff?saved=1');
});

module.exports = router;
