// أدمن OscarDevs: حسابات «مراقب السرعة» — /admin/fleet (requireAdmin فى server.js).
// ده الطريق الوحيد لإنشاء حساب شركة (مفيش تسجيل عام). كلمة السر بتتولّد عشوائية وبتظهر
// **مرة واحدة** فى رد الطلب نفسه (مش فى الرابط ولا اللوج) — الأدمن يسلّمها للعميل.
'use strict';

const express = require('express');
const { pool } = require('../fleet/schema');
const { createFleet, resetPassword } = require('../fleet/accounts');

const router = express.Router();
const SPEED_ORIGIN = process.env.SPEED_ORIGIN || 'https://speed.oscardevs.com';

router.use((req, res, next) => {
  res.locals.showAds = false;
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');   // صفحة فيها كلمة سر — ماتتخزّنش
  next();
});

async function render(res, extra) {
  const { rows } = await pool.query(
    `SELECT f.id, f.name, f.join_code, f.speed_limit, f.created_at,
            (SELECT count(*)::int FROM fleet_drivers d WHERE d.fleet_id = f.id) AS drivers,
            (SELECT count(*)::int FROM fleet_violations v WHERE v.fleet_id = f.id
                AND v.started_at > now() - interval '30 days') AS v30
       FROM fleet_accounts f ORDER BY f.created_at DESC`);
  res.render('fleet/admin', { fleets: rows, issued: null, error: '', SPEED_ORIGIN, layout: false, ...extra });
}

router.get('/', async (req, res) => render(res));

router.post('/create', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (name.length < 2) return render(res, { error: 'اكتب اسم الشركة' });
  const a = await createFleet(name);
  return render(res, { issued: { name, code: a.code, password: a.password, isNew: true } });
});

router.post('/:id/reset', async (req, res) => {
  const a = await resetPassword(Number(req.params.id) || 0);
  if (!a) return render(res, { error: 'الحساب مش موجود' });
  const f = (await pool.query('SELECT name FROM fleet_accounts WHERE id = $1', [Number(req.params.id)])).rows[0];
  return render(res, { issued: { name: f ? f.name : '', code: a.code, password: a.password, isNew: false } });
});

module.exports = router;
