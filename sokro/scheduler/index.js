'use strict';

// ── Scheduler / Watchers ─────────────────────────────────────────────────────
// Recurring goals stored in the DB and executed when due. There are NO queues or
// background workers: a periodic external cron ping (or Replit Scheduled
// Deployment) hits POST /internal/cron, which calls runDue(). Each due task runs
// through the SAME planner + executor. Auto-runs never perform SENSITIVE actions
// (which need interactive consent) — those are skipped and flagged.
const { Pool } = require('pg');
const planner = require('../ai/planner');
const executor = require('../workflows/executor');
const registry = require('../registry');
const permissions = require('../permissions');
const memory = require('../memory');
const settings = require('../settings');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function create(userId, goal, everyMinutes) {
  const mins = Math.min(Math.max(parseInt(everyMinutes, 10) || 60, 5), 7 * 24 * 60); // 5min..7days
  return (await pool.query(
    `INSERT INTO sokro_scheduled_tasks (user_id, goal, every_minutes, next_run_at)
     VALUES ($1,$2,$3, now() + ($3 || ' minutes')::interval) RETURNING *`,
    [userId, String(goal), mins]
  )).rows[0];
}
async function list(userId) {
  return (await pool.query('SELECT * FROM sokro_scheduled_tasks WHERE user_id = $1 ORDER BY id DESC', [userId])).rows;
}
async function remove(userId, id) {
  await pool.query('DELETE FROM sokro_scheduled_tasks WHERE id = $1 AND user_id = $2', [parseInt(id, 10), userId]);
}

// Run all due tasks (called by the cron endpoint). Returns how many ran.
async function runDue(limit = 10) {
  const due = (await pool.query(
    'SELECT * FROM sokro_scheduled_tasks WHERE active AND next_run_at <= now() ORDER BY next_run_at LIMIT $1',
    [limit]
  )).rows;
  for (const s of due) {
    let lastResult;
    try {
      const prefs = await settings.get(s.user_id);
      const task = await memory.createTask(s.user_id, s.goal, null);
      const ctx = {
        userId: s.user_id, taskId: task.id, prefs,
        llm: require('../llm'), memory, browser: require('../browser'), actions: registry,
        log: () => {},
      };
      const plan = await planner.plan(ctx, s.goal);
      const perms = permissions.forPlan(plan, registry);
      if (perms.requiresConsent) {
        lastResult = { skipped: true, reason: 'requires consent (sensitive permissions)' };
      } else {
        const results = await executor.execute(ctx, plan);
        const summary = await planner.summarize(ctx, s.goal, results);
        lastResult = { ok: results.length > 0 && results.every((r) => r.result.ok), summary };
      }
    } catch (e) {
      lastResult = { error: e.message };
    }
    await pool.query(
      `UPDATE sokro_scheduled_tasks
       SET last_run_at = now(), next_run_at = now() + (every_minutes || ' minutes')::interval, last_result = $2::jsonb
       WHERE id = $1`,
      [s.id, JSON.stringify(lastResult)]
    );
  }
  return due.length;
}

module.exports = { create, list, remove, runDue };
