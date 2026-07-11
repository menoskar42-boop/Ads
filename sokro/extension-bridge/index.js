'use strict';

// ── Browser-extension bridge ─────────────────────────────────────────────────
// A command queue between the Sokro server and the user's Chrome extension. The
// server ENQUEUES a browser command; the extension POLLS for it, runs it in the
// user's live browser (already logged into their sites), and POSTS the result.
// This replaces server-side Chromium for login/booking/social actions.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Server side: enqueue a command and wait for the extension to return a result.
async function run(userId, kind, input, timeoutMs = 45000) {
  const cmd = (await pool.query(
    'INSERT INTO sokro_ext_commands (user_id, kind, input) VALUES ($1,$2,$3::jsonb) RETURNING id',
    [userId, kind, JSON.stringify(input || {})]
  )).rows[0];
  const deadline = timeoutMs;
  let waited = 0;
  while (waited < deadline) {
    await sleep(800); waited += 800;
    const r = (await pool.query('SELECT status, output, error FROM sokro_ext_commands WHERE id = $1', [cmd.id])).rows[0];
    if (r && r.status === 'done') return { ok: true, output: r.output };
    if (r && r.status === 'error') return { ok: false, error: r.error || 'extension error' };
  }
  await pool.query("UPDATE sokro_ext_commands SET status='error', error='timeout' WHERE id=$1 AND status IN ('pending','running')", [cmd.id]);
  return { ok: false, error: 'extension did not respond (is it connected?)' };
}

// Extension side: claim the oldest pending command for this user.
async function next(userId) {
  const r = (await pool.query(
    `UPDATE sokro_ext_commands SET status='running'
     WHERE id = (SELECT id FROM sokro_ext_commands WHERE user_id=$1 AND status='pending' ORDER BY id LIMIT 1)
     RETURNING id, kind, input`,
    [userId]
  )).rows[0];
  return r || null;
}

// Extension side: post a command's result back.
async function result(userId, id, output, error) {
  await pool.query(
    "UPDATE sokro_ext_commands SET status=$3, output=$4::jsonb, error=$5 WHERE id=$1 AND user_id=$2",
    [parseInt(id, 10), userId, error ? 'error' : 'done', JSON.stringify(output || null), error || null]
  );
}

// Has this user's extension polled recently? (drives extension-vs-Playwright.)
const _seen = new Map(); // userId -> ts
function markSeen(userId) { _seen.set(userId, Date.now()); }
function connected(userId) { const t = _seen.get(userId); return !!t && (Date.now() - t) < 60000; }

module.exports = { run, next, result, markSeen, connected };
