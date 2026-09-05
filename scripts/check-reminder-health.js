#!/usr/bin/env node
/**
 * Reminder health fallback checks.
 *
 * The real worker uses a conditional upsert as its dedupe gate. These tests
 * exercise both fallback causes without connecting to a database or sending
 * an email, so a future change cannot silently remove the safe admin channel.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { checkWorkshopReminderHealth } = require('../src/workshop/reminder_health');

const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ` — ${extra}` : ''));
  if (!ok) failed += 1;
};

function fakeDb({ claim = true } = {}) {
  const alerts = [];
  const db = {
    updates: alerts,
    async query(sql, args) {
      if (/SELECT id, created_at\s+FROM companies/.test(sql)) {
        return { rows: [{ id: 7, created_at: '2026-09-05T06:00:00.000Z' }] };
      }
      if (/SELECT started_at, finished_at, error/.test(sql)) {
        return { rows: [{ started_at: '2026-09-05T08:00:00.000Z', finished_at: null, error: null }] };
      }
      if (/SELECT state, last_success_at, outage_started_at/.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO workshop_reminder_health/.test(sql)) {
        return {
          rows: claim ? [{ company_id: 7, outage_started_at: '2026-09-05T08:00:00.000Z' }] : [],
        };
      }
      if (/SET last_alert_channel=\$2/.test(sql)) {
        alerts.push({ sql, args });
        return { rows: [] };
      }
      if (/SET checked_at=now\(\)/.test(sql)) return { rows: [] };
      throw new Error(`unexpected query: ${sql.slice(0, 120)}`);
    },
  };
  return db;
}

async function run() {
  const now = new Date('2026-09-05T09:00:00.000Z');
  const disabledDb = fakeDb();
  const disabledFallback = [];
  const disabledResult = await checkWorkshopReminderHealth({
    db: disabledDb,
    isPushEnabled: () => false,
    sendPush: async () => {},
    sendFallback: async (payload) => {
      disabledFallback.push(payload);
      return { channel: 'email', ok: true, status: 'sent' };
    },
    now,
    staleAfterMs: 60 * 1000,
  });
  check('push_disabled يختار البريد الاحتياطي', disabledDb.updates[0].args[1] === 'email');
  check('نجاح البريد يتسجل كإرسال', disabledDb.updates[0].args[2] === 'sent');
  check('سبب التعطّل يصل للقناة دون بيانات عميل',
    disabledFallback[0].reason === 'push_disabled'
      && !Object.prototype.hasOwnProperty.call(disabledFallback[0], 'customer_name')
      && !Object.prototype.hasOwnProperty.call(disabledFallback[0], 'customer_phone'));
  check('حالة التعطّل الواحدة تُرسل مرة واحدة', disabledResult.alerted === 1);

  const errorDb = fakeDb();
  const errorFallback = [];
  await checkWorkshopReminderHealth({
    db: errorDb,
    isPushEnabled: () => true,
    sendPush: async () => { throw new Error('simulated push failure'); },
    sendFallback: async (payload) => {
      errorFallback.push(payload);
      return { channel: 'email', ok: false, status: 'error' };
    },
    now,
    staleAfterMs: 60 * 1000,
  });
  check('push_error يختار البريد الاحتياطي', errorFallback[0].reason === 'push_error');
  check('فشل البريد يُسجل كفشل', errorDb.updates[0].args[2] === 'error');

  const duplicateDb = fakeDb({ claim: false });
  const duplicateFallback = [];
  const duplicateResult = await checkWorkshopReminderHealth({
    db: duplicateDb,
    isPushEnabled: () => false,
    sendFallback: async () => {
      duplicateFallback.push(true);
      return { channel: 'email', ok: true, status: 'sent' };
    },
    now,
    staleAfterMs: 60 * 1000,
  });
  check('بوابة منع التكرار تمنع تنبيهًا ثانيًا',
    duplicateResult.alerted === 0 && duplicateFallback.length === 0);

  const mailer = fs.readFileSync(path.join(ROOT, 'src/lib/mailer.js'), 'utf8');
  check('قناة البريد الإدارية موجودة', /sendWorkshopReminderHealthAlert/.test(mailer));
  check('نص التنبيه لا يقرأ بيانات العملاء',
    !/customer_(name|phone)|customerName|customerPhone/.test(mailer.slice(mailer.indexOf('async function sendWorkshopReminderHealthAlert'))));

  console.log(failed ? `\n${failed} مشكلة في قناة تنبيه صحة التذكيرات.` : '\nقناة التنبيه الاحتياطية ومنع التكرار يعملان.');
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});