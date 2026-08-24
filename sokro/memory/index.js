'use strict';

// ── Memory ───────────────────────────────────────────────────────────────────
// The system's recall layer: conversations + messages (short-term context),
// durable per-user context (long-term), and tasks + execution history (what was
// done and how it went). Pure data access — no LLM logic here. The planner reads
// buildContextWindow() before every response, and logs each step via logStep().
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Conversations & messages ──
async function createConversation(userId, title = null) {
  return (await pool.query(
    'INSERT INTO sokro_conversations (user_id, title) VALUES ($1,$2) RETURNING *',
    [userId, title]
  )).rows[0];
}
async function listConversations(userId, limit = 30) {
  return (await pool.query(
    'SELECT id, title, created_at, updated_at FROM sokro_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2',
    [userId, limit]
  )).rows;
}
async function addMessage(conversationId, role, content) {
  const m = (await pool.query(
    'INSERT INTO sokro_messages (conversation_id, role, content) VALUES ($1,$2,$3) RETURNING *',
    [conversationId, role, String(content)]
  )).rows[0];
  await pool.query('UPDATE sokro_conversations SET updated_at = now() WHERE id = $1', [conversationId]);
  return m;
}
// Ownership-safe write used by HTTP/channel entry points. INSERT ... SELECT
// makes the ownership check and insert one database statement, so a caller
// cannot append to a conversation it does not own.
async function addMessageFor(userId, conversationId, role, content) {
  const m = (await pool.query(
    `INSERT INTO sokro_messages (conversation_id, role, content)
     SELECT id, $3, $4 FROM sokro_conversations
      WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [conversationId, userId, role, String(content)]
  )).rows[0];
  if (!m) return null;
  await pool.query(
    'UPDATE sokro_conversations SET updated_at = now() WHERE id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  return m;
}
// Record a user/assistant turn atomically. The advisory lock closes the small
// race where two identical client retries both read the same previous turn.
async function addTurnFor(userId, conversationId, userContent, assistantContent) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const own = (await client.query(
      'SELECT 1 FROM sokro_conversations WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [conversationId, userId]
    )).rows[0];
    if (!own) { await client.query('ROLLBACK'); return null; }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [String(conversationId)]);
    const last = (await client.query(
      'SELECT role, content FROM sokro_messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 2',
      [conversationId]
    )).rows.reverse();
    if (last.length === 2 && last[0].role === 'user' && last[0].content === String(userContent)
        && last[1].role === 'assistant' && last[1].content === String(assistantContent)) {
      await client.query('COMMIT');
      return { duplicate: true };
    }
    await client.query(
      'INSERT INTO sokro_messages (conversation_id, role, content) VALUES ($1, $2, $3), ($1, $4, $5)',
      [conversationId, 'user', String(userContent), 'assistant', String(assistantContent)]
    );
    await client.query(
      'UPDATE sokro_conversations SET updated_at = now() WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    await client.query('COMMIT');
    return { duplicate: false };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}
async function getMessages(conversationId, limit = 20) {
  // Most recent `limit`, returned in chronological order.
  const rows = (await pool.query(
    'SELECT role, content, created_at FROM sokro_messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT $2',
    [conversationId, limit]
  )).rows;
  return rows.reverse();
}
// Ownership-safe fetch (used by the API).
async function getMessagesFor(userId, conversationId, limit = 50) {
  const own = (await pool.query('SELECT 1 FROM sokro_conversations WHERE id = $1 AND user_id = $2', [conversationId, userId])).rows[0];
  if (!own) return null;
  return getMessages(conversationId, limit);
}

// ── Durable user context (long-term, JSONB — shallow-merge on write) ──
async function getContext(userId) {
  const r = (await pool.query('SELECT data FROM sokro_user_context WHERE user_id = $1', [userId])).rows[0];
  return (r && r.data) || {};
}
async function mergeContext(userId, patch) {
  await pool.query(
    `INSERT INTO sokro_user_context (user_id, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET data = sokro_user_context.data || EXCLUDED.data, updated_at = now()`,
    [userId, JSON.stringify(patch || {})]
  );
  return getContext(userId);
}

// ── Tasks & execution history ──
async function createTask(userId, goal, conversationId = null) {
  return (await pool.query(
    'INSERT INTO sokro_tasks (user_id, goal, conversation_id) VALUES ($1,$2,$3) RETURNING *',
    [userId, String(goal), conversationId]
  )).rows[0];
}
async function updateTask(id, patch = {}) {
  const fields = [], vals = [];
  for (const k of ['status', 'plan', 'result']) {
    if (k in patch) { vals.push(k === 'status' ? patch[k] : JSON.stringify(patch[k])); fields.push(`${k} = $${vals.length}${k === 'status' ? '' : '::jsonb'}`); }
  }
  if (!fields.length) return;
  vals.push(id);
  await pool.query(`UPDATE sokro_tasks SET ${fields.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);
}
async function logStep(taskId, { step = 0, action = null, status, input = null, output = null, error = null }) {
  await pool.query(
    `INSERT INTO sokro_execution_history (task_id, step, action, status, input, output, error)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
    [taskId, step, action, status, input == null ? null : JSON.stringify(input), output == null ? null : JSON.stringify(output), error]
  );
}
async function getHistory(taskId) {
  return (await pool.query('SELECT * FROM sokro_execution_history WHERE task_id = $1 ORDER BY id', [taskId])).rows;
}

// ── Context window for the LLM (recent turns as {role, content}) ──
async function buildContextWindow(conversationId, limit = 20) {
  const msgs = await getMessages(conversationId, limit);
  return msgs.map((m) => ({ role: m.role, content: m.content }));
}

module.exports = {
  createConversation, listConversations, addMessage, addMessageFor, addTurnFor, getMessages, getMessagesFor,
  getContext, mergeContext,
  createTask, updateTask, logStep, getHistory,
  buildContextWindow,
};
