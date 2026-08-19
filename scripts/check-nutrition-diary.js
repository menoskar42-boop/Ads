#!/usr/bin/env node
/**
 * The diary of ticks, and the plan that could feed a peanut to a peanut allergy.
 *
 * ── Two defects, both of them silent ────────────────────────────────────────
 *
 * **The diary was a checkbox.** The plan said "grilled chicken, 150g" and the
 * patient pressed done. That answers "did you follow the plan" and nothing
 * else — and people eat things that are not on the plan, which is the entire
 * problem a dietitian is solving. A week of ticks shows perfect compliance for
 * a patient who gained two kilos, and the follow-up visit is spent guessing.
 *
 * **Nothing recorded what would harm them.** Height, weight, goal — and no
 * allergies, conditions or medications. So a plan could hand a peanut allergy a
 * peanut and no screen would notice.
 *
 * ── The two rules being defended ────────────────────────────────────────────
 *
 * A day's total that silently drops the free-text entries under-counts, and the
 * patient looks compliant. So a total is a pair: the number, and how many
 * entries it could NOT account for.
 *
 * And a food check has three answers, never two. `unknown` painted green turns
 * "nobody checked" into "checked and safe", which is the sentence that gets
 * somebody hurt.
 *
 *   node scripts/check-nutrition-diary.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const D = require('../src/nutrition/diary');
const S = require('../src/nutrition/safety');
const { strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const portal = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/nutrition_portal.js'), 'utf8'));
const admin = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/nutrition_admin.js'), 'utf8'));
const view = fs.readFileSync(path.join(ROOT, 'src/views/nutrition_portal/today.ejs'), 'utf8');

/* ── A total that cannot quietly under-count ───────────────────────────── */
{
  const food = { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 };
  check('الأكلة المعروفة بتتحسب بالجرام',
    JSON.stringify(D.macrosOf({ grams: 150 }, food)) === '{"known":true,"kcal":247.5,"protein":46.5,"carbs":0,"fat":5.4}',
    JSON.stringify(D.macrosOf({ grams: 150 }, food)));
  check('واللي مكتوب بالكلام مالوش أرقام', D.macrosOf({ text: 'كشري' }, null).known === false);
  const totals = D.dayTotals([{ grams: 150, food }, { free_text: 'كشري', food: null }, { grams: null, food }]);
  check('واليوم بيقول كام حاجة ما اتحسبتش', totals.uncounted === 2 && totals.counted === 1, JSON.stringify(totals));
  check('و«ناقص» حالة مش هامش', totals.partial === true);
  check('ويوم كله محسوب مش ناقص', D.dayTotals([{ grams: 100, food }]).partial === false);
  check('ويوم فاضي مش ناقص', D.dayTotals([]).partial === false);
  // The screen must show it, not just carry it.
  check('والشاشة بتعرض إن في حاجات مش محسوبة', /ateTotals\.partial/.test(view) && /nd\.partial/.test(view));
  check('وكل سطر مش محسوب متعلّم', /nd\.uncounted/.test(view));
}

/* ── Nothing is invented ───────────────────────────────────────────────── */
{
  check('أكلة معروفة من غير كمية بتترفض', D.readEntry({ food_id: '3' }).why === 'grams');
  check('وفورم فاضي مش تسجيل', D.readEntry({}).why === 'empty' && D.readEntry({ text: '   ' }).why === 'empty');
  check('وكلام لوحده مقبول', D.readEntry({ text: 'كشري من بره' }).ok === true);
  check('والأرقام العربية بتتقرا', D.readEntry({ food_id: '3', grams: '١٥٠' }).grams === 150);
  check('وكمية مستحيلة بتتقص', D.grams('99999') === 5000 && D.grams('-5') === null && D.grams('x') === null);
  check('ووجبة مش معروفة بترجع للفطار', D.mealOf('brunch') === 'breakfast' && D.mealOf('lunch') === 'lunch');
  // And the route must not accept a food from another practice.
  check('والأكلة لازم تكون من قائمة الدكتور بتاعه',
    /FROM nutrition_foods WHERE id=\$1 AND company_id=\$2 AND is_active=true/.test(portal));
  check('والتسجيل بيتكتب كـ«اتاكل» مش تعليم',
    /INSERT INTO nutrition_diary[\s\S]{0,200}'ate'/.test(portal));
  check('والتعليم القديم لسه شغّال لوحده', /kind='tick'/.test(portal));
  check('والمريض بيمسح اللي هو كتبه بس',
    /DELETE FROM nutrition_diary WHERE id=\$1 AND patient_id=\$2 AND company_id=\$3 AND kind='ate'/.test(portal));
}

/* ── Three answers, never two ──────────────────────────────────────────── */
{
  const p = { allergies: 'مكسرات, peanut', diet_style: 'vegetarian', avoid_foods: 'خيار' };
  check('الحساسية بتتمسك في اسم الأكلة',
    S.checkFood({ name: 'زبدة الفول السوداني peanut butter' }, p).state === 'clash');
  check('ونمط الأكل كمان', S.checkFood({ name: 'فراخ مشوية' }, p).hits[0].kind === 'diet');
  check('واللي مالوش تعارض بيبقى سليم', S.checkFood({ name: 'أرز أبيض' }, p).state === 'clear');
  // The two states that must never be drawn as safe.
  check('وأكلة من غير اسم = مش معروف مش سليم',
    S.checkFood({ name: '' }, p).state === 'unknown' && S.checkFood({ name: '' }, p).why === 'no_name');
  check('ومريض مالوش قيود = مش معروف مش سليم',
    S.checkFood({ name: 'أي حاجة' }, {}).state === 'unknown');
  check('وحرف واحد مايتحسبش قاعدة', S.parseList('a, مكسرات').join() === 'مكسرات');
  check('والفاصلة العربية بتفصل', S.parseList('مكسرات، سمك').length === 2);
  check('والتكرار بيتشال', S.parseList('سمك, سمك').length === 1);
  const scan = S.scanPlan([{ id: 1, name: 'peanut toast' }, { id: 2, name: 'أرز' }], p);
  check('ومسح الخطة بيرجّع المتعارض بس', scan.length === 1 && scan[0].item.id === 1);
  check('والصفحة بتفرّق بين «مفيش تعارض» و«مافيش قيود»',
    /planScan\.state === 'no_rules'/.test(fs.readFileSync(path.join(ROOT, 'src/views/nutrition_admin/patient.ejs'), 'utf8')));
  // The claim this module refuses to make.
  const src = fs.readFileSync(path.join(ROOT, 'src/nutrition/safety.js'), 'utf8');
  check('والملف نفسه مكتوب فيه إنه بيحذّر مش بيضمن', /does not certify|refuses to claim/i.test(src));
}

/* ── Pregnancy changes the numbers ─────────────────────────────────────── */
{
  check('الرضاعة ليها سعرات زيادة', S.stageExtra('breastfeeding') === 500);
  check('والتلت الأول لأ', S.stageExtra('pregnant_t1') === 0);
  check('وحالة مش معروفة بتبقى صفر مش NaN', S.stageExtra('nonsense') === 0);
  check('والراوت بيقبل الحالات المعروفة بس',
    /Object\.prototype\.hasOwnProperty\.call\(safety\.STAGE_KCAL, String\(b\.stage\)\)/.test(admin));
  check('ونمط الأكل كمان', /Object\.prototype\.hasOwnProperty\.call\(safety\.DIETS, String\(b\.diet_style\)\)/.test(admin));
}

/* ── A substitute is a quantity, and it is checked like anything else ───── */
{
  const SW = require('../src/nutrition/swaps');
  const foods = [
    { id: 2, name: 'Rice', kcal: 130, protein_g: 2.7, category: 'grain' },
    { id: 3, name: 'Fish', kcal: 206, protein_g: 22, category: 'protein' },
    { id: 4, name: 'peanut butter', kcal: 588, protein_g: 25, category: 'protein' },
    { id: 5, name: 'Cucumber', kcal: 15, protein_g: 0.6, category: 'veg' },
    { id: 6, name: 'Mystery', kcal: 0, protein_g: 0, category: null },
  ];
  const line = { food_id: 1, name: 'Chicken', kcal: 330, protein_g: 62, category: 'protein', grams: 200 };
  const out = SW.candidates(line, foods, { allergies: 'peanut' }, { limit: 5 });

  check('البديل بيتقاس بنفس السعرات', SW.scaleTo({ kcal: 206 }, 330) === 160, String(SW.scaleTo({ kcal: 206 }, 330)));
  check('وأكلة مالهاش سعرات مالهاش بديل يتحسب', SW.scaleTo({ kcal: 0 }, 330) === null);
  check('واللي يتعارض مع المريض مابيتعرضش أصلاً',
    !out.options.some((o) => /peanut/i.test(o.food.name)), out.options.map((o) => o.food.name).join(' · '));
  check('واللي مش قابل للقياس مابيتعرضش', !out.options.some((o) => o.food.id === 6));
  check('وكمية خيالية مش بديل', !out.options.some((o) => o.food.id === 5));
  check('واللي من نفس النوع بيتقدّم', out.options[0].food.id === 3, out.options[0].food.name);
  check('وكل بديل معاه كميته', out.options.every((o) => Number.isFinite(o.grams) && o.grams > 0));
  check('وسطر من غير سعرات بيقول ليه', SW.candidates({ kcal: 0 }, foods, {}).why === 'no_energy');
  // The state the screen must mark rather than hide.
  const unchecked = SW.candidates(line, [{ id: 9, name: 'Fish', kcal: 206, protein_g: 22 }], {}, {});
  check('والبديل اللي ما اتأكدناش منه بيوصل متعلّم',
    unchecked.options[0].safety === 'unknown', unchecked.options[0].safety);
  const planView = fs.readFileSync(path.join(ROOT, 'src/views/nutrition_admin/plan.ejs'), 'utf8');
  check('والصفحة بتعلّمه', /o\.safety !== 'clear'/.test(planView));
}

/* ── A shopping list that leaves things out says so ────────────────────── */
{
  const SW = require('../src/nutrition/swaps');
  const list = SW.shoppingList([
    { food_id: 1, food_name: 'Chicken', grams: 200 },
    { food_id: 1, food_name: 'Chicken', grams: 100 },
    { food_id: 2, food_name: 'Rice', grams: 80 },
    { food_name: '', grams: 50 },          // nothing to call it
    { food_name: 'Soup', grams: 0 },       // nothing to weigh
  ], 7);
  check('القايمة بتجمع نفس الأكلة', list.lines.find((l) => l.name === 'Chicken').grams === 2100);
  check('وبتضرب في عدد الأيام', list.lines.find((l) => l.name === 'Rice').grams === 560);
  check('وبتقول كام سطر ما دخلش', list.uncounted === 2 && list.partial === true, JSON.stringify(list.uncounted));
  check('وعدد أيام مجنون بيتقص', SW.shoppingList([], 999).days === 31 && SW.shoppingList([], 0).days === 7);
  check('وقايمة كاملة مش ناقصة', SW.shoppingList([{ food_id: 1, food_name: 'x', grams: 10 }], 3).partial === false);
  const planView = fs.readFileSync(path.join(ROOT, 'src/views/nutrition_admin/plan.ejs'), 'utf8');
  check('والصفحة بتعرض النقص', /shopping\.partial/.test(planView) && /nt\.shop\.partial/.test(planView));
}

/* ── A day with nothing logged is not a day of zero ────────────────────── */
{
  const C = require('../src/nutrition/checkin');
  const rows = [
    { water_glasses: 8, sleep_hours: 7, steps: null, mood: 'good' },
    { water_glasses: null, sleep_hours: 5, steps: null, mood: null },
    { water_glasses: 6, sleep_hours: null, steps: null, mood: 'bad' },
  ];
  const sum = C.summarize(rows);
  // The whole point: `Number(null)` is 0 and 0 is finite, so a naive average
  // counts every silent day as zero water — and a patient looks worse the less
  // they use the app, which is the number a dietitian would act on.
  check('المتوسط على الأيام اللي فيها قراءة بس',
    sum.water.avg === 7 && sum.water.days === 2, JSON.stringify(sum.water));
  check('والنوم كمان', sum.sleep.avg === 6 && sum.sleep.days === 2, JSON.stringify(sum.sleep));
  check('واللي مافيهوش ولا قراءة بيرجع null مش صفر',
    sum.steps.avg === null && sum.steps.days === 0, JSON.stringify(sum.steps));
  // 'good' is 4 and 'bad' is 1, so the fortnight averages to the middle.
  check('والمزاج بيتوسّط وبيرجع كلمة', C.moodWord(sum.mood.avg) === 'ok', String(C.moodWord(sum.mood.avg)));
  check('ومفيش بيانات = مفيش متوسط', C.summarize([]).water.avg === null);
  check('ومتوسط مش رقم مالوش كلمة', C.moodWord(null) === null);

  check('وصفر كوباية إجابة حقيقية', C.glasses('0') === 0);
  check('وخانة فاضية مش إجابة', C.glasses('') === null && C.hours('  ') === null);
  check('والأرقام العربية بتتقرا', C.glasses('٨') === 8);
  check('والقيم المستحيلة بتتقص', C.hours('30') === 24 && C.steps('9999999') === 100000);
  check('وفورم فاضي مش تسجيل', C.readCheckin({}).why === 'empty');
  check('وملاحظة لوحدها تسجيل', C.readCheckin({ note: 'يوم صعب' }).ok === true);
  check('ومزاج مش من القايمة بيتشال', C.readCheckin({ mood: 'ecstatic', water_glasses: 2 }).value.mood === null);

  const portal = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/nutrition_portal.js'), 'utf8'));
  check('واليوم الواحد صف واحد',
    /ON CONFLICT \(patient_id, on_date\) DO UPDATE/.test(portal));
  check('والتعديل مابيمسحش اللي اتسجّل قبل كده',
    /COALESCE\(EXCLUDED\.water_glasses, nutrition_checkins\.water_glasses\)/.test(portal));
  const schema = fs.readFileSync(path.join(ROOT, 'src/nutrition/schema.js'), 'utf8');
  check('والفهرس الفريد بيثبّت ده',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_nut_checkin_day ON nutrition_checkins \(patient_id, on_date\)/.test(schema));
}

/* ── Who went quiet ────────────────────────────────────────────────────── */
{
  const C = require('../src/nutrition/checkin');
  const now = new Date('2026-08-19T12:00:00Z');
  const ago = (d) => new Date(now.getTime() - d * 86400000);
  check('اللي سجّل امبارح شغّال', C.engagement(ago(1), now).state === 'active');
  check('واللي بقاله أسبوع ساكت', C.engagement(ago(7), now).state === 'stale');
  check('وبيقول بقاله كام يوم', C.engagement(ago(21), now).days === 21);
  // "Never started" is a different phone call from "stopped".
  check('واللي عمره ما سجّل حالته لوحدها', C.engagement(null, now).state === 'never');
  check('وتاريخ بايظ مش «شغّال»', C.engagement('nonsense', now).state === 'never');
  const practice = stripComments(fs.readFileSync(path.join(ROOT, 'src/nutrition/practice.js'), 'utf8'));
  check('والقايمة بتحسبها من آخر حاجة عملها فعلاً',
    /MAX\(created_at\) FROM nutrition_diary/.test(practice) && /MAX\(updated_at\) FROM nutrition_checkins/.test(practice));
  check('و«epoch» مابتتقريش على إنها ١٩٧٠', /getFullYear\(\) > 1971/.test(practice));
  const view = fs.readFileSync(path.join(ROOT, 'src/views/nutrition_admin/patients.ejs'), 'utf8');
  check('والصفحة بتعلّم الساكت', /nc\.eng\.' \+ eng\.state/.test(view));
}

/* ── Words ─────────────────────────────────────────────────────────────── */
{
  const keys = ['title', 'sub', 'empty', 'add', 'pick_food', 'or_text', 'partial', 'uncounted'].map((k) => 'nd.' + k)
    .concat(['empty', 'grams', 'food', 'save'].map((k) => 'nd.err.' + k))
    .concat(['title', 'sub', 'allergies', 'conditions', 'medications', 'avoid', 'diet', 'stage', 'budget', 'hint'].map((k) => 'nt.pf.' + k))
    .concat(Object.keys(S.DIETS).map((k) => 'nt.diet.' + k))
    .concat(Object.keys(S.STAGE_KCAL).map((k) => 'nt.stage.' + k))
    .concat(['clash', 'unknown', 'none', 'no_rules'].map((k) => 'nt.safe.' + k))
    .concat(['np.m.protein', 'np.m.carbs', 'np.m.fat'])
    .concat(['title', 'none', 'no_energy'].map((k) => 'nt.sw.' + k))
    .concat(['title', 'days', 'empty', 'partial'].map((k) => 'nt.shop.' + k))
    .concat(['title', 'sub', 'water', 'sleep', 'steps', 'mood', 'mood_skip', 'note', 'save',
      'avg', 'days', 'no_data'].map((k) => 'nc.' + k))
    .concat(require('../src/nutrition/checkin').MOODS.map((m) => 'nc.mood.' + m))
    .concat(['active', 'stale', 'never'].map((k) => 'nc.eng.' + k))
    .concat(['nt.u.day']);
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل نص موجود (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }
  const render = fs.readFileSync(path.join(ROOT, 'scripts/render-clinic-pages.js'), 'utf8');
  check('وفحص العرض بيعرض الحالتين', /diaryFixture\(/.test(render) && /profileFixture\(/.test(render));
}

console.log(fail === 0 ? '\n✅ الدفتر بيقول اللي مش محسوب، والفحص بيحذّر ومابيضمنش.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
