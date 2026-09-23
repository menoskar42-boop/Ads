// The practice's food database.
//
// Everything is stored PER 100g, always, and converted at the moment a plan
// line is written. Storing "per serving" would make every number in every plan
// depend on a serving size that gets edited later — and then a plan a patient
// is eating from quietly restates itself. The serving size is kept as a
// convenience for typing, never as the unit of storage.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const M = require('../lib/money');
const micros = require('../nutrition/micros');
const catalog = require('../nutrition/food_catalog');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const text = (v, max) => String(v || '').trim().slice(0, max) || null;

/**
 * The four figures, per 100g, and the ceiling each one cannot pass.
 *
 * `Number(v) || 0` was reading a blank field, an Arabic-numeral 75, and a
 * typo as the same thing: zero. And zero is a REAL answer here — chicken
 * breast has 0 g of carbohydrate — so nothing downstream can tell "no carbs"
 * from "nobody filled this in". Every plan built on that food then computes a
 * diet that is wrong by however much was missing, and the screen shows a
 * confident number the whole way. A dietitian cannot audit a silence.
 *
 * 900 kcal/100g is above pure oil (884) and below anything physical; a
 * macronutrient cannot exceed 100 g in 100 g of food.
 */
const FIGURES = [['kcal', 900], ['protein_g', 100], ['carbs_g', 100], ['fat_g', 100]];

const FOOD_ERRORS = ['required', 'missing', 'unreadable', 'range', 'save'];

router.get('/', async (req, res) => {
  const cid = req.company.id;
  const archived = req.query.archived === '1';
  const q = String(req.query.q || '').slice(0, 60);
  try {
    const params = [cid, !archived];
    let where = 'company_id=$1 AND is_active=$2';
    if (q) where += ` AND name ILIKE $${params.push('%' + q + '%')}`;
    const [rows, tally, edit, names] = await Promise.all([
      pool.query(`SELECT * FROM nutrition_foods WHERE ${where} ORDER BY category NULLS LAST, name LIMIT 500`, params),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
                COUNT(*) FILTER (WHERE NOT is_active)::int AS archived
           FROM nutrition_foods WHERE company_id=$1`, [cid]),
      req.query.edit
        ? pool.query('SELECT * FROM nutrition_foods WHERE id=$1 AND company_id=$2',
          [parseInt(req.query.edit, 10) || 0, cid])
        : { rows: [] },
      pool.query('SELECT name FROM nutrition_foods WHERE company_id=$1', [cid]),
    ]);
    res.render('nutrition_admin/foods', {
      tab: 'foods', rows: rows.rows, tally: tally.rows[0], edit: edit.rows[0] || null,
      // How many of the ready-made list this practice does not have yet.
      catalogMissing: catalog.missing(names.rows.map((r) => r.name), res.locals.lang).length,
      added: Math.max(0, parseInt(req.query.added, 10) || 0),
      MICROS: micros.MICROS,
      q, archived, saved: req.query.saved === '1',
      // Known codes only — the page never repeats the address bar's own words.
      err: FOOD_ERRORS.includes(req.query.err) ? req.query.err : null,
    });
  } catch (e) { console.error('[nutrition foods]', e.message); res.status(500).send('error'); }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (!name) return res.redirect('/nutrition/foods?err=required');
  const id = parseInt(b.id, 10);

  // Refused, not coerced: a figure nobody typed is not a figure of zero.
  const figures = [];
  for (const [field, max] of FIGURES) {
    const got = M.read(b[field]);
    if (!got.ok) return res.redirect('/nutrition/foods?err=' + (got.why === 'blank' ? 'missing' : 'unreadable'));
    if (got.value < 0 || got.value > max) return res.redirect('/nutrition/foods?err=range');
    figures.push(got.value);
  }
  // The serving is optional — but a serving that was typed and could not be
  // read has to be said out loud too, or the food silently loses it.
  let servingG = null;
  if (String(b.serving_g || '').trim() !== '') {
    const got = M.read(b.serving_g);
    if (!got.ok) return res.redirect('/nutrition/foods?err=unreadable');
    if (!(got.value > 0) || got.value > 5000) return res.redirect('/nutrition/foods?err=range');
    servingG = got.value;
  }

  // العناصر الدقيقة: **اختيارية كلها**، والخانة الفاضية بتفضل NULL مش صفر —
  // إحنا مانشحنش قاعدة تركيب أغذية، فاللي مامتلاش يفضل «مش مسجّل». بس اللي
  // اتكتب ومااتقراش بيوقّف الحفظ زي أي رقم تاني.
  const got = micros.readAll(b);
  if (!got.ok) return res.redirect('/nutrition/foods?err=' + (got.why === 'range' ? 'range' : 'unreadable'));
  const microVals = micros.KEYS.map((k) => got.values[k]);

  const vals = [name, ...figures,
    text(b.serving_desc, 60), servingG, text(b.category, 60), ...microVals];
  const microSet = micros.KEYS.map((k, i) => `${k}=$${9 + i}`).join(', ');
  const microCols = micros.KEYS.join(', ');
  const microPh = micros.KEYS.map((k, i) => `$${9 + i}`).join(',');
  try {
    if (Number.isInteger(id)) {
      await pool.query(
        `UPDATE nutrition_foods SET name=$1, kcal=$2, protein_g=$3, carbs_g=$4, fat_g=$5,
                serving_desc=$6, serving_g=$7, category=$8, ${microSet}
          WHERE id=$${9 + micros.KEYS.length} AND company_id=$${10 + micros.KEYS.length}`,
        [...vals, id, req.company.id]);
    } else {
      await pool.query(
        `INSERT INTO nutrition_foods
           (name, kcal, protein_g, carbs_g, fat_g, serving_desc, serving_g, category, ${microCols}, company_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,${microPh},$${9 + micros.KEYS.length})`,
        [...vals, req.company.id]);
    }
  } catch (e) {
    console.error('[nutrition food save]', e.message);
    return res.redirect('/nutrition/foods?err=save');
  }
  res.redirect('/nutrition/foods?saved=1');
});

// Archived, not deleted. Plan lines copy the food's figures at write time, so
// an archived food breaks nothing — but the food still has to be nameable when
// somebody asks where a line came from.
router.post('/:id(\\d+)/archive', async (req, res) => {
  const on = (req.body || {}).restore === '1';
  try {
    await pool.query('UPDATE nutrition_foods SET is_active=$1 WHERE id=$2 AND company_id=$3',
      [on, parseInt(req.params.id, 10), req.company.id]);
  } catch (e) { console.error('[nutrition food archive]', e.message); }
  res.redirect('/nutrition/foods' + (on ? '' : '?archived=1'));
});

// ── The ready-made food list ────────────────────────────────────────────────
// A plan builder with no foods in it is unusable on day one, and every
// dietitian would otherwise type the same staples by hand. The list lives in
// src/nutrition/food_catalog.js (per 100g, USDA SR Legacy, and EDITABLE —
// a starting point, not an authority).
//
// It used to go into an EMPTY database only, which meant a clinic that had
// typed five foods could never get the other hundred. Now it adds what is
// MISSING: a food the practice already has under the same name — in either
// language, active or archived — is never touched. An archived one stays
// archived: the dietitian took it off their list on purpose.
router.post('/starter', async (req, res) => {
  const cid = req.company.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Two clicks in the same second would each see the same "missing" list
    // and insert it twice. The lock makes the second one wait and find none.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nutrition_food_catalog'), $1::int)", [cid]);
    const have = (await client.query('SELECT name FROM nutrition_foods WHERE company_id=$1', [cid])).rows;
    const rows = catalog.missing(have.map((r) => r.name), res.locals.lang);
    for (const f of rows) {
      await client.query(
        `INSERT INTO nutrition_foods (company_id, name, kcal, protein_g, carbs_g, fat_g, category, serving_g)
         VALUES ($1,$2,$3,$4,$5,$6,$7,100)`,
        [cid, f.name, f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.category]);
    }
    await client.query('COMMIT');
    res.redirect('/nutrition/foods?saved=1&added=' + rows.length);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[nutrition starter]', e.message);
    res.redirect('/nutrition/foods?err=save');
  } finally {
    client.release();
  }
});

module.exports = router;
