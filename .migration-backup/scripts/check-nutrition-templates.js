#!/usr/bin/env node
/**
 * القالب العلاجي مايتطبّقش أعمى على مريض.
 *
 * الأخصائي بيكتب «إنقاص وزن ١٥٠٠ سعرة» مية مرة، فالقالب حاجة منطقية. بس
 * القالب اتكتب لمريض تاني — والمريض اللي قدامه دلوقتي ممكن يكون عنده حساسية
 * من صنف جوّاه. تطبيق أعمى معناه إن الأخصائي بيسلّم خطة فيها الصنف اللي
 * المريض حساس منه، وهو فاكر إنه راجعها.
 *
 * ── الأربعة اللي الفحص ده بيمسكهم ────────────────────────────────────────
 *
 * ١) **السطر اللي فيه تعارض مابيتنسخش** — و**بيتقال باسمه**. لو اتنسخ خلاص
 *    خطة المريض فيها الحساسية. ولو اتشال في صمت الأخصائي هيفتكر إن المريض
 *    واخد القالب كامل. الاتنين غلط، والصح واحد: يترفض بصوت.
 *
 * ٢) **الصنف اللي راح (اتمسح/اتأرشف) بيترفض كمان** — القالب بيخزّن الاسم
 *    وقت الحفظ عشان يقدر يقول «الصنف الفلاني مابقاش موجود» بدل رقم.
 *
 * ٣) **«مش معروف» مابيمنعش.** المريض اللي مالوش قيود متسجّلة `safety` بيقول
 *    عنه «مش معروف» — ومنع القالب ساعتها معناه إن الميزة مابتشتغلش لأغلب
 *    المرضى. بيعدّي كتنبيه.
 *
 * ٤) **القيم بتتحسب وقت التطبيق من الصنف الحي**، مش متخزّنة في القالب. لو
 *    الأخصائي عدّل سعرات الصنف، القالب لازم يطلع بالجديد.
 *
 * وكمان: التطبيق في معاملة واحدة، والقالب مقيّد بالعيادة، والنتيجة بترجع
 * أرقام في الرابط — الصفحة مابتطبعش كلام جاي من العنوان.
 *
 *   node scripts/check-nutrition-templates.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const T = require('../src/nutrition/templates');
const { strings } = require('../src/i18n/strings');

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

const FOODS = [
  { id: 1, name: 'Oats', kcal: 380, protein_g: 13, carbs_g: 67, fat_g: 7 },
  { id: 2, name: 'Peanut butter', kcal: 588, protein_g: 25, carbs_g: 20, fat_g: 50 },
  { id: 3, name: 'Chicken breast', kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
];
// السطر ٤ صنفه مش في القايمة الحية — اتمسح بعد ما القالب اتحفظ.
const LINES = [
  { food_id: 1, food_name: 'Oats', meal: 'breakfast', grams: 50, note: null },
  { food_id: 2, food_name: 'Peanut butter', meal: 'snack1', grams: 30, note: null },
  { food_id: 3, food_name: 'Chicken breast', meal: 'lunch', grams: 200, note: null },
  { food_id: 4, food_name: 'Tuna', meal: 'dinner', grams: 150, note: null },
];
const ALLERGIC = { allergies: 'peanut', avoid_foods: null, diet_style: null };
const BLANK = { allergies: null, avoid_foods: null, diet_style: null };

/* ── ١. التعارض مابيتنسخش وبيتقال باسمه ─────────────────────────────────── */
{
  const r = T.planApply(LINES, FOODS, ALLERGIC);
  const names = r.apply.map((a) => a.food_name);
  check('السطر اللي فيه تعارض مابيتنسخش',
    !names.includes('Peanut butter'), names.join(' · '));
  const clash = r.refused.filter((x) => x.why === 'clash');
  check('وبيترجع باسمه مش بيختفي',
    clash.length === 1 && clash[0].food_name === 'Peanut butter');
  check('وبسبب واضح (الكلمة اللي عملت التعارض)',
    Array.isArray(clash[0] && clash[0].hits) && clash[0].hits.length > 0);
  check('والباقي بيتنسخ عادي — الرفض سطر مش قالب',
    names.includes('Oats') && names.includes('Chicken breast'));
}

/* ── ٢. الصنف اللي راح ─────────────────────────────────────────────────── */
{
  const r = T.planApply(LINES, FOODS, BLANK);
  const gone = r.refused.filter((x) => x.why === 'gone');
  check('الصنف اللي اتمسح بيترفض', gone.length === 1);
  check('وباسمه المتنسوخ وقت الحفظ مش برقمه',
    gone[0] && gone[0].food_name === 'Tuna', gone[0] && gone[0].food_name);
}

/* ── ٣. «مش معروف» مابيمنعش ────────────────────────────────────────────── */
{
  const r = T.planApply(LINES, FOODS, BLANK);
  check('المريض اللي مالوش قيود متسجّلة القالب بيتطبّق عليه',
    r.apply.length === 3, r.apply.length + ' سطر');
  check('و«مش معروف» بترجع كتنبيه مش كرفض',
    r.warned.length === 3 && r.refused.every((x) => x.why !== 'unknown'));
}

/* ── ٤. القيم محسوبة وقت التطبيق من الصنف الحي ─────────────────────────── */
{
  const r = T.planApply([LINES[0]], FOODS, BLANK);
  check('السعرات محسوبة من الصنف بالجرامات', r.apply[0].kcal === 190, String(r.apply[0].kcal));
  // نفس القالب على صنف اتعدّلت قيمته → الناتج بيتغيّر.
  const edited = [{ ...FOODS[0], kcal: 400 }];
  const r2 = T.planApply([LINES[0]], edited, BLANK);
  check('ولو الصنف اتعدّل القالب بيطلع بالجديد', r2.apply[0].kcal === 200, String(r2.apply[0].kcal));
  check('والوجبة اللي مش من قايمتنا بترجع لأول وجبة مش بتتكتب زي ما جت',
    T.planApply([{ ...LINES[0], meal: '<script>' }], FOODS, BLANK).apply[0].meal === 'breakfast');

  const from = T.linesFromPlan([
    { food_id: 1, meal: 'lunch', grams: 120, note: 'x' },
    { food_id: null, meal: 'lunch', grams: 50 },
  ]);
  check('والحفظ بيشيل السطر اللي مالوش صنف', from.length === 1);
  check('وبيخزّن الوصفة بس (وجبة · صنف · جرامات) من غير سعرات',
    from[0].grams === 120 && from[0].kcal === undefined);
}

/* ── ٥. الملخّص ────────────────────────────────────────────────────────── */
{
  const s = T.summary(T.planApply(LINES, FOODS, ALLERGIC));
  check('الملخّص بيقول اتنسخ كام واترفض كام وليه',
    s.copied === 2 && s.refused === 2 && s.byWhy.clash === 1 && s.byWhy.gone === 1,
    JSON.stringify(s));
}

/* ── ٦. الوصل بالراوت ──────────────────────────────────────────────────── */
{
  const r = code('src/routes/nutrition_plans.js');
  check('الراوت بيستعمل نفس الدالة مش بينسخ الأسطر بنفسه',
    /templates\.planApply\(lines, foods, patient\)/.test(r));
  check('وبيكتب اللي في `apply` بس', /for \(const l of result\.apply\)/.test(r));
  check('والتطبيق في معاملة واحدة',
    /apply-template[\s\S]*?BEGIN[\s\S]*?COMMIT/.test(r) && /apply-template[\s\S]*?ROLLBACK/.test(r));
  check('والقالب مقيّد بالعيادة في نفس الجملة',
    /JOIN nutrition_templates t ON t\.id = i\.template_id\s+WHERE i\.template_id=\$1 AND t\.company_id=\$2/.test(r));
  check('وقيود المريض بتتقرا من صف المريض بتاع الخطة نفسها',
    /FROM nutrition_patients WHERE id=\$1 AND company_id=\$2/.test(r));
  check('والأصناف الحية بس (المؤرشف مش منها)',
    /FROM nutrition_foods WHERE company_id=\$1 AND is_active/.test(r));
  check('والنتيجة بترجع أرقام في الرابط مش أسماء',
    /copied=\$\{s\.copied\}&clash=\$\{s\.byWhy\.clash \|\| 0\}&gone=\$\{s\.byWhy\.gone \|\| 0\}/.test(r));
  check('والصفحة بتقرا الأرقام دي كأرقام بس',
    /parseInt\(v, 10\); return Number\.isInteger\(x\) && x >= 0 \? x : null/.test(r));
  check('والحذف مقيّد بالعيادة',
    /DELETE FROM nutrition_templates WHERE id=\$1 AND company_id=\$2/.test(r));
  check('والقالب الفاضي مابيتحفظش', /err=tpl_empty/.test(r));

  const perms = code('src/nutrition/perms.js');
  check('والقالب على صلاحية الخطة نفسها (اللي مايكتبش خطة مايمسحش قالب)',
    /\['\/templates', 'clinical'\]/.test(perms));
}

/* ── ٧. المخطط والشاشة والكلام ─────────────────────────────────────────── */
{
  const schema = raw('src/nutrition/schema.js');
  check('جداول القوالب موجودة',
    /CREATE TABLE IF NOT EXISTS nutrition_templates/.test(schema)
    && /CREATE TABLE IF NOT EXISTS nutrition_template_items/.test(schema));
  check('واسم الصنف متنسوخ عشان الرفض يقدر يقول الاسم',
    /nutrition_template_items[\s\S]*?food_name\s+TEXT/.test(schema));
  check('والصنف اللي اتمسح بيسيب السطر (SET NULL) مش بيوقّع القالب',
    /food_id\s+INTEGER REFERENCES nutrition_foods\(id\) ON DELETE SET NULL/.test(schema));

  const page = raw('src/views/nutrition_admin/plan.ejs');
  check('والشاشة بتعرض المرفوض مش بس المنسوخ',
    /nt\.tpl\.clash/.test(page) && /nt\.tpl\.gone/.test(page));
  check('وزرار التطبيق مقفول لما مافيش قوالب',
    /!templates\.length\) \? 'disabled'/.test(page));

  const keys = ['nt.tpl.title', 'nt.tpl.apply', 'nt.tpl.save', 'nt.tpl.applied',
    'nt.tpl.copied', 'nt.tpl.clash', 'nt.tpl.gone', 'nt.tpl.warned',
    'nt.err.tpl_name', 'nt.err.tpl_empty', 'nt.err.tpl_pick', 'nt.err.tpl_save'];
  const missing = keys.filter((k) => !strings.ar[k] || !strings.en[k]);
  check('والكلام باللغتين', missing.length === 0, missing.join(', ') || 'تمام');
}

console.log(fail === 0
  ? '\n✅ القالب بيتطبّق بعد فحص المريض — واللي اترفض بيتقال باسمه.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
