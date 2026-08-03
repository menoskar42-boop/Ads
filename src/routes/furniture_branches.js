// Branches (phase 8): the list, and the switch that scopes what you see.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const B = require('../furniture/branches');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', async (req, res) => {
  try {
    const branches = await B.list(pool, req.company.id, { includeArchived: true });
    res.render('furniture_admin/branches', {
      company: req.company, tab: 'branches', branches, kinds: B.KINDS,
      scoped: B.SCOPED, saved: req.query.saved === '1', err: req.query.err || null,
    });
  } catch (e) { console.error('[furniture branches]', e.message); res.status(500).send('error'); }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 120);
  if (!name) return res.redirect('/furniture/branches?err=required');
  const id = parseInt(b.id, 10);
  try {
    const vals = [name, B.KINDS.includes(b.kind) ? b.kind : 'showroom',
      String(b.address || '').trim().slice(0, 200) || null,
      String(b.phone || '').trim().slice(0, 30) || null];
    if (Number.isInteger(id)) {
      await pool.query(
        `UPDATE furniture_branches SET name=$1, kind=$2, address=$3, phone=$4
          WHERE id=$5 AND company_id=$6`, [...vals, id, req.company.id]);
      req.flog('branch.edit', 'master', id, name);
    } else {
      await pool.query(
        `INSERT INTO furniture_branches (company_id, name, kind, address, phone)
         VALUES ($1,$2,$3,$4,$5)`, [req.company.id, ...vals]);
      req.flog('branch.add', 'master', null, name);
    }
  } catch (e) { console.error('[furniture branch save]', e.message); }
  res.redirect('/furniture/branches?saved=1');
});

// Archive, never delete: rows already stamped with this branch must still be
// able to name where they happened.
router.post('/:id(\\d+)/archive', async (req, res) => {
  const on = (req.body || {}).restore === '1';
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('UPDATE furniture_branches SET is_active=$1 WHERE id=$2 AND company_id=$3',
      [on, id, req.company.id]);
    req.flog(on ? 'branch.restore' : 'branch.archive', 'master', id, '');
    // A branch that is no longer active must not stay selected, or the next
    // page load filters to something the owner can no longer see or change.
    if (!on && req.session.furnitureBranch === String(id)) delete req.session.furnitureBranch;
  } catch (e) { console.error('[furniture branch archive]', e.message); }
  res.redirect('/furniture/branches');
});

// The switch. Kept in the session rather than on every URL so it survives a
// form POST and a redirect — a filter that silently resets is worse than none.
router.post('/switch', (req, res) => {
  const v = String((req.body || {}).branch || '');
  if (!v) delete req.session.furnitureBranch;
  else req.session.furnitureBranch = v;
  const back = String((req.body || {}).back || '/furniture');
  res.redirect(back.startsWith('/furniture') ? back : '/furniture');
});

module.exports = router;
