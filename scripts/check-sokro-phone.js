#!/usr/bin/env node
/**
 * Phone channel guardrails:
 * - Arabic confirmation is explicit and cannot be confused with a decline.
 * - provider events never retain audio deltas or function arguments.
 * - call history/transcripts are read through the owning user.
 * - Twilio is configured for a bidirectional Media Stream.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const stream = require('../sokro/channels/phone-stream');

let fail = 0;
function check(label, ok) {
  console.log((ok ? '✅ ' : '❌ ') + label);
  if (!ok) fail++;
}
function raw(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

check('الموافقة العربية الصريحة تُلتقط', stream.isConfirmation('أيوه، كمل'));
check('التأكيد باللهجة المصرية يُلتقط', stream.isConfirmation('تمام'));
check('الرفض لا يتحول لموافقة', !stream.isConfirmation('مش موافق'));
check('الرفض الصريح يُلتقط', stream.isDecline('لا، بلاش'));
check('النص الفارغ لا يوافق', !stream.isConfirmation(''));

const provider = stream.safeProviderEvent({
  type: 'response.audio.delta',
  delta: 'VERY-LARGE-AUDIO-BYTES',
  arguments: '{"secret":"should not persist"}',
  audio: 'should not persist',
  response_id: 'resp_1',
  output_index: 0,
});
check('أحداث المزوّد لا تخزّن audio أو arguments', !('delta' in provider) && !('arguments' in provider) && !('audio' in provider));
check('أحداث المزوّد تحتفظ بالمعرّفات المفيدة', provider.type === 'response.audio.delta' && provider.response_id === 'resp_1');

const phone = raw('sokro/channels/phone.js');
check('المكالمة تطلب تحديثات Twilio لكل مراحل الاتصال', /StatusCallbackEvent: 'initiated ringing answered completed'/.test(phone));
const router = raw('sokro/router.js');
check('مسار سجل المكالمات مقيّد بالمستخدم', /FROM sokro_phone_calls[\s\S]{0,180}WHERE user_id=\$1/.test(router));
check('مسار الأحداث يتحقق من ملكية المكالمة', /WHERE call_id=\$1 AND user_id=\$2/.test(router));
check('كولباك Twilio لا يعمل بلا توقيع', /if \(!process\.env\.SOKRO_TWILIO_AUTH_TOKEN\) return res\.sendStatus\(503\)/.test(router)
  && /phone\.verifySignature\(url, req\.body \|\| \{\}, req\.headers\['x-twilio-signature'\]\)/.test(router));
check('المكالمة تستخدم Twilio Connect Stream', /<Connect><Stream url="\$\{esc\(streamUrl\)\}"\/><\/Connect>/.test(router));

console.log(fail ? `\n⚠️  ${fail} مشكلة.` : '\n✅ قناة الهاتف جاهزة للمحادثة والتأكيد المعزول.');
process.exit(fail ? 1 : 0);