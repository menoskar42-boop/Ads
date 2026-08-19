// The meal plan builder.
//
// Two things this file is careful about.
//
// 1. A plan's TARGETS are frozen onto it when it is created. The engine keeps
//    recomputing as the patient's weight changes — that is the point of the
//    engine — but the plan the patient is holding was built for the numbers of
//    that day. A plan whose targets drift underneath it cannot be reviewed:
//    "you were 200 kcal over" is meaningless if the target has moved since.
//
// 2. A plan LINE copies the food's name and its per-100g figures. Editing or
//    archiving a food next month must not silently restate a plan somebody is
//    already eating from.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const E = require('../nutrition/engine');
const P = require('../nutrition/practice');
const swaps = require('../nutrition/swaps');
const safety = require('../nutrition/safety');
const templates = require('../nutrition/templates');
const micros = require('../nutrition/micros');

const router = express.Router({ mergeParams: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const text = (v, max) => String(v || '').trim().slice(0, max) || null;
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };

/** Load a plan and confirm it belongs to this practice. */
async function load(companyId, planId) {
  const plan = (await pool.query(
    `SELECT p.*, pt.name AS patient_name, pt.id AS pid
       FROM nutrition_plans p JOIN nutrition_patients pt ON pt.id = p.patient_id
      WHERE p.id=$1 AND p.company_id=$2`, [planId, companyId])).rows[0];
  if (!plan) return null;
  const items = (await pool.query(
    `SELECT * FROM nutrition_plan_items WHERE plan_id=$1 AND company_id=$2
      ORDER BY sort_order, id`, [planId, companyId])).rows;
  return { plan, items };
}

// ── Create a plan for a patient ──────────────────────────────────────────────
router.post('/patients/:id(\\d+)/plans', async (req, res) => {
  const cid = req.company.id;
  // req.scopedId is the id ownerGuard already checked against this practice
  // (mounted on /patients/:id in nutrition_admin.js).
  const pid = req.scopedId || parseInt(req.params.id, 10);
  const b = req.body || {};
  try {
    const file = await P.file(pool, cid, pid);
    if (!file) return res.redirect('/nutrition/patients');

    // Targets default to whatever the engine says today, and are then FROZEN.
    // The dietitian can overwrite them — the engine advises, it does not
    // prescribe.
    const c = file.calc;
    const target = int(b.target_kcal) || (c.ok ? c.target : null);
    const protein = int(b.target_protein) || (c.ok && c.macros ? c.macros.protein : null);
    const carbs = int(b.target_carbs) || (c.ok && c.macros ? c.macros.carbs : null);
    const fat = int(b.target_fat) || (c.ok && c.macros ? c.macros.fat : null);

    // Only one active plan at a time. Two active plans means the patient portal
    // has to guess which one to show, and it will guess wrong.
    //
    // Deactivate-then-insert is correct until two tabs do it at once, so both
    // statements are now one transaction AND the database carries a unique
    // partial index on (patient_id) WHERE is_active — the transaction makes it
    // ordinary, the index makes it impossible.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE nutrition_plans SET is_active=false WHERE patient_id=$1 AND company_id=$2', [pid, cid]);
      const r = await client.query(
        `INSERT INTO nutrition_plans
           (company_id, patient_id, title, target_kcal, target_protein, target_carbs, target_fat, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        // file.id — the patient row P.file() just confirmed belongs to this
        // practice. pid came from the URL; this one came from the database.
        [cid, file.id, text(b.title, 120), target, protein, carbs, fat, text(b.notes, 500)]);
      await client.query('COMMIT');
      return res.redirect('/nutrition/plans/' + r.rows[0].id);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { client.release(); }
  } catch (e) {
    console.error('[nutrition plan create]', e.message);
    res.redirect('/nutrition/patients/' + pid + '?err=save');
  }
});

// ── One plan ─────────────────────────────────────────────────────────────────
router.get('/plans/:id(\\d+)', async (req, res) => {
  try {
    const data = await load(req.company.id, parseInt(req.params.id, 10));
    if (!data) return res.redirect('/nutrition/patients');
    const foods = (await pool.query(
      'SELECT * FROM nutrition_foods WHERE company_id=$1 AND is_active ORDER BY category NULLS LAST, name',
      [req.company.id])).rows;

    // Totals per meal and for the day, computed in the engine so this page and
    // the patient's phone can never disagree about what the plan adds up to.
    const byMeal = {};
    E.MEALS.forEach((m) => { byMeal[m] = data.items.filter((i) => i.meal === m); });
    const foodsById = new Map(foods.map((f) => [Number(f.id), f]));

    // The patient's profile, so a substitute goes through the same check the
    // plan itself does — a peanut offered as an "alternative" is worse than no
    // alternative, because it looks like it came from the same place.
    const patient = (await pool.query(
      'SELECT allergies, avoid_foods, diet_style FROM nutrition_patients WHERE id=$1 AND company_id=$2',
      [data.plan.pid, req.company.id])).rows[0] || {};

    // Swaps per line, and the plan's own clashes. Both are computed here so the
    // page shows an answer instead of a button that goes somewhere.
    const swapsByItem = {};
    for (const it of data.items) swapsByItem[it.id] = swaps.candidates(it, foods, patient, { limit: 4 });

    res.render('nutrition_admin/plan', {
      tab: 'patients', ...data, foods, meals: E.MEALS, byMeal,
      mealTotals: Object.fromEntries(E.MEALS.map((m) => [m, E.totals(byMeal[m])])),
      dayTotals: E.totals(data.items),
      swapsByItem,
      // العناصر الدقيقة (البند ٨٤): المجموع بيتحسب من قيم الأصناف اللي
      // الأخصائي كتبها — و**بيقول كام سطر مش محسوب**. مجموع ناقص معروض كأنه
      // كامل بيدّي رقم أقل من الحقيقة، والأخصائي يقرا «نقص حديد» على مريض
      // مافيهوش نقص.
      micros: micros.MICROS,
      microTotals: micros.totals(data.items.map((i) => ({
        grams: i.grams, food: foodsById.get(Number(i.food_id)) || null,
      }))),
      // القوالب العلاجية (البند ٨٤): القايمة بتتعرض على الخطة نفسها عشان
      // التطبيق يبقى خطوة واحدة، والنتيجة بتترجع بعدها بالتفصيل.
      templates: (await pool.query(
        `SELECT t.id, t.name, COUNT(i.id)::int AS lines
           FROM nutrition_templates t
           LEFT JOIN nutrition_template_items i ON i.template_id = t.id
          WHERE t.company_id = $1 GROUP BY t.id ORDER BY t.name`, [req.company.id])).rows,
      applied: applyReport(req.query),
      clashes: safety.restrictionsOf(patient).length ? safety.scanPlan(data.items, patient) : null,
      shopping: swaps.shoppingList(data.items, req.query.days || 7),
      shoppingDays: Math.max(1, Math.min(31, parseInt(req.query.days, 10) || 7)),
      saved: req.query.saved === '1', err: req.query.err || null,
    });
  } catch (e) { console.error('[nutrition plan]', e.message); res.status(500).send('error'); }
});

/**
 * نتيجة آخر تطبيق قالب، جاية في الرابط كأرقام بس.
 * الأسماء مابتتحطش في الرابط — الصفحة مابتطبعش كلام جاي من العنوان.
 */
function applyReport(q) {
  const n = (v) => { const x = parseInt(v, 10); return Number.isInteger(x) && x >= 0 ? x : null; };
  const copied = n((q || {}).copied);
  if (copied === null) return null;
  return { copied, clash: n(q.clash) || 0, gone: n(q.gone) || 0, warned: n(q.warned) || 0 };
}

// ── القوالب العلاجية ─────────────────────────────────────────────────────────

// حفظ الخطة الحالية كقالب. الأسطر بتتخزّن كوصفة (وجبة · صنف · جرامات).
router.post('/plans/:id(\\d+)/save-template', async (req, res) => {
  const cid = req.company.id;
  const planId = parseInt(req.params.id, 10);
  const name = String((req.body || {}).name || '').trim().slice(0, 80);
  if (!name) return res.redirect('/nutrition/plans/' + planId + '?err=tpl_name');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const items = (await client.query(
      `SELECT i.food_id, i.food_name, i.meal, i.grams, i.note
         FROM nutrition_plan_items i
         JOIN nutrition_plans p ON p.id = i.plan_id
        WHERE i.plan_id=$1 AND p.company_id=$2 ORDER BY i.meal, i.sort_order`,
      [planId, cid])).rows;
    if (!items.length) { await client.query('ROLLBACK'); return res.redirect('/nutrition/plans/' + planId + '?err=tpl_empty'); }

    const tpl = (await client.query(
      'INSERT INTO nutrition_templates (company_id, name) VALUES ($1,$2) RETURNING id', [cid, name])).rows[0];
    const lines = templates.linesFromPlan(items);
    for (const l of lines) {
      const src = items.find((i) => i.food_id === l.food_id) || {};
      await client.query(
        `INSERT INTO nutrition_template_items
           (company_id, template_id, food_id, food_name, meal, grams, note, sort_order)
         SELECT $1, $2, f.id, $4, $5, $6, $7, $8 FROM nutrition_foods f
          WHERE f.id=$3 AND f.company_id=$1`,
        [cid, tpl.id, l.food_id, src.food_name || null, l.meal, l.grams, l.note, l.sort_order]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[nutrition tpl save]', e.message);
    return res.redirect('/nutrition/plans/' + planId + '?err=tpl_save');
  } finally { client.release(); }
  res.redirect('/nutrition/plans/' + planId + '?saved=1');
});

/**
 * تطبيق قالب على خطة مريض.
 *
 * **مايتطبّقش أعمى**: السطر اللي فيه تعارض مع حساسية المريض مابيتنسخش،
 * والسطر اللي صنفه راح مابيتنسخش — والاتنين بيترجعوا بالعدد للشاشة. قالب
 * بيتطبّق ناقص في صمت أسوأ من قالب بيترفض بصوت.
 */
router.post('/plans/:id(\\d+)/apply-template', async (req, res) => {
  const cid = req.company.id;
  const planId = parseInt(req.params.id, 10);
  const tplId = parseInt((req.body || {}).template_id, 10);
  const back = '/nutrition/plans/' + planId;
  if (!Number.isInteger(tplId)) return res.redirect(back + '?err=tpl_pick');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const plan = (await client.query(
      'SELECT id, patient_id FROM nutrition_plans WHERE id=$1 AND company_id=$2', [planId, cid])).rows[0];
    if (!plan) { await client.query('ROLLBACK'); return res.redirect('/nutrition/patients'); }

    const lines = (await client.query(
      `SELECT i.food_id, i.food_name, i.meal, i.grams, i.note, i.sort_order
         FROM nutrition_template_items i
         JOIN nutrition_templates t ON t.id = i.template_id
        WHERE i.template_id=$1 AND t.company_id=$2 ORDER BY i.sort_order`,
      [tplId, cid])).rows;
    if (!lines.length) { await client.query('ROLLBACK'); return res.redirect(back + '?err=tpl_empty'); }

    const foods = (await client.query(
      'SELECT * FROM nutrition_foods WHERE company_id=$1 AND is_active', [cid])).rows;
    const patient = (await client.query(
      'SELECT allergies, avoid_foods, diet_style FROM nutrition_patients WHERE id=$1 AND company_id=$2',
      [plan.patient_id, cid])).rows[0] || {};

    const result = templates.planApply(lines, foods, patient);
    for (const l of result.apply) {
      await client.query(
        `INSERT INTO nutrition_plan_items
           (company_id, plan_id, food_id, meal, food_name, grams, kcal, protein_g, carbs_g, fat_g, note, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                 COALESCE((SELECT MAX(sort_order)+1 FROM nutrition_plan_items WHERE plan_id=$2), 0))`,
        [cid, plan.id, l.food_id, l.meal, l.food_name, l.grams, l.kcal, l.protein_g, l.carbs_g, l.fat_g, l.note]);
    }
    await client.query('COMMIT');
    const s = templates.summary(result);
    return res.redirect(`${back}?copied=${s.copied}&clash=${s.byWhy.clash || 0}&gone=${s.byWhy.gone || 0}&warned=${s.warned}`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[nutrition tpl apply]', e.message);
    return res.redirect(back + '?err=tpl_save');
  } finally { client.release(); }
});

router.post('/templates/:id(\\d+)/delete', async (req, res) => {
  try {
    await pool.query('DELETE FROM nutrition_templates WHERE id=$1 AND company_id=$2',
      [parseInt(req.params.id, 10), req.company.id]);
  } catch (e) { console.error('[nutrition tpl del]', e.message); }
  res.redirect(req.get('referer') && req.get('referer').includes('/nutrition/plans/')
    ? req.get('referer').split('?')[0] : '/nutrition/patients');
});

// ── Add a line ───────────────────────────────────────────────────────────────
router.post('/plans/:id(\\d+)/items', async (req, res) => {
  const cid = req.company.id;
  const planId = parseInt(req.params.id, 10);
  const b = req.body || {};
  const foodId = parseInt(b.food_id, 10);
  const grams = Number(b.grams);
  if (!Number.isInteger(foodId) || !(grams > 0)) {
    return res.redirect('/nutrition/plans/' + planId + '?err=line');
  }
  try {
    const owns = (await pool.query(
      'SELECT id FROM nutrition_plans WHERE id=$1 AND company_id=$2', [planId, cid])).rows[0];
    if (!owns) return res.redirect('/nutrition/patients');
    const food = (await pool.query(
      'SELECT * FROM nutrition_foods WHERE id=$1 AND company_id=$2', [foodId, cid])).rows[0];
    if (!food) return res.redirect('/nutrition/plans/' + planId + '?err=line');

    // Computed here and STORED. Recomputing at read time from the live food row
    // is exactly the drift this design is avoiding.
    const line = E.lineFrom(food, grams);
    await pool.query(
      `INSERT INTO nutrition_plan_items
         (company_id, plan_id, food_id, meal, food_name, grams, kcal, protein_g, carbs_g, fat_g, note, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
               COALESCE((SELECT MAX(sort_order)+1 FROM nutrition_plan_items WHERE plan_id=$2), 0))`,
      // food.id — the row the scoped SELECT above returned.
      // owns.id and food.id — both rows were just confirmed to be ours.
      [cid, owns.id, food.id, E.MEALS.includes(b.meal) ? b.meal : 'breakfast',
        line.food_name, line.grams, line.kcal, line.protein_g, line.carbs_g, line.fat_g,
        text(b.note, 200)]);
  } catch (e) { console.error('[nutrition plan item]', e.message); }
  res.redirect('/nutrition/plans/' + planId + '?saved=1');
});

router.post('/plans/:id(\\d+)/items/:iid(\\d+)/delete', async (req, res) => {
  const planId = parseInt(req.params.id, 10);
  try {
    await pool.query('DELETE FROM nutrition_plan_items WHERE id=$1 AND plan_id=$2 AND company_id=$3',
      [parseInt(req.params.iid, 10), planId, req.company.id]);
  } catch (e) { console.error('[nutrition item del]', e.message); }
  res.redirect('/nutrition/plans/' + planId);
});

// ── Activate / retire ────────────────────────────────────────────────────────
router.post('/plans/:id(\\d+)/activate', async (req, res) => {
  const cid = req.company.id;
  const planId = parseInt(req.params.id, 10);
  try {
    const p = (await pool.query(
      'SELECT patient_id FROM nutrition_plans WHERE id=$1 AND company_id=$2', [planId, cid])).rows[0];
    if (p) {
      await pool.query('UPDATE nutrition_plans SET is_active=false WHERE patient_id=$1 AND company_id=$2',
        [p.patient_id, cid]);
      await pool.query('UPDATE nutrition_plans SET is_active=true WHERE id=$1 AND company_id=$2',
        [planId, cid]);
    }
  } catch (e) { console.error('[nutrition plan activate]', e.message); }
  res.redirect('/nutrition/plans/' + planId + '?saved=1');
});

module.exports = router;
