// Leads and quotes: who asked, what they were quoted, and what happened next.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const { ref } = require('../lib/tenant_scope');
const Q = require('../furniture/quotes');
const S = require('../furniture/sales');
const B = require('../furniture/branches');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const text = (v, max) => String(v || '').trim().slice(0, max) || null;

// Codes the server chose. The page never prints the address bar's own words.
const ERRORS = ['no_lines', 'save', 'no_name', 'dup_phone', 'expired', 'already', 'rejected', 'state'];

async function taxPercentOf(cid) {
  const r = await pool.query('SELECT tax_percent FROM furniture_settings WHERE company_id=$1', [cid]);
  return r.rows[0] ? Number(r.rows[0].tax_percent) : 0;
}

// ── The board: leads on the left, quotes on the right ────────────────────────
router.get('/', async (req, res) => {
  const cid = req.company.id;
  try {
    const params = [cid];
    let where = 'company_id=$1';
    where += B.sqlFor(req.branch, params, 'branch_id');
    const [leads, quotes, products, customers, taxPercent] = await Promise.all([
      pool.query(`SELECT * FROM furniture_leads WHERE ${where}
                   ORDER BY (status='new') DESC, updated_at DESC LIMIT 200`, params),
      pool.query(
        `SELECT q.*, l.name AS lead_name, l.phone AS lead_phone
           FROM furniture_quotes q LEFT JOIN furniture_leads l ON l.id = q.lead_id
          WHERE q.company_id=$1 ORDER BY q.quote_date DESC, q.id DESC LIMIT 100`, [cid]),
      pool.query('SELECT id, name, selling_price FROM furniture_products WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      pool.query('SELECT id, name FROM furniture_customers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      taxPercentOf(cid),
    ]);
    const now = new Date();
    res.render('furniture_admin/quotes', {
      company: req.company, tab: 'quotes',
      leads: leads.rows,
      quotes: quotes.rows.map((q) => Object.assign({}, q, { state: Q.stateOf(q, now) })),
      products: products.rows, customers: customers.rows, taxPercent,
      sources: Q.SOURCES, leadStatuses: Q.LEAD_STATUSES,
      defaultValid: Q.defaultValidUntil(new Date()),
      saved: req.query.saved === '1',
      err: ERRORS.includes(req.query.err) ? req.query.err : null,
    });
  } catch (e) { console.error('[furniture quotes]', e.message); res.status(500).send('error'); }
});

// ── A lead ───────────────────────────────────────────────────────────────────
router.post('/leads', async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (!name) return res.redirect('/furniture/quotes?err=no_name');
  const key = Q.phoneKey(b.phone);
  try {
    // The same phone is the same person: quoting one caller twice at two
    // different prices is the failure this index prevents.
    const r = await pool.query(
      `INSERT INTO furniture_leads (company_id, name, phone, phone_key, source, interest, note, branch_id)
       VALUES ($1,$2,$3,NULLIF($4,''),$5,$6,$7,$8)
       ON CONFLICT (company_id, phone_key) WHERE phone_key IS NOT NULL AND phone_key <> ''
       DO NOTHING RETURNING id`,
      [req.company.id, name, text(b.phone, 30), key,
        Q.SOURCES.includes(b.source) ? b.source : 'walkin',
        text(b.interest, 200), text(b.note, 300),
        B.idToStamp(req.branch, b.branch_id, req.branches || [])]
    );
    if (!r.rows[0] && key) return res.redirect('/furniture/quotes?err=dup_phone');
  } catch (e) {
    console.error('[furniture lead add]', e.message);
    return res.redirect('/furniture/quotes?err=save');
  }
  res.redirect('/furniture/quotes?saved=1');
});

router.post('/leads/:id(\\d+)/status', async (req, res) => {
  const status = Q.LEAD_STATUSES.includes((req.body || {}).status) ? req.body.status : null;
  if (!status) return res.redirect('/furniture/quotes?err=state');
  try {
    await pool.query(
      'UPDATE furniture_leads SET status=$1, updated_at=now() WHERE id=$2 AND company_id=$3',
      [status, parseInt(req.params.id, 10), req.company.id]);
  } catch (e) {
    console.error('[furniture lead status]', e.message);
    return res.redirect('/furniture/quotes?err=save');
  }
  res.redirect('/furniture/quotes?saved=1');
});

// ── A quote ──────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  const pids = [].concat(b.product_id || []);
  const qtys = [].concat(b.qty || []);
  const prices = [].concat(b.unit_price || []);
  const names = [].concat(b.line_name || []);
  const lines = pids
    .map((p, i) => ({
      product_id: parseInt(p, 10) || null,
      name: text(names[i], 120),
      qty: num(qtys[i]) || 1,
      unit_price: num(prices[i]),
    }))
    .filter((l) => (l.product_id || l.name) && l.unit_price > 0);
  if (!lines.length) return res.redirect('/furniture/quotes?err=no_lines');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = Q.totals(lines, await taxPercentOf(cid));
    const quoteDate = date(b.quote_date) || new Date().toISOString().slice(0, 10);
    const quote = (await client.query(
      `INSERT INTO furniture_quotes
         (company_id, lead_id, customer_id, quote_date, valid_until, subtotal, tax, total, status, note, branch_id)
       VALUES ($1,${ref('furniture_leads', '$2', '$1')},${ref('furniture_customers', '$3', '$1')},
               $4,$5,$6,$7,$8,'sent',$9,$10) RETURNING id`,
      [cid, parseInt(b.lead_id, 10) || null, parseInt(b.customer_id, 10) || null,
        quoteDate, date(b.valid_until) || Q.defaultValidUntil(quoteDate),
        t.subtotal, t.tax, t.total, text(b.note, 300),
        B.idToStamp(req.branch, b.branch_id, req.branches || [])]
    )).rows[0];

    for (const l of lines) {
      // The name and price AS QUOTED. Reading today's product price back later
      // would rewrite what the customer was told.
      await client.query(
        `INSERT INTO furniture_quote_items (company_id, quote_id, product_id, name, qty, unit_price, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [cid, quote.id, l.product_id, l.name, l.qty, l.unit_price, S.round2(l.qty * l.unit_price)]);
    }
    // The lead moved on: it has been quoted.
    if (parseInt(b.lead_id, 10)) {
      await client.query(
        "UPDATE furniture_leads SET status='quoted', updated_at=now() WHERE id=$1 AND company_id=$2 AND status='new'",
        [parseInt(b.lead_id, 10), cid]);
    }
    await client.query('COMMIT');
    req.flog('quote.create', 'quote', quote.id, `#${quote.id} · ${S.round2(t.total)}`);
    res.redirect('/furniture/quotes?saved=1');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[furniture quote create]', e.message);
    res.redirect('/furniture/quotes?err=save');
  } finally { client.release(); }
});

router.post('/:id(\\d+)/reject', async (req, res) => {
  try {
    await pool.query(
      "UPDATE furniture_quotes SET status='rejected' WHERE id=$1 AND company_id=$2 AND sale_id IS NULL",
      [parseInt(req.params.id, 10), req.company.id]);
  } catch (e) {
    console.error('[furniture quote reject]', e.message);
    return res.redirect('/furniture/quotes?err=save');
  }
  res.redirect('/furniture/quotes?saved=1');
});

/**
 * Accept → invoice.
 *
 * The moment a piece of paper becomes money owed. Two clicks on it must not
 * produce two invoices for the same bedroom, so the quote is CLAIMED in the
 * same statement that checks it — `WHERE sale_id IS NULL` — and everything
 * happens on one transaction.
 */
router.post('/:id(\\d+)/accept', async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const quote = (await client.query(
      'SELECT * FROM furniture_quotes WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid])).rows[0];
    const verdict = Q.canConvert(quote, new Date());
    if (!verdict.ok) {
      await client.query('ROLLBACK');
      return res.redirect('/furniture/quotes?err=' + (['already', 'expired', 'rejected'].includes(verdict.why) ? verdict.why : 'state'));
    }
    const items = (await client.query(
      'SELECT * FROM furniture_quote_items WHERE quote_id=$1 AND company_id=$2 ORDER BY id', [id, cid])).rows;
    if (!items.length) { await client.query('ROLLBACK'); return res.redirect('/furniture/quotes?err=no_lines'); }

    const sale = (await client.query(
      `INSERT INTO furniture_sales
         (company_id, customer_id, sale_date, subtotal, tax, total, paid, status, note, branch_id)
       VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,0,'open',$6,$7) RETURNING id`,
      [cid, quote.customer_id, quote.subtotal, quote.tax, quote.total,
        'من عرض سعر #' + quote.id, quote.branch_id]
    )).rows[0];

    for (const it of items) {
      await client.query(
        `INSERT INTO furniture_sale_items (company_id, sale_id, product_id, qty, unit_price, total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cid, sale.id, it.product_id, it.qty, it.unit_price, it.total]);
    }

    // The claim: only a quote that has not been invoiced can take this row.
    const claimed = await client.query(
      `UPDATE furniture_quotes SET status='accepted', sale_id=$3
        WHERE id=$1 AND company_id=$2 AND sale_id IS NULL RETURNING id`, [id, cid, sale.id]);
    if (!claimed.rows[0]) {
      // Somebody else accepted it while we were building the invoice.
      await client.query('ROLLBACK');
      return res.redirect('/furniture/quotes?err=already');
    }
    if (quote.lead_id) {
      await client.query("UPDATE furniture_leads SET status='won', updated_at=now() WHERE id=$1 AND company_id=$2",
        [quote.lead_id, cid]);
    }
    await client.query('COMMIT');
    req.flog('quote.accept', 'quote', id, '#' + id + ' → فاتورة #' + sale.id);
    res.redirect('/furniture/sales/' + sale.id + '?saved=1');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[furniture quote accept]', e.message);
    res.redirect('/furniture/quotes?err=save');
  } finally { client.release(); }
});

module.exports = router;
