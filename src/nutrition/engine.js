// Calorie and macro engine.
//
// Every number this file produces is an ESTIMATE about a real person's food,
// so the guiding rule is: never return a figure the inputs do not support.
// A patient with no weight on file gets `null` and a stated reason, not a
// confident-looking number derived from a default nobody chose.
//
// Formulas, and why these:
//   BMR   Mifflin-St Jeor (1990). Chosen over Harris-Benedict because it is
//         measurably closer on modern populations and is what most clinical
//         references now use.
//   TDEE  BMR × an activity factor.
//   Goal  a percentage of TDEE, not a flat 500 kcal: 500 off a 3,000 kcal man
//         and 500 off a 1,400 kcal woman are completely different instructions.
//
// The engine deliberately does NOT clamp a target silently. If the arithmetic
// lands below a floor that is safe to eat at unsupervised, it says so and
// leaves the decision with the clinician.
'use strict';

const ACTIVITY = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};
const ACTIVITY_KEYS = Object.keys(ACTIVITY);

// A percentage of maintenance rather than a fixed number of calories.
const GOAL_ADJUST = { loss: -0.20, maintain: 0, gain: 0.15 };
const GOAL_KEYS = Object.keys(GOAL_ADJUST);

// Below these, a diet needs supervision that software cannot give. The engine
// flags rather than clamps — silently raising a clinician's target would be
// overruling them without telling them.
const FLOOR = { male: 1500, female: 1200 };

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

const round = (n, d = 0) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};

/** Whole years at `on`, or null when there is no date of birth to work from. */
function ageOn(birthDate, on) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const d = on ? new Date(on) : new Date();
  if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null;
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const m = d.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && d.getUTCDate() < b.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Mifflin-St Jeor. Returns null unless weight, height, age and sex are all known. */
function bmr({ weightKg, heightCm, age, gender }) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = Number(age);
  if (!(w > 0) || !(h > 0) || !(a >= 0)) return null;
  if (gender !== 'male' && gender !== 'female') return null;
  const base = 10 * w + 6.25 * h - 5 * a;
  return round(gender === 'male' ? base + 5 : base - 161);
}

function bmi(weightKg, heightCm) {
  const w = Number(weightKg);
  const h = Number(heightCm) / 100;
  if (!(w > 0) || !(h > 0)) return null;
  return round(w / (h * h), 1);
}

// WHO adult bands. Labelled by key so the page can translate them; a band is
// never shown for a patient under 19, where adult cut-offs do not apply.
function bmiBand(value) {
  if (value == null) return null;
  if (value < 18.5) return 'under';
  if (value < 25) return 'normal';
  if (value < 30) return 'over';
  if (value < 35) return 'obese1';
  if (value < 40) return 'obese2';
  return 'obese3';
}

/**
 * Macro split.
 * Protein is set per kilogram of BODY WEIGHT, fat as a percentage of calories,
 * and carbohydrate takes what is left — the order clinicians actually reason
 * in. If protein and fat between them exceed the calorie target, carbs would
 * come out negative; that is reported as a conflict rather than floored at
 * zero, because a zero-carb plan nobody asked for is not a fix.
 */
function macros({ kcal, weightKg, proteinPerKg, fatPercent }) {
  const target = Number(kcal);
  const w = Number(weightKg);
  if (!(target > 0) || !(w > 0)) return null;

  const protein = round(w * (Number(proteinPerKg) || 0));
  const fat = round((target * ((Number(fatPercent) || 0) / 100)) / KCAL_PER_G.fat);
  const used = protein * KCAL_PER_G.protein + fat * KCAL_PER_G.fat;
  const carbs = round((target - used) / KCAL_PER_G.carbs);

  return {
    protein, fat, carbs,
    conflict: carbs < 0,
    // What the split actually adds up to, so a rounded plan cannot quietly
    // drift from the target it claims to hit.
    kcal: round(protein * KCAL_PER_G.protein + carbs * KCAL_PER_G.carbs + fat * KCAL_PER_G.fat),
  };
}

/**
 * The whole calculation for one patient.
 *
 * Returns `{ ok: false, missing: [...] }` when it cannot honestly produce a
 * number. The list of what is missing is the point: "add a date of birth and a
 * weight" is actionable, "—" is not.
 */
function compute(patient, latest, defaults = {}) {
  const missing = [];
  const gender = patient && (patient.gender === 'male' || patient.gender === 'female')
    ? patient.gender : null;
  const age = ageOn(patient && patient.birth_date);
  const heightCm = Number(patient && patient.height_cm) || null;
  const weightKg = Number(latest && latest.weight_kg) || null;

  if (!gender) missing.push('gender');
  if (age == null) missing.push('birth_date');
  if (!heightCm) missing.push('height_cm');
  if (!weightKg) missing.push('weight');
  if (missing.length) return { ok: false, missing };

  const activity = ACTIVITY_KEYS.includes(patient.activity) ? patient.activity : 'light';
  const goal = GOAL_KEYS.includes(patient.goal) ? patient.goal : 'maintain';

  const basal = bmr({ weightKg, heightCm, age, gender });
  const tdee = round(basal * ACTIVITY[activity]);
  const target = round(tdee * (1 + GOAL_ADJUST[goal]));

  // Per-patient value first, practice default second. NULL on the patient
  // means "follow the practice", which is why it is not copied at save time.
  const proteinPerKg = Number(patient.protein_per_kg) || Number(defaults.protein_per_kg) || 1.8;
  const fatPercent = Number(patient.fat_percent) || Number(defaults.fat_percent) || 25;

  const split = macros({ kcal: target, weightKg, proteinPerKg, fatPercent });
  const floor = FLOOR[gender];

  return {
    ok: true,
    age, gender, activity, goal, weightKg, heightCm,
    bmr: basal, tdee, target,
    adjustPct: Math.round(GOAL_ADJUST[goal] * 100),
    macros: split,
    proteinPerKg, fatPercent,
    bmi: bmi(weightKg, heightCm),
    bmiBand: age >= 19 ? bmiBand(bmi(weightKg, heightCm)) : null,
    // Flagged, never clamped. The clinician decides; the software says what it
    // sees.
    belowFloor: target < floor,
    floor,
  };
}

/** Totals for a plan or a meal. Kept here so the page and the print view can
 *  never disagree about what a plan adds up to. */
function totals(items) {
  return (items || []).reduce((a, i) => ({
    kcal: round(a.kcal + Number(i.kcal || 0), 1),
    protein: round(a.protein + Number(i.protein_g || 0), 1),
    carbs: round(a.carbs + Number(i.carbs_g || 0), 1),
    fat: round(a.fat + Number(i.fat_g || 0), 1),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

/** One plan line from a food and a weight in grams. Foods are stored per 100g. */
function lineFrom(food, grams) {
  const g = Number(grams) > 0 ? Number(grams) : 0;
  const k = g / 100;
  return {
    food_name: food.name,
    grams: round(g, 1),
    kcal: round(Number(food.kcal) * k, 1),
    protein_g: round(Number(food.protein_g) * k, 1),
    carbs_g: round(Number(food.carbs_g) * k, 1),
    fat_g: round(Number(food.fat_g) * k, 1),
  };
}

const MEALS = ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner'];

module.exports = {
  ACTIVITY, ACTIVITY_KEYS, GOAL_ADJUST, GOAL_KEYS, FLOOR, KCAL_PER_G, MEALS,
  round, ageOn, bmr, bmi, bmiBand, macros, compute, totals, lineFrom,
};
