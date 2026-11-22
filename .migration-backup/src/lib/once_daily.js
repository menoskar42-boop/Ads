'use strict';
/**
 * "Run this once today" — decided by the database, not by the clock.
 *
 * The daily jobs were fired from a 30-minute timer that checked the hour:
 *
 *     if (h === 8) { sendDaily(); runExpiryAlerts(); }
 *
 * Hour 8 happens twice — 08:00 and 08:30 — so every gym owner got the same
 * renewal alert twice every morning, and so did every NeuroPilot user. The
 * timer was not wrong about the hour; the hour is simply not a thing that
 * happens once.
 *
 * And the fix cannot be a variable in this process. Autoscale runs more than
 * one instance, each with its own memory and its own timer, so an in-process
 * "already sent today" flag means "already sent today, by me".
 *
 * The claim is an INSERT with a unique key on (job, day). Exactly one caller —
 * on exactly one instance — gets a row back; everybody else gets nothing and
 * does nothing. The same shape as the offline POS sale and the duplicate
 * order: when two things must agree, they have to agree in the one place they
 * both can see.
 *
 * The day is Cairo's, not the server's: on a UTC host the calendar rolls at 2am
 * local, which would let the 8am job run twice in what a person would call one
 * day.
 */

/**
 * @param {import('pg').Pool} pool
 * @param {string} job  a stable name — the key the day is claimed under
 * @returns {Promise<boolean>} true for the one caller that may run
 */
async function claimToday(pool, job) {
  try {
    const r = await pool.query(
      `INSERT INTO app_meta (key, value)
       SELECT $1 || ':' || to_char((now() AT TIME ZONE 'Africa/Cairo')::date, 'YYYY-MM-DD'), '1'
       ON CONFLICT (key) DO NOTHING
       RETURNING key`,
      [job]
    );
    return r.rows.length > 0;
  } catch (e) {
    /* A claim that cannot be recorded must not silently become "yes" — that is
     * the duplicate this file exists to stop. It also must not become a
     * permanent "no": if app_meta is missing on a fresh database the daily jobs
     * would never run again and nothing would say why. Loud and skip: the job
     * is late by a day, and the log says so. */
    console.error('[once_daily] could not claim', job, '-', e.message);
    return false;
  }
}

/** Old claims are just noise once the day is gone. */
async function sweep(pool, keepDays = 30) {
  try {
    await pool.query(
      `DELETE FROM app_meta
        WHERE key LIKE '%:20%'
          AND updated_at < now() - ($1 || ' days')::interval`, [keepDays]);
  } catch (e) { /* housekeeping only */ }
}

module.exports = { claimToday, sweep };
