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
async function save(userId, id, { fields, status, site }) {
  const r = await db().query(
    `UPDATE sokro_bookings
        SET fields = COALESCE($3::jsonb, fields),
            status = COALESCE($4, status),
            site   = COALESCE($5, site),
            updated_at = now()
      WHERE id=$1 AND user_id=$2
      RETURNING *`,
    [id, userId, fields ? JSON.stringify(fields) : null, status || null, site || null]
  );
  return r.rows[0] || null;
}

module.exports = { open, create, save, OPEN };
