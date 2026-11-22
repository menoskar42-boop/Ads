// Warranty (phase 8): what is still guaranteed, and what is about to stop being.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const W = require('../furniture/warranty');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VIEWS = ['all', 'active', 'expiring', 'expired', 'not_started'];

router.get('/', async (req, res) => {
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'all';
  try {
    const data = await W.list(pool, req.company.id, view);
    res.render('furniture_admin/warranty', {
      company: req.company, tab: 'warranty', view, views: VIEWS, ...data,
    });
  } catch (e) { console.error('[furniture warranty]', e.message); res.status(500).send('error'); }
});

// ── Start the clock by hand ──────────────────────────────────────────────────
// For a piece handed over at the showroom door with no delivery job behind it.
// The date is asked for rather than assumed to be today: the owner is often
// entering this a week later.
router.post('/:id(\\d+)/start', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const on = /^\d{4}-\d{2}-\d{2}$/.test(String((req.body || {}).starts_on || ''))
    ? req.body.starts_on : null;
  try {
    await pool.query(
      `UPDATE furniture_warranties SET starts_on = COALESCE($1, CURRENT_DATE)
        WHERE id=$2 AND company_id=$3 AND starts_on IS NULL`, [on, id, req.company.id]);
    req.flog('warranty.start_manual', 'warranty', id, on || '—');
  } catch (e) { console.error('[furniture warranty start]', e.message); }
  res.redirect('/furniture/warranty');
});

module.exports = router;
