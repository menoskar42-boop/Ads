'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const audit = require('../src/lib/audit');

describe('latest workshop security alert result', () => {
  it('reads only the latest claimed alert from the dedicated security state', async () => {
    let call;
    const expected = {
      company_id: 12,
      actor_kind: 'company_user',
      actor_id: 34,
      rejection_count: 5,
      window_started_at: new Date('2026-11-09T10:00:00Z'),
      alerted_at: new Date('2026-11-09T10:15:00Z'),
      alert_channel: 'email',
      alert_status: 'sent',
    };
    const pool = {
      query: async (sql, params) => {
        call = { sql, params };
        return { rows: [expected] };
      },
    };

    assert.deepEqual(await audit.latestSecurityAlert(pool), expected);
    assert.match(call.sql, /FROM workshop_security_alert_state/);
    assert.match(call.sql, /WHERE alerted_at IS NOT NULL/);
    assert.match(call.sql, /ORDER BY alerted_at DESC\s+LIMIT 1/);
    assert.doesNotMatch(call.sql, /email_address|message_body|medical_audit_log/);
    assert.equal(call.params, undefined);
  });

  it('marks missing and unrecognized delivery results as unavailable', async () => {
    for (const status of [null, 'unexpected']) {
      const pool = {
        query: async () => ({
          rows: [{
            company_id: 12,
            alert_channel: null,
            alert_status: status,
          }],
        }),
      };
      const latest = await audit.latestSecurityAlert(pool);
      assert.equal(latest.alert_status, 'unavailable');
      assert.equal(latest.alert_channel, null);
    }
  });

  it('preserves explicit unavailable and in-progress statuses', async () => {
    for (const status of ['unavailable', 'pending']) {
      const pool = {
        query: async () => ({ rows: [{ alert_status: status }] }),
      };
      assert.equal((await audit.latestSecurityAlert(pool)).alert_status, status);
    }
  });
});
