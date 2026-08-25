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
  -- Radiology has no company: OncoScan has its own doctor login (rad_doctors),
  -- and a study belongs to a doctor, not to a tenant. Writing the doctor's id
  -- into company_id would make one column mean two different things, so the
  -- system is named and company_id is allowed to be empty for those rows.
  ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS system TEXT NOT NULL DEFAULT 'clinic';
  ALTER TABLE ${TABLE} ALTER COLUMN company_id DROP NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_audit_system_actor
    ON ${TABLE} (system, actor_id, created_at DESC);
`;

/**
 * The client's address, as far as we can honestly tell behind a proxy.
 *
 * كانت بتاخد **أول** عنصر في `X-Forwarded-For` — واللي بيكتبه العميل بنفسه.
 * يعني سجل الوصول للبيانات الطبية كان بيسجّل العنوان اللي المُرسِل اختاره،
 * وسجل بيسجّل كلام المتّهم مش سجل. بقت من القراية المشتركة.
 */
function ipOf(req) {
  try {
    return String(require('../middleware/rateLimit').clientIp(req) || '').slice(0, 60) || null;
  } catch (e) {
    return (req && req.ip ? String(req.ip) : '').slice(0, 60) || null;
  }
}

/**
 * Record one action. Returns a promise that never rejects.
 *
 *   audit.log(pool, req, { entity: 'vitals', entityId: id, patientId: pid, action: 'create' });
 */
function log(pool, req, e) {
  const s = (req && req.session) || {};
  const system = (e && e.system) || 'clinic';
  const companyId = (req && req.company && req.company.id) || s.companyId || null;
  // Radiology passes its own actor because it has no company at all — a study
  // belongs to a doctor. Every other system identifies the tenant and derives
  // the actor from the session.
  const actorKind = e && e.actorKind ? e.actorKind
    : (s.staffId ? 'staff' : (s.clinicStaffId ? 'staff'
      : (s.foodStaffId ? 'staff' : (s.nutriStaffId ? 'staff'
        : (s.adminId ? 'admin' : 'company')))));
  const actorId = (e && Number.isInteger(e.actorId) ? e.actorId : null)
    || s.staffId || s.clinicStaffId || s.foodStaffId || s.nutriStaffId || s.adminId || companyId;

  // A row that names neither a tenant nor an actor cannot be read later, so it
  // is not worth writing.
  if (!pool || !e || !e.entity || !e.action || (!companyId && !actorId)) return Promise.resolve();

  return pool.query(
    `INSERT INTO ${TABLE}
       (company_id, system, actor_kind, actor_id, actor_label, entity, entity_id, patient_id, action, meta, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [companyId, String(system).slice(0, 20), actorKind, actorId,
      (e.actorLabel || s.staffName || s.companyName || null),
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
  // Radiology reads its own trail by doctor, since those rows have no company.
  if (companyId == null && o.system && Number.isInteger(o.actorId)) {
    params.length = 0;
    where = 'system = $' + params.push(String(o.system).slice(0, 20))
      + ' AND actor_id = $' + params.push(o.actorId);
  }
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
