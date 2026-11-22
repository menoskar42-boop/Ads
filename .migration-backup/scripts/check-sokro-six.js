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
// بوقت ثابت مش بساعة التشغيل: «اليوم الساعة ٥» بتكون في الماضي أو لأ
// حسب امتى بتشغّل الفحص، فالاختبار كان بيعدّي الصبح ويفشل بالليل.
check('الوقت الماضي مرفوض (نص طبيعي)', () => assert.equal(
  scheduler.parseWhen({ whenText: 'اليوم الساعة 5', timezone: 'Asia/Amman' },
    new Date('2026-08-24T14:00:00Z')).error, 'past'));
// والمسار التاني: وقت صريح فات.
check('الوقت الماضي مرفوض (وقت صريح)', () => assert.equal(
  scheduler.parseWhen({ runAt: '2020-01-01T00:00:00Z' }).error, 'past'));
// الاختبارين دول اتكتبوا على الشكل القديم للواتساب (مفتاح واحد من متغيّر
// بيئة). بقى **لكل مستخدم مفاتيحه**، فالنداء بياخد المفتاح كمُعامل — والقاعدة
// اللي بيختبروها هي هي: التوقيع المزوّر بيترفض، والحساب المش متظبّط مابيدّعيش.
check('توقيع WhatsApp لا يقبل توقيعًا مزورًا', () => {
  const raw = Buffer.from('{"x":1}');
  const secret = 'test';
  const good = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  assert(wa.verifySignature(secret, raw, good));
  assert(!wa.verifySignature(secret, raw, 'sha256=bad'));
  // ومفتاح تاني مايفتحش نفس التوقيع، ومن غير مفتاح بيترفض (مش بيعدّي).
  assert(!wa.verifySignature('other', raw, good));
  assert(!wa.verifySignature('', raw, good));
});
check('WhatsApp غير المهيأ لا يدعي النجاح', () => {
  // الحساب الناقص مش جاهز — ومفيش متغيّر بيئة يخلّيه جاهز.
  assert.equal(wa.ready(null), false);
  assert.equal(wa.ready({ phoneNumberId: '123' }), false);
  assert.equal(wa.ready({ token: 'x'.repeat(30) }), false);
  assert.equal(wa.ready({ phoneNumberId: '123', token: 'x'.repeat(30) }), true);
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