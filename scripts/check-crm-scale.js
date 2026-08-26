#!/usr/bin/env node
/**
 * لوحة CRM مابتسحبش كل الجدول في كل زيارة.
 *
 * ── المشكلة ────────────────────────────────────────────────────────────
 *
 *     SELECT * FROM crm_leads <where> ORDER BY ...      ← بلا حد
 *     SELECT * FROM crm_activities ORDER BY created_at  ← **كل التفاعلات**
 *
 * التاني هو الأخطر: مش بيسحب تفاعلات العملاء المعروضين، بيسحب **كل**
 * التفاعلات في النظام كله عشان يبني خريطة في الذاكرة. وجدول التفاعلات
 * بيكبر أسرع من جدول العملاء بكتير — كل مكالمة وكل ملاحظة وكل رسالة صف.
 *
 * مع مية عميل اتسجّلوا من دفعة واحدة، ومع كل دفعة جاية، الاتنين بيكبروا
 * خطياً — وأول ما اللوحة تبقى بطيئة، بتبقى بطيئة **على المالك وهو بيشتغل**.
 *
 * كشفتها مراجعة كود خارجية.
 *
 * Usage: node scripts/check-crm-scale.js
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

/* ⚠️ تجريد التعليقات قبل أي بحث — التعليق اللي بيشرح الاستعلام القديم
 * مالوش ذنب، ولو الفحص شافه أول حل هيخطر على البال هو مسح الشرح.
 * دي سادس مرة الملاحظة دي تتكتب في المشروع. */
const src = fs.readFileSync(path.join(ROOT, 'src/routes/admin.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

// نعزل راوت الـCRM لوحده.
const start = src.indexOf("router.get('/crm'");
const end = src.indexOf("router.", src.indexOf('res.render(\'admin/crm/index\'', start));
const crm = start > -1 ? src.slice(start, end > start ? end : start + 6000) : '';

check('راوت `/admin/crm` موجود', crm.length > 0, 'مش لاقيه في `admin.js`.');

// ── ١) العملاء بترقيم ──────────────────────────────────────────────────

check('استعلام العملاء فيه `LIMIT`', /FROM crm_leads[\s\S]{0,200}LIMIT/.test(crm),
  '`SELECT * FROM crm_leads` بلا حد بيكبر مع كل دفعة عملاء جديدة.');
check('وفيه `OFFSET` للصفحة', /OFFSET/.test(crm),
  'من غيره كل الصفحات بتعرض نفس الخمسين.');
check('وعدّاد منفصل للإجمالي', /COUNT\(\*\)::int AS n FROM crm_leads/.test(crm),
  'الأدمن اللي شايف ٥٠ وهو عنده ٣٠٠ لازم يعرف.');

// ── ٢) والتفاعلات لعملاء الصفحة بس ─────────────────────────────────────
//
// دي القاعدة اللي الفحص اتكتب عشانها.

check('التفاعلات مقيّدة بعملاء الصفحة',
  /FROM crm_activities WHERE lead_id = ANY\(\$1\)/.test(crm),
  '`SELECT * FROM crm_activities` من غير شرط بيسحب **كل** تفاعلات النظام '
  + 'في كل زيارة — وجدول التفاعلات بيكبر أسرع من جدول العملاء بكتير.');
check('ومفيش سحب مطلق للتفاعلات',
  !/SELECT \* FROM crm_activities ORDER BY/.test(crm),
  'لسه فيه استعلام بيسحب الجدول كله.');
check('والاستعلام مابيتشغّلش لو الصفحة فاضية', /if \(ids\.length\)/.test(crm),
  'صفحة بلا عملاء مامحتاجهاش استعلام تفاعلات أصلاً.');

// ── ٣) والشريط بيبان للأدمن ────────────────────────────────────────────

const view = fs.readFileSync(path.join(ROOT, 'src/views/admin/crm/index.ejs'), 'utf8');
check('القالب بيعرض رقم الصفحة والإجمالي',
  /typeof pages !== 'undefined'/.test(view) && /totalLeads/.test(view),
  'الترقيم اللي محدّش شايفه بيخلّي الأدمن يفتكر إن دول كل العملاء.');
check('وروابط التنقّل بتحفظ الفلاتر',
  /currentFilter/.test(view) && /currentSort/.test(view)
  && /pageUrl/.test(view),
  'التنقّل اللي بيضيّع الفلتر بيرجّع الأدمن للقايمة الكاملة كل صفحة.');

// ── ٤) والقالب بيتجمّع ─────────────────────────────────────────────────

try {
  require('ejs').compile(view, { filename: 'src/views/admin/crm/index.ejs' });
  check('القالب بيتجمّع', true, '');
} catch (e) {
  check('القالب بيتجمّع', false, e.message.split('\n')[0]);
}

process.exit(failed ? 1 : 0);
