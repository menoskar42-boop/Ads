'use strict';

const { Pool } = require('pg');
const push = require('../lib/push');
const { sendWorkshopReminderHealthAlert } = require('../lib/mailer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const STALE_AFTER_MS = 15 * 60 * 1000;
const NO_RUN_GRACE_MS = 30 * 60 * 1000;

function ageMs(value, now) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? Math.max(0, now.getTime() - time) : Infinity;
}

/**
 * Detect a stopped reminder worker without depending on the worker creating
 * another run row. Only company ids and aggregate timestamps are used here;
 * customer names, phones, plates and message bodies never enter the alert.
 *
 * The conditional upsert is the dedupe gate: only the first monitor instance
 * that sees a healthy company become stale gets to send the alert.
 */
async function checkWorkshopReminderHealth({
  db = pool,
  sendPush = push.sendToCompany,
  isPushEnabled = push.isEnabled,
  sendFallback = sendWorkshopReminderHealthAlert,
  now = new Date(),
  staleAfterMs = STALE_AFTER_MS,
  noRunGraceMs = NO_RUN_GRACE_MS,
} = {}) {
  const companies = (await db.query(
    `SELECT id, created_at
       FROM companies
      WHERE page_type='workshop' AND is_active=true`
  )).rows;
  const result = { checked: 0, alerted: 0, recovered: 0 };

  for (const company of companies) {
    const companyId = Number(company.id);
    if (!companyId) continue;
    const latest = (await db.query(
      `SELECT started_at, finished_at, error
         FROM workshop_reminder_runs
        WHERE company_id=$1
        ORDER BY started_at DESC, id DESC
        LIMIT 1`, [companyId]
    )).rows[0] || null;

    const lastRunAt = latest && (latest.finished_at || latest.started_at);
    const noRunAge = ageMs(company.created_at, now);
    const stale = latest
      ? !latest.finished_at || ageMs(lastRunAt, now) > staleAfterMs || Boolean(latest.error)
      : noRunAge > noRunGraceMs;
    const current = (await db.query(
      `SELECT state, last_success_at, outage_started_at
         FROM workshop_reminder_health
        WHERE company_id=$1`, [companyId]
    )).rows[0] || null;

    result.checked += 1;
    if (!stale) {
      await db.query(
        `INSERT INTO workshop_reminder_health
           (company_id, state, last_success_at, recovered_at, checked_at)
         VALUES ($1,'healthy',$2,
                 CASE WHEN $3='alerted' THEN now() ELSE NULL END, now())
         ON CONFLICT (company_id) DO UPDATE SET
           state='healthy',
           last_success_at=EXCLUDED.last_success_at,
           recovered_at=CASE WHEN workshop_reminder_health.state='alerted'
                             THEN now() ELSE workshop_reminder_health.recovered_at END,
           checked_at=now()`,
        [companyId, latest && latest.finished_at ? latest.finished_at : null, current && current.state]
      );
      if (current && current.state === 'alerted') result.recovered += 1;
      continue;
    }

    const claimed = (await db.query(
      `INSERT INTO workshop_reminder_health
         (company_id, state, outage_started_at, last_alert_at, last_alert_status, checked_at)
       VALUES ($1,'alerted',now(),now(),'pending',now())
       ON CONFLICT (company_id) DO UPDATE SET
         state='alerted',
         outage_started_at=COALESCE(workshop_reminder_health.outage_started_at, now()),
         last_alert_at=now(),
         last_alert_status='pending',
         checked_at=now()
       WHERE workshop_reminder_health.state <> 'alerted'
       RETURNING company_id, outage_started_at`,
      [companyId]
    )).rows[0];

    if (!claimed) {
      await db.query(
        `UPDATE workshop_reminder_health SET checked_at=now()
          WHERE company_id=$1`, [companyId]
      );
      continue;
    }

    result.alerted += 1;
    let channel = 'push';
    let status = isPushEnabled() ? 'sent' : 'push_disabled';
    try {
      await sendPush(companyId, {
        title: 'تنبيه تشغيل تذكيرات الصيانة',
        body: 'لم يسجل عامل التذكيرات تشغيلًا ناجحًا خلال النافذة المحددة. راجع الإعدادات.',
        url: '/workshop/settings',
      });
    } catch (err) {
      status = 'push_error';
      console.error('[workshop reminder health alert]', err.message);
    }
    if (status === 'push_disabled' || status === 'push_error') {
      channel = 'email';
      try {
        const fallback = await sendFallback({
          companyId,
          reason: status,
          outageStartedAt: claimed.outage_started_at,
        });
        status = fallback && fallback.ok
          ? 'sent'
          : (fallback && fallback.status) || 'error';
      } catch (err) {
        status = 'error';
        console.error('[workshop reminder health fallback]', err.message);
      }
    }
    await db.query(
      `UPDATE workshop_reminder_health
          SET last_alert_channel=$2, last_alert_status=$3, checked_at=now()
        WHERE company_id=$1 AND state='alerted'`,
      [companyId, channel, status]
    );
  }
  return result;
}

module.exports = {
  checkWorkshopReminderHealth,
  STALE_AFTER_MS,
  NO_RUN_GRACE_MS,
  pool,
};