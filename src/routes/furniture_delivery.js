// Delivery + installation (phase 8): the board, and the four buttons on it.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const D = require('../furniture/delivery');

const router = express.Router();

// The reasons this section can refuse, as data. Printing `req.query.err` would
// let a link choose the words on the merchant's screen.
const DELIVERY_ERRORS = ['no_customer', 'invoice_not_found', 'save', 'unpaid', 'bad_date', 'fee',
  'bad_code', 'wrong_code', 'already', 'not_found'];
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const VIEWS = ['open', 'today', 'late', 'done'];

router.get('/', async (req, res) => {
  const cid = req.company.id;
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'open';
  try {
    const [jobs, tally, policy, sales, customers] = await Promise.all([
      D.board(pool, cid, view, req.branch),
      D.counts(pool, cid, req.branch),
      D.policyOf(pool, cid),
      // Open invoices first: those are the ones with something still to hand over.
      pool.query(
        `SELECT s.id, s.sale_date, s.total, c.name AS customer_name
           FROM furniture_sales s LEFT JOIN furniture_customers c ON c.id = s.customer_id
          WHERE s.company_id=$1 AND s.status <> 'cancelled'
          ORDER BY (s.status <> 'open') ASC, s.sale_date DESC, s.id DESC LIMIT 200`, [cid]),
      pool.query('SELECT id, name FROM furniture_customers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
    ]);
    res.render('furniture_admin/delivery', {
      company: req.company, tab: 'delivery',
      jobs, tally, view, policy, today: D.today(),
      // Computed once here rather than in the template: whether a van may go
      // out is a business rule, and business rules do not belong in EJS.
      dispatch: Object.fromEntries(jobs.map((j) => [j.id, D.dispatchCheck(j, policy)])),
      sales: sales.rows, customers: customers.rows,
      err: DELIVERY_ERRORS.includes(req.query.err) ? req.query.err : null,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture delivery]', e.message); res.status(500).send('error'); }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  try {
    const job = await D.schedule(pool, req.company.id, {
      saleId: b.sale_id, customerId: b.customer_id, kind: b.kind,
      scheduledDate: date(b.scheduled_date), slot: b.slot, crew: b.crew,
      address: b.address, phone: b.phone, note: b.note, fee: b.fee,
      // Which showroom this trip belongs to: what the form says if it says
      // anything, otherwise the branch the user is looking at.
      branch: req.branch, branchId: b.branch_id, branches: req.branches || [],
    });
    req.flog('delivery.book', 'delivery', job.id, `#${job.id} · ${b.kind === 'install' ? 'install' : 'delivery'}`);
    res.redirect('/furniture/delivery?saved=1');
  } catch (e) {
    console.error('[furniture delivery create]', e.message);
    const known = ['no_customer', 'invoice_not_found'];
    res.redirect('/furniture/delivery?err=' + (known.includes(e.message) ? e.message : 'save'));
  }
});

router.post('/:id(\\d+)/status', async (req, res) => {
  const b = req.body || {};
  const view = VIEWS.includes(b.view) ? b.view : 'open';
  const id = parseInt(req.params.id, 10);
  try {
    // The override is deliberate and recorded. Refusing outright would just
    // teach the showroom to mark jobs done from another page; refusing SILENTLY
    // would be worse. So: block by default, allow with one explicit click, and
    // write who did it to the log.
    const override = b.override === '1';
    const done = await D.setStatus(pool, req.company.id, id, b.status, b.note, { override });
    req.flog(override ? 'delivery.dispatch_override' : 'delivery.status', 'delivery', id,
      `#${id} → ${done.status}`);
    // Delivered is the moment a guarantee starts running — see
    // src/furniture/warranty.js. Only on 'done', and only for rows that have
    // not started, so a second trip cannot reset the first one's clock.
    if (done.status === 'done' && done.sale_id) {
      const started = await require('../furniture/warranty')
        .startForSale(pool, req.company.id, done.sale_id, null);
      if (started) req.flog('warranty.start', 'warranty', done.sale_id, `#${done.sale_id} · ${started}`);
    }
  } catch (e) {
    console.error('[furniture delivery status]', e.message);
    if (e.message === 'unpaid') {
      return res.redirect(`/furniture/delivery?view=${view}&err=unpaid&job=${id}`);
    }
  }
  res.redirect('/furniture/delivery?view=' + view);
});

// ── كود الاستلام وتأكيده (البند ٨٦) ──────────────────────────────────────────
//
// الكود بيتولد للرحلة مرة واحدة، والعميل بيشوفه على صفحة متابعة طلبه.
router.post('/:id(\\d+)/code', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const code = await D.ensureReceiptCode(pool, req.company.id, id);
    if (!code) return res.redirect('/furniture/delivery?err=save');
    req.flog('delivery.code', 'delivery', id, '#' + id);
  } catch (e) {
    console.error('[furniture delivery code]', e.message);
    return res.redirect('/furniture/delivery?err=save');
  }
  res.redirect('/furniture/delivery?saved=1');
});

// «تم التسليم» ليها طريقتين، والاتنين متسجّلين باسمهم: العميل قال الكود، أو
// الورشة أقرّت بالتسليم. الشاشة والعميل بيشوفوا الفرق — الادعاء إن العميل
// أكّد وهو ما أكّدش أسوأ من إننا نقول اللي حصل.
router.post('/:id(\\d+)/receipt', async (req, res) => {
  const b = req.body || {};
  const view = VIEWS.includes(b.view) ? b.view : 'open';
  const id = parseInt(req.params.id, 10);
  try {
    const r = await D.deliverWithReceipt(pool, req.company.id, id, {
      method: b.method === 'declared' ? 'declared' : 'code',
      code: b.code,
      // مين أقرّ بالاستلام — نفس اللي بيتكتب في سجل النشاط، مش «حد».
      by: require('../furniture/activity').actorOf(req, res.locals.t),
      override: b.override === '1',
      policy: await D.policyOf(pool, req.company.id),
    });
    if (!r.ok) return res.redirect(`/furniture/delivery?view=${view}&err=${r.why}&job=${id}`);
    req.flog('delivery.receipt', 'delivery', id, `#${id} · ${r.job.receipt_method}`);
    // التسليم هو اللحظة اللي الضمان بيبدأ منها — نفس قاعدة زرار الحالة.
    if (r.job.sale_id) {
      const started = await require('../furniture/warranty')
        .startForSale(pool, req.company.id, r.job.sale_id, null);
      if (started) req.flog('warranty.start', 'warranty', r.job.sale_id, `#${r.job.sale_id} · ${started}`);
    }
  } catch (e) {
    console.error('[furniture delivery receipt]', e.message);
    return res.redirect(`/furniture/delivery?view=${view}&err=save`);
  }
  res.redirect('/furniture/delivery?view=' + view + '&saved=1');
});

router.post('/:id(\\d+)/move', async (req, res) => {
  const b = req.body || {};
  try {
    const id = parseInt(req.params.id, 10);
    await D.reschedule(pool, req.company.id, id, date(b.scheduled_date), b.slot);
    req.flog('delivery.move', 'delivery', id, `#${id} → ${date(b.scheduled_date)}`);
  } catch (e) {
    console.error('[furniture delivery move]', e.message);
    return res.redirect('/furniture/delivery?err=bad_date');
  }
  res.redirect('/furniture/delivery?saved=1');
});

// ── Collect the trip fee ─────────────────────────────────────────────────────
router.post('/:id(\\d+)/fee', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const got = await D.collectFee(pool, req.company.id, id, Number((req.body || {}).amount));
    req.flog('delivery.fee', 'delivery', id, `#${id} · ${got.added}`);
    res.redirect('/furniture/delivery?saved=1');
  } catch (e) {
    console.error('[furniture delivery fee]', e.message);
    res.redirect('/furniture/delivery?err=fee');
  }
});

module.exports = router;
