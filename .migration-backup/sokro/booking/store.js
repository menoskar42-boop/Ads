'use strict';

// Where a half-finished booking lives between two messages.
//
// The conversation table already stores the words; this stores the DECISIONS.
// They are not the same thing: a transcript has to be re-read and re-understood
// every turn (and re-understood differently, sometimes), while a row says what
// is known, what is missing, and how far along the confirmation it is.
//
// One open booking per conversation. Two would mean an answer landing in the
// wrong one, which is the failure this whole module exists to prevent.
const { Pool } = require('pg');

let pool = null;
function db() {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

const OPEN = ['collecting', 'reviewing', 'ready_for_confirmation', 'confirmed'];

async function open(userId, conversationId) {
  const r = await db().query(
    `SELECT * FROM sokro_bookings
      WHERE user_id=$1 AND conversation_id=$2 AND status = ANY($3::text[])
      ORDER BY id DESC LIMIT 1`,
    [userId, conversationId, OPEN]
  );
  return r.rows[0] || null;
}

async function create(userId, conversationId, kind, fields) {
  const r = await db().query(
    `INSERT INTO sokro_bookings (user_id, conversation_id, kind, status, fields)
     VALUES ($1,$2,$3,'collecting',$4::jsonb) RETURNING *`,
    [userId, conversationId, kind, JSON.stringify(fields || {})]
  );
  return r.rows[0];
}

/**
 * Save the merged fields and the new status — scoped in the same statement, so
 * a booking id from anywhere cannot be written by the wrong user.
 */
async function save(userId, id, { fields, status, site, fingerprint }) {
  const r = await db().query(
    `UPDATE sokro_bookings
        SET fields = COALESCE($3::jsonb, fields),
            status = COALESCE($4, status),
            site   = COALESCE($5, site),
            -- An explicit empty string clears it: an edit VOIDS a confirmation,
            -- and COALESCE alone would quietly keep the old yes.
            confirmed_fingerprint = CASE WHEN $6::text IS NULL THEN confirmed_fingerprint
                                         WHEN $6 = '' THEN NULL ELSE $6 END,
            confirmed_at = CASE WHEN $4 = 'confirmed' THEN now()
                                WHEN $6 = '' THEN NULL ELSE confirmed_at END,
            updated_at = now()
      WHERE id=$1 AND user_id=$2
      RETURNING *`,
    [id, userId, fields ? JSON.stringify(fields) : null, status || null, site || null,
      fingerprint === undefined ? null : String(fingerprint || '')]
  );
  return r.rows[0] || null;
}

/**
 * Mark it sent, ONCE.
 *
 * The claim is the same statement that checks the state, so two requests — a
 * double tap, a retry after a timeout — cannot both come back with a row and
 * both submit the booking. This is the one write in the module where being
 * late is better than being twice.
 */
async function claimForSubmit(userId, id, fingerprint) {
  const r = await db().query(
    `UPDATE sokro_bookings
        SET status='submitting', updated_at=now()
      WHERE id=$1 AND user_id=$2 AND status='confirmed' AND confirmed_fingerprint=$3
      RETURNING *`,
    [id, userId, fingerprint]
  );
  return r.rows[0] || null;
}
async function finishSubmit(userId, id, ok, result) {
  const status = ok ? 'submitted' : 'failed';
  const r = await db().query(
    `UPDATE sokro_bookings SET status=$3, submitted_at=CASE WHEN $3='submitted' THEN now() ELSE submitted_at END,
       updated_at=now() WHERE id=$1 AND user_id=$2 AND status='submitting' RETURNING *`,
    [id, userId, status]
  );
  return r.rows[0] || null;
}

module.exports = { open, create, save, claimForSubmit, finishSubmit, OPEN };
