#!/usr/bin/env node
/**
 * تلات صفحات رقيقة كانوا معفيين من فحص الرقّة.
 *
 * `seo-audit-tenants` بيرفض أي صفحة تحت ١٢٠ كلمة — وكان فيه استثناء مكتوب
 * بالاسم لتلات قوالب: `orders` ١١٦ · `furniture` ١٢١ · `nutrition` ٩٦. الاستثناء
 * كان أمين (بيمنع الفحص من الكدب) بس الصفحات فضلت رقيقة، وصفحة رقيقة متأرشفة
 * = صفحة doorway محتملة ضد حساب أدسنس — الخط الأحمر المكتوب في `CLAUDE.md`.
 *
 * ── الحل مش حشو ─────────────────────────────────────────────────────────
 *
 * التلات صفحات كانت **مش بتعرض بيانات موجودة عندنا أصلاً**:
 *   · المطعم: مناطق التوصيل ورسومها ووقتها — مدفونة جوّه قائمة منسدلة في
 *     السلة، والزبون اللي لسه بيقرّر ماكانش يشوفها. وهي أول سؤال بيتسأل.
 *   · المعرض: سياسة التسليم والتركيب، والضمان المتسجّل على القطعة، والفروع.
 *   · العيادة: مالهاش أي بيانات خدمات — فاتضافت خانة **يكتبها الأخصائي
 *     بنفسه**. نص جاهز من عندنا كان هيبقى حشو معروض باسمه.
 *
 * وبوابة أرشفة العيادة كانت بتقيس بطول الحروف (٤٠ حرف = ٦ كلمات)، فصفحة
 * ٩٦ كلمة كانت بتعدّي. بقت بتقيس كلام العيادة نفسه.
 *
 *   node scripts/check-thin-pages.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const W = require('../src/lib/tenant_words');

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

/* ── ١. الاستثناء اتشال ────────────────────────────────────────────────── */
{
  const audit = raw('scripts/seo-audit-tenants.js');
  const m = audit.match(/const KNOWN_SHORT = \{([^}]*)\}/);
  check('قايمة الاستثناءات موجودة في الفحص', !!m);
  check('وفاضية — مفيش قالب معفي من حد الرقّة', !!m && !m[1].trim(), m && m[1].trim());
  // الحد نفسه لسه شغّال في الملف اللي بيحسبه.
  check('وحد الـ١٢٠ كلمة لسه مطبَّق',
    /words < 120\) out\.push\(`محتوى قليل جداً/.test(raw('scripts/seo-audit.js')));
}

/* ── ٢. بيانات التاجر اللي بقت تتعرض ───────────────────────────────────── */
{
  const orders = raw('src/views/tenant_orders.ejs');
  check('صفحة المطعم بتعرض مناطق التوصيل كقسم مقروء',
    /orders\.zones_title/.test(orders) && /__allZones/.test(orders));
  check('وبتقول «توصيل مجاني» بدل ما تكتب صفر',
    /orders\.free_delivery/.test(orders));
  check('والمنطقة اللي مالهاش حد أدنى بتتكتب — مش صفر',
    /Number\(z\.min_order\) > 0 \? \(__money\(z\.min_order\)[^)]*\) : '—'/.test(orders));

  const furn = raw('src/views/tenant_furniture.ejs');
  check('وصفحة المعرض بتعرض سياسة التسليم', /fnp\.delivery\.(prepaid|cod)/.test(furn));
  check('والفروع بأنواعها', /fnp\.branch\./.test(furn) && /furnitureBranches/.test(furn));
  // ضمان صفر = مفيش ضمان، ودي حقيقة عن القطعة مش خانة ناقصة.
  check('والضمان بيظهر لما يكون فيه ضمان بس',
    /Number\(p\.warranty_months\) > 0/.test(furn));

  const nut = raw('src/views/tenant_nutrition.ejs');
  check('وصفحة العيادة بتعرض الخدمات اللي الأخصائي كتبها', /ntp\.services/.test(nut));
  check('والقسم بيختفي لو مكتبش حاجة', /if \(__services\.length\)/.test(nut));

  // القاعدة اللي البند نفسه بيقولها: محتوى حقيقي مش حشو. مفيش نص جاهز
  // بيتكتب باسم التاجر في القوالب التلاتة.
  const settings = raw('src/views/nutrition_admin/settings.ejs');
  check('والخانة في اللوحة بتقول إنها بكلامه هو', /nt\.set\.services_hint/.test(settings));

  const route = code('src/routes/tenant.js');
  check('والفروع بتتقرا من قاعدة البيانات مقيّدة بالشركة',
    /FROM furniture_branches\s+WHERE company_id = \$1 AND is_active/.test(route));
  check('والضمان بيتقرا مع القطعة', /warranty_months/.test(route));
}

/* ── ٣. البوابة بتقيس كلام مش حروف ─────────────────────────────────────── */
{
  check('أربعين حرف مش أربعين كلمة',
    W.words('كلمة كلمة كلمة') === 3 && W.words('') === 0);
  check('والفاضي صفر مش «مش معروف»', W.totalWords([null, undefined, '']) === 0);
  check('والصفوف بتوزن كلمات', W.enough([], 10, 40).ok === true);
  check('والنص القصير مابيعدّيش', W.enough(['كلمتين بس'], 0, 40).ok === false);
  const r = W.enough(['كلمة '.repeat(45)], 0, 40);
  check('واللي كتب فعلاً بيعدّي', r.ok === true, String(r.count));

  const route = code('src/routes/tenant.js');
  check('وبوابة العيادة بقت تقيس كلام العيادة نفسها',
    /tenantWords\.enough\(\s*\[company\.description, nutritionSettings && nutritionSettings\.about,/.test(route));
  check('والخدمات جزء من القياس', /nutritionSettings && nutritionSettings\.services\]/.test(route));
  check('ومفيش قياس بطول الحروف في بوابة العيادة',
    !/about >= 60\) && company\.slug !== 'nutrition'/.test(route));
  check('والعيادة التجريبية لسه بره الفهرس', /company\.slug !== 'nutrition'/.test(route));
}

/* ── ٤. الخانة الجديدة متخزّنة وبتتحفظ ─────────────────────────────────── */
{
  const schema = raw('src/nutrition/schema.js');
  check('عمود الخدمات موجود', /ADD COLUMN IF NOT EXISTS services TEXT/.test(schema));
  const admin = code('src/routes/nutrition_admin.js');
  check('وبيتحفظ من اللوحة', /services=EXCLUDED\.services/.test(admin));
  check('وسطر لكل خدمة بحد أقصى',
    /split\(\/\\r\?\\n\/\)[\s\S]{0,140}?slice\(0, 12\)/.test(admin));
}

console.log(fail === 0
  ? '\n✅ التلات صفحات بقت بتعرض بيانات التاجر الحقيقية، ومفيش قالب معفي من حد الرقّة.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
