#!/usr/bin/env node
/**
 * دفتر جهات الاتصال: الرقم مشفّر، والاسم الغامض مابيتخمّنش.
 *
 * ── ليه الفحص ده موجود ─────────────────────────────────────────────────
 *
 * الوحدة دي هي اللي هتخلّي «اتصل بمراتي» جملة قابلة للتنفيذ. وفيها
 * خاصيّتين لو اتكسروا الضرر مالوش رجعة:
 *
 *   ١. **الرقم بيانات طرف تالت.** مراته ما اختارتش تدّي رقمها لسوكرو.
 *      فبيتخزّن مشفّر ومابيرجعش خام في أي رد — واللي بيرجع `phone_hint`
 *      (آخر ٤ أرقام): يكفي المستخدم يميّز، ومايكفيش حد يتصل.
 *   ٢. **الاسم الغامض بيوقف.** «اتصل بأحمد» وعندك أحمد أخوك وأحمد
 *      العميل — رجوع «أقرب نتيجة» معناه إن رسالة شخصية ممكن توصل
 *      للعميل. ودي مش زي بحث بيرجع نتيجة غلط وتعيد.
 *
 * الفحص بيشتغل **بلا قاعدة بيانات**: الدوال النقيّة بتتقاس مباشرة،
 * والبحث بتتحقن ليه نتايج وهمية. البيئة هنا مافيهاش Postgres، وفحص
 * بيتخطّى نفسه فحص مش موجود.
 *
 * Usage: node scripts/check-sokro-contacts.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const code = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

const contacts = require('../sokro/contacts');
const src = code('sokro/contacts/index.js');
const schema = code('sokro/schema.js');

// ── ١) الاسم العربي بيتطبّع، والفروق الحقيقية بتفضل ────────────────────

const same = [['أحمد', 'احمد'], ['سارة', 'ساره'], ['مُحَمَّد', 'محمد'], ['يحيى', 'يحيي']];
const bad = same.filter(([a, b]) => contacts.normalize(a) !== contacts.normalize(b));
check('نفس الاسم بأشكال كتابة مختلفة بيتطابق', bad.length === 0,
  bad.map((p) => p.join('≠')).join('، ')
  + ' — بحث بيفرّق بينهم بيقول «مش موجود» على حد موجود.');

const differ = [['أحمد', 'محمد'], ['سارة', 'سيرة'], ['علي', 'عالي']];
const merged = differ.filter(([a, b]) => contacts.normalize(a) === contacts.normalize(b));
check('والأسماء المختلفة بتفضل مختلفة', merged.length === 0,
  merged.map((p) => p.join('=')).join('، ')
  + ' — التطبيع بلع فرق حقيقي، والمكالمة ممكن تروح للغلط.');

// ── ٢) الرقم: توحيد بلا تخمين كود دولة ────────────────────────────────

check('نفس الرقم بصيغ مختلفة بيتوحّد',
  contacts.sameNumber('0155-240-6406', '01552406406')
  && contacts.sameNumber('0155 240 6406', '01552406406'),
  'من غير التوحيد، الاستيراد المكرّر بيعمل نسخ من نفس الشخص.');

check('والرقم الغلط بيترفض',
  contacts.normalizePhone('123') === null && contacts.normalizePhone('abc') === null
  && contacts.normalizePhone('') === null,
  'رقم قصير أو نص مش رقم ماينفعش يتخزّن كأنه رقم.');

// المحلي مابيتحوّلش لدولي بالتخمين: كود الدولة قرار المستخدم. اللي
// بيخمّن +20 على رقم سعودي بيتصل بالبلد الغلط.
check('ومفيش تخمين لكود الدولة', contacts.normalizePhone('01552406406') === '01552406406',
  'التحويل التلقائي لدولي بيخمّن البلد — والتخمين الغلط مكالمة غلط.');

check('والتلميح آخر ٤ أرقام بس', contacts.hintOf('01552406406') === '6406',
  'التلميح بيتعرض للمستخدم — أكتر من كده بيبقى الرقم نفسه.');

// ── ٣) الرقم مشفّر، ومابيرجعش خام ─────────────────────────────────────

check('التخزين عن طريق الـvault', /vault\.encrypt\(/.test(src) && /require\('\.\.\/secrets\/vault'\)/.test(src),
  'رقم طرف تالت مخزّن خام = تسريب لو القاعدة اتقريت.');

check('والعمود مشفّر في السكيمة', /phone_enc TEXT NOT NULL/.test(schema) && !/phone TEXT NOT NULL/.test(schema),
  'عمود اسمه phone بنص صريح بيدعو إن حد يكتب فيه خام.');

// أي `SELECT` بيرجع للمستخدم ماينفعش يحتوي العمود المشفّر — ماعدا
// `phoneOf` اللي شغلتها بالظبط إنها تفكّه وقت الاتصال.
// ⚠️ لازم يشيل الـ`WHERE` كمان. أول نسخة وقفت عند `FROM sokro_contacts`،
// فكانت بتفحص نص مافيهوش الشرط أصلاً وتقول «مفيش user_id» على كود سليم.
// حارس بيفشّل شغل صح أسوأ من حارس مش موجود — بيعلّم إن الأحمر مش معناه شيء.
const selects = src.match(/SELECT[\s\S]*?FROM sokro_contacts[^`']*/g) || [];
const leaky = selects.filter((q) => /phone_enc/.test(q));
check('ومفيش استعلام بيرجّع العمود المشفّر غير واحد', leaky.length === 1,
  `${leaky.length} استعلام بيسحب phone_enc — المفروض واحد (phoneOf) بس.`);

check('وكل استعلام مقيّد بالمستخدم',
  selects.every((q) => /user_id = \$/.test(q)),
  'استعلام بلا user_id بيرجّع جهات اتصال حد تاني.');

// ── ٤) البحث: تلات حالات، والغامض مابيتخمّنش ──────────────────────────
//
// الحالة `ambiguous` بتتقاس بالسلوك مش بوجود الكلمة: الدالة بتتنفّذ
// على نتايج محقونة بدل قاعدة بيانات.

check('البحث بيعرف حالة `ambiguous`', /'ambiguous'/.test(src) && /'none'/.test(src) && /'found'/.test(src),
  'حالتين بس معناها إن الغامض هيرجع كـ«لقيت» — ومكالمة للغلط.');

const fake = (rows) => {
  const mod = { rows };
  const Module = require('module');
  const realLoad = Module._load;
  Module._load = function (r) {
    if (r === 'pg') return { Pool: class { async query() { return mod; } } };
    return realLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve('../sokro/contacts')];
  const c = require('../sokro/contacts');
  Module._load = realLoad;
  return c;
};

(async () => {
  const two = fake([
    { id: 1, display_name: 'أحمد', relation: 'أخويا', phone_hint: '1111' },
    { id: 2, display_name: 'أحمد', relation: 'عميل', phone_hint: '2222' },
  ]);
  const amb = await two.find(1, 'احمد');
  check('اسمين متطابقين → غامض مش أول واحد', amb.status === 'ambiguous' && amb.candidates.length === 2,
    `رجع ${amb.status} — ده بالظبط اللي بيوَدّي رسالة شخصية لعميل.`);
  check('والمرشّحين بيرجعوا بالتلميح مش بالرقم',
    amb.candidates.every((c) => !('phone_enc' in c) && !('phone' in c) && c.phone_hint),
    'سؤال توضيحي بيعرض أرقام = تسريب في صيغة سؤال عادي.');

  const one = fake([
    { id: 1, display_name: 'أحمد سمير', relation: null, phone_hint: '1111' },
    { id: 2, display_name: 'محمدي', relation: null, phone_hint: '2222' },
  ]);
  const hit = await one.find(1, 'أحمد');
  check('ومطابقة أوضح من غيرها → واحد محدّد', hit.status === 'found' && hit.contact.id === 1,
    `رجع ${hit.status} — الغموض المفتعل بيخلّي كل مكالمة تسأل.`);

  const none = fake([]);
  check('ومفيش نتيجة → `none`', (await none.find(1, 'خالد')).status === 'none');

  console.log(failed ? `\n❌ ${failed} مشكلة` : '\n✅ دفتر جهات الاتصال: مشفّر، والغامض بيوقف');
  process.exit(failed ? 1 : 0);
})();
