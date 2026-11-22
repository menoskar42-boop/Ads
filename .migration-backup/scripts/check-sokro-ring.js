#!/usr/bin/env node
/**
 * «سوكرو بيرنّلك» — الرن بيوصل، والنداء ليه عمر، والمكالمة بتبدأ بكلام.
 *
 * ── ليه الفحص ده لازم يقيس سلوك مش نص ───────────────────────────────────
 *
 * الميزة دي مبنية من أربع قطع بتتكلم مع بعض: `push` (VAPID) · `rings`
 * (حالة النداء) · service worker (بيعرض الإشعار) · الواجهة (بترد وتبدأ
 * المكالمة). أي واحدة فيهم ممكن تفضل «موجودة» وهي مش موصّلة — والنتيجة
 * إن سوكرو يقول «كلمتك» وهو ما رنّش.
 *
 * وبيئة الفحص هنا **مافيهاش قاعدة بيانات**، فالمنطق اللي محتاج SQL
 * بيتقاس بحقن `pool` وهمي بدل ما يتخطّى. فحص بيتخطّى نفسه فحص مش موجود.
 *
 * Usage: node scripts/check-sokro-ring.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const raw = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p) => raw(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

// ── ١) VAPID بيتقرا وقت النداء ─────────────────────────────────────────
//
// أول نسخة قرت `process.env` وقت التحميل، فالفحص كان بيشوف
// `configured=false` للأبد ويعدّي أخضر وهو مش بيقيس حاجة.

const push = require('../sokro/push');
const before = push.configured();
const generated = require('web-push').generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = generated.publicKey;
process.env.VAPID_PRIVATE_KEY = generated.privateKey;
check('إعداد VAPID بيتقرا وقت النداء مش وقت التحميل',
  before === false && push.configured() === true,
  'الإعداد اتقرا مرة واحدة عند التحميل — الفحص مش قادر يقيس، وأي تشغيل '
  + 'بيقرا الإعداد متأخّر هيلاقي الرن مطفي بلا سبب.');
check('والمفتاح العام بيرجع للمتصفح', push.publicKey() === generated.publicKey);

// ── ٢) النداء بيرفض يتعمل من غير كلام ──────────────────────────────────
//
// نداء بلا `brief` بيفتح مكالمة فاضية — التليفون بيرن، المستخدم بيرد،
// ومفيش حد بيتكلم. ده أسوأ من إن الرن مايجيش.

const calls = [];
const fakePool = {
  query: async (sql, params) => {
    calls.push([String(sql).replace(/\s+/g, ' ').trim(), params]);
    if (/INSERT INTO sokro_rings/.test(sql)) {
      return { rows: [{ id: 7, reason: params[1], brief: params[2], meta: {}, status: 'pending' }] };
    }
    if (/UPDATE sokro_rings SET status = 'answered'/.test(sql)) {
      return { rows: [{ id: 7, reason: 'task', brief: 'خلصت البحث', meta: {} }] };
    }
    return { rows: [], rowCount: 1 };
  },
};
const realLoad = Module._load;
Module._load = function (req) {
  if (req === 'pg') return { Pool: function () { return fakePool; } };
  return realLoad.apply(this, arguments);
};
for (const k of Object.keys(require.cache)) {
  if (/sokro[\/\\](rings|push)[\/\\]/.test(k)) delete require.cache[k];
}
const rings = require('../sokro/rings');

(async () => {
  const empty = await rings.create(1, { reason: 'task', brief: '   ' });
  check('النداء بلا كلام بيترفض', empty.ok === false,
    'نداء من غير `brief` بيفتح مكالمة فاضية — التليفون بيرن ومحدّش بيتكلم.');

  calls.length = 0;
  const made = await rings.create(1, { reason: 'task', brief: 'خلصت البحث اللي طلبته' });
  check('والنداء السليم بيتعمل', made.ok === true, made.error || '');

  // نداء واحد مستني: القديم بيتقفل قبل ما الجديد يتكتب.
  const supersede = calls.findIndex((c) => /superseded/.test(c[0]));
  const insert = calls.findIndex((c) => /INSERT INTO sokro_rings/.test(c[0]));
  check('والقديم بيتقفل **قبل** ما الجديد يتكتب',
    supersede > -1 && insert > -1 && supersede < insert,
    'رنّتين ورا بعض إزعاج، والتانية بتلغي الأولى من على الشاشة قبل ما تتقري.');
  check('والقديم بيتقفل كـ`superseded` مش `missed`',
    calls.some((c) => /superseded/.test(c[0])) && !calls.some((c) => /= 'missed'/.test(c[0])),
    'نداء اتبدّل مش نداء اتفوّت — خلط الاتنين بيخلّي عدّاد «اتفوّت» يكدب.');

  // العمر: `expires_at` بيتحسب في نفس جملة الإدخال.
  const ins = calls.find((c) => /INSERT INTO sokro_rings/.test(c[0]));
  check('ولكل نداء عمر بينتهي', /expires_at/.test(ins[0]) && /interval/.test(ins[0]),
    'نداء بلا عمر بيفضل «مستني» للأبد — والرن على حاجة عدّت أسوأ من مفيش رن.');

  // الرد حالة نهائية: `status = 'pending'` شرط في نفس الـUPDATE.
  calls.length = 0;
  await rings.answer(1, 7);
  const upd = calls.find((c) => /answered/.test(c[0]));
  check('والرد مابيتكرّرش على نفس النداء',
    upd && /status = 'pending'/.test(upd[0]) && /expires_at > now\(\)/.test(upd[0]),
    'من غير الشرط، إعادة تحميل الصفحة بتبدأ المكالمة من الأول والمساعد '
    + 'بيعيد نفس الكلام.');

  // ── ٣) الاشتراك الميّت بيتمسح — والعطل المؤقّت لأ ────────────────────
  const p = code('sokro/push/index.js');
  check('الاشتراك الميّت (404/410) بيتمسح',
    /statusCode === 404 \|\| e\.statusCode === 410/.test(p) && /DELETE FROM sokro_push_subs/.test(p),
    'من غير مسح، كل رن بيحاول على أجهزة مافيش و«اتبعت لتلات أجهزة» رقم مالوش معنى.');
  check('والعطل المؤقّت مابيمسحش',
    !/catch[\s\S]{0,120}DELETE FROM sokro_push_subs/.test(p),
    'مسح اشتراك سليم بسبب عطل شبكة معناه إن المستخدم يبطّل يستقبل خالص.');

  // ── ٤) الـservice worker بيعرض ويوجّه ────────────────────────────────
  const express = require('express');
  const app = express();
  app.use(require('../sokro/router'));
  const srv = app.listen(0, async () => {
    const port = srv.address().port;
    const sw = await (await fetch('http://127.0.0.1:' + port + '/sw.js')).text();
    try { new Function(sw); check('كود الـservice worker بيتحلّل', true); }
    catch (e) { check('كود الـservice worker بيتحلّل', false, e.message); }
    check('وفيه مستقبل للـpush', /addEventListener\('push'/.test(sw),
      'من غيره الرن بيوصل للمتصفح ومايظهرش.');
    check('والإشعار بيستنى الرد مش بيختفي', /requireInteraction:true/.test(sw),
      'النداء المفروض يستنى الرد — إشعار بيختفي بعد ثواني مش نداء.');
    check('والضغط بيركّز التبويب المفتوح', /clients\.matchAll/.test(sw) && /focus/.test(sw),
      'تبويبين على نفس الحساب = مكالمتين ممكن يبدأوا على نفس النداء.');
    check('ونسخة الكاش اتغيّرت', /sokro-v2/.test(sw),
      'نفس اسم الكاش بعد تعديل الـSW معناه إن المتصفح يفضل شغّال بالقديم.');

    // ── ٥) الواجهة: الرد بيبدأ مكالمة بكلام ─────────────────────────────
    const ui = code('sokro/ui/app.html');
    check('الرد بيبدأ المكالمة بالـbrief', /startRealtime\(d\.ring\.brief\)/.test(ui),
      'من غيره المكالمة بتفتح ساكتة والمستخدم يقول «ألو؟» على مساعد نده عليه.');
    check('والـbrief بيتبعت بعد ما القناة تفتح', /rtDc\.onopen\s*=/.test(ui),
      'الإرسال على قناة لسه بتتفتح بيضيع من غير خطأ.');
    check('والشاشة بتتقفل بعد ما السيرفر يقبل',
      /answer[\s\S]{0,300}if\(!d\.ok\)[\s\S]{0,120}hideRing\(\)/.test(ui),
      'قفل الشاشة قبل تأكيد السيرفر بيخلّي المستخدم فاكر إنه رد على حاجة ماحصلتش.');
    check('والإذن مابيتطلبش لوحده عند الفتح', /pushRegister\(false\)/.test(ui),
      'طلب إذن الإشعارات أول ما الصفحة تفتح بتعاقب عليه المتصفحات، والمستخدم '
      + 'بيرفض من غير ما يعرف الطلب على إيه.');
    check('والمكالمة الشغّالة مافيهاش شاشة نداء', /if\(rtOn\|\|rtPc\)/.test(ui),
      '`ring_user` متاحة جوّه المكالمة — الشاشة كانت هتغطّي المكالمة اللي إنت فيها.');

    // ── ٦) الأداة موجودة ومش حسّاسة ─────────────────────────────────────
    const reg = require('../sokro/actions');
    const perms = require('../sokro/permissions');
    const act = reg.get('ring_user');
    check('أداة `ring_user` مسجّلة', !!act,
      'من غيرها المساعد مش قادر يرن — الرن بيبقى زرار اختبار وبس.');
    check('ومش حسّاسة', act && !perms.isSensitive(act.permissions),
      'الرن بيوصل لصاحب الحساب نفسه — طلب موافقة قبل كل رن معناه إن '
      + 'المستخدم لازم يفتح التطبيق عشان يوافق إن التطبيق ينده عليه.');
    check('وظاهرة للمكالمة الحيّة', require('../sokro/realtime').tools().some((t) => t.name === 'ring_user'));

    srv.close();
    console.log(failed ? `\n❌ ${failed} مشكلة` : '\n✅ الرن موصّل من الأداة لحد الشاشة');
    process.exit(failed ? 1 : 0);
  });
})();
