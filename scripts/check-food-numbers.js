#!/usr/bin/env node
/**
 * A silence that becomes a diet.
 *
 * The food form read every figure with `Number(v) || 0`. Three different
 * things arrived as the same zero:
 *
 *   · a box nobody filled in,
 *   · «٧٥» typed on the Arabic keyboard the page itself is written for,
 *   · a typo — «30 جم», a pasted cell with a non-breaking space.
 *
 * And zero is a REAL answer here: grilled chicken breast has 0 g of
 * carbohydrate. So nothing downstream — not the plan builder, not the printed
 * sheet, not the dietitian reading it back — can tell "no carbohydrate" from
 * "nobody typed it". Every plan built on that food is wrong by however much
 * was missing, and it displays a confident number the whole way.
 *
 * Two things this check insists on:
 *
 *   1. **The reader says when it cannot read.** `M.read()` returns a reason,
 *      not a number, so the caller has to decide — and the food route decides
 *      to refuse. `M.digits()` also teaches the money helpers Arabic numerals,
 *      because the same silence was eating weights and prices.
 *
 *   2. **The refusal names which kind it was.** "You left one blank" and "I
 *      could not read that" send the dietitian to different boxes.
 *
 *   node scripts/check-food-numbers.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const M = require('../src/lib/money');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── The reader, run rather than read ──────────────────────────────────── */
{
  check('الفاضي بيرجع «فاضي» مش صفر', M.read('').why === 'blank' && M.read('  ').why === 'blank');
  check('وغير الموجود كمان', M.read(undefined).why === 'blank' && M.read(null).why === 'blank');
  check('والصفر الحقيقي بيعدّي', M.read('0').ok === true && M.read('0').value === 0);
  check('والأرقام العربية بتتقرا', M.read('٧٥').value === 75, JSON.stringify(M.read('٧٥')));
  check('والكسر بالفاصلة العربية', M.read('3٫5').value === 3.5);
  check('والفاصل الألفي مابيكسرش', M.read('1,250').value === 1250);
  check('واللي مش رقم بيتقال إنه مش رقم',
    M.read('تلاتين').why === 'unreadable' && M.read('30 جم').why === 'unreadable');
  // The money helpers inherit it: a price typed in Arabic used to be the default.
  check('وحسابات الفلوس ورثت نفس القراءة', M.amount('٧٥') === 75 && M.count('٣') === 3);
  check('والفاضي في الفلوس لسه بياخد الافتراضي', M.amount('', 9) === 9);
}

/* ── The food form refuses instead of assuming ─────────────────────────── */
{
  const f = code('src/routes/nutrition_foods.js');
  check('مفيش تحويل صامت لصفر في صفحة الأطعمة',
    !/const num = \(v\) =>/.test(f) && !/Number\(b\.\w+\) \|\| 0/.test(f));
  check('والقيم الأربعة بتتقرا بالقارئ اللي بيعترض',
    /const got = M\.read\(b\[field\]\)/.test(f));
  check('والفاضي والمش-مفهوم ليهم ردّين مختلفين',
    /got\.why === 'blank' \? 'missing' : 'unreadable'/.test(f));
  check('وفيه سقف لكل رقم (٩٠٠ سعرة · ١٠٠جم ماكرو)',
    /\[\['kcal', 900\], \['protein_g', 100\], \['carbs_g', 100\], \['fat_g', 100\]\]/.test(f));
  check('والخارج عن الحد بيترفض', /got\.value > max\) return res\.redirect\('\/nutrition\/foods\?err=range'\)/.test(f));
  check('ووزن الحصة اختياري لكن لو اتكتب غلط بيتقال',
    /if \(String\(b\.serving_g \|\| ''\)\.trim\(\) !== ''\)/.test(f));
  check('وفشل الحفظ مابيرجعش «اتحفظ»',
    !/catch \(e\) \{ console\.error\('\[nutrition food save\]'[^}]*\}\s*\n\s*res\.redirect\('\/nutrition\/foods\?saved=1'\)/.test(f)
    && /err=save/.test(f));
  check('والرسالة أكواد معروفة مش كلام الرابط',
    /FOOD_ERRORS\.includes\(req\.query\.err\)/.test(f) && !/err: req\.query\.err \|\|/.test(f));
}

/* ── And the same silence in the clinical figures ──────────────────────── */
{
  const a = code('src/routes/nutrition_admin.js');
  check('القياسات: رقم اتكتب ومااتقراش بيوقف الحفظ',
    /\['weight_kg', 'body_fat_pct', 'waist_cm', 'muscle_kg'\]\.some\(\(f\) => bad\(b\[f\]\)\)/.test(a));
  check('وبيانات المريض كمان (الطول والهدف)',
    /\['height_cm', 'protein_per_kg', 'fat_percent', 'target_weight_kg'\]\.some\(\(f\) => bad\(b\[f\]\)\)/.test(a));
  check('و«فاضي يعني اتبع إعداد العيادة» لسه شغّال', /const num = \(v\) => \{ const r = M\.read\(v\); return r\.ok && r\.value > 0 \? r\.value : null; \}/.test(a));
  check('وفشل حفظ القياس بيتقال', /\?err=save'\)/.test(a));
  check('والأكواد متقيّدة', /NT_ERRORS\.includes\(req\.query\.err\)/.test(a) && !/err: req\.query\.err \|\|/.test(a));
}

/* ── The form itself asks for all four ─────────────────────────────────── */
{
  const v = fs.readFileSync(path.join(ROOT, 'src/views/nutrition_admin/foods.ejs'), 'utf8');
  for (const f of ['kcal', 'protein_g', 'carbs_g', 'fat_g']) {
    check(`خانة ${f} مطلوبة في الفورم`,
      new RegExp('name="' + f + '"[^>]*required').test(v));
  }
  check('والخانات بتقبل الأرقام العربية (مش type=number اللي بيرميها)',
    !/name="(kcal|protein_g|carbs_g|fat_g|serving_g)" type="number"/.test(v)
    && (v.match(/inputmode="decimal"/g) || []).length === 5);
}

/* ── And it can be said in both languages ──────────────────────────────── */
{
  const i18n = fs.readFileSync(path.join(ROOT, 'src/i18n/strings.js'), 'utf8');
  for (const k of ['nt.err.missing', 'nt.err.unreadable', 'nt.err.range', 'nt.err.no_name', 'nt.err.username']) {
    check('المفتاح `' + k + '` باللغتين',
      (i18n.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length === 2);
  }
}

console.log(fail
  ? `\n${fail} مشكلة — يعني خانة فاضية ممكن تتخزّن كصفر وتتحوّل خطة أكل.`
  : '\nالخانة الفاضية بتتقال، والأرقام العربية بتتقرا، والصفر الحقيقي لسه صفر.');
process.exit(fail ? 1 : 0);
