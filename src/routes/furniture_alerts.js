// Alerts (phase 8): the bell, and the page behind it.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const A = require('../furniture/alerts');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', async (req, res) => {
  try {
    const alerts = await A.collect(pool, req.company.id, req.flags);
    res.render('furniture_admin/alerts', {
      company: req.company, tab: 'alerts', alerts,
    });
  } catch (e) { console.error('[furniture alerts]', e.message); res.status(500).send('error'); }
});

module.exports = router;
