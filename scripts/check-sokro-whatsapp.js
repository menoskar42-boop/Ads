#!/usr/bin/env node
/**
 * واتساب: كل مستخدم برقمه هو — مش رقم واحد للمنصّة.
 *
 * الشكل الأول كان بيقرا التوكن ورقم الهاتف من `process.env`:
 *
 *     process.env.SOKRO_WHATSAPP_TOKEN
 *     process.env.SOKRO_WHATSAPP_PHONE_ID
 *
 * يعني **كل مستخدمي سوكرو بيبعتوا من نفس الرقم**، ومحدش فيهم يقدر يربط رقمه.
 * ومتغيّر البيئة أصلاً **مايقدرش** يحمل مفتاح مختلف لكل مستخدم — فالمشكلة مش
 * إعداد ناقص، دي بنية غلط.
 *
 * ── الأربعة اللي الفحص ده بيمسكهم ────────────────────────────────────────
 *
 * ١) **مفيش مفتاح واتساب في متغيّرات البيئة خالص.**
 *
 * ٢) **المفاتيح في الخزنة المشفّرة، ولو الخزنة مش متظبّطة الحفظ بيترفض** —
 *    مابنخزّنش مفتاح بالنضيف عشان الميزة تشتغل.
 *
 * ٣) **التوكن مابيرجعش للشاشة بعد الحفظ.** الشاشة بتعرف «متوصّل ولا لأ»
 *    وآخر أربع أرقام وخلاص.
 *
 * ٤) **ويب هوك لكل حساب بتوكن عشوائي في المسار.** ميتا بتوقّع كل طلب بمفتاح
 *    **التطبيق اللي بعته**، وكل مستخدم عنده تطبيقه. فمن غير ما نعرف الحساب
 *    مانقدرش نجيب المفتاح، ومن غير المفتاح مانقدرش نصدّق الجسم اللي جوّاه رقم
 *    الحساب. التوكن في المسار هو اللي بيكسر الحلقة دي.
 *
 *   node scripts/check-sokro-whatsapp.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const W = require('../sokro/channels/whatsapp-cloud');
const A = require('../sokro/channels/whatsapp-account');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── ١. مفيش مفاتيح في البيئة ─────────────────────────────────────────── */
{
  const files = ['sokro/channels/whatsapp-cloud.js', 'sokro/channels/whatsapp-account.js', 'sokro/router.js'];
  const leaks = files.filter((f) => /process\.env\.SOKRO_WHATSAPP/.test(code(f)));
  check('مفيش مفتاح واتساب بيتقرا من متغيّرات البيئة', leaks.length === 0, leaks.join(', ') || 'نضيف');
  check('والقناة بتاخد بيانات الحساب كمُعامل',
    /async function send\(creds, to, text, opts\)/.test(code('sokro/channels/whatsapp-cloud.js')));
  check('والتوثيق مابيوعدش بمتغيّرات مش موجودة',
    !/SOKRO_WHATSAPP_TOKEN/.test(raw('sokro/README.md')));
}

/* ── ٢. الحساب الناقص مايبعتش ─────────────────────────────────────────── */
{
  check('الحساب الفاضي مش جاهز', W.ready(null) === false && W.ready({}) === false);
  check('ورقم من غير توكن مش جاهز', W.ready({ phoneNumberId: '123' }) === false);
  check('وتوكن من غير رقم مش جاهز', W.ready({ token: 'x'.repeat(30) }) === false);
  check('والاتنين مع بعض جاهز', W.ready({ phoneNumberId: '123', token: 'x'.repeat(30) }) === true);
  check('والمسافات لوحدها مش قيمة', W.ready({ phoneNumberId: '  ', token: '  ' }) === false);

  const r = code('sokro/router.js');
  check('والراوت بيرفض الإرسال قبل الربط',
    /if \(!whatsappCloud\.ready\(creds\)\)/.test(r) && /error: 'not_connected'/.test(r));
  check('وبيبعت ببيانات المستخدم نفسه',
    /const creds = await waAccount\.creds\(pool, req\.sokroUser\.id\)/.test(r)
    && /whatsappCloud\.send\(creds, to, text\)/.test(r));
}

/* ── ٣. المقارنات الأمنية ─────────────────────────────────────────────── */
{
  check('توكن التحقّق: الفاضي مابيساويش الفاضي',
    W.verifyToken('', '') === false && W.verifyToken(null, null) === false);
  check('والمطابق بيعدّي والمختلف لأ',
    W.verifyToken('abc123', 'abc123') === true && W.verifyToken('abc123', 'abc124') === false);
  check('والطول المختلف مابيقعش',
    W.verifyToken('abc', 'abcdefgh') === false);

  const crypto = require('crypto');
  const secret = 'app-secret-value';
  const body = JSON.stringify({ hello: 'world' });
  const good = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  check('التوقيع الصحيح بيعدّي', W.verifySignature(secret, body, good) === true);
  check('والتوقيع بمفتاح تاني بيترفض', W.verifySignature('other', body, good) === false);
  check('و**من غير مفتاح بيترفض** (مش بيعدّي)',
    W.verifySignature('', body, good) === false && W.verifySignature(null, body, good) === false);
  check('والجسم المعدَّل بيترفض', W.verifySignature(secret, body + ' ', good) === false);
  check('والشكل الغلط بيترفض', W.verifySignature(secret, body, 'sha1=abc') === false);
}

/* ── ٤. ويب هوك لكل حساب ──────────────────────────────────────────────── */
{
  const r = code('sokro/router.js');
  check('مسار الويب هوك فيه توكن الحساب',
    /whatsapp\/webhook\/:token\(\[0-9a-f\]\{48\}\)/.test(r));
  check('ومفيش مسار قديم من غير توكن',
    !/'\/api\/channels\/whatsapp\/webhook'/.test(r));
  check('والتوقيع بيتفحص بمفتاح الحساب اللي التوكن دلّ عليه',
    /whatsappCloud\.verifySignature\(acc\.appSecret, raw, req\.headers\['x-hub-signature-256'\]\)/.test(r));
  check('والحساب المجهول بيترفض قبل أي قراية للجسم',
    /if \(!acc\) return res\.sendStatus\(403\)/.test(r));
  check('ورقم الحساب في الجسم لازم يطابق صاحب التوكن',
    /String\(m\.phoneId\) !== String\(acc\.phoneNumberId\)\) continue/.test(r));
  check('والرسالة المكرّرة مابتتكتبش مرتين',
    /ON CONFLICT \(external_message_id\) DO NOTHING/.test(r));

  check('وتوكن المسار عشوائي من `crypto` بطول كافي',
    A.newWebhookToken().length === 48 && /^[0-9a-f]+$/.test(A.newWebhookToken())
    && A.newWebhookToken() !== A.newWebhookToken());
  const acc = code('sokro/channels/whatsapp-account.js');
  check('والبحث بالتوكن بيتحقّق من شكله الأول',
    /\/\^\[0-9a-f\]\{48\}\$\/\.test\(t\)/.test(acc));
}

/* ── ٥. المفاتيح مابتتسرّبش للشاشة ────────────────────────────────────── */
{
  const acc = code('sokro/channels/whatsapp-account.js');
  check('الخزنة مش متظبّطة = الحفظ بيترفض',
    /if \(!vault\.configured\(\) && \(token \|\| appSecret\)\) return \{ ok: false, error: 'vault' \}/.test(acc));
  check('والمفاتيح بتتشفّر قبل التخزين',
    /vault\.encrypt\(token\)/.test(acc) && /vault\.encrypt\(appSecret\)/.test(acc));
  check('و`status` مابترجعش أي مفتاح',
    !/token:/.test(/async function status\([\s\S]*?\n\}/.exec(acc)[0].replace('webhookToken', '')));
  check('وبترجع آخر أربع أرقام بس', /phoneTail: tail\(row\.external_id\)/.test(acc));
  check('وآخر أربع أرقام فعلاً مش الرقم كله',
    A.tail('123456789012345') === '…2345' && !/1234567/.test(A.tail('123456789012345')));

  const ui = raw('sokro/ui/app.html');
  check('والشاشة بتمسح التوكن من الخانة بعد الحفظ',
    /\$\('#waToken'\)\.value=''; \$\('#waSecret'\)\.value='';/.test(ui));
  check('وخانات المفاتيح `type=password`',
    /id="waToken" class="fld"[^>]*type="password"/.test(ui) && /id="waSecret" class="fld"[^>]*type="password"/.test(ui));
  check('والشاشة بتقول للمستخدم إن الرقم لازم يكون فاضي من واتساب',
    /مش مسجّل على تطبيق واتساب/.test(ui));
}

/* ── ٦. نافذة الـ٢٤ ساعة بتتقال بصراحة ────────────────────────────────── */
{
  const r = code('sokro/router.js');
  check('نافذة ميتا المقفولة ليها ردّ مختلف عن «فشل الإرسال»',
    /error: closed \? 'window_closed' : 'send_failed'/.test(r));
  check('والجملة بتقول إن المطلوب قالب معتمد',
    /محتاج قالب معتمد/.test(raw('sokro/router.js')));
  check('والقناة بتمرّر كود ميتا زي ما هو',
    /err\.metaCode = /.test(code('sokro/channels/whatsapp-cloud.js')));
}

console.log(fail === 0
  ? '\n✅ كل مستخدم بيبعت من رقمه هو، ومفاتيحه في الخزنة مش في متغيّر بيئة.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
