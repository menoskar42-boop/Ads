// Data access for the dietitian's portal.
//
// Queries live here rather than in the routes for one reason: every single one
// must be scoped by company_id, and a query that forgets it shows one
// practice another's patients. Keeping them in one file makes that reviewable
// in a sitting instead of scattered across six route handlers.
'use strict';

const E = require('./engine');
const engagement = require('./engagement');
const goalTools = require('./goals');

/** The practice's defaults, or the engine's if it has never saved any. */
async function settings(pool, companyId) {
  try {
    const r = await pool.query('SELECT * FROM nutrition_settings WHERE company_id=$1', [companyId]);
    return r.rows[0] || {};
  } catch (e) { return {}; }
}

async function patients(pool, companyId, { q, archived = false } = {}) {
  const params = [companyId];
  let where = 'p.company_id=$1 AND p.is_active = $' + params.push(!archived);
  if (q) where += ` AND p.name ILIKE $${params.push('%' + String(q).slice(0, 60) + '%')}`;
  // `last_activity` is the most recent thing the patient actually DID — a
  // weight, a diary line, a check-in. The patient who stopped logging is the
  // patient who stopped, and that is the one worth a phone call; before this
  // the list gave no signal at all about who had gone quiet.
  const r = await pool.query(
    `SELECT p.*,
            m.weight_kg AS last_weight, m.taken_on AS last_seen,
            (SELECT COUNT(*)::int FROM nutrition_measurements x WHERE x.patient_id = p.id) AS readings,
            GREATEST(
              COALESCE(m.taken_on::timestamptz, 'epoch'::timestamptz),
              COALESCE((SELECT MAX(created_at) FROM nutrition_diary d
                         WHERE d.patient_id = p.id AND d.kind = 'ate'), 'epoch'::timestamptz),
              COALESCE((SELECT MAX(updated_at) FROM nutrition_checkins c
                         WHERE c.patient_id = p.id), 'epoch'::timestamptz)
            ) AS last_activity
       FROM nutrition_patients p
       LEFT JOIN LATERAL (
         SELECT weight_kg, taken_on FROM nutrition_measurements
          WHERE patient_id = p.id ORDER BY taken_on DESC, id DESC LIMIT 1
       ) m ON true
      WHERE ${where}
      ORDER BY p.name LIMIT 500`, params);
  const CH = require('./checkin');
  const now = new Date();
  return r.rows.map((row) => {
    // 'epoch' means every source was empty: never logged, not "logged in 1970".
    const raw = row.last_activity && new Date(row.last_activity).getFullYear() > 1971
      ? row.last_activity : null;
    return Object.assign({}, row, { engagement: CH.engagement(raw, now) });
  });
}

async function counts(pool, companyId) {
  const r = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
            COUNT(*) FILTER (WHERE NOT is_active)::int AS archived
       FROM nutrition_patients WHERE company_id=$1`, [companyId]);
  return r.rows[0];
}

/**
 * Goals are shown with their own report history. The company and patient
 * predicates are repeated on both queries because a goal id is not ownership.
 */
async function goals(pool, companyId, patientId, { activeOnly = false, onDate = null } = {}) {
  const params = [companyId, patientId];
  let where = 'g.company_id=$1 AND g.patient_id=$2';
  if (activeOnly) {
    where += ` AND g.status='active' AND g.starts_on <= $${params.push(onDate)} AND g.ends_on >= $${params.push(onDate)}`;
  }
  const rows = (await pool.query(
    `SELECT g.* FROM nutrition_goals g
      WHERE ${where}
      ORDER BY CASE WHEN g.status='active' THEN 0 ELSE 1 END, g.starts_on DESC, g.id DESC
      LIMIT 50`, params)).rows;
  if (!rows.length) return [];
  const logs = (await pool.query(
    `SELECT * FROM nutrition_goal_logs
      WHERE company_id=$1 AND patient_id=$2 AND goal_id = ANY($3::int[])
      ORDER BY on_date, id`, [companyId, patientId, rows.map((g) => g.id)])).rows;
  return rows.map((goal) => goalTools.decorate(goal, logs.filter((log) => log.goal_id === goal.id)));
}

/**
 * What the active patients recorded in the current seven-day window.
 *
 * The window is calculated in SQL so it uses the database's calendar date,
 * just like the rows patients create with CURRENT_DATE. Every source is
 * company-scoped, including the active plan and its lines.
 */
async function weeklyEngagement(pool, companyId, days = engagement.DEFAULT_DAYS) {
  const windowDays = Math.max(1, Math.min(31, parseInt(days, 10) || engagement.DEFAULT_DAYS));
  const r = await pool.query(
    `WITH active AS (
       SELECT id, name, phone
         FROM nutrition_patients
        WHERE company_id=$1 AND is_active=true
     ),
     plan_lines AS (
       SELECT p.patient_id, COUNT(i.id)::int AS planned_items
         FROM nutrition_plans p
         LEFT JOIN nutrition_plan_items i
           ON i.plan_id=p.id AND i.company_id=$1
        WHERE p.company_id=$1 AND p.is_active=true
        GROUP BY p.patient_id
     ),
     checkin_days AS (
       SELECT patient_id, COUNT(DISTINCT on_date)::int AS checkin_days
         FROM nutrition_checkins
        WHERE company_id=$1
          AND on_date >= CURRENT_DATE - ($2::int - 1)
          AND on_date <= CURRENT_DATE
        GROUP BY patient_id
     ),
     diary_days AS (
       SELECT patient_id, COUNT(DISTINCT on_date)::int AS diary_days
         FROM nutrition_diary
        WHERE company_id=$1
          AND on_date >= CURRENT_DATE - ($2::int - 1)
          AND on_date <= CURRENT_DATE
          AND kind='ate'
        GROUP BY patient_id
     ),
     ticks AS (
       SELECT patient_id, COUNT(*)::int AS completed_ticks
         FROM nutrition_diary
        WHERE company_id=$1
          AND on_date >= CURRENT_DATE - ($2::int - 1)
          AND on_date <= CURRENT_DATE
          AND kind='tick' AND done=true
        GROUP BY patient_id
     ),
     touch_days AS (
       SELECT patient_id, on_date
         FROM nutrition_diary
        WHERE company_id=$1
          AND on_date >= CURRENT_DATE - ($2::int - 1)
          AND on_date <= CURRENT_DATE
       GROUP BY patient_id, on_date
       UNION
       SELECT patient_id, on_date
         FROM nutrition_checkins
        WHERE company_id=$1
          AND on_date >= CURRENT_DATE - ($2::int - 1)
          AND on_date <= CURRENT_DATE
       GROUP BY patient_id, on_date
     ),
     active_days AS (
       SELECT patient_id, COUNT(*)::int AS active_days
         FROM touch_days GROUP BY patient_id
     )
     SELECT a.id, a.name, a.phone,
            COALESCE(ad.active_days, 0)::int AS active_days,
            COALESCE(cd.checkin_days, 0)::int AS checkin_days,
            COALESCE(dd.diary_days, 0)::int AS diary_days,
            COALESCE(t.completed_ticks, 0)::int AS completed_ticks,
            COALESCE(pl.planned_items, 0)::int AS planned_items
       FROM active a
       LEFT JOIN active_days ad ON ad.patient_id=a.id
       LEFT JOIN checkin_days cd ON cd.patient_id=a.id
       LEFT JOIN diary_days dd ON dd.patient_id=a.id
       LEFT JOIN ticks t ON t.patient_id=a.id
       LEFT JOIN plan_lines pl ON pl.patient_id=a.id
      ORDER BY a.name`,
    [companyId, windowDays]
  );
  return engagement.sortForFollowUp(r.rows, windowDays);
}

/**
 * One patient, with everything the file page shows.
 * The engine result is computed here from the LATEST measurement, so the
 * targets on the page always follow the most recent weight rather than a
 * figure stored at some point and never revisited.
 */
async function file(pool, companyId, patientId) {
  const patient = (await pool.query(
    'SELECT * FROM nutrition_patients WHERE id=$1 AND company_id=$2', [patientId, companyId])).rows[0];
  if (!patient) return null;

  const [meas, labs, plans, login, prefs, subs] = await Promise.all([
    pool.query(
      `SELECT * FROM nutrition_measurements WHERE patient_id=$1 AND company_id=$2
        ORDER BY taken_on DESC, id DESC LIMIT 200`, [patientId, companyId]),
    pool.query(
      `SELECT * FROM nutrition_labs WHERE patient_id=$1 AND company_id=$2
        ORDER BY taken_on DESC, id DESC LIMIT 100`, [patientId, companyId]),
    pool.query(
      `SELECT p.*, (SELECT COUNT(*)::int FROM nutrition_plan_items i WHERE i.plan_id = p.id) AS lines
         FROM nutrition_plans p WHERE p.patient_id=$1 AND p.company_id=$2
        ORDER BY p.is_active DESC, p.start_date DESC, p.id DESC LIMIT 50`, [patientId, companyId]),
    pool.query(
      'SELECT id, login, is_active, last_login_at FROM nutrition_patient_users WHERE patient_id=$1 AND company_id=$2',
      [patientId, companyId]),
    settings(pool, companyId),
    // Newest first: the current period is the one the dietitian is looking at,
    // and the older rows are the history a renewal must not have erased.
    pool.query(
      `SELECT * FROM nutrition_subscriptions WHERE patient_id=$1 AND company_id=$2
        ORDER BY ends_on DESC, id DESC LIMIT 24`, [patientId, companyId]),
  ]);
  const patientGoals = await goals(pool, companyId, patientId);

  const latest = meas.rows[0] || null;
  const SUB = require('./subscription');
  const currentSub = subs.rows.find((x) => x.status === 'paid') || subs.rows[0] || null;
  return {
    patient,
    subscriptions: subs.rows,
    subscription: currentSub,
    subState: SUB.stateOf(currentSub, new Date()),
    subAccess: SUB.access(prefs, patient, currentSub, new Date()),
    measurements: meas.rows,
    labs: labs.rows,
    plans: plans.rows,
    goals: patientGoals,
    login: login.rows[0] || null,
    calc: E.compute(patient, latest, prefs),
    latest,
    // Oldest first, for a chart that reads left to right like time does.
    series: meas.rows.slice().reverse()
      .filter((m) => m.weight_kg != null)
      .map((m) => ({ on: String(m.taken_on).slice(0, 10), kg: Number(m.weight_kg) })),
  };
}

/** Weight change since the first reading and since the previous one. */
function progress(series, targetWeight) {
  if (!series || series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const target = Number(targetWeight) || null;
  return {
    total: E.round(last.kg - first.kg, 1),
    since: E.round(last.kg - prev.kg, 1),
    from: first.on, to: last.on,
    // Distance left to a goal the patient actually set. Without one there is
    // no "remaining" to report, and inventing a target would be a clinical
    // opinion the software is not entitled to.
    remaining: target ? E.round(last.kg - target, 1) : null,
  };
}

module.exports = { settings, patients, counts, weeklyEngagement, goals, file, progress };
