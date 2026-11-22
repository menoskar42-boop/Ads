// Activity log (phase 8): read-only. There is no edit and no delete here, on
// purpose — a log the people in it can tidy up is not evidence of anything.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const A = require('../furniture/activity');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', async (req, res) => {
  const entity = A.ENTITIES.includes(req.query.entity) ? req.query.entity : null;
  try {
    const page = await A.recent(pool, req.company.id, {
      entity, limit: 100, offset: req.query.offset,
    });
    res.render('furniture_admin/activity', {
      company: req.company, tab: 'activity',
      entity, entities: A.ENTITIES, ...page,
    });
  } catch (e) { console.error('[furniture activity page]', e.message); res.status(500).send('error'); }
});

module.exports = router;
