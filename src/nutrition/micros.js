// العناصر الدقيقة (Micronutrients) — والحدّ اللي إحنا واقفين عنده بالظبط.
//
// ── الحاجة اللي إحنا **مش** بنعملها ──────────────────────────────────────
//
// إحنا **مانشحنش قاعدة بيانات عناصر دقيقة**. مفيش عندنا جدول بيقول إن ١٠٠ جم
// عدس فيهم كام مليجرام حديد. الأرقام دي بتيجي من جداول تركيب أغذية (USDA
// وغيرها) وليها رخص وفروق بين بلد وبلد وبين طريقة طبخ وطريقة — واختراعها
// بالتقريب في نظام أخصائي بيبني عليه خطة لمريض أنيميا مش «تقريب»، ده رقم
// غلط بيتقال بثقة.
//
// فاللي بنعمله: **خانات فاضية الأخصائي بيملاها من مرجعه هو**، بالظبط زي
// السعرات والماكروز. واللي مامتلاش يفضل **مش معروف** — مش صفر.
//
// ── والقاعدة اللي الملف ده قايم عليها ───────────────────────────────────
//
// **مجموع ناقص مايتعرضش كأنه كامل.** لو ٣ أسطر من ٨ فيهم قيمة حديد، الشاشة
// بتقول الرقم **ومعاه** إن ٥ أسطر مش محسوبين. مجموع بيجمع اللي يعرفه ويسكت
// عن الباقي بيدّي رقم أقل من الحقيقة، والأخصائي بيقرا «نقص حديد» على مريض
// مافيهوش نقص — أو العكس.
//
// ولو **مافيش ولا سطر** فيه قيمة، المجموع بيرجع `null` مش صفر. «مش مسجّل»
// غير «صفر».
//
// ومفيش هنا **احتياج يومي موصى به**: الرقم ده بيختلف بالسن والجنس والحمل
// والرضاعة والحالة، ونشره كمرجع في النظام معناه إن الشاشة بتفتي. الأخصائي
// بيقارن بمرجعه.
'use strict';

const M = require('../lib/money');

/**
 * العناصر اللي ليها خانة، وسقف كل واحد لكل ١٠٠ جم.
 * السقوف فوق أي أكل حقيقي بمسافة — الغرض إنها تمسك غلطة الكتابة (٥٠٠ بدل
 * ٥٫٠٠) مش إنها تحكم على الأكل.
 */
const MICROS = [
  { key: 'fiber_g', unit: 'g', max: 100 },
  { key: 'sodium_mg', unit: 'mg', max: 40000 },
  { key: 'potassium_mg', unit: 'mg', max: 20000 },
  { key: 'calcium_mg', unit: 'mg', max: 20000 },
  { key: 'iron_mg', unit: 'mg', max: 1000 },
  { key: 'vit_d_ug', unit: 'ug', max: 2000 },
  { key: 'vit_b12_ug', unit: 'ug', max: 1000 },
];
const KEYS = MICROS.map((m) => m.key);

const round = (n, d) => {
  const p = Math.pow(10, d == null ? 1 : d);
  return Math.round(Number(n) * p) / p;
};

/**
 * قراية خانة عنصر من الفورم.
 *
 * @returns { ok: true, value: number|null } — `null` معناها الخانة سيبت فاضية
 *          (وده مسموح: العنصر ده مش مسجّل على الصنف)
 *          { ok: false, why: 'unreadable' | 'range' }
 *
 * الفرق اللي الدالة دي موجودة عشانه: **فاضي ≠ صفر**. ملح صفر على صنف حقيقي
 * جواب، وخانة محدش لمسها مش جواب.
 */
function readField(value, max) {
  if (String(value == null ? '' : value).trim() === '') return { ok: true, value: null };
  const got = M.read(value);
  if (!got.ok) return { ok: false, why: 'unreadable' };
  if (got.value < 0 || got.value > max) return { ok: false, why: 'range' };
  return { ok: true, value: got.value };
}

/** كل الخانات من الفورم مرة واحدة — أول خانة بايظة بتوقّف الحفظ. */
function readAll(body) {
  const out = {};
  for (const m of MICROS) {
    const got = readField((body || {})[m.key], m.max);
    if (!got.ok) return { ok: false, why: got.why, field: m.key };
    out[m.key] = got.value;
  }
  return { ok: true, values: out };
}

/** القيمة لكمية معيّنة: الصنف متخزّن لكل ١٠٠ جم زي كل حاجة تانية هنا. */
function amountOf(food, key, grams) {
  const per100 = food == null ? null : food[key];
  if (per100 == null || per100 === '') return null;
  const n = Number(per100);
  if (!Number.isFinite(n)) return null;
  // `Number(null) === 0` و٠ رقم صحيح — فسطر جراماته فاضية كان هيتحسب «صفر
  // حديد» ويدخل الحسبة كأنه معروف. الفاضي هنا **مش محسوب**، مش صفر.
  if (grams == null || String(grams).trim() === '') return null;
  const g = Number(grams);
  if (!Number.isFinite(g) || g < 0) return null;
  return (n * g) / 100;
}

/**
 * مجاميع الخطة — ومعاها **اللي مش محسوب**.
 *
 * @param lines أسطر فيها `grams` و`food` (صف الصنف الحالي أو null)
 * @returns { [key]: { value, counted, missing } }
 *   value   — المجموع، أو `null` لو مافيش ولا سطر فيه قيمة
 *   counted — أسطر دخلت الحسبة
 *   missing — أسطر مالهاش قيمة (صنفها اتمسح، أو الخانة فاضية)
 */
function totals(lines) {
  const rows = Array.isArray(lines) ? lines : [];
  const out = {};
  for (const m of MICROS) {
    let sum = 0, counted = 0, missing = 0;
    for (const l of rows) {
      const v = amountOf(l && l.food, m.key, l && l.grams);
      if (v == null) { missing++; continue; }
      sum += v; counted++;
    }
    out[m.key] = { value: counted ? round(sum, 1) : null, counted, missing, unit: m.unit };
  }
  return out;
}

/** فيه ولا مفيش أي عنصر متسجّل خالص — عشان الشاشة تعرف تعرض القسم أصلاً. */
function anyRecorded(t) {
  return KEYS.some((k) => t && t[k] && t[k].value !== null);
}

module.exports = { MICROS, KEYS, readField, readAll, amountOf, totals, anyRecorded, round };
