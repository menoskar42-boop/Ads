// Master data CRUD (phase 1): suppliers, customers, materials, workers, products.
//
// One set of routes serves all five, driven by the declarations in
// furniture/master.js. The entity always comes from the URL and is checked
// against that list before it reaches SQL, so no request can name a table.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const uploads = require('../lib/uploads');
const { compressImage } = require('../lib/media');
const { ENTITIES, ENTITY_KEYS, coerce, firstMissing, referenceCount } = require('../furniture/master');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Product photos land in the same public/uploads sandbox as every other image
// in the app, through the same guard.
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const imageMimeRegex = /^image\/(png|jpe?g|gif|webp)$/;
const uploadProductImage = uploads.guard(multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `fnprod-${req.company.id}-${Date.now()}${uploads.extname(file, '.bin')}`),
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (imageMimeRegex.test(file.mimetype) ? cb(null, true) : cb(new Error('image only'))),
}).single('image_file'), 'image');

// Resolve :entity once. An unknown name is a wrong URL, not an error page.
router.param('entity', (req, res, next, value) => {
  if (!ENTITY_KEYS.includes(value)) return res.redirect('/furniture');
  req.entity = value;
  req.spec = ENTITIES[value];
  next();
});

const back = (entity, q) => '/furniture/master/' + entity + (q || '');

// ── List (+ inline add / edit) ───────────────────────────────────────────────
router.get('/:entity', async (req, res) => {
  const cid = req.company.id;
  const { table, order } = req.spec;
  const showArchived = req.query.archived === '1';
  const q = String(req.query.q || '').trim();
  try {
    const params = [cid];
    let where = 'company_id=$1 AND is_active = ' + (showArchived ? 'false' : 'true');
    if (q) where += ' AND name ILIKE $' + params.push('%' + q + '%');
    const rows = (await pool.query(
      `SELECT * FROM ${table} WHERE ${where} ORDER BY ${order} LIMIT 500`, params
    )).rows;

    // Counts for the two tabs, so the archive is discoverable rather than a
    // URL you have to know about.
    const counts = (await pool.query(
      `SELECT COUNT(*) FILTER (WHERE is_active) ::int AS active,
              COUNT(*) FILTER (WHERE NOT is_active)::int AS archived
         FROM ${table} WHERE company_id=$1`, [cid]
    )).rows[0];

    let edit = null;
    const editId = parseInt(req.query.edit, 10);
    if (Number.isInteger(editId)) {
      edit = (await pool.query(`SELECT * FROM ${table} WHERE id=$1 AND company_id=$2`, [editId, cid])).rows[0] || null;
    }

    res.render('furniture_admin/master', {
      company: req.company, tab: 'master',
      entity: req.entity, spec: req.spec, rows, edit, q, showArchived, counts,
      err: ['required', 'in_use', 'save', 'image'].includes(req.query.err) ? req.query.err : null,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture master]', e.message); res.status(500).send('error'); }
});

// ── Create / update ──────────────────────────────────────────────────────────
router.post('/:entity', async (req, res) => {
  const cid = req.company.id;
  const { table } = req.spec;
  const id = parseInt(req.body.id, 10);
  const isEdit = Number.isInteger(id);
  // On edit the opening balance is left alone: it belongs to the moment the
  // material was first counted, and overwriting it would silently restate stock.
  const values = coerce(req.entity, req.body, { includeOpening: !isEdit });
  const missing = firstMissing(req.entity, values);
  if (missing) return res.redirect(back(req.entity, '?err=required'));

  const cols = Object.keys(values);
  try {
    if (isEdit) {
      const sets = cols.map((c, i) => `${c}=$${i + 1}`).join(', ');
      await pool.query(
        `UPDATE ${table} SET ${sets} WHERE id=$${cols.length + 1} AND company_id=$${cols.length + 2}`,
        [...cols.map((c) => values[c]), id, cid]
      );
    } else {
      // A material's average cost starts at what it was first bought for;
      // leaving it at zero would value the opening stock at nothing.
      if (req.entity === 'materials') { cols.push('avg_cost'); values.avg_cost = values.last_purchase_price; }
      const ph = cols.map((_, i) => '$' + (i + 2)).join(', ');
      await pool.query(
        `INSERT INTO ${table} (company_id, ${cols.join(', ')}) VALUES ($1, ${ph})`,
        [cid, ...cols.map((c) => values[c])]
      );
    }
    req.flog(isEdit ? 'master.edit' : 'master.add', 'master', isEdit ? id : null,
      `${req.entity} · ${values.name || ''}`);
  } catch (e) {
    console.error('[furniture master save]', e.message);
    return res.redirect(back(req.entity, '?err=save'));
  }
  res.redirect(back(req.entity, '?saved=1'));
});

// ── Product photo (backlog 87) ───────────────────────────────────────────────
//
// Only entities that declare `image` accept one, so this cannot be pointed at
// a table that has no such column by changing the URL.
router.post('/:entity/:id/image', (req, res, next) => {
  if (!req.spec.image) return res.redirect(back(req.entity));
  uploadProductImage(req, res, (err) => {
    if (err) { console.error('[furniture product image]', err.message); return res.redirect(back(req.entity, '?err=image')); }
    next();
  });
}, async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  if (!req.file) return res.redirect(back(req.entity, '?err=image'));
  let url = '/uploads/' + req.file.filename;
  try { await compressImage(req.file.path); } catch (e) { /* keep the original */ }
  try {
    const done = await pool.query(
      `UPDATE ${req.spec.table} SET image_path=$1 WHERE id=$2 AND company_id=$3 RETURNING id`,
      [url, id, cid]);
    // A file saved against a row that is not this workshop's is a file nobody
    // asked for: say the save did not happen rather than reporting success.
    if (!done.rows.length) return res.redirect(back(req.entity, '?err=save'));
    req.flog('master.image', 'master', id, req.entity);
  } catch (e) {
    console.error('[furniture product image save]', e.message);
    return res.redirect(back(req.entity, '?err=save'));
  }
  res.redirect(back(req.entity, '?saved=1'));
});

router.post('/:entity/:id/image/delete', async (req, res) => {
  if (!req.spec.image) return res.redirect(back(req.entity));
  try {
    await pool.query(
      `UPDATE ${req.spec.table} SET image_path=NULL WHERE id=$1 AND company_id=$2`,
      [parseInt(req.params.id, 10), req.company.id]);
  } catch (e) {
    // «اتحفظ» never appears over a write that did not happen.
    console.error('[furniture product image del]', e.message);
    return res.redirect(back(req.entity, '?err=save'));
  }
  res.redirect(back(req.entity, '?saved=1'));
});

// ── Archive / restore ────────────────────────────────────────────────────────
router.post('/:entity/:id/archive', async (req, res) => {
  const on = req.body.restore === '1';
  try {
    await pool.query(
      `UPDATE ${req.spec.table} SET is_active=$1 WHERE id=$2 AND company_id=$3`,
      [on, parseInt(req.params.id, 10), req.company.id]
    );
    req.flog(on ? 'master.restore' : 'master.archive', 'master',
      parseInt(req.params.id, 10), req.entity);
  } catch (e) { console.error('[furniture archive]', e.message); }
  res.redirect(back(req.entity, on ? '' : '?archived=1'));
});

// ── Delete, only when nothing points at it ───────────────────────────────────
router.post('/:entity/:id/delete', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const cid = req.company.id;
  try {
    // Deleting a referenced row would leave orders and payslips naming nobody.
    // The archive already covers that case, so refuse and say why.
    const refs = await referenceCount(pool, req.entity, cid, id);
    if (refs > 0) return res.redirect(back(req.entity, '?err=in_use'));
    // Read the name before the row goes: after the DELETE the log line is the
    // only place it still exists.
    const gone = (await pool.query(
      `SELECT name FROM ${req.spec.table} WHERE id=$1 AND company_id=$2`, [id, cid])).rows[0];
    await pool.query(`DELETE FROM ${req.spec.table} WHERE id=$1 AND company_id=$2`, [id, cid]);
    req.flog('master.delete', 'master', id, `${req.entity} · ${(gone && gone.name) || ''}`);
  } catch (e) { console.error('[furniture delete]', e.message); }
  res.redirect(back(req.entity));
});

module.exports = router;
