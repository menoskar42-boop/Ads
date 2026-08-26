#!/usr/bin/env node
/**
 * استيراد العملاء المحتملين: بيقرا الملف الحقيقي ويتأكد من التحويل.
 *
 * ── ليه فحص ────────────────────────────────────────────────────────────
 *
 * الاستيراد بيكتب في `crm_leads` — القايمة اللي البايع بيشتغل منها. غلطة
 * هنا مش بتطلع رسالة خطأ، بتطلع **مكالمة غلط**: مورّد معدّات مطاعم
 * بيتسجّل تحت «نظام الطلبات» فالبايع بيعرض عليه منيو إلكتروني، أو رقم
 * مخترع بيوَدّي لحد مالوش علاقة.
 *
 * والفحص بيشتغل على **الملف الحقيقي** مش على عيّنة مخترعة، عشان أي دفعة
 * جديدة تتفحص بنفس القواعد قبل ما تتسجّل.
 *
 * Usage: node scripts/check-lead-import.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

const li = require('../src/lib/lead_import');
const { PRICES } = require('../src/lib/pricing');

// ── ١) الرقم بييجي من رابط واتساب بس — ومفيش تخمين ─────────────────────
//
// قاعدة مكتوبة في `docs/MANUS_LEADS_PROMPT.md`: «رقم واتساب مخترع بيحرق
// البايع مع حد غلط».

check('الرقم بيتقرا من `wa.me`',
  li.phoneFromWhatsApp('https://wa.me/201001716566') === '+201001716566',
  'الشكل الأساسي في الملف.');
check('ومن `api.whatsapp.com`',
  li.phoneFromWhatsApp('https://api.whatsapp.com/send?phone=201001716566') === '+201001716566',
  'الشكل التاني اللي بيظهر في صفحات فيسبوك.');
for (const bad of ['', null, 'https://facebook.com/page', 'wa.me/123', 'تليفون: 0100']) {
  check(`مفيش رقم من «${String(bad).slice(0, 28) || '(فاضي)'}»`,
    li.phoneFromWhatsApp(bad) === null,
    'أي استخراج من هنا بيبقى تخمين — والتخمين ممنوع.');
}

// ── ٢) الأولوية من إمكانية التواصل مش من تقدير البحث ───────────────────
//
// دي القاعدة اللي الملف اتكتب حواليها.

check('واتساب → أولوية عالية',
  li.priorityOf({ whatsapp_url: 'https://wa.me/201001716566' }) === 'high', '');
check('فيسبوك بس → عادية',
  li.priorityOf({ facebook_url: 'https://facebook.com/x' }) === 'normal', '');
check('ولا وسيلة → منخفضة',
  li.priorityOf({}) === 'low',
  'الصف اللي مالوش وسيلة تواصل مش «عميل محتمل» — ده اسم وعنوان. '
  + 'تسجيله بأولوية عادية بيخلّي البايع يكتشف ده بنفسه بعد نص ساعة.');
check('والثقة العالية **مابتترقّيش** صف مالوش وسيلة تواصل',
  li.priorityOf({ confidence: 'مرتفع' }) === 'low',
  'تقدير البحث بييجي بعد إمكانية التواصل مش قبلها.');

// ── ٣) القطاع بيتحوّل لنوع صفحة موجود عندنا ────────────────────────────

const MAP = [
  ['صيدلية', 'pharmacy'], ['سلسلة صيدليات', 'pharmacy'],
  ['عيادة أسنان', 'clinic'], ['عيادة أسنان تجميلية', 'clinic'],
  ['مطعم برجر', 'orders'], ['سلسلة مطاعم', 'orders'], ['كافيه', 'orders'],
  ['تجهيزات فنادق ومطاعم', 'shop'],
];
for (const [seg, want] of MAP) {
  check(`«${seg}» → ${want}`, li.categoryOf(seg) === want,
    `طلع «${li.categoryOf(seg)}».`);
}
check('والقطاع المش واضح بيرجع `null` مش تخمين',
  li.categoryOf('حاجة مالهاش علاقة') === null,
  'تخمين النظام بيخلّي البايع يعرض حاجة غلط في أول جملة.');

/* ⚠️ **الأسنان بتروح `clinic` مش نوع لوحدها.**
 * لو اتسجّلت `dental`، القايمة بتقول إن عندنا نظام تلتاشر — ونفس غموض
 * العدّ اللي اتصلّح في `llms.txt` بيرجع، بس المرة دي جوّه CRM. */
check('مفيش `dental` كنوع مستقل',
  li.categoryOf('عيادة أسنان') !== 'dental',
  'الأسنان تخصّص جوّه نظام العيادة — مش النظام التلتاشر.');

// ── ٤) وكل نوع بيتولّد فعلاً نظام عندنا ────────────────────────────────

const types = new Set(Object.keys(PRICES));
const produced = new Set();
for (const [, t] of MAP) produced.add(t);
const unknown = [...produced].filter((t) => !types.has(t));
check('كل نوع بيطلع من التحويل هو نظام عندنا', unknown.length === 0,
  `«${unknown.join('، ')}» مش في \`PRICES\` — يعني تصنيف مالوش منتج.`);

// ── ٥) والملف الحقيقي بيعدّي بالكامل ───────────────────────────────────

const FILE = 'data/leads/alexandria_100.csv';
const exists = fs.existsSync(path.join(ROOT, FILE));
check(`ملف الدفعة موجود (${FILE})`, exists, 'الاستيراد مالوش مدخل.');
if (exists) {
  const { execFileSync } = require('child_process');
  const out = execFileSync('node',
    [path.join(ROOT, 'scripts/import-leads.js'), FILE, 'check', '--dry'],
    { encoding: 'utf8' });
  const m = /صفوف: (\d+) · جاهز للتسجيل: (\d+) · متخطّى: (\d+)/.exec(out);
  check('الاستيراد الجاف بيشتغل على الملف الحقيقي', !!m, out.slice(0, 200));
  if (m) {
    check(`كل الصفوف بتتحوّل (${m[2]}/${m[1]})`, m[1] === m[2],
      `${m[3]} صف متخطّى — كل صف فيه اسم ورابط مصدر المفروض يعدّي.`);
    const noCat = /"—":(\d+)/.exec(out);
    check('مفيش صف بلا نظام مناسب', !noCat,
      `${noCat && noCat[1]} صف مش متصنّف — ضيف قاعدة في \`SEGMENT_RULES\` `
      + 'أو سيبه `null` بوعي (بس ساعتها الفحص ده بيتعدّل بوعي كمان).');
  }
}

// ── ٦) والإدخال محصّن ضد التكرار ───────────────────────────────────────

const script = fs.readFileSync(path.join(ROOT, 'scripts/import-leads.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
check('الإدخال بيتخطّى الرابط المتسجّل قبل كده',
  /WHERE NOT EXISTS \(SELECT 1 FROM crm_leads WHERE link = \$6\)/.test(script),
  'من غيره، تشغيلة تانية بتعمل مية صف مكرّر في CRM البايع.');
check('والتخطّي جوّه نفس الجملة مش `SELECT` منفصل',
  !/SELECT[\s\S]{0,120}FROM crm_leads[\s\S]{0,120};[\s\S]{0,200}INSERT INTO crm_leads/.test(script),
  'التنفيذ على مرحلتين بيسمح بسباق لو الاستيراد اتشغّل مرتين مع بعض.');
check('والقارئ بيحترم الاقتباس مش `split`',
  !/\.split\(','\)/.test(script),
  'عمود العنوان فيه فواصل جوّه اقتباس — التقسيم الساذج بيزحزح كل الأعمدة '
  + 'اللي بعده، والرابط بيروح مكان الثقة من غير أي خطأ.');

process.exit(failed ? 1 : 0);
