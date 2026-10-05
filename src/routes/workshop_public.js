'use strict';

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const J = require('../workshop/jobs');
const { logActivity } = require('../workshop/operations');
const payVault = require('../lib/pay_vault');
const { createGatewayPayment, loadPaySettings, gatewayReady } = require('../lib/gateways');
const paymob = require('../lib/gateways/paymob');

const { rateLimit, clientIp } = require('../middleware/rateLimit');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── صلاحية رابط المتابعة (مراجعة كوديكس ٢٠٢٦-١٠-٠٥) ──────────────────────────
// الرابط كان شغّال للأبد. دلوقتى: بيقف لو الورشة أوقفته (revoked_at)، أو بعد ٣٠ يوم من
// التسليم/الإلغاء (expires_at بيتحط وقت تغيير الحالة؛ والأوامر القديمة بتتحسب من آخر
// تاريخ عندها). «رابط جديد» من الإدارة بيغيّر التوكن نفسه فالقديم بيبقى ٤٠٤.
const LINK_DAYS_AFTER_CLOSE = 30;
const LINK_LIVE_SQL = `a.revoked_at IS NULL AND COALESCE(a.expires_at,
    CASE WHEN j.status IN ('delivered','cancelled')
         THEN COALESCE(j.delivered_at, j.ready_at, j.done_at, j.received_at) + interval '${LINK_DAYS_AFTER_CLOSE} days' END,
    'infinity'::timestamptz) > now()`;

/** التوكن موجود بس منتهى/موقوف ← صفحة «الرابط انتهى» (410)، ومش موجود خالص ← 404. */
async function deadLink(res, token) {
  const known = (await pool.query('SELECT 1 FROM workshop_job_access WHERE token=$1', [token])).rows[0];
  if (!known) return res.status(404).render('404');
  return res.status(410).render('workshop_public/expired');
}

// نص الموافقة ثابت ومتسجّل حرفياً مع كل موافقة — العميل بيعلّم عليه مش بيكتب اسمه وبس.
const CONSENT_TEXT = 'أوافق على الأعمال والتكلفة الموضحة';
const sameMoney = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
// محاولات الموافقة: ١٠ كل ربع ساعة للرابط من نفس الجهاز — كفاية لأى عميل حقيقى
const approveLimiter = rateLimit({
  name: 'workshop-approve',
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => String(req.params.token || '').slice(0, 100) + '|' + clientIp(req),
});
const evidenceMeta = (req) => ({
  ip: clientIp(req) || null,
  ua: String((req.get && req.get('user-agent')) || '').slice(0, 300) || null,
});

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
      WHERE a.token=$1 AND ${LINK_LIVE_SQL}`, [token]
  )).rows[0];
  if (!data) return deadLink(res, token);

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
     consentText: CONSENT_TEXT,
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
        WHERE a.token=$1 AND ${LINK_LIVE_SQL}`, [token]
    )).rows[0];
    if (!job) return deadLink(res, token);
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

// الموافقة على العرض. بتتقبل بس لو: الرابط شغّال · العميل علّم على نص الموافقة · والإجمالى اللى
// شافه فى الصفحة (seen_total) هو نفسه الإجمالى دلوقتى — لو الورشة غيّرت العرض بعد ما فتح
// الرابط، بيرجع يشوف الأرقام الجديدة بدل ما يوافق على حاجة غير اللى قدامه. وكل موافقة
// بتتسجّل فى workshop_approval_evidence بنسخة البنود والـIP والمتصفح.
router.post('/:token/approve', approveLimiter, async (req, res) => {
  const token = String(req.params.token || '').slice(0, 100);
  const back = (q) => res.redirect('/workshop/status/' + encodeURIComponent(token) + (q ? '?' + q : ''));
  const b = req.body || {};
  const data = (await pool.query(
    `SELECT a.job_id, a.company_id, j.status, j.customer_id, j.discount, j.tax_percent, j.approved_at
       FROM workshop_job_access a
       JOIN workshop_jobs j ON j.id=a.job_id AND j.company_id=a.company_id
      WHERE a.token=$1 AND ${LINK_LIVE_SQL}`, [token]
  )).rows[0];
  if (!data) return deadLink(res, token);
  if (['cancelled', 'delivered'].includes(data.status) || data.approved_at) return back('');
  if (b.agree !== '1') return back('consent=1#approve');
  const [parts, labour] = await Promise.all([
    pool.query('SELECT name, qty, unit_price FROM workshop_job_parts WHERE company_id=$2 AND job_id=$1 ORDER BY id', [data.job_id, data.company_id]),
    pool.query('SELECT description, amount FROM workshop_job_labour WHERE company_id=$2 AND job_id=$1 ORDER BY id', [data.job_id, data.company_id]),
  ]);
  const totals = J.jobTotals(data, parts.rows, labour.rows);
  if (!sameMoney(b.seen_total, totals.total)) return back('changed=1#approve');
  const name = safeName(b.name);
  const meta = evidenceMeta(req);
  const snapshot = {
    parts: parts.rows.map((p) => ({ name: p.name, qty: Number(p.qty), unit_price: Number(p.unit_price) })),
    labour: labour.rows.map((l) => ({ description: l.description, amount: Number(l.amount) })),
    discount: totals.discount, tax_percent: totals.taxPercent, tax: totals.tax,
    subtotal: totals.subtotal, total: totals.total,
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // approved_at IS NULL: ضغطتين ورا بعض ماتعملش موافقتين
    const upd = await client.query(
      `UPDATE workshop_jobs
          SET status='approved', approved_at=now(), approved_by=$1, quote_total=$2
        WHERE id=$3 AND company_id=$4 AND approved_at IS NULL`,
      [name, totals.total, data.job_id, data.company_id]);
    if (upd.rowCount) {
      await client.query(
        `INSERT INTO workshop_approval_evidence
           (company_id, job_id, approved_by, consent_text, total, snapshot, ip, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [data.company_id, data.job_id, name, CONSENT_TEXT, totals.total, JSON.stringify(snapshot), meta.ip, meta.ua]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[workshop approve]', e.message);
    return back('');
  } finally { client.release(); }
  await logActivity(pool, data.company_id, data.job_id, 'quote_approved',
    `اعتمد العميل العرض من الرابط الآمن — الإجمالى ${totals.total} — «${CONSENT_TEXT}»`, name);
  back('approved=1');
});

router.post('/:token/change-orders/:id/approve', approveLimiter, async (req, res) => {
  const token = String(req.params.token || '').slice(0, 100);
  const back = (q) => res.redirect('/workshop/status/' + encodeURIComponent(token) + (q ? '?' + q : ''));
  const orderId = parseInt(req.params.id, 10);
  const b = req.body || {};
  const data = (await pool.query(
    `SELECT a.job_id, a.company_id, co.id AS order_id, co.status
       FROM workshop_job_access a
       JOIN workshop_jobs j ON j.id=a.job_id AND j.company_id=a.company_id
       JOIN workshop_change_orders co
         ON co.job_id=a.job_id AND co.company_id=a.company_id
      WHERE a.token=$1 AND co.id=$2 AND ${LINK_LIVE_SQL}`, [token, orderId]
  )).rows[0];
  if (!data) return deadLink(res, token);
  if (data.status !== 'proposed') return back('');
  // من هنا المعرّف اللى رجع من القاعدة (متقيّد بالشركة والأمر) — مش اللى فى الرابط
  const changeId = data.order_id;
  if (b.agree !== '1') return back('consent=1#change-' + changeId);
  const items = (await pool.query(
    `SELECT kind, description, qty, unit_price FROM workshop_change_order_items
      WHERE company_id=$1 AND change_order_id=$2 ORDER BY id`, [data.company_id, changeId])).rows;
  const total = Math.round(items.reduce((sum, i) => sum + Number(i.qty) * Number(i.unit_price), 0) * 100) / 100;
  if (!sameMoney(b.seen_total, total)) return back('changed=1#change-' + changeId);
  const name = safeName(b.name);
  const meta = evidenceMeta(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE workshop_change_orders
          SET status='approved', approved_by=$1, approved_at=now(), updated_at=now()
        WHERE id=$2 AND company_id=$3 AND job_id=$4 AND status='proposed'`,
      [name, changeId, data.company_id, data.job_id]);
    if (upd.rowCount) {
      await client.query(
        `INSERT INTO workshop_approval_evidence
           (company_id, job_id, change_order_id, approved_by, consent_text, total, snapshot, ip, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [data.company_id, data.job_id, changeId, name, CONSENT_TEXT, total,
          JSON.stringify({ items: items.map((i) => ({ kind: i.kind, description: i.description, qty: Number(i.qty), unit_price: Number(i.unit_price) })), total }),
          meta.ip, meta.ua]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[workshop change approve]', e.message);
    return back('');
  } finally { client.release(); }
  await logActivity(pool, data.company_id, data.job_id, 'change_order_customer_approved',
    `اعتمد العميل التعديل الإضافي #${changeId} — ${total} — «${CONSENT_TEXT}»`, name);
  back('change_approved=1');
});

module.exports = router;
module.exports.LINK_LIVE_SQL = LINK_LIVE_SQL;
module.exports.LINK_DAYS_AFTER_CLOSE = LINK_DAYS_AFTER_CLOSE;
module.exports.CONSENT_TEXT = CONSENT_TEXT;