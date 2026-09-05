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
const { resolveWorkshopAlertRecipient } = require('../src/lib/mailer');

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
      if (/SELECT c\.id, c\.created_at/.test(sql)) {
        return {
          rows: [{
            id: 7,
            created_at: '2026-09-05T06:00:00.000Z',
            admin_alert_email: 'owner@workshop.example',
          }],
        };
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

function fakeRecoveryDb({ claim = true } = {}) {
  const updates = [];
  return {
    updates,
    async query(sql, args) {
      if (/SELECT c\.id, c\.created_at/.test(sql)) {
        return {
          rows: [{
            id: 7,
            created_at: '2026-09-05T06:00:00.000Z',
            admin_alert_email: 'owner@workshop.example',
          }],
        };
      }
      if (/SELECT started_at, finished_at, error/.test(sql)) {
        return { rows: [{ started_at: '2026-09-05T08:59:00.000Z', finished_at: '2026-09-05T08:59:00.000Z', error: null }] };
      }
      if (/SELECT state, last_success_at, outage_started_at/.test(sql)) {
        return { rows: [{ state: 'alerted', outage_started_at: '2026-09-05T08:00:00.000Z' }] };
      }
      if (/SET state='healthy'/.test(sql)) {
        return {
          rows: claim ? [{ company_id: 7, outage_started_at: '2026-09-05T08:00:00.000Z' }] : [],
        };
      }
      if (/SET recovery_alert_channel=\$2/.test(sql)) {
        updates.push({ sql, args });
        return { rows: [] };
      }
      throw new Error(`unexpected recovery query: ${sql.slice(0, 120)}`);
    },
  };
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
      && disabledFallback[0].adminEmail === 'owner@workshop.example'
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

  const recoveryDb = fakeRecoveryDb();
  const recoveryFallback = [];
  const recoveryResult = await checkWorkshopReminderHealth({
    db: recoveryDb,
    isPushEnabled: () => false,
    sendPush: async () => {},
    sendFallback: async (payload) => {
      recoveryFallback.push(payload);
      return { channel: 'email', ok: true, status: 'sent' };
    },
    now,
    staleAfterMs: 60 * 1000,
  });
  check('العودة من alerted ترسل تنبيه استعادة مرة واحدة',
    recoveryResult.recovered === 1 && recoveryFallback[0].kind === 'recovered');
  check('استعادة Push المعطل تستخدم بريد الورشة',
    recoveryFallback[0].adminEmail === 'owner@workshop.example'
      && recoveryDb.updates[0].args[1] === 'email'
      && recoveryDb.updates[0].args[2] === 'sent');

  const recoveryPushDb = fakeRecoveryDb();
  let recoveryPushCount = 0;
  const recoveryPushResult = await checkWorkshopReminderHealth({
    db: recoveryPushDb,
    isPushEnabled: () => true,
    sendPush: async () => { recoveryPushCount += 1; },
    sendFallback: async () => { throw new Error('fallback should not run'); },
    now,
    staleAfterMs: 60 * 1000,
  });
  check('استعادة Push الناجح تُسجل القناة والنتيجة',
    recoveryPushResult.recovered === 1 && recoveryPushCount === 1
      && recoveryPushDb.updates[0].args[1] === 'push'
      && recoveryPushDb.updates[0].args[2] === 'sent');

  const recoveryDuplicateDb = fakeRecoveryDb({ claim: false });
  let recoveryDuplicateCount = 0;
  const recoveryDuplicateResult = await checkWorkshopReminderHealth({
    db: recoveryDuplicateDb,
    isPushEnabled: () => false,
    sendFallback: async () => { recoveryDuplicateCount += 1; },
    now,
    staleAfterMs: 60 * 1000,
  });
  check('بوابة الاستعادة تمنع رسالة مكررة',
    recoveryDuplicateResult.recovered === 0 && recoveryDuplicateCount === 0);

  const mailer = fs.readFileSync(path.join(ROOT, 'src/lib/mailer.js'), 'utf8');
  check('قناة البريد الإدارية موجودة', /sendWorkshopReminderHealthAlert/.test(mailer));
  check('رسالة اختبار البريد منفصلة عن تنبيهات الأعطال',
    /sendWorkshopReminderHealthTest/.test(mailer)
      && /اختبار بريد تنبيهات تذكيرات الصيانة/.test(mailer));
  check('قالب البريد يدعم إشعار الاستعادة', /kind === 'recovered'/.test(mailer));
  check('العنوان المخصص يسبق العنوان العام',
    /resolveWorkshopAlertRecipient[\s\S]{0,500}ADMIN_NOTIFY_EMAIL/.test(mailer));
  process.env.ADMIN_NOTIFY_EMAIL = 'global@example.com';
  process.env.ADMIN_EMAIL = 'fallback@example.com';
  check('العنوان المخصص يُستخدم فعليًا',
    resolveWorkshopAlertRecipient('owner@workshop.example') === 'owner@workshop.example');
  check('العنوان العام يبقى fallback عند غياب المخصص',
    resolveWorkshopAlertRecipient('') === 'global@example.com'
      && resolveWorkshopAlertRecipient('not-an-email') === 'global@example.com');
  check('نص التنبيه لا يقرأ بيانات العملاء',
    !/customer_(name|phone)|customerName|customerPhone/.test(mailer.slice(mailer.indexOf('async function sendWorkshopReminderHealthAlert'))));
  const router = fs.readFileSync(path.join(ROOT, 'src/routes/workshop_admin.js'), 'utf8');
  const settingsView = fs.readFileSync(path.join(ROOT, 'src/views/workshop_admin/settings.ejs'), 'utf8');
  const schema = fs.readFileSync(path.join(ROOT, 'src/workshop/schema.js'), 'utf8');
  check('اختبار البريد محمي بصلاحية الإدارة',
    /router\.post\('\/settings\/reminder-email-test', requireWorkshopPermission\('manage_settings'\)/.test(router));
  check('الإعدادات تعرض نتيجة الاختبار دون أسرار',
    /testEmailStatus/.test(router) && /testEmailStatus === 'sent'/.test(settingsView)
      && !/SMTP_PASSWORD|SMTP_PASS|SMTP_USER/.test(settingsView));
  check('سجل بريد التنبيهات معزول بالشركة',
    /CREATE TABLE IF NOT EXISTS workshop_alert_email_history/.test(schema)
      && /company_id\s+INTEGER NOT NULL REFERENCES companies/.test(schema)
      && /workshop_alert_email_history/.test(router)
      && /alertEmailHistory/.test(settingsView));
  check('التغيير يسجل الإضافة والتعديل والإزالة مع المنفذ',
    /alertEmailChange/.test(router)
      && /change_type/.test(router)
      && /changed_by_user_id/.test(router)
      && /settings_save/.test(settingsView));

  console.log(failed ? `\n${failed} مشكلة في قناة تنبيه صحة التذكيرات.` : '\nقناة التنبيه الاحتياطية ومنع التكرار يعملان.');
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});