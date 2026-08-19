'use strict';
/**
 * دفتر الأكل — what the patient actually ate.
 *
 * What existed was a tick box: the plan said "grilled chicken, 150g" and the
 * patient pressed done. That answers "did you follow the plan" and nothing
 * else, and it is the wrong question — people eat things that are not on the
 * plan, that is the entire problem a dietitian is solving. A diary of ticks
 * shows a perfect week for a patient who gained two kilos, and the follow-up
 * visit is spent guessing.
 *
 * So an entry is a thing that was eaten: a food from the practice's list with
 * a quantity, or a line of text the patient typed.
 *
 * ── The rule that makes the totals worth reading ────────────────────────────
 *
 * A day's total that silently leaves out the free-text lines is a lie in the
 * direction that matters — it under-counts, and the patient looks compliant.
 * So a total is always a pair: the number, and how many entries it could not
 * count. Every screen shows both, and `partial` is a state, not a footnote.
 */

/** Meals, in the order a day happens. */
const MEALS = ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner'];

function mealOf(raw) {
  const m = String(raw || '').trim();
  return MEALS.includes(m) ? m : 'breakfast';
}

/** Grams a patient typed. Zero and nonsense are both "not a quantity". */
function grams(v) {
  const n = Number(String(v == null ? '' : v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(5000, +n.toFixed(1));
}

/**
 * What one entry contributes.
 *
 * A food row carries macros per 100g; a free-text line carries nothing, and
 * says so rather than contributing zero.
 *
 * @returns {{known:boolean, kcal:number, protein:number, carbs:number, fat:number}}
 */
function macrosOf(entry, food) {
  const g = grams(entry && entry.grams);
  if (!food || g === null) return { known: false, kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const per = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? +(n * g / 100).toFixed(2) : 0;
  };
  return {
    known: true,
    kcal: per(food.kcal), protein: per(food.protein_g),
    carbs: per(food.carbs_g), fat: per(food.fat_g),
  };
}

/**
 * A day's totals — and how much of the day they could not account for.
 *
 * @param {Array} entries rows already joined to their food (or not)
 * @returns {{kcal,protein,carbs,fat, counted:number, uncounted:number, partial:boolean}}
 */
function dayTotals(entries) {
  const out = { kcal: 0, protein: 0, carbs: 0, fat: 0, counted: 0, uncounted: 0, partial: false };
  for (const e of (Array.isArray(entries) ? entries : [])) {
    const m = macrosOf(e, e && e.food);
    if (!m.known) { out.uncounted++; continue; }
    out.counted++;
    out.kcal += m.kcal; out.protein += m.protein; out.carbs += m.carbs; out.fat += m.fat;
  }
  out.kcal = +out.kcal.toFixed(1);
  out.protein = +out.protein.toFixed(1);
  out.carbs = +out.carbs.toFixed(1);
  out.fat = +out.fat.toFixed(1);
  // The whole point: a total with unread entries behind it says so.
  out.partial = out.uncounted > 0;
  return out;
}

/** Group a day's entries by meal, keeping the meal order. */
function byMeal(entries) {
  const map = new Map(MEALS.map((m) => [m, []]));
  for (const e of (Array.isArray(entries) ? entries : [])) {
    const m = mealOf(e.meal);
    map.get(m).push(e);
  }
  return MEALS.map((m) => ({ meal: m, entries: map.get(m) }));
}

/**
 * What the patient wrote, cleaned. An entry with neither a food nor text is
 * not an entry — it is an empty form somebody pressed save on.
 */
function readEntry(body) {
  const b = body || {};
  const foodId = parseInt(b.food_id, 10);
  const text = String(b.text || '').trim().slice(0, 200);
  const g = grams(b.grams);
  if (!Number.isFinite(foodId) && !text) return { ok: false, why: 'empty' };
  // A known food with no quantity cannot be counted, and pretending a default
  // portion is worse than asking.
  if (Number.isFinite(foodId) && g === null) return { ok: false, why: 'grams' };
  return {
    ok: true,
    foodId: Number.isFinite(foodId) ? foodId : null,
    text: text || null,
    grams: g,
    meal: mealOf(b.meal),
  };
}

module.exports = { MEALS, mealOf, grams, macrosOf, dayTotals, byMeal, readEntry };
