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
const { ownerGuard } = require('../lib/tenant_scope');
const staffScope = require('../lib/staff_scope');
const nutriPerms = require('../nutrition/perms');
const bcrypt = require('bcryptjs');
const audit = require('../lib/audit');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const M = require('../lib/money');

// A clinical figure that was typed but could not be read is not a blank. Both
// used to come back as `null`: «٧٥» on an Arabic keyboard, «75 كجم», and an
// empty box were the same thing, and the row saved without the reading.
// `optional` keeps "blank means follow the default"; `bad` is what the screen
// has to say instead of saving a silence.
const num = (v) => { const r = M.read(v); return r.ok && r.value > 0 ? r.value : null; };
const bad = (v) => String(v == null ? '' : v).trim() !== '' && !M.read(v).ok;

// Codes the server chose. Printing `req.query.err` would let a link write the
// words on a dietitian's screen.
const NT_ERRORS = ['required', 'save', 'empty', 'unreadable', 'login_taken',
  'no_name', 'username', 'line', 'not_empty'];
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const text = (v, max) => String(v || '').trim().slice(0, max) || null;

/**
 * The one-time password handover.
 *
 * Tied to the patient id it was created for, so a stale flash cannot surface
 * on a different patient's page, and deleted on read so a refresh does not
 * show it again.
 */
function takeFlashPassword(req, patientId) {
  const f = req.session && req.session.nutriPw;
  if (!f) return null;
  delete req.session.nutriPw;
  return f.id === patientId ? String(f.password).slice(0, 32) : null;
}

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
    // Who is on this screen — the dietitian, or the assistant with the scale,
    // or somebody on the phone. Computed once so no route has to.
    const perms = nutriPerms.permsFor(req.session);
    req.perms = perms;
    res.locals.perms = perms;
    next();
  } catch (e) {
    console.error('[nutrition admin]', e.message);
    res.redirect('/company/login');
  }
}
// staffScope keeps another system's staff out entirely; nutriPerms.guard()
// decides what this practice's own roles reach, from the path prefix.
router.use(requireLogin, staffScope.only('/nutrition'), requirePractice, nutriPerms.guard());

// Everything under /patients/<number>/ writes to a named person's health
// record. The number is whatever the browser sent, and the measurement and lab
// inserts below paired it with company_id from the session without checking
// they belong together — so editing the address bar wrote a weight or a blood
// result onto another practice's patient. One guard on the prefix covers every
// route under it, including ones added later.
router.use('/patients/:id(\\d+)', ownerGuard(pool, 'nutrition_patients', '/nutrition/patients'));

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
      saved: req.query.saved === '1',
      err: NT_ERRORS.includes(req.query.err) ? req.query.err : null,
    });
  } catch (e) { console.error('[nutrition patients]', e.message); res.status(500).send('error'); }
});

router.post('/patients', async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (!name) return res.redirect('/nutrition/patients?err=required');
  const id = parseInt(b.id, 10);
  if (['height_cm', 'protein_per_kg', 'fat_percent', 'target_weight_kg'].some((f) => bad(b[f]))) {
    return res.redirect('/nutrition/patients?err=unreadable');
  }
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
    audit.log(pool, req, { entity: 'patient', entityId: parseInt(req.params.id, 10),
      patientId: parseInt(req.params.id, 10), action: 'view' });
    res.render('nutrition_admin/patient', {
      tab: 'patients', ...data,
      progress: P.progress(data.series, data.patient.target_weight_kg),
      activities: E.ACTIVITY_KEYS, goals: E.GOAL_KEYS,
      // Shown once and never again — it exists only as a hash from here on.
      // Read once and gone. It used to arrive as ?pw=… — which puts a patient's
      // password in the browser history, in the address bar over someone's
      // shoulder, in the Referer header of the next request, and in any proxy
      // or server log that records URLs. A flash in the session shows it on
      // exactly one render and leaves no copy anywhere.
      newPassword: takeFlashPassword(req, parseInt(req.params.id, 10)),
      portalUrl: 'https://' + req.company.slug + '.oscardevs.com/portal',
      saved: req.query.saved === '1',
      err: NT_ERRORS.includes(req.query.err) ? req.query.err : null,
    });
  } catch (e) { console.error('[nutrition patient]', e.message); res.status(500).send('error'); }
});

// ── Measurements ─────────────────────────────────────────────────────────────
router.post('/patients/:id(\\d+)/measure', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  // Typed but unreadable is refused before anything is written: a visit that
  // records three of the four figures and drops the fourth in silence is worse
  // than one that asks the dietitian to type it again.
  if (['weight_kg', 'body_fat_pct', 'waist_cm', 'muscle_kg'].some((f) => bad(b[f]))) {
    return res.redirect('/nutrition/patients/' + id + '?err=unreadable');
  }
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
    audit.log(pool, req, { entity: 'measurement', patientId: id, action: 'create' });
  } catch (e) {
    console.error('[nutrition measure]', e.message);
    return res.redirect('/nutrition/patients/' + id + '?err=save');
  }
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
    audit.log(pool, req, { entity: 'measurement', entityId: parseInt(req.params.mid, 10), patientId: id, action: 'delete' });
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
    audit.log(pool, req, { entity: 'lab', patientId: id, action: 'create', meta: { title } });
  } catch (e) { console.error('[nutrition lab]', e.message); }
  res.redirect('/nutrition/patients/' + id + '?saved=1');
});

router.post('/patients/:id(\\d+)/lab/:lid(\\d+)/delete', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('DELETE FROM nutrition_labs WHERE id=$1 AND patient_id=$2 AND company_id=$3',
      [parseInt(req.params.lid, 10), id, req.company.id]);
    audit.log(pool, req, { entity: 'lab', entityId: parseInt(req.params.lid, 10), patientId: id, action: 'delete' });
  } catch (e) { console.error('[nutrition lab del]', e.message); }
  res.redirect('/nutrition/patients/' + id);
});

// ── Printable report ─────────────────────────────────────────────────────────
//
// The sheet the patient walks out with. Browser print is the whole PDF story
// here: "Save as PDF" is in every print dialogue on every platform, and a
// server-side PDF renderer would be a large dependency producing a worse
// result — no selectable Arabic text, no reflow, one more thing to break.
router.get('/patients/:id(\\d+)/report', async (req, res) => {
  try {
    const data = await P.file(pool, req.company.id, parseInt(req.params.id, 10));
    if (!data) return res.redirect('/nutrition/patients');
    const active = data.plans.find((x) => x.is_active) || null;
    const items = active ? (await pool.query(
      'SELECT * FROM nutrition_plan_items WHERE plan_id=$1 AND company_id=$2 ORDER BY sort_order, id',
      [active.id, req.company.id])).rows : [];
    const byMeal = {};
    E.MEALS.forEach((m) => { byMeal[m] = items.filter((i) => i.meal === m); });

    res.render('nutrition_admin/report', {
      tab: 'patients', ...data,
      settings: await P.settings(pool, req.company.id),
      progress: P.progress(data.series, data.patient.target_weight_kg),
      plan: active, items, meals: E.MEALS, byMeal,
      dayTotals: E.totals(items),
      mealTotals: Object.fromEntries(E.MEALS.map((m) => [m, E.totals(byMeal[m])])),
      printedOn: new Date().toISOString().slice(0, 10),
    });
  } catch (e) { console.error('[nutrition report]', e.message); res.status(500).send('error'); }
});

// ── The patient's login ──────────────────────────────────────────────────────
//
// The dietitian sets it, and the password is shown ONCE, right after it is
// created. It is stored only as a bcrypt hash, so there is no screen anywhere
// that can show it again — which is the point. Resetting issues a new one.
router.post('/patients/:id(\\d+)/login', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  const login = text(b.login, 120);
  if (!login) return res.redirect('/nutrition/patients/' + id + '?err=required');
  try {
    const patient = (await pool.query(
      'SELECT id FROM nutrition_patients WHERE id=$1 AND company_id=$2', [id, req.company.id])).rows[0];
    if (!patient) return res.redirect('/nutrition/patients');

    // Generated, not typed. A dietitian choosing passwords for forty patients
    // picks the clinic's phone number forty times.
    const password = require('crypto').randomBytes(6).toString('base64url').slice(0, 8);
    const hash = await require('bcryptjs').hash(password, 10);
    await pool.query(
      `INSERT INTO nutrition_patient_users (company_id, patient_id, login, password_hash)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (patient_id) DO UPDATE SET login=EXCLUDED.login,
              password_hash=EXCLUDED.password_hash, is_active=true`,
      [req.company.id, id, login, hash]);
    // Handed over in the session, not the URL. Shown once on the next render.
    audit.log(pool, req, { entity: 'patient_login', patientId: id, action: 'reset_password' });
    req.session.nutriPw = { id, password };
    res.redirect('/nutrition/patients/' + id);
  } catch (e) {
    console.error('[nutrition patient login]', e.message);
    res.redirect('/nutrition/patients/' + id + '?err=login_taken');
  }
});

router.post('/patients/:id(\\d+)/login/disable', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query(
      'UPDATE nutrition_patient_users SET is_active=false WHERE patient_id=$1 AND company_id=$2',
      [id, req.company.id]);
  } catch (e) { console.error('[nutrition login disable]', e.message); }
  res.redirect('/nutrition/patients/' + id);
});

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    res.render('nutrition_admin/settings', {
      tab: 'settings', settings: await P.settings(pool, req.company.id),
      saved: req.query.saved === '1',
      err: NT_ERRORS.includes(req.query.err) ? req.query.err : null,
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
  } catch (e) {
    console.error('[nutrition settings save]', e.message);
    return res.redirect('/nutrition/settings?err=save');
  }
  res.redirect('/nutrition/settings?saved=1');
});

// ── Practice staff ───────────────────────────────────────────────────────────
/* The assistant with the scale, and whoever answers the phone.
 *
 * Both used to sign in as the dietitian, because there was no other way in —
 * which put a blood panel and a treatment plan one click from the front desk.
 * Only the dietitian reaches this screen (`staff` is owner-only in perms.js).
 */
router.get('/staff', async (req, res) => {
  try {
    const staff = (await pool.query(
      `SELECT id, name, username, perm_role, phone, login_enabled, is_active
         FROM nutrition_staff WHERE company_id=$1 ORDER BY is_active DESC, id`,
      [req.company.id])).rows;
    res.render('nutrition_admin/staff', {
      tab: 'staff', staff, roles: nutriPerms.ROLE_KEYS, ROLES: nutriPerms.ROLES,
      saved: req.query.saved === '1',
      err: NT_ERRORS.includes(req.query.err) ? req.query.err : null,
    });
  } catch (e) { console.error('[nutrition staff]', e.message); res.status(500).send('error'); }
});

router.post('/staff', async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (!name) return res.redirect('/nutrition/staff?err=no_name');
  const role = nutriPerms.ROLE_KEYS.includes(b.perm_role) ? b.perm_role : 'reception';
  try {
    await pool.query(
      'INSERT INTO nutrition_staff (company_id, name, perm_role, phone) VALUES ($1,$2,$3,$4)',
      [req.company.id, name, role, text(b.phone, 30)]);
  } catch (e) {
    console.error('[nutrition staff add]', e.message);
    return res.redirect('/nutrition/staff?err=save');
  }
  audit.log(pool, req, { entity: 'staff', action: 'create', meta: { role } });
  res.redirect('/nutrition/staff?saved=1');
});

router.post('/staff/:id(\\d+)/login', async (req, res) => {
  const cid = req.company.id, sid = parseInt(req.params.id, 10);
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase().slice(0, 60);
  const role = nutriPerms.ROLE_KEYS.includes(b.perm_role) ? b.perm_role : 'reception';
  const enabled = b.login_enabled === '1';
  try {
    if (!username) {
      // No username, no account — the row stays a name on the rota.
      await pool.query(
        'UPDATE nutrition_staff SET username=NULL, password_hash=NULL, login_enabled=false, perm_role=$1 WHERE id=$2 AND company_id=$3',
        [role, sid, cid]);
      audit.log(pool, req, { entity: 'staff', entityId: sid, action: 'update', meta: { login: 'removed' } });
      return res.redirect('/nutrition/staff?saved=1');
    }
    const password = String(b.password || '');
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE nutrition_staff SET username=$1, password_hash=$2, perm_role=$3, login_enabled=$4 WHERE id=$5 AND company_id=$6',
        [username, hash, role, enabled, sid, cid]);
    } else {
      // Blank keeps the old password: changing a role should not require
      // knowing it.
      await pool.query(
        'UPDATE nutrition_staff SET username=$1, perm_role=$2, login_enabled=$3 WHERE id=$4 AND company_id=$5',
        [username, role, enabled, sid, cid]);
    }
    audit.log(pool, req, { entity: 'staff', entityId: sid, action: 'update',
      meta: { role, login_enabled: enabled, password_changed: !!password } });
    res.redirect('/nutrition/staff?saved=1');
  } catch (e) {
    console.error('[nutrition staff login]', e.message);
    res.redirect('/nutrition/staff?err=username');
  }
});

router.post('/staff/:id(\\d+)/delete', async (req, res) => {
  const sid = parseInt(req.params.id, 10);
  try {
    await pool.query('DELETE FROM nutrition_staff WHERE id=$1 AND company_id=$2', [sid, req.company.id]);
  } catch (e) { console.error('[nutrition staff delete]', e.message); }
  audit.log(pool, req, { entity: 'staff', entityId: sid, action: 'delete' });
  res.redirect('/nutrition/staff?saved=1');
});

module.exports = router;
