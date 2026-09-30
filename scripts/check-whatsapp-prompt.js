#!/usr/bin/env node
/**
 * check-whatsapp-prompt — برومبت تفعيل WhatsApp Business API (docs/WHATSAPP_API_SETUP_PROMPT.md).
 *
 * القوالب الأربعة اللى الإكستنشن بيقدّمها لـMeta لازم تفضل **نفس النص المعتمد** من المالك
 * فى serviceflow/shared/sms-message.ts (رسالة SMS المتابعة). لو حد عدّل النص فى الكود
 * ونسى البرومبت (أو العكس)، القوالب المعتمدة عند Meta هتختلف عن اللى الموقع بيبعته.
 * وبيتأكد إن الخطوط الحمرا وأسماء الأسرار موجودة.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const doc = fs.readFileSync(path.join(root, 'docs/WHATSAPP_API_SETUP_PROMPT.md'), 'utf8');
const msg = fs.readFileSync(path.join(root, 'serviceflow/shared/sms-message.ts'), 'utf8');

const errors = [];
const need = (ok, m) => { if (!ok) errors.push(m); };
const block = (doc.match(/```\n([\s\S]*?)\n```/) || [])[1] || '';
need(block.length > 1000, 'بلوك البرومبت مش موجود.');
const flat = block.split('\n').map((l) => l.replace(/^ {3}/, '')).join('\n');

// النص من الكود نفسه ← صيغة قالب Meta
const pick = (re, label) => { const m = msg.match(re); need(!!m, `مالقيتش ${label} فى sms-message.ts`); return m ? m[1] : ''; };
const central = pick(/CENTRAL_SMS_CONTACT = "(\d+)"/, 'رقم السنترال');
const head = pick(/const lines = \["([^"]+)"\]/, 'السطر الأول');
const complaint = pick(/lines\.push\(`(عميلنا العزيز، تم تسجيل بلاغ[^`]+)`\)/, 'جملة البلاغ')
  .replace('${i.phone}', '{{1}}').replace('${when.day} ${when.date}', '{{2}}').replace('${when.time}', '{{3}}');
const calm = pick(/lines\.push\("(نود الاطمئنان[^"]+)"\)/, 'نود الاطمئنان');
const plain = pick(/lines\.push\(`(عميلنا العزيز، نود الاطمئنان[^`]+)`\)/, 'السطر من غير بلاغ').replace('${i.phone}', '{{1}}');
const contact = pick(/lines\.push\(`(في حالة وجود أي مشكلة[^`]+)`\)/, 'جملة التواصل').replace('${CENTRAL_SMS_CONTACT}', central);
const techTpl = pick(/const tech = techMobile \? `([^`]+)`/, 'جملة الفنى');
const thanks = pick(/lines\.push\("(شكراً[^"]+)"\)/, 'الختام');
const tech = (a, b) => techTpl.replace(/\$\{techName \? [^}]+\}/, ' {{' + a + '}}').replace('${techMobile}', '{{' + b + '}}');
const withTech = (a, b) => contact.replace('${tech}', tech(a, b));
const noTech = contact.replace('${tech}', '');

const expected = {
  ghanayem_followup_complaint_tech: [head, complaint, calm, withTech(4, 5), thanks],
  ghanayem_followup_complaint: [head, complaint, calm, noTech, thanks],
  ghanayem_followup_tech: [head, plain, withTech(2, 3), thanks],
  ghanayem_followup: [head, plain, noTech, thanks],
};
for (const [name, lines] of Object.entries(expected)) {
  const i = flat.indexOf('الاسم: ' + name + '\n');
  need(i >= 0, `القالب ${name} مش موجود.`);
  if (i < 0) continue;
  const body = flat.slice(i).split('\n').slice(1, 1 + lines.length).join('\n');
  need(body === lines.join('\n'), `نص القالب ${name} مختلف عن النص المعتمد فى sms-message.ts:\n     المتوقع:\n${lines.join('\n')}\n     الموجود:\n${body}`);
}

for (const s of ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_WABA_ID'])
  need(block.includes(s), `اسم السرّ ${s} ناقص.`);
for (const [re, m] of [
  [/ممنوع تلمس أى حاجة تخص OscarDevs/, 'خط أحمر: OscarDevs'],
  [/بتمسح حساب الواتساب بتاعه/, 'خط أحمر: رقم عليه واتساب'],
  [/مايتكتبش فى الشات ولا فى التقرير/, 'خط أحمر: التوكن'],
  [/اطلب من المالك يدخّل البيانات بنفسه/, 'خط أحمر: الكارت'],
  [/متبعتش أى رسالة لعملاء حقيقيين/, 'خط أحمر: عملاء حقيقيين'],
  [/Category = \*\*Utility\*\*/, 'فئة القوالب Utility'],
]) need(re.test(block), `ناقص: ${m}`);

if (errors.length) {
  console.log('❌ check-whatsapp-prompt:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-whatsapp-prompt: القوالب الأربعة مطابقة لنص رسالة المتابعة المعتمد، والخطوط الحمرا موجودة.');
