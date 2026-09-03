'use strict';

const assert = require('node:assert/strict');
const { after, describe, it } = require('node:test');
const health = require('../src/workshop/reminder_health');

class ReminderHealthDb {
  constructor() {
    this.states = new Map();
    this.alertUpdates = [];
    this.checkUpdates = [];
  }

  async query(sql, params) {
    if (sql.includes('FROM companies') && sql.includes("page_type='workshop'")) {
      return {
        rows: [
          { id: 11, created_at: '2020-01-01T00:00:00.000Z' },
          { id: 22, created_at: '2020-01-01T00:00:00.000Z' },
        ],
      };
    }
    if (sql.includes('FROM workshop_reminder_runs')) {
      return {
        rows: params[0] === 11
          ? [{ started_at: '2020-01-01T00:00:00.000Z', finished_at: '2020-01-01T00:00:00.000Z', error: null }]
          : [{ started_at: '2099-01-01T00:00:00.000Z', finished_at: '2099-01-01T00:00:00.000Z', error: null }],
      };
    }
    if (sql.includes('SELECT state, last_success_at')) {
      const state = this.states.get(params[0]);
      return { rows: state ? [state] : [] };
    }
    if (sql.includes('INSERT INTO workshop_reminder_health')) {
      const companyId = params[0];
      if (sql.includes("VALUES ($1,'healthy'")) {
        this.states.set(companyId, { state: 'healthy', last_success_at: params[1] });
        return { rows: [] };
      }
      const current = this.states.get(companyId);
      if (current && current.state === 'alerted') return { rows: [] };
      this.states.set(companyId, { state: 'alerted', last_alert_status: 'pending' });
      return { rows: [{ company_id: companyId, outage_started_at: new Date() }] };
    }
    if (sql.includes('UPDATE workshop_reminder_health SET checked_at')) {
      this.checkUpdates.push(params[0]);
      return { rows: [] };
    }
    if (sql.includes('SET last_alert_status')) {
      this.alertUpdates.push({ companyId: params[0], status: params[1] });
      this.states.set(params[0], { state: 'alerted', last_alert_status: params[1] });
      return { rows: [] };
    }
    throw new Error(`unexpected health query: ${sql.slice(0, 90)}`);
  }
}

describe('workshop reminder health alerts', () => {
  after(async () => {
    await health.pool.end();
  });

  it('alerts once per outage, stays company-scoped, and sends no customer data', async () => {
    const db = new ReminderHealthDb();
    const pushes = [];
    const options = {
      db,
      now: new Date('2026-09-03T12:00:00.000Z'),
      staleAfterMs: 15 * 60 * 1000,
      sendPush: async (companyId, payload) => pushes.push({ companyId, payload }),
    };

    const first = await health.checkWorkshopReminderHealth(options);
    const second = await health.checkWorkshopReminderHealth(options);

    assert.deepEqual(first, { checked: 2, alerted: 1, recovered: 0 });
    assert.deepEqual(second, { checked: 2, alerted: 0, recovered: 0 });
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].companyId, 11);
    assert.deepEqual(pushes[0].payload, {
      title: 'تنبيه تشغيل تذكيرات الصيانة',
      body: 'لم يسجل عامل التذكيرات تشغيلًا ناجحًا خلال النافذة المحددة. راجع الإعدادات.',
      url: '/workshop/settings',
    });
    assert.deepEqual(db.alertUpdates, [{ companyId: 11, status: 'sent' }]);
    assert.ok(db.checkUpdates.includes(11));
  });
});