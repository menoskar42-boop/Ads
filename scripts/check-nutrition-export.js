#!/usr/bin/env node
/**
 * تصدير عملاء التغذية إكسيل — بيانات العيادة ملكها، والسحب لصاحبها بس.
 *
 * اتعمل لأننا قولنا لعميلة محتملة «تقدري تسحبي قاعدة العملاء إكسيل» والزرار
 * ماكانش موجود. الوعد لازم يفضل صح، فالفحص ده بيمسك:
 *
 * ١) الراوت موجود ورابطه ظاهر في صفحة العملاء.
 * ٢) **صاحب العيادة بس**: الملف فيه السجل الطبي كله — المساعد والاستقبال
 *    مايفتحوش تحليل واحد (perms.js)، فمايسحبوش الكل. مقفول مرتين: في
 *    perms.js على المسار، وفي الراوت على الدور.
 * ٣) **كل استعلام مقيّد بالعيادة** (company_id) — ومربوط بيها في الـJOIN
 *    كمان، عشان قياس مريض عيادة تانية مايتسحبش باسم مريض عندنا.
 * ٤) النشطين **والمؤرشفين** (مفيش فلتر is_active) — «كل بياناتك» يعني كلها.
 * ٥) السحب بيتسجّل في سجل العمليات، والملف مايتخزّنش في كاش.
 *
 *   node scripts/check-nutrition-export.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const errors = [];
const check = (label, ok) => { if (!ok) errors.push(label); };

const r = code('src/routes/nutrition_admin.js');
const route = (r.match(/router\.get\('\/export'[\s\S]*?\n\}\);/) || [''])[0];
check('راوت /nutrition/export موجود', !!route);
check('صاحب العيادة بس (الراوت بيرفض أي دور تاني)',
  /if \(!req\.perms \|\| req\.perms\.role !== 'owner'\) return res\.redirect/.test(route));
const perms = require('../src/nutrition/perms');
check('والمسار نفسه على صلاحية clinical في perms.js', perms.needsFor('/export') === 'clinical');
check('والمساعد مالوش clinical', perms.ROLES.assistant.clinical === false && perms.ROLES.reception.clinical === false);

const sqls = route.match(/`SELECT[\s\S]*?`/g) || [];
check('تلات استعلامات (العملاء · القياسات · التحاليل)', sqls.length === 3);
check('كل استعلام مقيّد بالعيادة', sqls.every((q) => /company_id=\$1/.test(q)));
check('والـJOIN مربوط بالعيادة كمان',
  sqls.filter((q) => /JOIN nutrition_patients/.test(q)).every((q) => /p\.company_id = [ml]\.company_id/.test(q)));
check('النشطين والمؤرشفين الاتنين (مفيش فلتر is_active)', sqls.every((q) => !/is_active/.test(q)));
check('السحب بيتسجّل في سجل العمليات', /audit\.log\(pool, req, \{ entity: 'patient', action: 'export'/.test(route));
check('والملف مابيتخزّنش في كاش', /Cache-Control', 'no-store'/.test(route));
check('وفشله مابيرجّعش ملف ناقص', /err=save/.test(route));

const v = code('src/views/nutrition_admin/patients.ejs');
check('الزرار ظاهر في صفحة العملاء لصاحب العيادة بس',
  /perms\.role === 'owner'[\s\S]{0,80}\s*<a href="\/nutrition\/export"/.test(v));

const s = code('src/i18n/strings.js');
for (const k of ['btn', 'hint', 'patients', 'measurements', 'labs', 'email', 'target', 'status', 'active', 'archived',
  'created', 'date', 'weight', 'fat', 'waist', 'muscle', 'source', 'src_clinic', 'src_patient', 'lab', 'value', 'unit']) {
  check(`النص nt.ex.${k} بالعربي والإنجليزي`, (s.match(new RegExp(`'nt\\.ex\\.${k}':`, 'g')) || []).length === 2);
}

if (errors.length) {
  console.log('❌ check-nutrition-export:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-nutrition-export: تصدير العملاء إكسيل لصاحب العيادة بس، مقيّد بالعيادة، وبيتسجّل.');
