#!/usr/bin/env node
/**
 * العناصر الدقيقة — والحدّ اللي إحنا واقفين عنده.
 *
 * إحنا **مانشحنش قاعدة تركيب أغذية**. الأرقام اللي بتقول إن ١٠٠ جم عدس فيهم
 * كام مليجرام حديد بتيجي من جداول ليها مصادر ورخص، وبتختلف بالبلد وطريقة
 * الطبخ. اختراعها بالتقريب في نظام أخصائي بيبني عليه خطة لمريض أنيميا مش
 * «تقريب» — ده رقم غلط بيتقال بثقة.
 *
 * فاللي بنعمله: خانات الأخصائي بيملاها من مرجعه هو. واللي مامتلاش يفضل **مش
 * معروف**.
 *
 * ── الأربعة اللي الفحص ده بيمسكهم ────────────────────────────────────────
 *
 * ١) **الخانة الفاضية بتفضل NULL** — لا في المخطط ولا في القراية بتبقى صفر.
 *    صفر حديد على صنف حقيقي جواب؛ خانة محدش لمسها مش جواب.
 *
 * ٢) **مجموع ناقص مايتعرضش كأنه كامل.** الشاشة بتقول الرقم ومعاه كام سطر مش
 *    محسوب. مجموع بيجمع اللي يعرفه ويسكت عن الباقي بيدّي رقم أقل من الحقيقة،
 *    والأخصائي يقرا «نقص حديد» على مريض مافيهوش نقص.
 *
 * ٣) **مافيش ولا قيمة → `null` مش صفر.**
 *
 * ٤) **مفيش احتياج يومي موصى به معروض.** الرقم ده بيختلف بالسن والجنس والحمل
 *    والحالة — ونشره كمرجع معناه إن الشاشة بتفتي.
 *
 *   node scripts/check-nutrition-micros.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MI = require('../src/nutrition/micros');
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

/* ── ١. فاضي ≠ صفر ─────────────────────────────────────────────────────── */
{
  check('الخانة الفاضية بترجع «مش مسجّل» مش صفر',
    MI.readField('', 1000).ok === true && MI.readField('', 1000).value === null);
  check('والفراغ كمان', MI.readField('   ', 1000).value === null);
  check('والصفر اللي اتكتب فعلاً بيفضل صفر',
    MI.readField('0', 1000).value === 0);
  check('واللي اتكتب ومااتقراش بيترفض مش بيبقى صفر',
    MI.readField('حديد', 1000).ok === false);
  check('واللي بره المدى بيترفض (غلطة كتابة ٥٠٠ بدل ٥)',
    MI.readField('5000', 1000).why === 'range' && MI.readField('-1', 1000).why === 'range');
  check('والأرقام العربية بتتقرا', MI.readField('١٫٢', 1000).value === 1.2);

  const all = MI.readAll({ iron_mg: '2.5' });
  check('وقراية الفورم كلها: اللي اتكتب اتقرا واللي فاضي فضل null',
    all.ok && all.values.iron_mg === 2.5 && all.values.calcium_mg === null);
  check('وخانة واحدة بايظة بتوقّف الحفظ كله',
    MI.readAll({ iron_mg: 'x' }).ok === false);
}

/* ── ٢. المجموع بيقول اللي مش محسوب ───────────────────────────────────── */
{
  const t = MI.totals([
    { grams: 100, food: { iron_mg: 1.2 } },
    { grams: 200, food: { iron_mg: 2 } },
    { grams: 150, food: null },          // الصنف اتمسح
    { grams: 50, food: { iron_mg: null } }, // الخانة فاضية
  ]);
  check('المجموع بيتحسب لكل ١٠٠ جم زي باقي النظام',
    t.iron_mg.value === 5.2, String(t.iron_mg.value));
  check('وبيقول كام سطر داخل الحسبة وكام برّه',
    t.iron_mg.counted === 2 && t.iron_mg.missing === 2);
  check('والعنصر اللي مافيش ولا سطر فيه قيمة بيرجع null مش صفر',
    t.calcium_mg.value === null && t.calcium_mg.missing === 4);
  check('والوحدة بترجع مع الرقم', t.iron_mg.unit === 'mg');
  check('والخطة الفاضية مش «صفر حديد»', MI.totals([]).iron_mg.value === null);
  check('و`anyRecorded` بيفرّق بين مسجّل ومش مسجّل',
    MI.anyRecorded(t) === true && MI.anyRecorded(MI.totals([])) === false);

  // جرامات مش مقروءة مابتتحوّلش صفر — بتبقى سطر مش محسوب.
  const bad = MI.totals([{ grams: null, food: { iron_mg: 5 } }]);
  check('والسطر اللي جراماته مش مقروءة بيتعدّ «مش محسوب»',
    bad.iron_mg.value === null && bad.iron_mg.missing === 1);
}

/* ── ٣. المخطط ─────────────────────────────────────────────────────────── */
{
  const schema = raw('src/nutrition/schema.js');
  for (const m of MI.MICROS) {
    const re = new RegExp('ADD COLUMN IF NOT EXISTS ' + m.key + '\\s+NUMERIC\\([0-9, ]+\\);');
    if (!re.test(schema)) { check('عمود ' + m.key + ' موجود', false); }
  }
  check('كل الأعمدة موجودة',
    MI.MICROS.every((m) => new RegExp('ADD COLUMN IF NOT EXISTS ' + m.key).test(schema)));
  check('ومفيش واحد فيهم DEFAULT 0 (ده كان هيخلي كل صنف يدّعي صفر حديد)',
    MI.MICROS.every((m) => !new RegExp(m.key + '[^;]*DEFAULT').test(schema)));
  check('ومفيش واحد فيهم NOT NULL',
    MI.MICROS.every((m) => !new RegExp(m.key + '[^;]*NOT NULL').test(schema)));
}

/* ── ٤. الحفظ والعرض ──────────────────────────────────────────────────── */
{
  const foods = code('src/routes/nutrition_foods.js');
  check('الحفظ بيقرا الخانات من نفس الوحدة',
    /const got = micros\.readAll\(b\)/.test(foods));
  check('والرفض بكوده مش بصمت',
    /if \(!got\.ok\) return res\.redirect\('\/nutrition\/foods\?err=' \+ \(got\.why === 'range' \? 'range' : 'unreadable'\)\)/.test(foods));
  check('والأعمدة بتتبني من نفس القايمة مش مكتوبة بالإيد',
    /micros\.KEYS\.map\(\(k, i\) => `\$\{k\}=\$\$\{9 \+ i\}`\)/.test(foods));

  const plans = code('src/routes/nutrition_plans.js');
  check('والخطة بتحسب المجاميع من نفس الوحدة',
    /microTotals: micros\.totals\(/.test(plans));
  check('وبتوصّل صف الصنف الحالي لكل سطر',
    /food: foodsById\.get\(Number\(i\.food_id\)\) \|\| null/.test(plans));

  const form = raw('src/views/nutrition_admin/foods.ejs');
  check('وخانات الصنف مبنية من القايمة (عنصر جديد مايحتاجش تعديل القالب)',
    /MICROS\.forEach\(function\(m\)\{/.test(form));
  check('ومفيش واحدة فيهم required — كلها اختيارية',
    !/name="iron_mg"[^>]*required/.test(form));

  const page = raw('src/views/nutrition_admin/plan.ejs');
  check('والشاشة بتقول «مش مسجّل» لما مافيش قيمة',
    /v\.value === null/.test(page) && /nt\.mi\.unknown/.test(page));
  check('وبتقول كام سطر مش محسوب مع الرقم الناقص',
    /if \(v\.missing\)/.test(page) && /nt\.mi\.missing/.test(page));
  check('ومفيش احتياج يومي معروض جنب الرقم',
    !/rda|daily_value|nt\.mi\.target/i.test(page));
}

/* ── ٥. الكلام ─────────────────────────────────────────────────────────── */
{
  const keys = ['nt.fd.micros', 'nt.fd.micros_hint', 'nt.pl.micros', 'nt.pl.micros_hint',
    'nt.mi.unknown', 'nt.mi.missing', 'nt.u.g', 'nt.u.mg', 'nt.u.ug']
    .concat(MI.MICROS.map((m) => 'nt.mi.' + m.key));
  const missing = keys.filter((k) => !strings.ar[k] || !strings.en[k]);
  check('كل عنصر له اسم باللغتين', missing.length === 0, missing.join(', ') || 'تمام');
  check('والشرح بيقول صراحةً إن إحنا مش بنشحن جدول تركيب أغذية',
    /مانشحنش/.test(strings.ar['nt.fd.micros_hint'])
    && /do not ship/.test(strings.en['nt.fd.micros_hint']));
  check('والخطة بتقول إن مفيش احتياج يومي هنا',
    /احتياج يومي/.test(strings.ar['nt.pl.micros_hint'])
    && /recommended daily intake/.test(strings.en['nt.pl.micros_hint']));
}

console.log(fail === 0
  ? '\n✅ العناصر الدقيقة بقيم الأخصائي — والمجموع الناقص بيقول إنه ناقص.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
