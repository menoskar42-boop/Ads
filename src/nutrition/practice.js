// Data access for the dietitian's portal.
//
// Queries live here rather than in the routes for one reason: every single one
// must be scoped by company_id, and a query that forgets it shows one
// practice another's patients. Keeping them in one file makes that reviewable
// in a sitting instead of scattered across six route handlers.
'use strict';

const E = require('./engine');

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
  const r = await pool.query(
    `SELECT p.*,
            m.weight_kg AS last_weight, m.taken_on AS last_seen,
            (SELECT COUNT(*)::int FROM nutrition_measurements x WHERE x.patient_id = p.id) AS readings
       FROM nutrition_patients p
       LEFT JOIN LATERAL (
         SELECT weight_kg, taken_on FROM nutrition_measurements
          WHERE patient_id = p.id ORDER BY taken_on DESC, id DESC LIMIT 1
       ) m ON true
      WHERE ${where}
      ORDER BY p.name LIMIT 500`, params);
  return r.rows;
}

async function counts(pool, companyId) {
  const r = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
            COUNT(*) FILTER (WHERE NOT is_active)::int AS archived
       FROM nutrition_patients WHERE company_id=$1`, [companyId]);
  return r.rows[0];
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

  const [meas, labs, plans, login, prefs] = await Promise.all([
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
  ]);

  const latest = meas.rows[0] || null;
  return {
    patient,
    measurements: meas.rows,
    labs: labs.rows,
    plans: plans.rows,
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

module.exports = { settings, patients, counts, file, progress };
