#!/usr/bin/env node
/**
 * Integration check for the real PostgreSQL security-alert claim.
 *
 * It uses an existing active workshop company and a synthetic actor id, then
 * removes only the rows created by this check. No email address, message body,
 * secret, or customer record is created.
 */
'use strict';

const { Pool } = require('pg');
const audit = require('../src/lib/audit');

const actorId = 2147483000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let companyId = null;

function request() {
  return {
    method: 'POST',
    path: '/workshop/settings',
    session: { companyId, companyUserId: actorId },
  };
}

async function cleanup() {
  if (!companyId) return;
  await pool.query(
    `DELETE FROM medical_audit_log
      WHERE company_id=$1 AND actor_id=$2
        AND system='workshop' AND entity='workshop_alert_email_history'`,
    [companyId, actorId]
  );
  await pool.query(
    `DELETE FROM workshop_security_alert_state
      WHERE company_id=$1 AND actor_kind='company_user' AND actor_id=$2`,
    [companyId, actorId]
  );
}

(async () => {
  try {
    const company = (await pool.query(
      `SELECT id FROM companies
        WHERE page_type='workshop' AND is_active=true
        ORDER BY id LIMIT 1`
    )).rows[0];
    companyId = company && company.id;
    if (!companyId) throw new Error('no active workshop company found');

    await cleanup();
    const policy = await audit.getSecurityAlertPolicy(pool);
    const alerts = [];
    const deny = () => audit.logSecurity(pool, request(), {
      reason: 'permission_denied',
      notify: async (event) => {
        alerts.push(event);
        return { channel: 'test', status: 'sent' };
      },
    });

    for (let i = 0; i < policy.threshold - 2; i += 1) await deny();
    await Promise.all([deny(), deny()]);

    const state = (await pool.query(
      `SELECT rejection_count, alert_status
         FROM workshop_security_alert_state
        WHERE company_id=$1 AND actor_kind='company_user' AND actor_id=$2`,
      [companyId, actorId]
    )).rows[0];
    if (!state || Number(state.rejection_count) !== policy.threshold
        || alerts.length !== 1 || state.alert_status !== 'sent') {
      throw new Error('concurrent claim did not produce exactly one alert');
    }
    console.log('✅ PostgreSQL claim emits one alert for concurrent workers');
  } finally {
    try { await cleanup(); } finally { await pool.end(); }
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});