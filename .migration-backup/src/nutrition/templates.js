// القوالب العلاجية: الخطة اللي الأخصائي بيكتبها مية مرة.
//
// «إنقاص وزن ١٥٠٠ سعرة»، «بروتوكول سكري»، «زيادة كتلة عضلية» — نفس الأسطر
// بتتكتب لكل مريض من الأول. القالب بيخزّن الوصفة (الوجبة · الصنف · الجرامات)،
// والتطبيق بيحسب القيم من صفوف الأصناف الحية وقت التطبيق.
//
// ── القاعدة اللي الملف ده موجود عشانها ──────────────────────────────────
//
// **القالب مايتطبّقش أعمى على مريض.** المريض ده ممكن يكون عنده حساسية من
// صنف في القالب. `safety.js` بيقول تلات إجابات — «فيه تعارض» و«نضيف» و«مش
// معروف» — والتطبيق هنا بيحترم التلاتة:
//
//   · السطر اللي فيه تعارض **مابيتنسخش**، وبيترجع باسمه وسبب رفضه.
//   · السطر اللي صنفه اتمسح أو اتأرشف مابيتنسخش، وبيتقال كمان.
//   · والباقي بيتنسخ.
//
// الشاشة بتعرض اللي اتنسخ واللي اترفض قبل الحفظ — لأن قالب بيتطبّق ناقص في
// صمت أسوأ من قالب بيترفض بصوت: الأخصائي بيفتكر إن المريض واخد الخطة كلها.
'use strict';

const safety = require('./safety');
const E = require('./engine');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * أسطر القالب من أسطر خطة موجودة.
 * الجرامات والوجبة بس — القيم الغذائية بتتحسب وقت التطبيق من الصنف الحي،
 * لأن القالب وصفة مش خطة مسلّمة.
 */
function linesFromPlan(items) {
  return (items || [])
    .filter((i) => i && i.food_id)
    .map((i, idx) => ({
      food_id: i.food_id,
      meal: E.MEALS.includes(i.meal) ? i.meal : 'breakfast',
      grams: Math.max(1, round2(i.grams)),
      note: i.note || null,
      sort_order: idx,
    }));
}

/**
 * خطة تطبيق قالب على مريض.
 *
 * @param lines   أسطر القالب
 * @param foods   صفوف الأصناف الحية (المتاحة دلوقتي) — مفتاحها id
 * @param patient صف المريض (بقيوده)
 *
 * @returns { apply, refused }
 *   apply   — أسطر جاهزة للكتابة، محسوبة بـ`engine.lineFrom`
 *   refused — { food_name, why } · why: 'gone' | 'clash' | 'unknown'
 *
 * ملحوظة مقصودة: `unknown` **مابيمنعش** التطبيق. `safety` بيقول «مش معروف»
 * لما المريض مالوش قيود متسجّلة أصلاً — ومنع القالب ساعتها معناه إن الميزة
 * مابتشتغلش لأغلب المرضى. اللي بيتمنع هو التعارض الصريح، و«مش معروف» بيترجع
 * كتنبيه على الشاشة.
 */
function planApply(lines, foods, patient) {
  const byId = new Map((foods || []).map((f) => [Number(f.id), f]));
  const apply = [];
  const refused = [];
  const warned = [];

  for (const l of lines || []) {
    const food = byId.get(Number(l.food_id));
    if (!food) {
      // الصنف اتمسح أو اتأرشف. السطر مابيتنسخش، وبيتقال — مش بيختفي.
      refused.push({ food_name: l.food_name || String(l.food_id), why: 'gone' });
      continue;
    }
    const verdict = safety.checkFood(food, patient);
    if (verdict && verdict.state === 'clash') {
      refused.push({ food_name: food.name, why: 'clash', hits: verdict.hits || [] });
      continue;
    }
    if (verdict && verdict.state === 'unknown') warned.push(food.name);

    const line = E.lineFrom(food, l.grams);
    apply.push({
      food_id: food.id,
      meal: E.MEALS.includes(l.meal) ? l.meal : 'breakfast',
      note: l.note || null,
      ...line,
    });
  }
  return { apply, refused, warned };
}

/** ملخّص للشاشة: اتنسخ كام واترفض كام وليه. */
function summary(result) {
  const r = result || { apply: [], refused: [], warned: [] };
  const byWhy = {};
  for (const x of r.refused) byWhy[x.why] = (byWhy[x.why] || 0) + 1;
  return { copied: r.apply.length, refused: r.refused.length, warned: r.warned.length, byWhy };
}

module.exports = { linesFromPlan, planApply, summary, round2 };
