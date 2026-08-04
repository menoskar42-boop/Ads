// Dietitian's portal.
//
// Two guards, not one: the session must be logged in, AND the company must
// actually be a nutrition practice. Without the second, a shop owner reaches
// another product's admin — and here that product holds named people's health
// data, so the check is not a nicety.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const E = require('../nutrition/engine');
const P = require('../nutrition/practice');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const text = (v, max) => String(v || '').trim().slice(0, max) || null;

function requireLogin(req, res, next) {
  if (req.session && req.session.companyId) return next();
  res.redirect('/company/login');
}

async function requirePractice(req, res, next) {
  try {
    const c = (await pool.query('SELECT * FROM companies WHERE id=$1', [req.session.companyId])).rows[0];
    if (!c || c.page_type !== 'nutrition' || c.is_active === false) return res.redirect('/company/login');
    req.company = c;
    res.locals.company = c;
    next();
  } catch (e) {
    console.error('[nutrition admin]', e.message);
    res.redirect('/company/login');
  }
}
router.use(requireLogin, requirePractice);

// Mounted after the guards so both inherit req.company — a food or a plan
// router that ran before the practice check would be reachable by any login.
router.use('/foods', require('./nutrition_foods'));
router.use('/', require('./nutrition_plans'));

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [tally, recent] = await Promise.all([
      P.counts(pool, req.company.id),
      P.patients(pool, req.company.id, {}),
    ]);
    res.render('nutrition_admin/dashboard', {
      tab: 'dashboard', tally,
      // Patients whose last reading is over 30 days old. That gap is the whole
      // business problem a dietitian has: people stop coming back quietly.
      lapsed: recent.filter((p) => p.last_seen
        && (Date.now() - new Date(p.last_seen).getTime()) > 30 * 86400000).slice(0, 10),
      never: recent.filter((p) => !p.readings).slice(0, 10),
      total: recent.length,
    });
  } catch (e) { console.error('[nutrition dashboard]', e.message); res.status(500).send('error'); }
});

// ── Patients ─────────────────────────────────────────────────────────────────
router.get('/patients', async (req, res) => {
  const archived = req.query.archived === '1';
  try {
    const [rows, tally] = await Promise.all([
      P.patients(pool, req.company.id, { q: req.query.q, archived }),
      P.counts(pool, req.company.id),
    ]);
    res.render('nutrition_admin/patients', {
      tab: 'patients', rows, tally, archived, q: req.query.q || '',
      activities: E.ACTIVITY_KEYS, goals: E.GOAL_KEYS,
      saved: req.query.saved === '1', err: req.query.err || null,
    });
  } catch (e) { console.error('[nutrition patients]', e.message); res.status(500).send('error'); }
});

router.post('/patients', async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (!name) return res.redirect('/nutrition/patients?err=required');
  const id = parseInt(b.id, 10);
  const vals = [
    name, text(b.phone, 30), text(b.email, 120),
    b.gender === 'male' || b.gender === 'female' ? b.gender : null,
    date(b.birth_date), num(b.height_cm),
    E.ACTIVITY_KEYS.includes(b.activity) ? b.activity : 'light',
    E.GOAL_KEYS.includes(b.goal) ? b.goal : 'maintain',
    // Blank means "follow the practice default", so it is stored as NULL
    // rather than as a copy of today's setting — a copy would stop following
    // the setting the day the dietitian changed it.
    num(b.protein_per_kg), num(b.fat_percent), num(b.target_weight_kg),
    text(b.notes, 1000),
  ];
  try {
    if (Number.isInteger(id)) {
      await pool.query(
        `UPDATE nutrition_patients SET name=$1, phone=$2, email=$3, gender=$4, birth_date=$5,
                height_cm=$6, activity=$7, goal=$8, protein_per_kg=$9, fat_percent=$10,
                target_weight_kg=$11, notes=$12
          WHERE id=$13 AND company_id=$14`, [...vals, id, req.company.id]);
      return res.redirect('/nutrition/patients/' + id + '?saved=1');
    }
    const r = await pool.query(
      `INSERT INTO nutrition_patients
         (name, phone, email, gender, birth_date, height_cm, activity, goal,
          protein_per_kg, fat_percent, target_weight_kg, notes, company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [...vals, req.company.id]);
    res.redirect('/nutrition/patients/' + r.rows[0].id + '?saved=1');
  } catch (e) {
    console.error('[nutrition patient save]', e.message);
    res.redirect('/nutrition/patients?err=save');
  }
});

// Archived, never deleted: a measurement history with no patient attached to it
// is not privacy, it is just data nobody can account for.
router.post('/patients/:id(\\d+)/archive', async (req, res) => {
  const on = (req.body || {}).restore === '1';
  try {
    await pool.query('UPDATE nutrition_patients SET is_active=$1 WHERE id=$2 AND company_id=$3',
      [on, parseInt(req.params.id, 10), req.company.id]);
  } catch (e) { console.error('[nutrition archive]', e.message); }
  res.redirect('/nutrition/patients' + (on ? '' : '?archived=1'));
});

// ── One patient ──────────────────────────────────────────────────────────────
router.get('/patients/:id(\\d+)', async (req, res) => {
  try {
    const data = await P.file(pool, req.company.id, parseInt(req.params.id, 10));
    if (!data) return res.redirect('/nutrition/patients');
    res.render('nutrition_admin/patient', {
      tab: 'patients', ...data,
      progress: P.progress(data.series, data.patient.target_weight_kg),
      activities: E.ACTIVITY_KEYS, goals: E.GOAL_KEYS,
      saved: req.query.saved === '1', err: req.query.err || null,
    });
  } catch (e) { console.error('[nutrition patient]', e.message); res.status(500).send('error'); }
});

// ── Measurements ─────────────────────────────────────────────────────────────
router.post('/patients/:id(\\d+)/measure', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  // A row with nothing measured on it is not a visit, it is a stray click.
  if (!num(b.weight_kg) && !num(b.body_fat_pct) && !num(b.waist_cm) && !num(b.muscle_kg)) {
    return res.redirect('/nutrition/patients/' + id + '?err=empty');
  }
  try {
    await pool.query(
      `INSERT INTO nutrition_measurements
         (company_id, patient_id, taken_on, weight_kg, body_fat_pct, waist_cm, muscle_kg, source, notes)
       VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6,$7,'clinic',$8)`,
      [req.company.id, id, date(b.taken_on), num(b.weight_kg), num(b.body_fat_pct),
        num(b.waist_cm), num(b.muscle_kg), text(b.notes, 300)]);
  } catch (e) { console.error('[nutrition measure]', e.message); }
  res.redirect('/nutrition/patients/' + id + '?saved=1');
});

// A reading is deleted, never edited. Correcting a weight by overwriting it
// makes the curve a claim rather than a record; a wrong entry is removed and
// the right one is added with its own date.
router.post('/patients/:id(\\d+)/measure/:mid(\\d+)/delete', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('DELETE FROM nutrition_measurements WHERE id=$1 AND patient_id=$2 AND company_id=$3',
      [parseInt(req.params.mid, 10), id, req.company.id]);
  } catch (e) { console.error('[nutrition measure del]', e.message); }
  res.redirect('/nutrition/patients/' + id);
});

// ── Labs ─────────────────────────────────────────────────────────────────────
router.post('/patients/:id(\\d+)/lab', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  const title = text(b.title, 120);
  if (!title) return res.redirect('/nutrition/patients/' + id + '?err=required');
  try {
    await pool.query(
      `INSERT INTO nutrition_labs (company_id, patient_id, taken_on, title, value, unit, notes)
       VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6,$7)`,
      [req.company.id, id, date(b.taken_on), title, text(b.value, 60), text(b.unit, 20), text(b.notes, 300)]);
  } catch (e) { console.error('[nutrition lab]', e.message); }
  res.redirect('/nutrition/patients/' + id + '?saved=1');
});

router.post('/patients/:id(\\d+)/lab/:lid(\\d+)/delete', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('DELETE FROM nutrition_labs WHERE id=$1 AND patient_id=$2 AND company_id=$3',
      [parseInt(req.params.lid, 10), id, req.company.id]);
  } catch (e) { console.error('[nutrition lab del]', e.message); }
  res.redirect('/nutrition/patients/' + id);
});

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    res.render('nutrition_admin/settings', {
      tab: 'settings', settings: await P.settings(pool, req.company.id),
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[nutrition settings]', e.message); res.status(500).send('error'); }
});

router.post('/settings', async (req, res) => {
  const b = req.body || {};
  // Clamped, because these two feed every target the system prints. A typo of
  // 18 instead of 1.8 would put a patient on 1,440g of protein a day.
  const protein = Math.min(4, Math.max(0.5, Number(b.protein_per_kg) || 1.8));
  const fat = Math.min(60, Math.max(10, Number(b.fat_percent) || 25));
  try {
    await pool.query(
      `INSERT INTO nutrition_settings
         (company_id, practice_name, about, address, phone, whatsapp, hours,
          booking_enabled, protein_per_kg, fat_percent, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (company_id) DO UPDATE SET
         practice_name=EXCLUDED.practice_name, about=EXCLUDED.about, address=EXCLUDED.address,
         phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp, hours=EXCLUDED.hours,
         booking_enabled=EXCLUDED.booking_enabled, protein_per_kg=EXCLUDED.protein_per_kg,
         fat_percent=EXCLUDED.fat_percent, updated_at=now()`,
      [req.company.id, text(b.practice_name, 120), text(b.about, 1500), text(b.address, 200),
        text(b.phone, 30), text(b.whatsapp, 30), text(b.hours, 200),
        b.booking_enabled === '1', protein, fat]);
  } catch (e) { console.error('[nutrition settings save]', e.message); }
  res.redirect('/nutrition/settings?saved=1');
});

module.exports = router;
