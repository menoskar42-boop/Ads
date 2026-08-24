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
const timeParser = require('../time-parser');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * A moment, or a rhythm.
 *
 * «فكّرني الساعة ٥» is a moment. Expressing it as "every N minutes" — the only
 * shape this had — means it keeps firing after the thing it was about has
 * happened, and the user turns the reminders off. So a one-shot is its own kind
 * and deactivates itself when it runs.
 */
function parseWhen(opts) {
  const o = opts && typeof opts === 'object' ? opts : { everyMinutes: opts };
  if (o.whenText || o.when) return timeParser.parseNatural(o.whenText || o.when, new Date(), o.timezone);
  const at = o.runAt || o.at;
  if (at) {
    const t = new Date(at);
    if (!Number.isFinite(t.getTime())) return { error: 'bad_time' };
    // A time in the past is a typo, not a reminder that fires immediately.
    if (t.getTime() < Date.now() - 60000) return { error: 'past' };
    return { kind: 'once', runAt: t };
  }
  const mins = Math.min(Math.max(parseInt(o.everyMinutes, 10) || 60, 5), 7 * 24 * 60); // 5min..7days
  return { kind: 'recurring', everyMinutes: mins };
}

async function create(userId, goal, opts, title) {
  const when = parseWhen(opts);
  if (when.error) return { error: when.error };
  if (when.kind === 'once') {
    return (await pool.query(
      `INSERT INTO sokro_scheduled_tasks (user_id, goal, kind, title, every_minutes, next_run_at)
       VALUES ($1,$2,'once',$3,NULL,$4) RETURNING *`,
      [userId, String(goal), title || null, when.runAt.toISOString()]
    )).rows[0];
  }
  return (await pool.query(
     `INSERT INTO sokro_scheduled_tasks (user_id, goal, kind, title, every_minutes, next_run_at)
      VALUES ($1,$2,'recurring',$3,$4, now() + make_interval(mins => $4)) RETURNING *`,
    [userId, String(goal), title || null, when.everyMinutes]
  )).rows[0];
}

/**
 * What happens to a schedule row after it has run.
 *
 * Pure, so the rule can be tested: a one-shot is DONE (it must not linger as an
 * active row that fires again), and a repeating task moves on by its own
 * interval rather than by "now + whatever the last run took".
 */
function afterRun(row, now) {
  const at = now instanceof Date ? now : new Date();
  if ((row && row.kind) === 'once') return { active: false, nextRunAt: null };
  const mins = Math.max(5, parseInt(row && row.every_minutes, 10) || 60);
  return { active: true, nextRunAt: new Date(at.getTime() + mins * 60000) };
}

/**
 * Hand the result to the user.
 *
 * The scheduler used to run a task and write the outcome into its own row —
 * and a row is not a channel. Two places now, both of which the app shows: the
 * notifications inbox (survives a closed app) and the conversation itself.
 */
async function deliver(db, userId, { title, body, meta }) {
  const text = String(body || '').slice(0, 4000);
  const row = (await db.query(
    `INSERT INTO sokro_notifications (user_id, source, title, body, meta)
     VALUES ($1,'schedule',$2,$3,$4::jsonb) RETURNING id`,
    [userId, title || null, text, JSON.stringify(meta || {})]
  )).rows[0];
  return row;
}
async function list(userId) {
  return (await pool.query('SELECT * FROM sokro_scheduled_tasks WHERE user_id = $1 ORDER BY id DESC', [userId])).rows;
}
async function remove(userId, id) {
  await pool.query('DELETE FROM sokro_scheduled_tasks WHERE id = $1 AND user_id = $2', [parseInt(id, 10), userId]);
}

// Run all due tasks (called by the cron endpoint). Returns how many ran.
async function runDue(limit = 10) {
  // Claim in the same statement that selects. A plain SELECT ... FOR UPDATE
  // would release its lock as soon as the query ends, before the async planner
  // work below finishes, allowing a second cron request to run the same row.
  const due = (await pool.query(
    `WITH due AS (
      SELECT id FROM sokro_scheduled_tasks
       WHERE active AND next_run_at <= now()
       ORDER BY next_run_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
    )
    UPDATE sokro_scheduled_tasks AS s
       SET next_run_at = now() + interval '1 hour'
      FROM due
     WHERE s.id = due.id
    RETURNING s.*`,
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
    // The user hears about it. A reminder that only updated a database row is
    // the failure this whole item is about.
    try {
      const title = s.title || (s.kind === 'once' ? 'تذكير' : 'مهمة مجدولة');
      const body = (lastResult && lastResult.summary && (lastResult.summary.summary || lastResult.summary))
        || (lastResult && lastResult.reason)
        || (lastResult && lastResult.error ? ('مامشيش: ' + lastResult.error) : s.goal);
      await deliver(pool, s.user_id, { title, body: String(body), meta: { scheduleId: s.id, goal: s.goal } });
      if (memory && memory.createConversation && memory.addMessage) {
        const conv = await memory.createConversation(s.user_id, title.slice(0, 60));
        await memory.addMessage(conv.id, 'assistant', String(body));
      }
    } catch (_) { /* delivery must not lose the schedule bookkeeping below */ }

    const after = afterRun(s, new Date());
    await pool.query(
      `UPDATE sokro_scheduled_tasks
       SET last_run_at = now(), next_run_at = COALESCE($3::timestamptz, next_run_at),
           active = $4, last_result = $2::jsonb
       WHERE id = $1`,
      [s.id, JSON.stringify(lastResult), after.nextRunAt ? after.nextRunAt.toISOString() : null, after.active]
    );
  }
  return due.length;
}

/** The inbox the app reads. Unread first, newest first. */
async function notifications(userId, limit = 20) {
  return (await pool.query(
    'SELECT id, source, title, body, meta, read_at, created_at FROM sokro_notifications WHERE user_id=$1 ORDER BY id DESC LIMIT $2',
    [userId, Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100)]
  )).rows;
}
async function markRead(userId, id) {
  // Scoped in the same statement: an id from anywhere cannot mark somebody
  // else's reminder as seen.
  await pool.query('UPDATE sokro_notifications SET read_at = now() WHERE id=$1 AND user_id=$2 AND read_at IS NULL',
    [parseInt(id, 10), userId]);
}

module.exports = { create, list, remove, runDue, parseWhen, afterRun, deliver, notifications, markRead };
