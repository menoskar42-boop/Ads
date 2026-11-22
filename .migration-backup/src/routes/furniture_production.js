// أوامر التصنيع (البند ٨٦): اللوحة، وصرف الخامات، وحركة الأمر.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const { ref } = require('../lib/tenant_scope');
const P = require('../furniture/production');
const V = require('../furniture/variants');
const B = require('../furniture/branches');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// الأسباب اللي السيرفر يعرفها. طباعة `req.query.err` زي ما هي معناها إن أي
// لينك يقدر يكتب كلام على شاشة التاجر.
const MO_ERRORS = ['product', 'qty', 'save', 'already', 'closed', 'no_bom', 'unknown', 'short', 'move', 'not_found'];
const VIEWS = ['open', 'late', 'done', 'cancelled'];
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

// ── اللوحة ───────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const cid = req.company.id;
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'open';
  try {
    const params = [cid];
    let where = 'o.company_id=$1';
    if (view === 'done') where += " AND o.status='done'";
    else if (view === 'cancelled') where += " AND o.status='cancelled'";
    else where += " AND o.status = ANY('{queued,in_progress}')";
    where += B.sqlFor(req.branch, params, 'o.branch_id');

    const [orders, products, sales, all] = await Promise.all([
      pool.query(
        `SELECT o.*, s.id AS sale_no, c.name AS customer_name
           FROM furniture_production_orders o
           LEFT JOIN furniture_sales s ON s.id = o.sale_id
           LEFT JOIN furniture_customers c ON c.id = s.customer_id
          WHERE ${where}
          ORDER BY (o.due_date IS NULL) ASC, o.due_date ASC, o.id DESC LIMIT 300`, params),
      pool.query('SELECT id, name, selling_price FROM furniture_products WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      pool.query(
        `SELECT s.id, s.sale_date, c.name AS customer_name FROM furniture_sales s
           LEFT JOIN furniture_customers c ON c.id = s.customer_id
          WHERE s.company_id=$1 AND s.status <> 'cancelled'
          ORDER BY s.sale_date DESC, s.id DESC LIMIT 100`, [cid]),
      // العدّادات بتتحسب من الصفوف نفسها — مفيش عمود بيقول «متأخر» يبات غلط.
      pool.query(
        `SELECT id, status, due_date FROM furniture_production_orders WHERE company_id=$1`, [cid]),
    ]);

    const today = P.today();
    const rows = orders.rows.map((o) => ({
      ...o,
      late: P.lateOf(o, today),
      notes: P.notesFor(o),
    }));
    // «متأخر» تبويب، مش حالة متخزّنة: الأمر اللي فات ميعاده بيبان هنا لوحده.
    const list = view === 'late' ? rows.filter((r) => r.late.late) : rows;

    res.render('furniture_admin/production', {
      company: req.company, tab: 'production',
      orders: list, view, today,
      tally: P.tally(all.rows, today),
      products: products.rows, sales: sales.rows,
      err: MO_ERRORS.includes(req.query.err) ? req.query.err : null,
      shortName: typeof req.query.m === 'string' ? req.query.m.slice(0, 60) : null,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture production]', e.message); res.status(500).send('error'); }
});

// ── أمر جديد ─────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  const productId = parseInt(b.product_id, 10);
  const qty = Number(String(b.qty || '').trim());
  if (!Number.isInteger(productId)) return res.redirect('/furniture/production?err=product');
  if (!Number.isFinite(qty) || qty <= 0) return res.redirect('/furniture/production?err=qty');
  try {
    // الاسم بيتنسخ ساعة الأمر. القطعة اللي تتمسح السنة الجاية ماتخليش أمر
    // خلص السنة دي يقول إنه ما اتصنعش حاجة.
    const product = (await pool.query(
      'SELECT id, name FROM furniture_products WHERE id=$1 AND company_id=$2', [productId, cid])).rows[0];
    if (!product) return res.redirect('/furniture/production?err=product');

    const variants = (await pool.query(
      'SELECT id, product_id, name FROM furniture_product_variants WHERE company_id=$1 AND product_id=$2',
      [cid, productId])).rows;
    const rv = V.resolveVariant(variants, b.variant_id, productId);
    if (!rv.ok) return res.redirect('/furniture/production?err=product');

    const done = await pool.query(
      `INSERT INTO furniture_production_orders
         (company_id, product_id, variant_id, product_name, variant_name, sale_id, qty, due_date, note, branch_id)
       VALUES ($1,$2,$3,$4,$5,${ref('furniture_sales', '$6', '$1')},$7,$8,$9,$10) RETURNING id`,
      [cid, product.id, rv.variant ? rv.variant.id : null, product.name,
        rv.variant ? rv.variant.name : null, parseInt(b.sale_id, 10) || null, qty,
        date(b.due_date), String(b.note || '').trim().slice(0, 300) || null,
        B.idToStamp(req.branch, b.branch_id, req.branches || [])]);
    if (!done.rows.length) return res.redirect('/furniture/production?err=save');
    req.flog('production.add', 'production', done.rows[0].id, `${product.name} × ${qty}`);
  } catch (e) {
    console.error('[furniture production add]', e.message);
    return res.redirect('/furniture/production?err=save');
  }
  res.redirect('/furniture/production?saved=1');
});

// ── صرف الخامات ──────────────────────────────────────────────────────────────
router.post('/:id(\\d+)/issue', async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  try {
    const r = await P.issue(pool, cid, id);
    if (!r.ok) {
      // السبب بيتقال باسمه: «مفيش مكوّنات» غير «الخامة ناقصة» غير «اتصرف قبل كده».
      const q = r.why === 'short' && r.material ? '&m=' + encodeURIComponent(r.material) : '';
      return res.redirect('/furniture/production?err=' + r.why + q);
    }
    req.flog('production.issue', 'production', id, `${r.lines.length} خامة`);
  } catch (e) {
    console.error('[furniture production issue]', e.message);
    return res.redirect('/furniture/production?err=save');
  }
  res.redirect('/furniture/production?saved=1');
});

// ── حركة الأمر ───────────────────────────────────────────────────────────────
router.post('/:id(\\d+)/move', async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  const to = String(req.body.to || '');
  try {
    const row = (await pool.query(
      'SELECT status FROM furniture_production_orders WHERE id=$1 AND company_id=$2', [id, cid])).rows[0];
    if (!row) return res.redirect('/furniture/production?err=not_found');
    // الحركة المسموحة محسوبة من الحالة الحالية، مش من اللي الزرار بعته:
    // أمر خلص مايرجعش للطابور بضغطة — ده أمر جديد.
    if (!P.canMove(row.status, to)) return res.redirect('/furniture/production?err=move');
    const done = await pool.query(
      `UPDATE furniture_production_orders
          SET status=$1,
              started_at = CASE WHEN $1='in_progress' THEN COALESCE(started_at, now()) ELSE started_at END,
              done_at    = CASE WHEN $1='done' THEN now() ELSE done_at END
        WHERE id=$2 AND company_id=$3 AND status=$4 RETURNING id`,
      [to, id, cid, row.status]);
    // الحالة القديمة شرط في نفس الجملة: اتنين بيحرّكوا نفس الأمر، واحد بس ينجح.
    if (!done.rows.length) return res.redirect('/furniture/production?err=move');
    req.flog('production.move', 'production', id, `${row.status} → ${to}`);
  } catch (e) {
    console.error('[furniture production move]', e.message);
    return res.redirect('/furniture/production?err=save');
  }
  res.redirect('/furniture/production?saved=1');
});

module.exports = router;
