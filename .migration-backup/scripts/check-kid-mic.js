#!/usr/bin/env node
/**
 * زرار الميكروفون في تطبيق الأطفال كان بيرد «مقدرتش أفتح الميكروفون 🙈».
 *
 * ── السبب المباشر: الطلب كان بيتأخّر عن الضغطة ──────────────────────────
 *
 * `toggleListen` كانت بترحّب الأول، وبعدين تنادي `beginRecording` جوّه
 * `setTimeout(1500)` — يعني `getUserMedia` بتتنادي **بعد ما إيماءة الضغط
 * تخلص بثانية ونص**. وسفاري على الآيفون بتربط إذن الميكروفون بإيماءة
 * المستخدم: الطلب اللي بره الإيماءة بيترفض. فميزو بيرحّب، وبعدين يفشل.
 *
 * ── والسبب التاني: الرسالة مكنتش بتقول إيه اللي حصل ──────────────────────
 *
 * `catch (e)` كان بيبلع `e.name`، فأربع حالات مختلفة تماماً بتطلع بنفس
 * الجملة: الإذن مرفوض · مافيش ميكروفون · الميكروفون مشغول في تطبيق تاني ·
 * السياق مش آمن. والأب اللي بيقرا «مقدرتش» مايعرفش يعمل إيه.
 *
 * الجملة اللي مابتقولش الخطوة الجاية زيّها زي مفيش جملة.
 *
 *   node scripts/check-kid-mic.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const raw = fs.readFileSync(path.join(ROOT, 'mykid/js/core/assistant.js'), 'utf8');
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── ١. الطلب جوّه الضغطة ──────────────────────────────────────────────── */
{
  const toggle = /async function toggleListen\(\) \{[\s\S]*?\n\}/.exec(src);
  check('`toggleListen` موجودة', !!toggle);
  check('والميكروفون بيتطلب جوّاها مباشرةً',
    toggle && /await navigator\.mediaDevices\.getUserMedia\(/.test(toggle[0]));

  // الطلب لازم يسبق أي `setTimeout` في الدالة — وإلا هو بره الإيماءة تاني.
  if (toggle) {
    const body = toggle[0];
    const atRequest = body.indexOf('getUserMedia');
    const atTimer = body.indexOf('setTimeout');
    check('والطلب **قبل** أي مؤقّت في نفس الدالة',
      atRequest > -1 && (atTimer === -1 || atRequest < atTimer),
      'getUserMedia@' + atRequest + ' · setTimeout@' + atTimer);
  }
  check('ومفيش `getUserMedia` مدفونة جوّه `setTimeout` في الملف كله',
    !/setTimeout\([^)]*\{[^}]*getUserMedia/.test(src.replace(/\n/g, ' ')));
  check('والترحيب بقى بعد الإذن مش قبله',
    /getUserMedia\([\s\S]*?Speech\.mizo\(INVITE\)/.test(src));
}

/* ── ٢. التيار مابيتسابش مفتوح ─────────────────────────────────────────── */
{
  check('التيار بيتقفل لو التسجيل ما ابتداش',
    (src.match(/stream\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/g) || []).length >= 3,
    (src.match(/stream\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/g) || []).length + ' موضع');
  check('و`beginRecording` بتاخد التيار الجاهز مش بتطلب واحد تاني',
    /async function beginRecording\(stream\)/.test(src));
}

/* ── ٣. أربع حالات بأربع جمل ───────────────────────────────────────────── */
{
  check('فيه دالة بتترجم سبب الرفض', /function micProblem\(err\)/.test(src));
  const fn = /function micProblem\(err\) \{[\s\S]*?\n\}/.exec(src);
  const body = fn ? fn[0] : '';
  check('والإذن المرفوض له جملته', /NotAllowed\|Permission\|Security/.test(body));
  check('والجهاز الناقص له جملته', /NotFound/.test(body));
  check('والميكروفون المشغول له جملته', /NotReadable/.test(body));

  // مشغّلة فعلاً: كل حالة لازم تدّي جملة مختلفة عن التانية.
  const mod = new Function('err', body.replace(/^function micProblem\(err\) \{/, '').replace(/\}$/, ''));
  const msgs = [
    mod({ name: 'NotAllowedError' }),
    mod({ name: 'NotFoundError' }),
    mod({ name: 'NotReadableError' }),
    mod({ name: 'SomethingElse' }),
  ];
  check('والأربعة بيدّوا تلات جمل مختلفة على الأقل',
    new Set(msgs).size >= 3, new Set(msgs).size + ' جملة');
  check('وجملة الإذن بتقول للأب يعمل إيه',
    /اسمح/.test(msgs[0]), msgs[0]);
  check('ومفيش حالة بترجع فاضي', msgs.every((m) => typeof m === 'string' && m.length > 5));
  check('والرسالة بتستنى وقت كفاية عشان تتقري',
    /showBubble\(""\), 4000/.test(src));
}

console.log(fail === 0
  ? '\n✅ الميكروفون بيتطلب وقت الضغطة، والرفض بيقول سببه.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
