'use strict';
/**
 * الحساسية والأمراض والأدوية — and the one thing this module refuses to claim.
 *
 * A nutrition practice was storing a patient's height, weight and goal, and
 * nothing about what would harm them. So a plan could hand a peanut allergy a
 * peanut, a coeliac a wheat bread, and a diabetic a dessert, and nothing on any
 * screen would notice.
 *
 * ── What this does, and what it does NOT ────────────────────────────────────
 *
 * It FLAGS. It does not certify. Matching is done on the food's name and
 * category against words the dietitian typed, which is a genuinely useful net
 * and is not a guarantee: "مكسرات" will not catch a brand name, and a food
 * whose name says nothing about its contents cannot be checked at all.
 *
 * So there are three answers, never two:
 *   · `clash`   — a word the patient must avoid appears in this food.
 *   · `clear`   — nothing matched, AND there was something to match against.
 *   · `unknown` — the patient has restrictions but this food has no name we
 *                 can read, or has no restrictions recorded at all.
 *
 * A screen that shows a green tick for `unknown` is the failure this exists to
 * prevent: it converts "nobody checked" into "checked and safe", which is the
 * sentence that gets somebody hurt.
 */

/** What a patient must avoid, and why. */
const KINDS = ['allergy', 'condition', 'dislike', 'diet'];

/** Diet styles the practice can pick, and the words each one rules out. */
const DIETS = {
  none: [],
  vegetarian: ['لحم', 'لحمة', 'فراخ', 'دجاج', 'سمك', 'بطة', 'كبدة', 'meat', 'chicken', 'fish', 'beef', 'liver'],
  vegan: ['لحم', 'لحمة', 'فراخ', 'دجاج', 'سمك', 'بيض', 'لبن', 'جبنة', 'زبادي', 'عسل',
    'meat', 'chicken', 'fish', 'egg', 'milk', 'cheese', 'yogurt', 'honey'],
  // Not a religious ruling — the words a practice asked us to keep off a plan.
  no_pork: ['خنزير', 'بيكون', 'لحم مقدد', 'pork', 'bacon', 'ham'],
  gluten_free: ['قمح', 'عيش', 'خبز', 'مكرونة', 'شعير', 'wheat', 'bread', 'pasta', 'barley'],
  lactose_free: ['لبن', 'جبنة', 'زبادي', 'كريمة', 'milk', 'cheese', 'yogurt', 'cream'],
};

/** Split what a dietitian typed into terms. Commas, newlines, Arabic commas. */
function parseList(text) {
  return String(text == null ? '' : text)
    .split(/[,،\n;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2)          // a single letter matches everything
    .filter((s, i, a) => a.indexOf(s) === i);
}

/** Everything this patient must avoid, with the reason attached. */
function restrictionsOf(patient) {
  const p = patient || {};
  const out = [];
  for (const term of parseList(p.allergies)) out.push({ kind: 'allergy', term });
  for (const term of parseList(p.avoid_foods)) out.push({ kind: 'dislike', term });
  const diet = DIETS[String(p.diet_style || 'none')] || [];
  for (const term of diet) out.push({ kind: 'diet', term });
  return out;
}

/** The text of a food we can search: its name, plus its category. */
function haystack(food) {
  const f = food || {};
  return [f.name, f.category].filter(Boolean).join(' ').toLowerCase().trim();
}

/**
 * Check one food against one patient.
 * @returns {{state:'clash'|'clear'|'unknown', hits:Array}}
 */
function checkFood(food, patient) {
  const rules = restrictionsOf(patient);
  const hay = haystack(food);
  // Nothing recorded to check against, or nothing readable to check.
  if (!rules.length) return { state: 'unknown', hits: [], why: 'no_rules' };
  if (!hay) return { state: 'unknown', hits: [], why: 'no_name' };
  const hits = rules.filter((r) => hay.indexOf(r.term) >= 0);
  return hits.length ? { state: 'clash', hits } : { state: 'clear', hits: [] };
}

/** Everything in a plan that clashes, so one screen can show the whole list. */
function scanPlan(items, patient) {
  const out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    const verdict = checkFood(it, patient);
    if (verdict.state === 'clash') out.push({ item: it, hits: verdict.hits });
  }
  return out;
}

/**
 * Pregnancy and breastfeeding change the numbers, not just the advice.
 * The extra energy is the commonly published figure; it is a starting point a
 * dietitian adjusts, and the module says so rather than pretending precision.
 */
const STAGE_KCAL = { none: 0, pregnant_t1: 0, pregnant_t2: 340, pregnant_t3: 450, breastfeeding: 500 };
function stageExtra(stage) {
  const key = String(stage || 'none');
  return Object.prototype.hasOwnProperty.call(STAGE_KCAL, key) ? STAGE_KCAL[key] : 0;
}

module.exports = { KINDS, DIETS, STAGE_KCAL, parseList, restrictionsOf, haystack, checkFood, scanPlan, stageExtra };
