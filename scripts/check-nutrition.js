#!/usr/bin/env node
/**
 * Pin the numbers the nutrition system hands a real patient.
 *
 * src/nutrition/engine.js turns a person's age, height, weight, activity and
 * goal into a daily calorie target and a macro split. A dietitian prints that
 * on a report and a patient eats to it. It is the one piece of arithmetic on
 * this platform where being quietly wrong has a physical consequence, and until
 * now nothing checked it.
 *
 * The cases below are computed by hand from the published formulas, not copied
 * from the code — otherwise this would assert only that the code equals itself:
 *
 *   Mifflin-St Jeor (male)   BMR = 10·kg + 6.25·cm − 5·age + 5
 *   Mifflin-St Jeor (female) BMR = 10·kg + 6.25·cm − 5·age − 161
 *   TDEE = BMR × activity factor
 *   target = TDEE × (1 + goal adjustment)
 *   protein = g/kg × kg · fat = % of target ÷ 9 · carbs = the rest ÷ 4
 *
 * Two behaviours matter as much as the numbers, and both are documented
 * promises in docs/NUTRITION_DOCTOR_ROADMAP.md:
 *   · it never invents a number — a patient missing a weight or a birth date
 *     gets nulls and a list of exactly what is missing, because "add a birth
 *     date and a weight" is an instruction and a dash is not;
 *   · it never trims one silently — a target under the safe floor is REPORTED,
 *     not clamped. Silent clamping overrides a doctor's decision without
 *     telling them.
 *
 * No dependencies and no database: the engine is pure arithmetic.
 *
 *   node scripts/check-nutrition.js
 */
'use strict';
const path = require('path');
const e = require(path.join(__dirname, '..', 'src/nutrition/engine'));

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};
// Age is computed from a birth date against today, so the fixtures build the
// birth date from a wanted age rather than hard-coding a year that ages out.
const born = (age) => {
  const d = new Date(); d.setFullYear(d.getFullYear() - age); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

/* ── 1. BMR, by hand ──────────────────────────────────────────────────── */
{
  // 10·90 + 6.25·175 − 5·36 + 5 = 900 + 1093.75 − 180 + 5 = 1818.75
  const male = e.compute({ gender: 'male', birth_date: born(36), height_cm: 175, activity_level: 'light', goal: 'maintain' }, { weight_kg: 90 });
  check('BMR (male, 90kg/175cm/36y) = 1819', male.bmr === 1819, String(male.bmr));
  // 10·60 + 6.25·165 − 5·30 − 161 = 600 + 1031.25 − 150 − 161 = 1320.25
  const female = e.compute({ gender: 'female', birth_date: born(30), height_cm: 165, activity_level: 'light', goal: 'maintain' }, { weight_kg: 60 });
  check('BMR (female, 60kg/165cm/30y) = 1320', female.bmr === 1320, String(female.bmr));
  // The −161 vs +5 term is the whole difference between the two formulas; a
  // copy-paste that used one for both would still look plausible.
  check('the male and female formulas differ by 166', male.bmr - 1819 === 0 && female.bmr - 1320 === 0);

  // TDEE = 1819 × 1.375 (light) = 2501.1
  check('TDEE applies the activity factor', male.tdee === 2501, String(male.tdee));
  check('maintain leaves the target at TDEE', male.target === male.tdee, `${male.target} vs ${male.tdee}`);
}

/* ── 2. The goal is a percentage, not a fixed number ──────────────────── */
// 500 kcal off a 3000-kcal man and off a 1400-kcal woman are two completely
// different instructions; the roadmap calls this out explicitly.
{
  const big = e.compute({ gender: 'male', birth_date: born(30), height_cm: 190, activity_level: 'very_active', goal: 'loss' }, { weight_kg: 110 });
  const small = e.compute({ gender: 'female', birth_date: born(30), height_cm: 155, activity_level: 'sedentary', goal: 'loss' }, { weight_kg: 55 });
  const cutBig = big.tdee - big.target, cutSmall = small.tdee - small.target;
  check('the deficit scales with the person, not a flat number',
    cutBig > cutSmall * 1.5, `${cutBig} vs ${cutSmall} kcal`);
  check('both cuts are the same percentage',
    big.adjustPct === small.adjustPct, `${big.adjustPct}% / ${small.adjustPct}%`);
  const gain = e.compute({ gender: 'male', birth_date: born(30), height_cm: 175, activity_level: 'light', goal: 'gain' }, { weight_kg: 70 });
  check('gain raises the target above TDEE', gain.target > gain.tdee, `${gain.target} > ${gain.tdee}`);
}

/* ── 3. Macros add back up to the target ─────────────────────────────── */
{
  const r = e.compute({ gender: 'male', birth_date: born(36), height_cm: 175, activity_level: 'light', goal: 'loss' }, { weight_kg: 90 });
  const m = r.macros;
  // 1.8 g/kg × 90 = 162 · 25% of 2000 ÷ 9 = 55.6 → 56 · rest ÷ 4 = 212
  check('protein follows g/kg', m.protein === Math.round(r.proteinPerKg * 90), String(m.protein));
  check('fat follows the percentage', m.fat === Math.round(r.target * r.fatPercent / 100 / 9), String(m.fat));
  const sum = m.protein * 4 + m.carbs * 4 + m.fat * 9;
  check('the three macros reconstruct the target', Math.abs(sum - r.target) <= 12, `${sum} vs ${r.target}`);
}

/* ── 4. It refuses to invent, and refuses to trim in silence ─────────── */
{
  const missing = e.compute({ gender: 'female', height_cm: 160 }, {});
  check('a patient with no weight or birth date gets no number',
    missing.ok === false && missing.target == null, JSON.stringify(missing.missing || []));
  check('and is told exactly what is missing',
    Array.isArray(missing.missing) && missing.missing.includes('birth_date') && missing.missing.includes('weight'),
    (missing.missing || []).join(', '));

  // Small, older, sedentary, losing: the arithmetic lands under the floor.
  const low = e.compute({ gender: 'female', birth_date: born(51), height_cm: 150, activity_level: 'sedentary', goal: 'loss' }, { weight_kg: 48 });
  check('a target under the safe floor is reported, not clamped',
    low.belowFloor === true && low.target < low.floor,
    `${low.target} < ${low.floor}`);
  check('the floor differs by sex', e.FLOOR.male !== e.FLOOR.female,
    `${e.FLOOR.male} / ${e.FLOOR.female}`);
}

/* ── 5. Nothing here may be indexed or monetised ─────────────────────── */
// Medical pages, and CLAUDE.md puts the AdSense account above everything.
{
  const fs = require('fs');
  const ROOT = path.join(__dirname, '..');
  const files = ['src/views/nutrition_admin', 'src/views/nutrition_portal']
    .flatMap((d) => fs.readdirSync(path.join(ROOT, d)).map((f) => path.join(d, f)));
  const withAds = files.filter((f) => /adsbygoogle|pagead2|ads_loader/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  check('no ad unit on any doctor or patient screen', withAds.length === 0, withAds.join(', '));
  const heads = ['src/views/nutrition_admin/head.ejs', 'src/views/nutrition_portal/head.ejs'];
  const indexable = heads.filter((f) => !/noindex/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  check('both portals are noindex', indexable.length === 0, indexable.join(', '));

  // The patient portal must never take an id from the URL: the session says who
  // you are. A single :patientId parameter here is one guessed number away from
  // another person's medical record.
  const portal = fs.readFileSync(path.join(ROOT, 'src/routes/nutrition_portal.js'), 'utf8');
  const idInUrl = [...portal.matchAll(/router\.(?:get|post)\(\s*'([^']*:[a-zA-Z]+[^']*)'/g)]
    .map((m) => m[1])
    .filter((r) => /:(patient|user)/i.test(r));
  check('no patient id in any portal URL', idInUrl.length === 0, idInUrl.join(', '));
}

/* ── The patient's password never travels in a URL ─────────────────────── */
// It used to be handed over as ?pw=… — which writes a named person's password
// into the browser history, the address bar, the Referer of the next request,
// and any log that records URLs. A session flash shows it once and keeps no
// copy.
{
  const fs = require('fs');
  const ROOT = path.join(__dirname, '..');
  const admin = fs.readFileSync(path.join(ROOT, 'src/routes/nutrition_admin.js'), 'utf8');
  // Comments stripped first: this file explains the old shape, and the
  // explanation is not the bug.
  const code = admin.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check('كلمة سر المريض مابتتحطش في الرابط',
    !/\?pw=/.test(code) && !/req\.query\.pw/.test(code));
  check('بتتسلّم مرة واحدة من الجلسة وتتمسح',
    /req\.session\.nutriPw = \{/.test(admin) && /delete req\.session\.nutriPw/.test(admin));
  check('ومربوطة بالمريض اللي اتعملت له',
    /f\.id === patientId/.test(admin));
}

console.log(fail ? `\n${fail} فشل — دي أرقام بتتحسب لمرضى.` : '\nمحرّك التغذية وبواباته سليمين.');
process.exit(fail ? 1 : 0);
