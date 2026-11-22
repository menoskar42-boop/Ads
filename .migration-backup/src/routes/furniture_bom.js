// Bill of materials (phase 4): components per product, costed from stock.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const B = require('../furniture/bom');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// The page prints the reason the SERVER decided on. Rendering `req.query.err`
// straight would let a link put words of somebody else's choosing on the
// merchant's screen — and this project has already fixed that once.
const BOM_ERRORS = ['invalid', 'no_components', 'unknown_material', 'save'];

// ── Catalogue with computed costs ────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    res.render('furniture_admin/bom', {
      company: req.company, tab: 'bom',
      products: await B.productCosts(pool, req.company.id),
      err: BOM_ERRORS.includes(req.query.err) ? req.query.err : null,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture bom]', e.message); res.status(500).send('error'); }
});

// ── One product's components ─────────────────────────────────────────────────
router.get('/:id(\\d+)', async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  try {
    const product = (await pool.query(
      'SELECT * FROM furniture_products WHERE id=$1 AND company_id=$2', [id, cid]
    )).rows[0];
    if (!product) return res.redirect('/furniture/bom');

    const [components, materials] = await Promise.all([
      B.componentsOf(pool, cid, id),
      pool.query('SELECT id, name, unit, avg_cost FROM furniture_materials WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
    ]);
    const costed = B.costOf(components);
    res.render('furniture_admin/bom_product', {
      company: req.company, tab: 'bom',
      product, materials: materials.rows, costed,
      margin: B.marginOf(product.selling_price, components.length ? costed.cost : product.estimated_cost, components.length > 0),
      err: BOM_ERRORS.includes(req.query.err) ? req.query.err : null,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture bom product]', e.message); res.status(500).send('error'); }
});

// ── Add a component ──────────────────────────────────────────────────────────
router.post('/:id(\\d+)/components', async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  const materialId = parseInt(req.body.material_id, 10) || null;
  const qty = num(req.body.qty_required);
  if (!materialId || qty <= 0) return res.redirect('/furniture/bom/' + id + '?err=invalid');
  try {
    // One row per material. Adding the same timber twice is a correction of the
    // quantity, not a second entry — two rows would double the piece's cost and
    // nobody would spot which one was wrong.
    const existing = (await pool.query(
      'SELECT id FROM furniture_product_components WHERE company_id=$1 AND product_id=$2 AND material_id=$3',
      [cid, id, materialId]
    )).rows[0];
    if (existing) {
      await pool.query('UPDATE furniture_product_components SET qty_required=$1 WHERE id=$2 AND company_id=$3',
        [qty, existing.id, cid]);
    } else {
      await pool.query(
        'INSERT INTO furniture_product_components (company_id, product_id, material_id, qty_required) VALUES ($1,$2,$3,$4)',
        [cid, id, materialId, qty]
      );
    }
  } catch (e) {
    console.error('[furniture bom add]', e.message);
    return res.redirect('/furniture/bom/' + id + '?err=save');
  }
  res.redirect('/furniture/bom/' + id + '?saved=1');
});

router.post('/:id(\\d+)/components/:cid(\\d+)/delete', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('DELETE FROM furniture_product_components WHERE id=$1 AND product_id=$2 AND company_id=$3',
      [parseInt(req.params.cid, 10), id, req.company.id]);
  } catch (e) { console.error('[furniture bom del]', e.message); }
  res.redirect('/furniture/bom/' + id);
});

// ── Copy the computed cost onto the product ──────────────────────────────────
router.post('/:id(\\d+)/apply-cost', async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  try {
    const components = await B.componentsOf(pool, cid, id);
    if (!components.length) return res.redirect('/furniture/bom/' + id + '?err=no_components');
    const { cost, unknown } = B.costOf(components);
    // Refuse while a component's material is missing: the figure would be short
    // by however much that material costs, and it would then look authoritative
    // sitting in the product record.
    if (unknown > 0) return res.redirect('/furniture/bom/' + id + '?err=unknown_material');
    await pool.query('UPDATE furniture_products SET estimated_cost=$1 WHERE id=$2 AND company_id=$3', [cost, id, cid]);
  } catch (e) {
    console.error('[furniture bom apply]', e.message);
    return res.redirect('/furniture/bom/' + id + '?err=save');
  }
  res.redirect('/furniture/bom/' + id + '?saved=1');
});

module.exports = router;
