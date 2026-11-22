// Labels (phase 8): a printable sheet of Code 128 barcodes.
//
// Rendered as inline SVG rather than fetched as images: the sheet has to print
// from a phone in a workshop with no signal, and an <img> that 404s prints as
// a blank label the storeman will happily stick on a cupboard.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const C = require('../lib/code128');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SOURCES = {
  products:  { table: 'furniture_products',  label: 'fn2.e.products' },
  materials: { table: 'furniture_materials', label: 'fn2.e.materials' },
};

router.get('/', async (req, res) => {
  const cid = req.company.id;
  const kind = SOURCES[req.query.kind] ? req.query.kind : 'products';
  const copies = Math.min(20, Math.max(1, parseInt(req.query.copies, 10) || 1));
  try {
    const rows = (await pool.query(
      `SELECT id, name, code FROM ${SOURCES[kind].table}
        WHERE company_id=$1 AND is_active ORDER BY name LIMIT 300`, [cid])).rows;

    // A row with no code gets no barcode — and is listed as missing rather than
    // quietly skipped, because "why is this piece not on the sheet" is the
    // question the storeman will otherwise be left with.
    const withCode = [];
    const missing = [];
    for (const r of rows) {
      const code = String(r.code || '').trim();
      if (!code) { missing.push(r); continue; }
      if (!C.isEncodable(code)) { missing.push({ ...r, bad: true }); continue; }
      for (let i = 0; i < copies; i += 1) {
        withCode.push({ ...r, code, svg: C.svg(code, { module: 2, height: 48 }) });
      }
    }
    res.render('furniture_admin/labels', {
      company: req.company, tab: 'labels',
      kind, copies, labels: withCode, missing,
      kinds: Object.keys(SOURCES),
    });
  } catch (e) { console.error('[furniture labels]', e.message); res.status(500).send('error'); }
});

module.exports = router;
