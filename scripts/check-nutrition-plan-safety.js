#!/usr/bin/env node
/**
 * باني الخطة الغذائية — الحساسية بتوقف الحفظ، والصفحة مابتكدبش.
 *
 * من مراجعة خارجية للوحة التغذية (٢٠٢٦-٠٩-٢٣)، أربع مشاكل حقيقية:
 *
 * ١) **صنف متعارض مع ملف المريض كان بيتحفظ، والتحذير بيظهر بعدها.** ساعتها
 *    الخطة اللي المريض بيفتحها على موبايله فيها الصنف خلاص. دلوقتي أول ضغطة
 *    مابتحفظش؛ الصفحة بتسأل، و«ضيفه رغم كده» محتاج سبب مكتوب بيتسجّل.
 * ٢) **«اتحفظ» على حفظ أو حذف فشل** — الخطأ بيتكتب في اللوج والأخصائي بيشوف نجاح.
 * ٣) **التفعيل كان جملتين من غير معاملة** — ودلوقتي معاملة بقفل، وفشلها (زي
 *    الفهرس اللي بيمنع خطتين نشطين) بيتقال.
 * ٤) **✕ بيحذف من غير تأكيد.**
 *
 * ومعاهم مشكلة لقيناها واحنا بنختبر (١): المطابقة كانت substring، و«بيض» جوّه
 * «أبيض» — حساسية البيض كانت بتعلّم على الأرز الأبيض والعيش الأبيض، ولو (١)
 * اتطبّق من غيرها كانت هتوقفهم. دلوقتي المطابقة من أول الكلمة.
 *
 *   node scripts/check-nutrition-plan-safety.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const errors = [];
const check = (label, ok) => { if (!ok) errors.push(label); };

const r = code('src/routes/nutrition_plans.js');
const add = (r.match(/router\.post\('\/plans\/:id\(\\\\d\+\)\/items',[\s\S]*?\n\}\);/) || [''])[0];
const del = (r.match(/router\.post\('\/plans\/:id\(\\\\d\+\)\/items\/:iid\(\\\\d\+\)\/delete'[\s\S]*?\n\}\);/) || [''])[0];
const act = (r.match(/router\.post\('\/plans\/:id\(\\\\d\+\)\/activate'[\s\S]*?\n\}\);/) || [''])[0];
check('راوت إضافة الصنف والحذف والتفعيل موجودين', !!add && !!del && !!act);

// ١) الحساسية
check('الإضافة بتفحص الصنف ضد ملف المريض قبل الحفظ',
  /safety\.checkFood\(food, patient\)/.test(add) && add.indexOf('checkFood') < add.indexOf('INSERT INTO nutrition_plan_items'));
check('المتعارض من غير تأكيد بيرجع من غير ما يتحفظ', /if \(b\.override !== '1'\) return res\.redirect\(back\)/.test(add));
check('والتأكيد محتاج سبب ٥ حروف على الأقل', /const OVERRIDE_REASON_MIN = 5;/.test(r) && /reason\.length < OVERRIDE_REASON_MIN/.test(add));
check('والتجاوز بيتسجّل بالسبب في سجل العمليات', /action: 'override_clash'/.test(add) && /reason \}/.test(add));
check('والرابط فيه أرقام بس مش اسم الصنف', /'\?clash=' \+ food\.id \+ '&g=' \+ Math\.round\(grams\) \+ '&meal=' \+ meal/.test(add));
check('والصفحة بتعيد الفحص بنفسها قبل ما تعرض المربع', /function clashAskFrom[\s\S]{0,400}safety\.checkFood\(food, patient\)/.test(r));
const v = code('src/views/nutrition_admin/plan.ejs');
check('مربع التأكيد فيه سبب إلزامي', /id="clash-ask"/.test(v) && /name="override_reason" required minlength="5"/.test(v) && /name="override" value="1"/.test(v));

// ٢) مفيش «اتحفظ» على فشل
const noLie = (src) => /catch \(e\) \{[\s\S]{0,200}return res\.redirect\([^)]*err=save/.test(src) && !/catch \(e\) \{[^}]*\}\s*\n\s*res\.redirect\([^)]*saved=1/.test(src);
check('فشل إضافة الصنف بيقول فشل', noLie(add));
check('فشل الحذف بيقول فشل، وحذف صف مش موجود كمان', noLie(del) && /r\.rowCount \? '\?saved=1' : '\?err=save'/.test(del));
check('فشل التفعيل بيقول فشل', noLie(act));
check('والصفحة بتعرض أكواد معروفة بس', /err: PLAN_ERRORS\.includes\(req\.query\.err\)/.test(r) && !/err: req\.query\.err \|\| null/.test(r));

// ٣) التفعيل
check('التفعيل في معاملة بقفل على خطط المريض',
  /BEGIN/.test(act) && /FOR UPDATE/.test(act) && /COMMIT/.test(act) && /ROLLBACK/.test(act));
check('والفهرس «خطة نشطة واحدة» لسه في المخطط',
  /CREATE UNIQUE INDEX IF NOT EXISTS idx_nut_one_active_plan\s+ON nutrition_plans \(patient_id\) WHERE is_active/.test(code('src/nutrition/schema.js')));

// ٤) تأكيد الحذف
check('✕ بيسأل قبل الحذف', /data-confirm="<%= t\('nt\.pl\.del_confirm'\)[\s\S]{0,80}onsubmit="return confirm\(this\.dataset\.confirm\)"/.test(v));

// المطابقة
const S = require('../src/nutrition/safety');
const cases = [
  ['أرز أبيض مسلوق', 'بيض', false], ['توست أبيض', 'بيض', false], ['فاصوليا بيضا مسلوقة', 'بيض', false],
  ['بيض مسلوق', 'بيض', true], ['صفار بيض', 'بيض', true], ['البيض', 'بيض', true], ['بيضة', 'بيض', true],
  ['لبنة', 'لبن', true], ['شوكولاتة باللبن', 'لبن', true], ['raw eggplant', 'egg', false], ['boiled eggs', 'egg', true],
];
for (const [hay, term, want] of cases) check(`«${term}» في «${hay}» = ${want}`, S.matchesTerm(hay, term) === want);
const { CATALOG } = require('../src/nutrition/food_catalog');
const eggHits = CATALOG.filter((x) => S.checkFood({ name: x[0], category: x[6] }, { allergies: 'بيض' }).state === 'clash').map((x) => x[0]);
check(`حساسية البيض على القائمة الجاهزة = أصناف البيض بس (${eggHits.join('، ')})`, eggHits.length === 5 && eggHits.every((n) => /بيض/.test(n) && !/أبيض/.test(n)));

const s = code('src/i18n/strings.js');
for (const k of ['nt.ov.title', 'nt.ov.body', 'nt.ov.reason', 'nt.ov.go', 'nt.ov.cancel', 'nt.err.reason', 'nt.pl.del_confirm',
  'nt.safe.k_allergy', 'nt.safe.k_dislike', 'nt.safe.k_diet']) {
  check(`النص ${k} بالعربي والإنجليزي`, (s.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length === 2);
}

if (errors.length) {
  console.log('❌ check-nutrition-plan-safety:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-nutrition-plan-safety: المتعارض مابيتحفظش من غير سبب، ومفيش «اتحفظ» على فشل، والتفعيل في معاملة.');
