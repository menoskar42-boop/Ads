'use strict';

const assert = require('node:assert/strict');
const { after, describe, it } = require('node:test');
const workshopAdmin = require('../src/routes/workshop_admin');

class ConcurrentReminderDb {
  constructor({ failInsertOnce = false } = {}) {
    this.reminder = {
      id: 901,
      company_id: 77,
      vehicle_id: 902,
      job_id: 903,
      customer_id: 904,
      due_on: '2099-01-01',
      due_odometer: null,
      plate: 'و ر 77',
      odometer: 1000,
      customer_phone: '01012345678',
      customer_whatsapp: null,
      reminder_lead_days: 7,
      reminder_lead_km: 500,
      messaging_active: false,
      sms_provider: 'none',
      whatsapp_provider: 'none',
      reminder_notified_at: null,
      reminder_message_id: null,
    };
    this.messages = [];
    this.nextMessageId = 1201;
    this.claimInProgress = null;
    this.failInsertOnce = failInsertOnce;
    this.rollbackCount = 0;
  }

  async query(sql) {
    if (sql.includes('FROM workshop_reminders r')) {
      return {
        rows: this.reminder.reminder_notified_at ? [] : [{ ...this.reminder }],
      };
    }
    throw new Error(`unexpected pool query: ${sql.slice(0, 80)}`);
  }

  async connect() {
    const transaction = { snapshot: null, mutated: false };
    return {
      query: (sql, params) => this.transactionQuery(sql, params, transaction),
      release: () => {},
    };
  }

  async transactionQuery(sql, params, transaction) {
    if (sql === 'BEGIN') {
      transaction.snapshot = {
        reminderNotifiedAt: this.reminder.reminder_notified_at,
        reminderMessageId: this.reminder.reminder_message_id,
        messageCount: this.messages.length,
      };
      transaction.mutated = false;
      return { rows: [] };
    }
    if (sql === 'COMMIT') {
      transaction.snapshot = null;
      return { rows: [] };
    }
    if (sql === 'ROLLBACK') {
      if (transaction.snapshot && transaction.mutated) {
        this.reminder.reminder_notified_at = transaction.snapshot.reminderNotifiedAt;
        this.reminder.reminder_message_id = transaction.snapshot.reminderMessageId;
        this.messages.length = transaction.snapshot.messageCount;
      }
      transaction.snapshot = null;
      transaction.mutated = false;
      this.rollbackCount += 1;
      return { rows: [] };
    }

    if (sql.includes('SET reminder_notified_at=now()')) {
      // PostgreSQL makes the second UPDATE wait for the first transaction's row
      // lock, then its IS NULL predicate no longer matches.
      if (this.reminder.reminder_notified_at) return { rows: [] };
      if (this.claimInProgress) {
        await this.claimInProgress;
        return { rows: [] };
      }
      let releaseClaim;
      this.claimInProgress = new Promise((resolve) => { releaseClaim = resolve; });
      await new Promise((resolve) => setTimeout(resolve, 10));
      this.reminder.reminder_notified_at = new Date();
      transaction.mutated = true;
      releaseClaim();
      this.claimInProgress = null;
      return { rows: [{ id: params[0] }] };
    }

    if (sql.includes('INSERT INTO workshop_messages')) {
      if (this.failInsertOnce) {
        this.failInsertOnce = false;
        throw new Error('simulated workshop_messages INSERT failure');
      }
      const message = {
        id: this.nextMessageId++,
        company_id: params[0],
        job_id: params[1],
        customer_id: params[2],
        channel: params[3],
        recipient: params[4],
        event_key: 'service_reminder',
        body: params[5],
      };
      this.messages.push(message);
      transaction.mutated = true;
      return { rows: [{ id: message.id }] };
    }

    if (sql.includes('UPDATE workshop_reminders SET reminder_message_id=$1')) {
      this.reminder.reminder_message_id = params[0];
      transaction.mutated = true;
      return { rows: [] };
    }

    throw new Error(`unexpected transaction query: ${sql.slice(0, 100)}`);
  }
}

describe('workshop service reminder queue integration', () => {
  after(async () => {
    await workshopAdmin.pool.end();
  });

  it('keeps one outbox message and its reminder receipt across concurrent workers and restart', async () => {
    const db = new ConcurrentReminderDb();
    const queue = workshopAdmin.helpers.queueServiceReminderMessages;
    const options = {
      db,
      activity: async () => {},
      deliver: async () => ({ ok: true }),
      runLog: false,
    };

    const [firstRun, secondRun] = await Promise.all([
      queue(options),
      queue(options),
    ]);

    assert.deepEqual([firstRun, secondRun].sort(), [0, 1]);
    assert.equal(db.messages.length, 1);
    assert.equal(db.messages[0].event_key, 'service_reminder');
    assert.equal(db.reminder.reminder_message_id, db.messages[0].id);
    assert.ok(db.reminder.reminder_notified_at instanceof Date);

    // A new scheduler process sees the durable claim and does not enqueue again.
    const afterRestart = await queue(options);
    assert.equal(afterRestart, 0);
    assert.equal(db.messages.length, 1);
    assert.equal(db.reminder.reminder_message_id, db.messages[0].id);
    assert.ok(db.reminder.reminder_notified_at instanceof Date);
  });

  it('rolls back a failed insert so the next run can queue the reminder once', async () => {
    const db = new ConcurrentReminderDb({ failInsertOnce: true });
    const queue = workshopAdmin.helpers.queueServiceReminderMessages;
    const options = {
      db,
      activity: async () => {},
      deliver: async () => ({ ok: true }),
      runLog: false,
    };

    const failedRun = await queue(options);

    assert.equal(failedRun, 0);
    assert.equal(db.rollbackCount, 1);
    assert.equal(db.messages.length, 0);
    assert.equal(db.reminder.reminder_notified_at, null);
    assert.equal(db.reminder.reminder_message_id, null);

    const retryRun = await queue(options);
    assert.equal(retryRun, 1);
    assert.equal(db.messages.length, 1);
    assert.equal(db.reminder.reminder_message_id, db.messages[0].id);
    assert.ok(db.reminder.reminder_notified_at instanceof Date);
  });
});