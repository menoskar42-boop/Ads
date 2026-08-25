'use strict';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function record(userId, event, data = {}) {
  return (await pool.query(
    `INSERT INTO sokro_consent_audit (user_id, event, task_id, permissions, domains, outcome)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6) RETURNING id`,
    [userId, event, data.taskId || null, JSON.stringify(data.permissions || []), JSON.stringify(data.domains || []), data.outcome || null]
  )).rows[0];
}
async function list(userId, limit = 50) {
  return (await pool.query(
    `SELECT id,event,task_id,permissions,domains,outcome,created_at
       FROM sokro_consent_audit WHERE user_id=$1 ORDER BY id DESC LIMIT $2`,
    [userId, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100)]
  )).rows;
}
module.exports = { record, list };