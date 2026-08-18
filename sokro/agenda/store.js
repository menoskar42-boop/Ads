'use strict';

// Persistence for agendas. Every statement is scoped to the owner IN THE
// STATEMENT — an agenda id from anywhere must never read or write somebody
// else's meeting.
const { Pool } = require('pg');
const A = require('./index');

let pool = null;
function db() {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

async function open(userId) {
  const r = await db().query(
    "SELECT * FROM sokro_agendas WHERE user_id=$1 AND status='open' ORDER BY id DESC LIMIT 1", [userId]);
  return r.rows[0] || null;
}

async function create(userId, title, whenAt) {
  const r = await db().query(
    `INSERT INTO sokro_agendas (user_id, title, when_at) VALUES ($1,$2,$3) RETURNING *`,
    [userId, A.clean(title) || 'الأجندة', whenAt || null]
  );
  return r.rows[0];
}

async function items(userId, agendaId) {
  const r = await db().query(
    'SELECT * FROM sokro_agenda_items WHERE agenda_id=$1 AND user_id=$2 ORDER BY position, id',
    [agendaId, userId]
  );
  return r.rows;
}

/**
 * Add a point.
 *
 * The unique index is what actually prevents a double — `ON CONFLICT DO
 * NOTHING` means two taps of "add" leave one row, and the caller is told which
 * happened rather than being shown a list that grew by two.
 */
async function addItem(userId, agendaId, text) {
  const value = A.clean(text);
  if (!value) return { added: false, why: 'empty' };
  const pos = (await db().query(
    'SELECT COALESCE(MAX(position),0)+1 AS p FROM sokro_agenda_items WHERE agenda_id=$1 AND user_id=$2',
    [agendaId, userId])).rows[0].p;
  const r = await db().query(
    `INSERT INTO sokro_agenda_items (agenda_id, user_id, text, item_key, position)
     SELECT $1,$2,$3,$4,$5 WHERE EXISTS (SELECT 1 FROM sokro_agendas WHERE id=$1 AND user_id=$2)
     ON CONFLICT (agenda_id, item_key) DO NOTHING
     RETURNING *`,
    [agendaId, userId, value, A.key(value), pos]
  );
  if (!r.rows[0]) return { added: false, why: 'duplicate' };
  return { added: true, item: r.rows[0] };
}

async function removeItem(userId, agendaId, id) {
  await db().query('DELETE FROM sokro_agenda_items WHERE id=$1 AND agenda_id=$2 AND user_id=$3',
    [parseInt(id, 10), agendaId, userId]);
  await renumber(userId, agendaId);
}

async function setDone(userId, id, done) {
  await db().query('UPDATE sokro_agenda_items SET done=$3 WHERE id=$1 AND user_id=$2',
    [parseInt(id, 10), userId, !!done]);
}

/** Close the gaps, in one statement, so no position is ever missing. */
async function renumber(userId, agendaId) {
  await db().query(
    `UPDATE sokro_agenda_items i SET position = r.rn
       FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) AS rn
               FROM sokro_agenda_items WHERE agenda_id=$1 AND user_id=$2) r
      WHERE i.id = r.id AND i.agenda_id=$1 AND i.user_id=$2`,
    [agendaId, userId]
  );
}

async function close(userId, agendaId) {
  await db().query("UPDATE sokro_agendas SET status='closed', updated_at=now() WHERE id=$1 AND user_id=$2",
    [agendaId, userId]);
}

module.exports = { open, create, items, addItem, removeItem, setDone, renumber, close };
