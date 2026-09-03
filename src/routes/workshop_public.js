'use strict';

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const J = require('../workshop/jobs');
const { logActivity } = require('../workshop/operations');
const payVault = require('../lib/pay_vault');
const { createGatewayPayment, loadPaySettings, gatewayReady } = require('../lib/gateways');
const paymob = require('../lib/gateways/paymob');

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
             co.currency,
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
  const [parts, labour, inspection, photos, changeOrders, payments] = await Promise.all([
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
    pool.query(
      'SELECT COALESCE(SUM(amount),0)::float AS paid FROM workshop_payments WHERE company_id=$1 AND job_id=$2',
      [data.company_id, data.job_id]
    ),
  ]);
  const totals = J.jobTotals(data, parts.rows, labour.rows);
  const paymentSettings = await loadPaySettings(pool, data.company_id);
  const paid = Number(payments.rows[0] && payments.rows[0].paid) || 0;
  res.render('workshop_public/status', {
    title: `متابعة ${J.jobCode(data.job_id)}`,
    job: data, parts: parts.rows, labour: labour.rows,
     inspection: inspection.rows, photos: photos.rows, changeOrders: changeOrders.rows, totals,
     payment: {
       paid,
       due: Math.max(0, Number(totals.total) - paid),
       onlineReady: gatewayReady(paymentSettings),
       link: paymentSettings && /^https?:\/\//i.test(String(paymentSettings.payment_link || ''))
         ? paymentSettings.payment_link : null,
       linkLabel: (paymentSettings && paymentSettings.payment_link_label) || 'ادفع إلكترونيًا',
       instructions: (paymentSettings && paymentSettings.instructions) || '',
     },
     approved: req.query.approved === '1', payerror: req.query.payerror || '',
     token, J,
  });
});

// Pay the outstanding balance of this specific job through the workshop's own
// Paymob account. The access token is the customer-facing capability; the
// callback settles only the attempt whose company and amount match.
router.get('/:token/pay', async (req, res) => {
  const token = String(req.params.token || '').slice(0, 100);
  try {
    const job = (await pool.query(
      `SELECT a.token, a.job_id, a.company_id, j.customer_id, j.status,
              j.discount, j.tax_percent, c.name AS customer_name, c.phone AS customer_phone,
              co.currency
         FROM workshop_job_access a
         JOIN workshop_jobs j ON j.id=a.job_id AND j.company_id=a.company_id
         JOIN companies co ON co.id=a.company_id
         LEFT JOIN workshop_customers c ON c.id=j.customer_id
        WHERE a.token=$1`, [token]
    )).rows[0];
    if (!job) return res.status(404).render('404');
    const [parts, labour, payments] = await Promise.all([
      pool.query('SELECT qty, unit_price FROM workshop_job_parts WHERE company_id=$2 AND job_id=$1', [job.job_id, job.company_id]),
      pool.query('SELECT amount FROM workshop_job_labour WHERE company_id=$2 AND job_id=$1', [job.job_id, job.company_id]),
      pool.query('SELECT COALESCE(SUM(amount),0)::float AS paid FROM workshop_payments WHERE company_id=$1 AND job_id=$2', [job.company_id, job.job_id]),
    ]);
    const totals = J.jobTotals(job, parts.rows, labour.rows);
    const paid = Number(payments.rows[0] && payments.rows[0].paid) || 0;
    const due = Math.max(0, Number(totals.total) - paid);
    if (!due || ['cancelled'].includes(job.status)) {
      return res.redirect('/workshop/status/' + encodeURIComponent(token));
    }
    const settings = await loadPaySettings(pool, job.company_id);
    if (!gatewayReady(settings)) {
      return res.redirect('/workshop/status/' + encodeURIComponent(token) + '?payerror=not_configured');
    }
    const merchantOrderId = `workshop-${job.job_id}-${crypto.randomBytes(8).toString('hex')}`;
    const attempt = (await pool.query(
      `INSERT INTO workshop_payment_attempts
        (company_id, job_id, merchant_order_id, provider, amount_cents, status)
       VALUES ($1,$2,$3,'paymob',$4,'pending') RETURNING id`,
      [job.company_id, job.job_id, merchantOrderId, Math.round(due * 100)]
    )).rows[0];
    const first = String(job.customer_name || 'Customer').trim().split(/\s+/);
    try {
      const out = await createGatewayPayment(pool, { id: job.company_id, currency: job.currency || 'EGP' }, {
        amountCents: Math.round(due * 100),
        currency: job.currency || 'EGP',
        merchantOrderId,
        billing: {
          first_name: first[0] || 'Customer',
          last_name: first.slice(1).join(' ') || 'NA',
          phone: job.customer_phone || 'NA',
          street: 'NA',
        },
      });
      await pool.query(
        `UPDATE workshop_payment_attempts
            SET provider_order_id=$1, payment_url=$2
          WHERE id=$3 AND company_id=$4`,
        [String(out.orderId || ''), out.url, attempt.id, job.company_id]
      );
      return res.redirect(out.url);
    } catch (e) {
      await pool.query(
        `UPDATE workshop_payment_attempts SET status='failed', error=$1
          WHERE id=$2 AND company_id=$3`, [String(e.message || 'gateway error').slice(0, 500), attempt.id, job.company_id]
      );
      return res.redirect('/workshop/status/' + encodeURIComponent(token) + '?payerror=provider');
    }
  } catch (e) {
    console.error('[workshop pay initiate]', e.message);
    return res.redirect('/workshop/status/' + encodeURIComponent(token) + '?payerror=provider');
  }
});

router.post('/payment/paymob/callback', async (req, res) => {
  try {
    const obj = (req.body && req.body.obj) || {};
    const providedHmac = req.query.hmac || (req.body && req.body.hmac);
    const merchantOrderId = String((obj.order && obj.order.merchant_order_id) || '');
    const match = /^workshop-(\d+)-([a-f0-9]+)$/.exec(merchantOrderId);
    if (!match) return res.status(200).send('ignored');
    const attempt = (await pool.query(
      `SELECT p.*, j.customer_id, co.currency
         FROM workshop_payment_attempts p
         JOIN workshop_jobs j ON j.id=p.job_id AND j.company_id=p.company_id
         JOIN companies co ON co.id=p.company_id
        WHERE p.merchant_order_id=$1 AND p.job_id=$2`, [merchantOrderId, Number(match[1])]
    )).rows[0];
    if (!attempt) return res.status(200).send('no payment');
    const settings = (await pool.query(
      'SELECT gateway_hmac, gateway_hmac_enc FROM payment_settings WHERE company_id=$1', [attempt.company_id]
    )).rows[0];
    const hmac = payVault.read(settings && settings.gateway_hmac_enc, settings && settings.gateway_hmac);
    if (!paymob.verifyCallbackHmac(obj, hmac, providedHmac)) return res.status(403).send('bad hmac');
    const verdict = paymob.paymentAccepted(
      obj, attempt.amount_cents, attempt.currency || 'EGP'
    );
    if (!verdict.ok) {
      await pool.query(
        `UPDATE workshop_payment_attempts SET status='failed', error=$1
          WHERE id=$2 AND status='pending'`, [verdict.why, attempt.id]
      );
      return res.status(200).send('rejected');
    }
    const settled = (await pool.query(
      `UPDATE workshop_payment_attempts
          SET status='paid', payment_ref=$1, paid_at=now()
        WHERE id=$2 AND company_id=$3 AND status <> 'paid'
        RETURNING id, job_id, company_id`,
      [String(obj.id || ''), attempt.id, attempt.company_id]
    )).rows[0];
    if (settled) {
      await pool.query(
        `INSERT INTO workshop_payments (company_id, job_id, customer_id, amount, method, note)
         VALUES ($1,$2,$3,$4,'paymob',$5)`,
        [attempt.company_id, attempt.job_id, attempt.customer_id, Number(attempt.amount_cents) / 100,
          `دفع إلكتروني عبر Paymob — ${String(obj.id || '')}`]
      );
      await logActivity(pool, attempt.company_id, attempt.job_id, 'online_payment_received', 'تم استلام دفعة إلكترونية من بوابة العميل');
    }
    return res.status(200).send('ok');
  } catch (e) {
    console.error('[workshop pay callback]', e.message);
    return res.status(200).send('err');
  }
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