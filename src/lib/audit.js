'use strict';
/**
 * Who touched a patient's record, when, and what did they do.
 *
 * Three of the external reviews asked for this independently — the clinic, the
 * nutrition practice and the radiology tool. The reason is the same in all
 * three: the data is a named person's health record, and until now the system
 * could not answer "who deleted that reading" or "who opened this file" at all.
 * Not "answered it badly" — there was nothing to ask.
 *
 * Design decisions worth keeping:
 *
 * · **Append only.** No update, no delete, ever. A log a user can edit is a
 *   log that says whatever the last person to edit it wanted it to say. There
 *   is deliberately no route that removes a row.
 *
 * · **Never breaks the request.** Logging failure must not stop a doctor from
 *   recording a vital sign. Every call is fire-and-forget with its own catch,
 *   so a full disk or a missing table costs a console line, not a visit.
 *
 * · **What, not the contents.** The row says "prescription 91 was deleted from
 *   patient 12 by company 3". It does not copy the medication list into a
 *   second table — duplicating medical data to protect medical data is not a
 *   trade worth making. `meta` is for the small facts that make an entry
 *   readable (a count, a status change), not for the record itself.
 *
 * · **The actor is whoever the session says.** Staff accounts exist in the
 *   pharmacy already and are coming to the clinic (ج٤ in the QA plan); until
 *   then most rows name the company. The column is there so those rows do not
 *   have to be rewritten later.
 */

const TABLE = 'medical_audit_log';

/** DDL — called from the app's schema bootstrap. */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    actor_kind TEXT NOT NULL DEFAULT 'company',
    actor_id INTEGER,
    actor_label TEXT,
    entity TEXT NOT NULL,
    entity_id INTEGER,
    patient_id INTEGER,
    action TEXT NOT NULL,
    meta JSONB,
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_audit_company_time ON ${TABLE} (company_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_patient ON ${TABLE} (company_id, patient_id, created_at DESC);
`;

/** The client's address, as far as we can honestly tell behind a proxy. */
function ipOf(req) {
  const fwd = req && req.headers && req.headers['x-forwarded-for'];
  const first = typeof fwd === 'string' ? fwd.split(',')[0].trim() : null;
  return (first || (req && req.ip) || '').slice(0, 60) || null;
}

/**
 * Record one action. Returns a promise that never rejects.
 *
 *   audit.log(pool, req, { entity: 'vitals', entityId: id, patientId: pid, action: 'create' });
 */
function log(pool, req, e) {
  const companyId = (req && req.company && req.company.id)
    || (req && req.session && req.session.companyId) || null;
  if (!pool || !companyId || !e || !e.entity || !e.action) return Promise.resolve();

  const s = (req && req.session) || {};
  // A staff login names the person; a plain company login names the account.
  const actorKind = s.staffId ? 'staff' : (s.adminId ? 'admin' : 'company');
  const actorId = s.staffId || s.adminId || companyId;

  return pool.query(
    `INSERT INTO ${TABLE}
       (company_id, actor_kind, actor_id, actor_label, entity, entity_id, patient_id, action, meta, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [companyId, actorKind, actorId,
      (s.staffName || s.companyName || null),
      String(e.entity).slice(0, 40),
      Number.isInteger(e.entityId) ? e.entityId : null,
      Number.isInteger(e.patientId) ? e.patientId : null,
      String(e.action).slice(0, 30),
      e.meta ? JSON.stringify(e.meta).slice(0, 4000) : null,
      ipOf(req)]
  ).catch((err) => {
    // Deliberately swallowed: a doctor recording a blood pressure must not be
    // stopped because the log could not be written.
    console.error('[audit]', e.entity, e.action, err.message);
  });
}

/** The company's own trail, newest first. Optionally one patient's. */
async function recent(pool, companyId, opts) {
  const o = opts || {};
  const params = [companyId];
  let where = 'company_id = $1';
  if (Number.isInteger(o.patientId)) where += ' AND patient_id = $' + params.push(o.patientId);
  if (o.entity) where += ' AND entity = $' + params.push(String(o.entity).slice(0, 40));
  const limit = Math.min(500, Math.max(1, parseInt(o.limit, 10) || 200));
  const r = await pool.query(
    `SELECT * FROM ${TABLE} WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ${limit}`,
    params
  );
  return r.rows;
}

module.exports = { log, recent, SCHEMA, TABLE };
