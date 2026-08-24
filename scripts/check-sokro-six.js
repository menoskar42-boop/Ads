#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const crypto = require('crypto');
const time = require('../sokro/time-parser');
const wa = require('../sokro/channels/whatsapp-cloud');
const booking = require('../sokro/booking/providers');
const flow = require('../sokro/booking/flow');
const scheduler = require('../sokro/scheduler');

let n = 0;
function check(label, fn) {
  try { fn(); console.log('✅ ' + label); n++; } catch (e) { console.error('❌ ' + label + ' — ' + e.message); process.exitCode = 1; }
}

check('الوقت الطبيعي يحترم المنطقة الزمنية', () => {
  const r = time.parseNatural('فكرني بكرة الساعة 5', new Date('2026-08-24T10:00:00Z'), 'Asia/Amman');
  assert.equal(r.kind, 'once'); assert.equal(r.runAt.toISOString(), '2026-08-25T02:00:00.000Z');
});
check('الوقت الغامض مرفوض', () => assert.equal(time.parseNatural('فكرني الساعة 5').error, 'date_required'));
check('الوقت الماضي مرفوض', () => assert.equal(scheduler.parseWhen({ whenText: 'اليوم الساعة 5', timezone: 'Asia/Amman' }).error, 'past'));
check('توقيع WhatsApp لا يقبل توقيعًا مزورًا', () => {
  const old = process.env.SOKRO_WHATSAPP_APP_SECRET; process.env.SOKRO_WHATSAPP_APP_SECRET = 'test';
  const raw = Buffer.from('{"x":1}');
  const good = 'sha256=' + crypto.createHmac('sha256', 'test').update(raw).digest('hex');
  assert(wa.verifySignature(raw, good)); assert(!wa.verifySignature(raw, 'sha256=bad'));
  process.env.SOKRO_WHATSAPP_APP_SECRET = old;
});
check('WhatsApp غير المهيأ لا يدعي النجاح', () => {
  const a = process.env.SOKRO_WHATSAPP_TOKEN, b = process.env.SOKRO_WHATSAPP_PHONE_ID;
  delete process.env.SOKRO_WHATSAPP_TOKEN; delete process.env.SOKRO_WHATSAPP_PHONE_ID;
  assert.equal(wa.configured(), false);
  if (a === undefined) delete process.env.SOKRO_WHATSAPP_TOKEN; else process.env.SOKRO_WHATSAPP_TOKEN = a;
  if (b === undefined) delete process.env.SOKRO_WHATSAPP_PHONE_ID; else process.env.SOKRO_WHATSAPP_PHONE_ID = b;
});
check('موصل الحجز غير المهيأ لا يعيد نجاحًا وهميًا', async () => assert.equal((await booking.submit({ kind: 'hotel', fields: {} })).ok, false));
check('تأكيد الحجز لا يقبل كلمة غير صريحة', () => assert.equal(flow.readAnswer('غيّر التاريخ وبعدين ابعت'), 'unclear'));
check('الميزات الجديدة لها مسارات وسجل', () => {
  const r = fs.readFileSync(require.resolve('../sokro/router'), 'utf8');
  const s = fs.readFileSync(require.resolve('../sokro/schema'), 'utf8');
  assert(/whatsapp\/webhook/.test(r) && r.includes("router.post('/api/calls'"));
  assert(/sokro_consent_audit/.test(s) && /sokro_channel_messages/.test(s));
});
console.log(`\n${n} فحوصات Sokro الجديدة نجحت.`);