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

const FOOD_ERRORS = ['required', 'missing', 'unreadable', 'range', 'save', 'not_empty'];

router.get('/', async (req, res) => {
  const cid = req.company.id;
  const archived = req.query.archived === '1';
  const q = String(req.query.q || '').slice(0, 60);
  try {
    const params = [cid, !archived];
    let where = 'company_id=$1 AND is_active=$2';
    if (q) where += ` AND name ILIKE $${params.push('%' + q + '%')}`;
    const [rows, tally, edit] = await Promise.all([
      pool.query(`SELECT * FROM nutrition_foods WHERE ${where} ORDER BY category NULLS LAST, name LIMIT 500`, params),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
                COUNT(*) FILTER (WHERE NOT is_active)::int AS archived
           FROM nutrition_foods WHERE company_id=$1`, [cid]),
      req.query.edit
        ? pool.query('SELECT * FROM nutrition_foods WHERE id=$1 AND company_id=$2',
          [parseInt(req.query.edit, 10) || 0, cid])
        : { rows: [] },
    ]);
    res.render('nutrition_admin/foods', {
      tab: 'foods', rows: rows.rows, tally: tally.rows[0], edit: edit.rows[0] || null,
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

// ── A small Egyptian starter set ─────────────────────────────────────────────
// Offered once, on an empty database, because a plan builder with no foods in
// it is unusable on day one and every dietitian would otherwise type the same
// twenty staples. Figures are per 100g from standard composition tables and
// are EDITABLE — they are a starting point, not an authority.
const STARTER = [
  ['أرز أبيض مسلوق', 'Cooked white rice', 130, 2.7, 28, 0.3, 'grain'],
  ['عيش بلدي', 'Baladi bread', 275, 9.5, 55, 1.6, 'grain'],
  ['مكرونة مسلوقة', 'Cooked pasta', 158, 5.8, 31, 0.9, 'grain'],
  ['فول مدمس', 'Ful medames', 110, 7.6, 19, 0.5, 'legume'],
  ['عدس مطبوخ', 'Cooked lentils', 116, 9, 20, 0.4, 'legume'],
  ['فراخ صدور مشوية', 'Grilled chicken breast', 165, 31, 0, 3.6, 'protein'],
  ['لحمة بقري قليلة الدهن', 'Lean beef', 187, 26, 0, 9, 'protein'],
  ['سمك بلطي', 'Tilapia', 128, 26, 0, 2.7, 'protein'],
  ['بيض مسلوق', 'Boiled egg', 155, 13, 1.1, 11, 'protein'],
  ['تونة في الماء', 'Tuna in water', 116, 26, 0, 0.8, 'protein'],
  ['جبنة قريش', 'Cottage cheese', 98, 11, 3.4, 4.3, 'dairy'],
  ['زبادي كامل الدسم', 'Whole milk yoghurt', 61, 3.5, 4.7, 3.3, 'dairy'],
  ['لبن كامل الدسم', 'Whole milk', 61, 3.2, 4.8, 3.3, 'dairy'],
  ['موز', 'Banana', 89, 1.1, 23, 0.3, 'fruit'],
  ['تفاح', 'Apple', 52, 0.3, 14, 0.2, 'fruit'],
  ['برتقال', 'Orange', 47, 0.9, 12, 0.1, 'fruit'],
  ['بلح', 'Dates', 282, 2.5, 75, 0.4, 'fruit'],
  ['سلطة خضراء', 'Green salad', 20, 1.2, 3.6, 0.2, 'vegetable'],
  ['بطاطس مسلوقة', 'Boiled potato', 87, 1.9, 20, 0.1, 'vegetable'],
  ['زيت زيتون', 'Olive oil', 884, 0, 0, 100, 'fat'],
  ['مكسرات نيّة', 'Raw mixed nuts', 607, 20, 21, 54, 'fat'],
  ['طحينة', 'Tahini', 595, 17, 21, 54, 'fat'],
];

router.post('/starter', async (req, res) => {
  const cid = req.company.id;
  try {
    const have = (await pool.query('SELECT COUNT(*)::int c FROM nutrition_foods WHERE company_id=$1', [cid])).rows[0];
    // Only into an empty database. Running it twice must not double every
    // staple, and merging into a list the dietitian has curated would be rude.
    if (have.c > 0) return res.redirect('/nutrition/foods?err=not_empty');
    const lang = res.locals.lang === 'en' ? 1 : 0;
    for (const row of STARTER) {
      await pool.query(
        `INSERT INTO nutrition_foods (company_id, name, kcal, protein_g, carbs_g, fat_g, category, serving_g)
         VALUES ($1,$2,$3,$4,$5,$6,$7,100)`,
        [cid, row[lang], row[2], row[3], row[4], row[5], row[6]]);
    }
  } catch (e) {
    console.error('[nutrition starter]', e.message);
    return res.redirect('/nutrition/foods?err=save');
  }
  res.redirect('/nutrition/foods?saved=1');
});

module.exports = router;
module.exports.STARTER = STARTER;
