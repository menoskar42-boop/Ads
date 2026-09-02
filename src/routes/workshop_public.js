'use strict';

const express = require('express');
const { Pool } = require('pg');
const J = require('../workshop/jobs');
const { logActivity } = require('../workshop/operations');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function safeName(value) {
  const name = String(value == null ? '' : value).trim().slice(0, 120);
  return name || 'العميل';
}

router.get('/:token', async (req, res) => {
  const token = String(req.params.token || '').slice(0, 100);
  const data = (await pool.query(
    `SELECT a.token, a.job_id, a.company_id,
            j.status, j.complaint, j.diagnosis, j.quote_total, j.approved_at,
            j.received_at, j.promised_at, j.paid, j.discount, j.tax_percent,
            v.plate, v.make, v.model, v.model_year, v.odometer,
            c.name AS customer_name,
            co.company_name, co.page_type,
            ws.business_name, ws.logo_url, ws.address, ws.phone AS workshop_phone
       FROM workshop_job_access a
       JOIN workshop_jobs j ON j.id=a.job_id AND j.company_id=a.company_id
       JOIN companies co ON co.id=a.company_id
       LEFT JOIN workshop_settings ws ON ws.company_id=a.company_id
       LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
       LEFT JOIN workshop_customers c ON c.id=j.customer_id
      WHERE a.token=$1`, [token]
  )).rows[0];
  if (!data) return res.status(404).render('404');

  await pool.query('UPDATE workshop_job_access SET last_viewed_at=now() WHERE token=$1', [token]);
  const [parts, labour, inspection, photos, changeOrders] = await Promise.all([
    pool.query('SELECT name, qty, unit_price FROM workshop_job_parts WHERE company_id=$2 AND job_id=$1 ORDER BY id', [data.job_id, data.company_id]),
    pool.query('SELECT description, amount FROM workshop_job_labour WHERE company_id=$2 AND job_id=$1 ORDER BY id', [data.job_id, data.company_id]),
    pool.query(
      `SELECT system, check_name, status, note, recommendation
         FROM workshop_inspection_items
         WHERE company_id=$2 AND job_id=$1 AND customer_visible ORDER BY id`, [data.job_id, data.company_id]
    ),
    pool.query(
      `SELECT phase, image_url, caption FROM workshop_job_photos
         WHERE company_id=$2 AND job_id=$1 ORDER BY id`, [data.job_id, data.company_id]
    ),
    pool.query(
      `SELECT co.*, COALESCE(SUM(i.qty*i.unit_price),0)::float AS total,
              json_agg(json_build_object(
                'kind', i.kind, 'description', i.description,
                'qty', i.qty, 'unit_price', i.unit_price
              ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL) AS items
         FROM workshop_change_orders co
         LEFT JOIN workshop_change_order_items i
           ON i.change_order_id=co.id AND i.company_id=co.company_id
        WHERE co.company_id=$1 AND co.job_id=$2
        GROUP BY co.id ORDER BY co.created_at DESC`, [data.company_id, data.job_id]
    ),
  ]);
  const totals = J.jobTotals(data, parts.rows, labour.rows);
  res.render('workshop_public/status', {
    title: `متابعة ${J.jobCode(data.job_id)}`,
    job: data, parts: parts.rows, labour: labour.rows,
     inspection: inspection.rows, photos: photos.rows, changeOrders: changeOrders.rows, totals,
    approved: req.query.approved === '1', token, J,
  });
});

router.post('/:token/approve', async (req, res) => {
  const token = String(req.params.token || '').slice(0, 100);
  const data = (await pool.query(
    `SELECT a.job_id, a.company_id, j.status, j.customer_id, j.discount, j.tax_percent
       FROM workshop_job_access a
       JOIN workshop_jobs j ON j.id=a.job_id AND j.company_id=a.company_id
      WHERE a.token=$1`, [token]
  )).rows[0];
  if (!data || ['cancelled', 'delivered'].includes(data.status)) {
    return res.status(400).redirect('/workshop/status/' + encodeURIComponent(token));
  }
  const [parts, labour] = await Promise.all([
    pool.query('SELECT qty, unit_price FROM workshop_job_parts WHERE company_id=$2 AND job_id=$1', [data.job_id, data.company_id]),
    pool.query('SELECT amount FROM workshop_job_labour WHERE company_id=$2 AND job_id=$1', [data.job_id, data.company_id]),
  ]);
  const totals = J.jobTotals(data, parts.rows, labour.rows);
  const name = safeName((req.body || {}).name);
  await pool.query(
    `UPDATE workshop_jobs
        SET status='approved', approved_at=now(), approved_by=$1, quote_total=$2
      WHERE id=$3 AND company_id=$4`,
    [name, totals.total, data.job_id, data.company_id]
  );
  await logActivity(pool, data.company_id, data.job_id, 'quote_approved', 'اعتمد العميل العرض من الرابط الآمن', name);
  res.redirect('/workshop/status/' + encodeURIComponent(token) + '?approved=1');
});

router.post('/:token/change-orders/:id/approve', async (req, res) => {
  const token = String(req.params.token || '').slice(0, 100);
  const orderId = parseInt(req.params.id, 10);
  const name = safeName((req.body || {}).name);
  const data = (await pool.query(
    `SELECT a.job_id, a.company_id, co.status
       FROM workshop_job_access a
       JOIN workshop_change_orders co
         ON co.job_id=a.job_id AND co.company_id=a.company_id
      WHERE a.token=$1 AND co.id=$2`, [token, orderId]
  )).rows[0];
  if (!data || data.status !== 'proposed') {
    return res.status(400).redirect('/workshop/status/' + encodeURIComponent(token));
  }
  await pool.query(
    `UPDATE workshop_change_orders
        SET status='approved', approved_by=$1, approved_at=now(), updated_at=now()
      WHERE id=$2 AND company_id=$3 AND job_id=$4 AND status='proposed'`,
    [name, orderId, data.company_id, data.job_id]);
  await logActivity(pool, data.company_id, data.job_id, 'change_order_customer_approved',
    `اعتمد العميل التعديل الإضافي #${orderId}`, name);
  res.redirect('/workshop/status/' + encodeURIComponent(token) + '?change_approved=1');
});

module.exports = router;