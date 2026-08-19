'use strict';
/**
 * البدائل وقائمة التسوّق.
 *
 * Two things a patient asks in the first week, and a plan on paper cannot
 * answer: "I don't have chicken today, what instead?" and "what do I buy?".
 * The first gets answered by guessing or by eating something off-plan; the
 * second by shopping daily, which is how a plan dies in week two.
 *
 * ── A substitute is not a similar food ──────────────────────────────────────
 *
 * It is a QUANTITY of another food that carries the same energy — 100g of
 * chicken is not 100g of rice. So a swap is always a food plus its grams,
 * scaled to the line it replaces, and it is never offered without them.
 *
 * And a swap goes through the patient's profile like anything else on the
 * plan. Offering a peanut allergy a peanut butter "alternative" is worse than
 * offering nothing, because the plan itself was checked and this looks like it
 * came from the same place. A candidate whose safety cannot be established is
 * marked, never silently listed as fine.
 *
 * ── A shopping list that leaves things out must say so ──────────────────────
 *
 * A plan line that is free text ("mum's soup") has no food and no weight, so it
 * cannot be added up. A list that drops it silently sends somebody to the shop
 * missing an ingredient. The count comes back with the list.
 */

const safety = require('./safety');

/** kcal per 100g, or null when the food cannot tell us. */
function energyOf(food) {
  const n = Number(food && food.kcal);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * How many grams of `food` carry `targetKcal`.
 * Null when the food has no usable energy figure — a swap with no quantity is
 * not a swap, and inventing one puts a number on a patient's plate.
 */
function scaleTo(food, targetKcal) {
  const per100 = energyOf(food);
  const target = Number(targetKcal);
  if (per100 === null || !Number.isFinite(target) || target <= 0) return null;
  return +((target / per100) * 100).toFixed(0);
}

/** The energy a plan line actually carries. */
function lineKcal(line) {
  const n = Number(line && line.kcal);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Substitutes for one plan line.
 *
 * @param {object} line      the plan item being replaced
 * @param {Array}  foods     the practice's food list
 * @param {object} patient   for the safety check
 * @param {{limit?:number, tolerance?:number}} [opts]
 * @returns {{ok:true, target:number, options:Array} | {ok:false, why:string}}
 */
function candidates(line, foods, patient, opts) {
  const target = lineKcal(line);
  // A line with no energy on it cannot be matched, and saying so beats
  // offering a list of foods that have nothing to do with it.
  if (target === null) return { ok: false, why: 'no_energy' };
  const limit = (opts && opts.limit) || 5;
  const sameCat = String(line.category || '').toLowerCase();

  const out = [];
  for (const f of (Array.isArray(foods) ? foods : [])) {
    if (Number(f.id) === Number(line.food_id)) continue;      // itself
    const grams = scaleTo(f, target);
    if (grams === null || grams <= 0) continue;               // cannot be scaled
    // Absurd portions are not substitutes: 900g of cucumber is not a meal.
    if (grams > 600) continue;
    const check = safety.checkFood(f, patient);
    if (check.state === 'clash') continue;                    // never offered
    const protein = Number(f.protein_g);
    const linePro = Number(line.protein_g);
    const proteinGap = (Number.isFinite(protein) && Number.isFinite(linePro))
      ? Math.abs((protein * grams / 100) - linePro) : null;
    out.push({
      food: f, grams,
      // Same category first: a patient replacing a protein wants a protein.
      sameCategory: sameCat && String(f.category || '').toLowerCase() === sameCat,
      proteinGap,
      // 'clear' or 'unknown' — carried through so the screen can mark the
      // second one instead of showing it as checked.
      safety: check.state,
    });
  }

  out.sort((a, b) => {
    if (a.sameCategory !== b.sameCategory) return a.sameCategory ? -1 : 1;
    // A candidate we could not check is offered after the ones we could.
    if ((a.safety === 'clear') !== (b.safety === 'clear')) return a.safety === 'clear' ? -1 : 1;
    const ag = a.proteinGap === null ? Infinity : a.proteinGap;
    const bg = b.proteinGap === null ? Infinity : b.proteinGap;
    return ag - bg;
  });
  return { ok: true, target, options: out.slice(0, limit) };
}

/**
 * The shopping list for a plan, over `days` days.
 *
 * @returns {{days:number, lines:Array, uncounted:number, partial:boolean}}
 */
function shoppingList(items, days) {
  const n = Math.max(1, Math.min(31, parseInt(days, 10) || 7));
  const byFood = new Map();
  let uncounted = 0;
  for (const it of (Array.isArray(items) ? items : [])) {
    const grams = Number(it.grams);
    const name = String(it.food_name || '').trim();
    // No weight, or nothing to call it: cannot be bought by this list.
    if (!name || !Number.isFinite(grams) || grams <= 0) { uncounted++; continue; }
    const key = it.food_id ? 'f' + it.food_id : 'n' + name.toLowerCase();
    if (!byFood.has(key)) byFood.set(key, { food_id: it.food_id || null, name, grams: 0 });
    byFood.get(key).grams += grams;
  }
  const lines = [...byFood.values()]
    .map((l) => ({ food_id: l.food_id, name: l.name, grams: +(l.grams * n).toFixed(0) }))
    .sort((a, b) => b.grams - a.grams);
  return { days: n, lines, uncounted, partial: uncounted > 0 };
}

module.exports = { energyOf, scaleTo, lineKcal, candidates, shoppingList };
