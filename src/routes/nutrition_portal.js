// The patient's own portal, served on the practice's subdomain at /portal.
//
// Security shape, and why it is this shape:
//
// - The patient session is a DIFFERENT key from the practice session. Reusing
//   `companyId` would make a logged-in patient indistinguishable from the
//   dietitian to every guard in the app.
//
// - The session carries the company it was issued for, and every request
//   checks it against the subdomain being visited. Session cookies are
//   host-scoped by default, but this app sits behind a proxy that rewrites the
//   host, and "probably scoped" is not an argument to make about somebody
//   else's medical record. A session from practice A on practice B's
//   subdomain is dropped, not honoured.
//
// - The patient can only ever read their OWN row. There is no id in any URL
//   here — the id comes from the session, never from the request.
//
// - Every page is noindex and ad-free. This is a named person's health data.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const E = require('../nutrition/engine');
const diary = require('../nutrition/diary');
const checkin = require('../nutrition/checkin');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Slower than the staff limiter: a patient logs in from one phone a few times
// a week, so anything above this is not a patient having a bad morning.
const portalLimiter = rateLimit({ name: 'nutrition-portal', windowMs: 15 * 60000, max: 8 });

/** The practice whose subdomain we are on, or null if this is not one. */
function practiceOf(req) {
  const c = req.tenant;
  return c && c.page_type === 'nutrition' && c.is_active !== false ? c : null;
}

// Shared locals + the session-belongs-here check.
router.use((req, res, next) => {
  const practice = practiceOf(req);
  if (!practice) return next('router');
  req.practice = practice;
  res.locals.company = practice;
  res.locals.practice = practice;

  const sess = req.session && req.session.nutriPatient;
  // A session issued by another practice is not merely ignored — it is
  // cleared, so a stale cookie cannot keep being presented.
  if (sess && sess.companyId !== practice.id) {
    delete req.session.nutriPatient;
    return next();
  }
  req.patientId = sess ? sess.id : null;
  next();
});

function requirePatient(req, res, next) {
  if (req.patientId) return next();
  res.redirect('/portal/login');
}

// ── Login ────────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.patientId) return res.redirect('/portal');
  res.render('nutrition_portal/login', { err: req.query.err || null });
});

router.post('/login', portalLimiter, async (req, res) => {
  const b = req.body || {};
  const login = String(b.login || '').trim().slice(0, 120);
  const password = String(b.password || '');
  if (!login || !password) return res.redirect('/portal/login?err=bad');
  try {
    const u = (await pool.query(
      `SELECT u.*, p.is_active AS patient_active
         FROM nutrition_patient_users u
         JOIN nutrition_patients p ON p.id = u.patient_id
        WHERE u.company_id=$1 AND lower(u.login)=lower($2)`,
      [req.practice.id, login])).rows[0];

    // One message for every failure. Distinguishing "no such login" from
    // "wrong password" tells an attacker which of a practice's patients exist.
    const ok = u && u.is_active && u.patient_active && await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.redirect('/portal/login?err=bad');

    req.session.nutriPatient = { id: u.patient_id, companyId: req.practice.id };
    await pool.query('UPDATE nutrition_patient_users SET last_login_at=now() WHERE id=$1', [u.id]);
    res.redirect('/portal');
  } catch (e) {
    console.error('[nutrition portal login]', e.message);
    res.redirect('/portal/login?err=bad');
  }
});

router.post('/logout', (req, res) => {
  if (req.session) delete req.session.nutriPatient;
  res.redirect('/portal/login');
});

// ── Everything below needs a patient ─────────────────────────────────────────
router.use(requirePatient);

/**
 * …and, where the practice charges for the portal, a paid period.
 *
 * Mounted once so a page added later is covered by where it lives. Three things
 * it deliberately does NOT do:
 *
 *   · it does not run at all for a practice that has not switched charging on
 *     (the default, and the owner's standing rule);
 *   · it does not lock somebody out because a read failed or a date could not
 *     be parsed — a patient is looking at their own medical plan, and "unknown"
 *     is the wrong thing to fail closed on;
 *   · it never blocks LOGOUT, or the page that explains the situation, because
 *     a screen you cannot leave or understand is worse than a closed one.
 */
const SUB = require('../nutrition/subscription');
const SUB_FREE = ['/subscription', '/logout'];
router.use(async (req, res, next) => {
  if (SUB_FREE.some((p) => req.path === p || req.path.startsWith(p + '/'))) return next();
  try {
    const [pref, pat, sub] = await Promise.all([
      pool.query('SELECT subscription_enabled, subscription_price, subscription_months, subscription_since FROM nutrition_settings WHERE company_id=$1', [req.practice.id]),
      pool.query('SELECT id, created_at FROM nutrition_patients WHERE id=$1 AND company_id=$2', [req.patientId, req.practice.id]),
      pool.query(
        `SELECT * FROM nutrition_subscriptions WHERE patient_id=$1 AND company_id=$2 AND status='paid'
          ORDER BY ends_on DESC LIMIT 1`, [req.patientId, req.practice.id]),
    ]);
    const verdict = SUB.access(pref.rows[0], pat.rows[0], sub.rows[0], new Date());
    res.locals.subAccess = verdict;
    if (!verdict.allowed) return res.redirect('/portal/subscription');
  } catch (e) {
    // Fail OPEN, loudly in the log and silently on the screen.
    console.error('[portal subscription gate]', e.message);
  }
  next();
});

// The page the gate sends people to — and the only one it never guards.
router.get('/subscription', async (req, res) => {
  try {
    const [pref, sub] = await Promise.all([
      pool.query('SELECT * FROM nutrition_settings WHERE company_id=$1', [req.practice.id]),
      pool.query(
        'SELECT * FROM nutrition_subscriptions WHERE patient_id=$1 AND company_id=$2 ORDER BY ends_on DESC LIMIT 1',
        [req.patientId, req.practice.id]),
    ]);
    const settings = pref.rows[0] || {};
    // The ways this practice already accepts money. This screen does not invent
    // a payment method of its own — the merchant configured theirs once.
    let pay = { methods: [], instructions: null };
    try {
      pay = await require('../lib/payment_methods')
        .loadPaymentMethods(pool, req.practice, res.locals.t || ((k) => k));
    } catch (e) { console.error('[portal pay methods]', e.message); }
    res.render('nutrition_portal/subscription', {
      settings,
      price: SUB.priceOf(settings),
      months: Math.max(1, parseInt(settings.subscription_months, 10) || 1),
      sub: sub.rows[0] || null,
      state: SUB.stateOf(sub.rows[0], new Date()),
      methods: pay.methods, instructions: pay.instructions,
    });
  } catch (e) { console.error('[portal subscription]', e.message); res.status(500).send('error'); }
});

/** The patient's row, their active plan and its lines. Always scoped by BOTH
 *  the session's patient id and the practice — never by a request parameter. */
async function load(companyId, patientId, onDate) {
  const [patient, plan] = await Promise.all([
    pool.query('SELECT * FROM nutrition_patients WHERE id=$1 AND company_id=$2', [patientId, companyId]),
    pool.query(
      `SELECT * FROM nutrition_plans WHERE patient_id=$1 AND company_id=$2 AND is_active
        ORDER BY start_date DESC, id DESC LIMIT 1`, [patientId, companyId]),
  ]);
  const p = plan.rows[0] || null;
  const items = p ? (await pool.query(
    'SELECT * FROM nutrition_plan_items WHERE plan_id=$1 AND company_id=$2 ORDER BY sort_order, id',
    [p.id, companyId])).rows : [];
  const ticks = p ? (await pool.query(
    // Ticks only: the diary now also holds what was eaten, and those rows have
    // no plan item to tick.
    "SELECT item_id, done FROM nutrition_diary WHERE patient_id=$1 AND on_date=$2 AND company_id=$3 AND kind='tick'",
    [patientId, onDate, companyId])).rows : [];
  return {
    patient: patient.rows[0] || null,
    plan: p,
    items,
    done: new Set(ticks.filter((t) => t.done).map((t) => t.item_id)),
  };
}

const today = () => new Date().toISOString().slice(0, 10);

// ── Today ────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const day = today();
  try {
    const d = await load(req.practice.id, req.patientId, day);
    if (!d.patient) { delete req.session.nutriPatient; return res.redirect('/portal/login'); }

    const byMeal = {};
    E.MEALS.forEach((m) => { byMeal[m] = d.items.filter((i) => i.meal === m); });
    // What has actually been ticked, so the patient sees where they are rather
    // than only what was prescribed.
    const eaten = d.items.filter((i) => d.done.has(i.id));

    const lastWeight = (await pool.query(
      `SELECT weight_kg, taken_on FROM nutrition_measurements
        WHERE patient_id=$1 AND company_id=$2 AND weight_kg IS NOT NULL
        ORDER BY taken_on DESC, id DESC LIMIT 1`, [req.patientId, req.practice.id])).rows[0] || null;

    // ── The real diary (backlog 84) ─────────────────────────────────────
    //
    // What the patient ATE, not what they ticked. Rows carry their food when
    // one was picked, and nothing when the patient typed a line — so the day's
    // totals come back with a count of what they could NOT account for. A
    // total that quietly drops the free-text lines under-counts, and the
    // patient looks compliant on the screen the dietitian is reading.
    let ate = [];
    try {
      ate = (await pool.query(
        `SELECT dr.id, dr.meal, dr.grams, dr.free_text, dr.created_at,
                f.id AS food_id, f.name AS food_name, f.kcal, f.protein_g, f.carbs_g, f.fat_g
           FROM nutrition_diary dr
           LEFT JOIN nutrition_foods f ON f.id = dr.food_id
          WHERE dr.patient_id=$1 AND dr.company_id=$2 AND dr.on_date=$3 AND dr.kind='ate'
          ORDER BY dr.created_at`, [req.patientId, req.practice.id, day])).rows
        .map((r) => Object.assign({}, r, {
          food: r.food_id ? { kcal: r.kcal, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g } : null,
        }));
    } catch (e) { console.error('[nutrition diary read]', e.message); }

    // Today's check-in, if there is one. A day with nothing logged stays null
    // rather than becoming a row of zeros.
    let todayCheckin = null;
    try {
      todayCheckin = (await pool.query(
        'SELECT * FROM nutrition_checkins WHERE patient_id=$1 AND company_id=$2 AND on_date=$3',
        [req.patientId, req.practice.id, day])).rows[0] || null;
    } catch (e) { console.error('[nutrition checkin read]', e.message); }

    // The practice's food list, for picking instead of typing.
    let foods = [];
    try {
      foods = (await pool.query(
        `SELECT id, name, serving_desc, serving_g FROM nutrition_foods
          WHERE company_id=$1 AND is_active=true ORDER BY name LIMIT 400`, [req.practice.id])).rows;
    } catch (e) { console.error('[nutrition foods]', e.message); }

    res.render('nutrition_portal/today', {
      ...d, day, meals: E.MEALS, byMeal,
      planTotals: E.totals(d.items),
      eatenTotals: E.totals(eaten),
      ate, foods,
      ateByMeal: diary.byMeal(ate),
      ateTotals: diary.dayTotals(ate),
      diaryMeals: diary.MEALS,
      todayCheckin, checkinMoods: checkin.MOODS,
      lastWeight,
      loggedToday: lastWeight && String(lastWeight.taken_on).slice(0, 10) === day,
      saved: req.query.saved === '1', err: req.query.err || null,
    });
  } catch (e) { console.error('[nutrition portal]', e.message); res.status(500).send('error'); }
});

// ── Tick a meal item ─────────────────────────────────────────────────────────
router.post('/tick', async (req, res) => {
  const b = req.body || {};
  const itemId = parseInt(b.item_id, 10);
  const day = today();
  if (!Number.isInteger(itemId)) return res.redirect('/portal');
  try {
    // The item must belong to THIS patient's active plan. Without this check a
    // patient could tick a line from somebody else's plan by posting its id.
    const owns = (await pool.query(
      `SELECT i.id FROM nutrition_plan_items i
         JOIN nutrition_plans p ON p.id = i.plan_id
        WHERE i.id=$1 AND p.patient_id=$2 AND i.company_id=$3`,
      [itemId, req.patientId, req.practice.id])).rows[0];
    if (!owns) return res.redirect('/portal');

    // Toggle: the unique index on (patient, date, item) makes this one row.
    await pool.query(
      `INSERT INTO nutrition_diary (company_id, patient_id, on_date, meal, item_id, done)
       VALUES ($1,$2,$3,$4,$5,true)
       ON CONFLICT (patient_id, on_date, item_id) DO UPDATE SET done = NOT nutrition_diary.done`,
      // owns.id — the row the ownership query above actually confirmed.
      [req.practice.id, req.patientId, day, String(b.meal || 'breakfast').slice(0, 20), owns.id]);
  } catch (e) { console.error('[nutrition tick]', e.message); }
  res.redirect('/portal');
});

/**
 * سجّل أكلة — the entry that makes the diary a diary.
 *
 * A food from the practice's list with a quantity, or a line the patient typed.
 * Nothing is defaulted: a known food with no grams is refused rather than
 * counted at some invented portion, because an invented portion becomes a
 * calorie total somebody makes a decision from.
 */
router.post('/ate', async (req, res) => {
  const day = today();
  const entry = diary.readEntry(req.body);
  if (!entry.ok) return res.redirect('/portal?err=' + entry.why);
  try {
    // The food, if one was named, must be this practice's. An id from a form is
    // not a fact — and this list is per-practice.
    let foodId = null;
    if (entry.foodId) {
      const f = (await pool.query(
        'SELECT id FROM nutrition_foods WHERE id=$1 AND company_id=$2 AND is_active=true',
        [entry.foodId, req.practice.id])).rows[0];
      if (!f) return res.redirect('/portal?err=food');
      foodId = f.id;
    }
    await pool.query(
      `INSERT INTO nutrition_diary (company_id, patient_id, on_date, meal, kind, food_id, grams, free_text, done)
       VALUES ($1,$2,$3,$4,'ate',$5,$6,$7,true)`,
      [req.practice.id, req.patientId, day, entry.meal, foodId, entry.grams, entry.text]);
  } catch (e) {
    console.error('[nutrition ate]', e.message);
    return res.redirect('/portal?err=save');
  }
  res.redirect('/portal?saved=1');
});

// A diary entry is the patient's own record: they may remove what they wrote,
// and only what they wrote.
router.post('/ate/:id(\\d+)/delete', async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM nutrition_diary WHERE id=$1 AND patient_id=$2 AND company_id=$3 AND kind='ate'",
      [parseInt(req.params.id, 10), req.patientId, req.practice.id]);
  } catch (e) { console.error('[nutrition ate delete]', e.message); }
  res.redirect('/portal');
});

/**
 * تسجيل اليوم — water, sleep, steps, mood.
 *
 * One row per day: sending the form twice is a correction, not a second day.
 * Everything is optional and a blank stays NULL, because a day with no reading
 * is not a day of zero — an average that counts silence as zero makes a
 * patient look worse the less they use the app.
 */
router.post('/checkin', async (req, res) => {
  const day = today();
  const read = checkin.readCheckin(req.body);
  if (!read.ok) return res.redirect('/portal?err=' + read.why);
  const v = read.value;
  try {
    await pool.query(
      `INSERT INTO nutrition_checkins (company_id, patient_id, on_date, water_glasses, sleep_hours, steps, mood, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (patient_id, on_date) DO UPDATE SET
         water_glasses = COALESCE(EXCLUDED.water_glasses, nutrition_checkins.water_glasses),
         sleep_hours   = COALESCE(EXCLUDED.sleep_hours,   nutrition_checkins.sleep_hours),
         steps         = COALESCE(EXCLUDED.steps,         nutrition_checkins.steps),
         mood          = COALESCE(EXCLUDED.mood,          nutrition_checkins.mood),
         note          = COALESCE(EXCLUDED.note,          nutrition_checkins.note),
         updated_at    = now()`,
      [req.practice.id, req.patientId, day, v.water_glasses, v.sleep_hours, v.steps, v.mood, v.note]);
  } catch (e) {
    console.error('[nutrition checkin]', e.message);
    return res.redirect('/portal?err=save');
  }
  res.redirect('/portal?saved=1');
});

// ── Log today's weight ───────────────────────────────────────────────────────
router.post('/weigh', async (req, res) => {
  const w = Number((req.body || {}).weight_kg);
  // A human weight. Outside this range it is a typo or a joke, and either way
  // it would wreck the curve the dietitian reads.
  if (!(w >= 2 && w <= 400)) return res.redirect('/portal?err=weight');
  try {
    // source='patient' — a reading from a bathroom scale at home and one from
    // the clinic scale are not the same evidence, and the dietitian's page
    // labels them differently.
    await pool.query(
      `INSERT INTO nutrition_measurements (company_id, patient_id, taken_on, weight_kg, source)
       VALUES ($1,$2,CURRENT_DATE,$3,'patient')`,
      [req.practice.id, req.patientId, w]);
  } catch (e) { console.error('[nutrition weigh]', e.message); }
  res.redirect('/portal?saved=1');
});

// ── Progress ─────────────────────────────────────────────────────────────────
router.get('/progress', async (req, res) => {
  try {
    const rows = (await pool.query(
      `SELECT taken_on, weight_kg, source FROM nutrition_measurements
        WHERE patient_id=$1 AND company_id=$2 AND weight_kg IS NOT NULL
        ORDER BY taken_on`, [req.patientId, req.practice.id])).rows;
    const patient = (await pool.query(
      'SELECT * FROM nutrition_patients WHERE id=$1 AND company_id=$2',
      [req.patientId, req.practice.id])).rows[0];
    const series = rows.map((r) => ({ on: String(r.taken_on).slice(0, 10), kg: Number(r.weight_kg) }));
    res.render('nutrition_portal/progress', {
      patient, rows: rows.slice().reverse(), series,
      progress: require('../nutrition/practice').progress(series, patient && patient.target_weight_kg),
    });
  } catch (e) { console.error('[nutrition progress]', e.message); res.status(500).send('error'); }
});

module.exports = router;
