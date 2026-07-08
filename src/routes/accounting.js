// Unified merchant accounting (mounted at /accounting). Works for every page
// type — shop, pharmacy, orders. Revenue/COGS are read from each vertical's own
// orders tables; cost prices, fixed expenses, staff commissions, tax and payment
// settings are layered on top. The site stays free; this is a management tool.
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const multer = require('multer');
const requireLogin = require('../middleware/auth');
const sheet = require('../lib/sheet_import');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const uploadSheet = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } }).single('sheet');
function withSheet(req, res, next) { uploadSheet(req, res, () => next()); }

function toNum(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function toInt(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }

async function loadCompany(req, res, next) {
  if (!req.session || !req.session.companyId) return res.redirect('/company/login');
  try {
    const r = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    if (!r.rows.length) return res.redirect('/company/login');
    req.company = r.rows[0];
    // Lazily ensure a settings row exists.
    req.settings = (await pool.query('SELECT * FROM accounting_settings WHERE company_id = $1', [req.company.id])).rows[0]
      || (await pool.query('INSERT INTO accounting_settings (company_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *', [req.company.id])).rows[0]
      || { company_id: req.company.id, tax_enabled: false, tax_base: 'profit', tax_rate: 14, markup_enabled: false, markup_percent: 30, delivery_enabled: false, delivery_fee: 0 };
    next();
  } catch (e) { console.error('[accounting] loadCompany:', e.message); res.status(500).send('Error.'); }
}
router.use(requireLogin, loadCompany);

// Revenue + order count + COGS for the current month, per vertical.
async function verticalTotals(company) {
  const cid = company.id;
  const type = company.page_type;
  const monthGuard = "date_trunc('month', o.created_at) = date_trunc('month', now())";
  let revenue = 0, orders = 0, cogs = 0, freeSampleCredit = 0;

  if (type === 'shop') {
    const rev = (await pool.query(
      `SELECT COALESCE(SUM(total_amount),0)::numeric AS rev, COUNT(*)::int AS n
       FROM orders o WHERE company_id=$1 AND status <> 'cancelled' AND ${monthGuard}`, [cid])).rows[0];
    revenue = Number(rev.rev); orders = rev.n;
    cogs = Number((await pool.query(
      `SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost_price,0)),0)::numeric AS c
       FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id
       WHERE o.company_id=$1 AND o.status <> 'cancelled' AND ${monthGuard}`, [cid])).rows[0].c);
  } else if (type === 'pharmacy') {
    const rev = (await pool.query(
      `SELECT COALESCE(SUM(total_amount),0)::numeric AS rev, COUNT(*)::int AS n
       FROM pharmacy_orders o WHERE company_id=$1 AND status NOT IN ('rejected','cancelled') AND ${monthGuard}`, [cid])).rows[0];
    revenue = Number(rev.rev); orders = rev.n;
    cogs = Number((await pool.query(
      `SELECT COALESCE(SUM(poi.qty * COALESCE(pi.cost,0)),0)::numeric AS c
       FROM pharmacy_order_items poi JOIN pharmacy_orders o ON o.id=poi.order_id
       LEFT JOIN pharmacy_inventory pi ON pi.company_id=o.company_id AND pi.medicine_id=poi.medicine_id
       WHERE o.company_id=$1 AND o.status NOT IN ('rejected','cancelled') AND ${monthGuard}`, [cid])).rows[0].c);
    // Free samples: units received at zero cost → credit against COGS (capped).
    const fs = Number((await pool.query(
      `SELECT COALESCE(SUM(COALESCE(free_sample_qty,0) * COALESCE(cost,0)),0)::numeric AS v
       FROM pharmacy_inventory WHERE company_id=$1`, [cid])).rows[0].v);
    freeSampleCredit = Math.min(cogs, fs);
  } else if (type === 'orders') {
    const rev = (await pool.query(
      `SELECT COALESCE(SUM(total),0)::numeric AS rev, COUNT(*)::int AS n
       FROM food_orders o WHERE company_id=$1 AND status NOT IN ('rejected','cancelled') AND ${monthGuard}`, [cid])).rows[0];
    revenue = Number(rev.rev); orders = rev.n;
    cogs = Number((await pool.query(
      `SELECT COALESCE(SUM(foi.quantity * COALESCE(fi.cost_price,0)),0)::numeric AS c
       FROM food_order_items foi JOIN food_orders o ON o.id=foi.order_id LEFT JOIN food_items fi ON fi.id=foi.item_id
       WHERE o.company_id=$1 AND o.status NOT IN ('rejected','cancelled') AND ${monthGuard}`, [cid])).rows[0].c);
  }
  return { revenue, orders, cogs, freeSampleCredit };
}

async function buildReport(company, settings) {
  const cid = company.id;
  const v = await verticalTotals(company);
  const cogsNet = Math.max(0, v.cogs - v.freeSampleCredit);

  // Fixed expenses for this month (all monthly + one-offs dated this month).
  const expenses = Number((await pool.query(
    `SELECT COALESCE(SUM(amount),0)::numeric AS s FROM merchant_expenses
     WHERE company_id=$1 AND (recurrence='monthly'
       OR (recurrence='once' AND date_trunc('month', incurred_on) = date_trunc('month', now())))`, [cid])).rows[0].s);

  // Staff commissions for this month.
  const staff = (await pool.query('SELECT * FROM merchant_staff WHERE company_id=$1 AND is_active=true', [cid])).rows;
  let commissions = 0;
  const staffLines = staff.map((s) => {
    const val = Number(s.commission_value) || 0;
    let amt = 0;
    if (s.commission_type === 'fixed_monthly') amt = val;
    else if (s.commission_type === 'percent_sales') amt = v.revenue * val / 100;
    else if (s.commission_type === 'per_order') amt = v.orders * val;
    commissions += amt;
    return { name: s.name, role: s.role, type: s.commission_type, amount: Math.round(amt * 100) / 100 };
  });

  const grossProfit = v.revenue - cogsNet;
  const profitBeforeTax = grossProfit - expenses - commissions;

  let tax = 0;
  if (settings.tax_enabled) {
    const rate = Number(settings.tax_rate) || 0;
    if (settings.tax_base === 'sales') tax = v.revenue * rate / 100;
    else tax = Math.max(0, profitBeforeTax) * rate / 100;
  }
  const netProfit = profitBeforeTax - tax;

  return {
    revenue: v.revenue, orders: v.orders, cogs: v.cogs, freeSampleCredit: v.freeSampleCredit,
    cogsNet, grossProfit, expenses, commissions, staffLines, tax, profitBeforeTax, netProfit,
  };
}

const currencyOf = (c) => c.currency || 'EGP';

/* ─── Report dashboard ─────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const report = await buildReport(req.company, req.settings);
    res.render('accounting/dashboard', {
      company: req.company, settings: req.settings, report, currency: currencyOf(req.company),
      session: req.session,
    });
  } catch (e) { console.error('[accounting report]', e.message); res.status(500).send('Error building report.'); }
});

/* ─── Settings (tax / markup / delivery) ───────────────── */
router.post('/settings', async (req, res) => {
  const b = req.body || {};
  const base = b.tax_base === 'sales' ? 'sales' : 'profit';
  try {
    await pool.query(
      `INSERT INTO accounting_settings (company_id, tax_enabled, tax_base, tax_rate, markup_enabled, markup_percent, delivery_enabled, delivery_fee)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (company_id) DO UPDATE SET
         tax_enabled=EXCLUDED.tax_enabled, tax_base=EXCLUDED.tax_base, tax_rate=EXCLUDED.tax_rate,
         markup_enabled=EXCLUDED.markup_enabled, markup_percent=EXCLUDED.markup_percent,
         delivery_enabled=EXCLUDED.delivery_enabled, delivery_fee=EXCLUDED.delivery_fee`,
      [req.company.id, b.tax_enabled === '1', base, toNum(b.tax_rate, 14),
       b.markup_enabled === '1', toNum(b.markup_percent, 30), b.delivery_enabled === '1', toNum(b.delivery_fee, 0)]
    );
  } catch (e) { console.error('[accounting settings]', e.message); }
  res.redirect('/accounting/settings');
});
router.get('/settings', (req, res) => {
  res.render('accounting/settings', { company: req.company, settings: req.settings, session: req.session, saved: req.query.saved === '1' });
});

/* ─── Fixed expenses ───────────────────────────────────── */
router.get('/expenses', async (req, res) => {
  const rows = (await pool.query('SELECT * FROM merchant_expenses WHERE company_id=$1 ORDER BY id DESC', [req.company.id])).rows;
  res.render('accounting/expenses', { company: req.company, expenses: rows, session: req.session, currency: currencyOf(req.company) });
});
router.post('/expenses/add', async (req, res) => {
  const b = req.body || {};
  const cat = ['salary', 'rent', 'utilities', 'supplies', 'other'].includes(b.category) ? b.category : 'other';
  const rec = b.recurrence === 'once' ? 'once' : 'monthly';
  if ((b.label || '').trim() && toNum(b.amount, 0) > 0) {
    await pool.query(
      `INSERT INTO merchant_expenses (company_id, label, category, amount, recurrence, incurred_on)
       VALUES ($1,$2,$3,$4,$5, COALESCE(NULLIF($6,'')::date, CURRENT_DATE))`,
      [req.company.id, String(b.label).trim().slice(0, 120), cat, toNum(b.amount, 0), rec, (b.incurred_on || '').trim()]
    );
  }
  res.redirect('/accounting/expenses');
});
router.post('/expenses/:id/delete', async (req, res) => {
  await pool.query('DELETE FROM merchant_expenses WHERE id=$1 AND company_id=$2', [toInt(req.params.id, null), req.company.id]);
  res.redirect('/accounting/expenses');
});

/* ─── Staff + commissions ──────────────────────────────── */
router.get('/staff', async (req, res) => {
  const rows = (await pool.query('SELECT * FROM merchant_staff WHERE company_id=$1 ORDER BY id DESC', [req.company.id])).rows;
  res.render('accounting/staff', { company: req.company, staff: rows, session: req.session, currency: currencyOf(req.company) });
});
router.post('/staff/add', async (req, res) => {
  const b = req.body || {};
  const role = ['delivery', 'chef', 'receptionist', 'cashier', 'other'].includes(b.role) ? b.role : 'other';
  const ctype = ['none', 'per_order', 'percent_sales', 'fixed_monthly'].includes(b.commission_type) ? b.commission_type : 'none';
  if ((b.name || '').trim()) {
    await pool.query(
      `INSERT INTO merchant_staff (company_id, name, role, commission_type, commission_value)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.company.id, String(b.name).trim().slice(0, 100), role, ctype, toNum(b.commission_value, 0)]
    );
  }
  res.redirect('/accounting/staff');
});
router.post('/staff/:id/toggle', async (req, res) => {
  await pool.query('UPDATE merchant_staff SET is_active = NOT is_active WHERE id=$1 AND company_id=$2', [toInt(req.params.id, null), req.company.id]);
  res.redirect('/accounting/staff');
});
router.post('/staff/:id/delete', async (req, res) => {
  await pool.query('DELETE FROM merchant_staff WHERE id=$1 AND company_id=$2', [toInt(req.params.id, null), req.company.id]);
  res.redirect('/accounting/staff');
});

/* ─── Cost prices editor (per vertical) ────────────────── */
async function loadCostItems(company) {
  const cid = company.id;
  if (company.page_type === 'shop') {
    return (await pool.query('SELECT id, name, price, COALESCE(cost_price,0) AS cost_price FROM products WHERE company_id=$1 ORDER BY id DESC', [cid]))
      .rows.map((r) => ({ id: r.id, name: r.name, price: r.price, cost: r.cost_price, free: null }));
  }
  if (company.page_type === 'orders') {
    return (await pool.query(
      `SELECT fi.id, COALESCE(fi.name_ar, fi.name) AS name, fi.price, COALESCE(fi.cost_price,0) AS cost_price
       FROM food_items fi JOIN food_outlets fo ON fo.id=fi.outlet_id WHERE fo.company_id=$1 ORDER BY fi.id DESC`, [cid]))
      .rows.map((r) => ({ id: r.id, name: r.name, price: r.price, cost: r.cost_price, free: null }));
  }
  if (company.page_type === 'pharmacy') {
    return (await pool.query(
      `SELECT pi.id, COALESCE(m.name_ar, m.name_en) AS name, pi.price, COALESCE(pi.cost,0) AS cost_price, COALESCE(pi.free_sample_qty,0) AS free
       FROM pharmacy_inventory pi JOIN medicines m ON m.id=pi.medicine_id WHERE pi.company_id=$1 ORDER BY pi.id DESC LIMIT 500`, [cid]))
      .rows.map((r) => ({ id: r.id, name: r.name, price: r.price, cost: r.cost_price, free: r.free }));
  }
  return [];
}
router.get('/costs', async (req, res) => {
  const items = await loadCostItems(req.company);
  res.render('accounting/costs', { company: req.company, items, settings: req.settings, session: req.session, currency: currencyOf(req.company), saved: req.query.saved === '1' });
});
// Save a single row's cost (+ price, + free samples for pharmacy).
router.post('/costs/:id/save', async (req, res) => {
  const id = toInt(req.params.id, null);
  const b = req.body || {};
  const cost = toNum(b.cost, 0);
  const price = b.price === undefined ? null : toNum(b.price, null);
  try {
    if (req.company.page_type === 'shop') {
      await pool.query('UPDATE products SET cost_price=$1, price=COALESCE($2, price) WHERE id=$3 AND company_id=$4', [cost, price, id, req.company.id]);
    } else if (req.company.page_type === 'orders') {
      await pool.query(
        `UPDATE food_items SET cost_price=$1, price=COALESCE($2, price)
         WHERE id=$3 AND outlet_id IN (SELECT id FROM food_outlets WHERE company_id=$4)`, [cost, price, id, req.company.id]);
    } else if (req.company.page_type === 'pharmacy') {
      const free = toInt(b.free, 0);
      await pool.query('UPDATE pharmacy_inventory SET cost=$1, price=COALESCE($2, price), free_sample_qty=$3 WHERE id=$4 AND company_id=$5', [cost, price, free, id, req.company.id]);
    }
  } catch (e) { console.error('[accounting costs save]', e.message); }
  res.redirect('/accounting/costs?saved=1');
});
// Apply markup to a row: price = round(cost × (1 + markup%)).
router.post('/costs/:id/markup', async (req, res) => {
  const id = toInt(req.params.id, null);
  const pct = Number(req.settings.markup_percent) || 0;
  const factor = 1 + pct / 100;
  try {
    if (req.company.page_type === 'shop') {
      await pool.query('UPDATE products SET price = ROUND(COALESCE(cost_price,0)*$1, 2) WHERE id=$2 AND company_id=$3 AND COALESCE(cost_price,0) > 0', [factor, id, req.company.id]);
    } else if (req.company.page_type === 'orders') {
      await pool.query('UPDATE food_items SET price = ROUND(COALESCE(cost_price,0)*$1, 2) WHERE id=$2 AND outlet_id IN (SELECT id FROM food_outlets WHERE company_id=$3) AND COALESCE(cost_price,0) > 0', [factor, id, req.company.id]);
    } else if (req.company.page_type === 'pharmacy') {
      await pool.query('UPDATE pharmacy_inventory SET price = ROUND(COALESCE(cost,0)*$1, 2) WHERE id=$2 AND company_id=$3 AND COALESCE(cost,0) > 0', [factor, id, req.company.id]);
    }
  } catch (e) { console.error('[accounting markup]', e.message); }
  res.redirect('/accounting/costs?saved=1');
});

/* ─── Payment settings (per merchant) ──────────────────── */
router.get('/payments', async (req, res) => {
  const p = (await pool.query('SELECT * FROM payment_settings WHERE company_id=$1', [req.company.id])).rows[0]
    || { company_id: req.company.id, cod_enabled: true, gateway: 'none' };
  res.render('accounting/payments', { company: req.company, pay: p, session: req.session, saved: req.query.saved === '1' });
});
router.post('/payments', async (req, res) => {
  const b = req.body || {};
  const gateway = ['none', 'paymob', 'fawry', 'stripe', 'paypal'].includes(b.gateway) ? b.gateway : 'none';
  try {
    await pool.query(
      `INSERT INTO payment_settings (company_id, cod_enabled, cod_terms, custom_methods, instapay_handle, wallet_number, payoneer_email, bank_details, gateway, gateway_public_key, gateway_secret, gateway_integration_id, gateway_iframe_id, gateway_exclusive, instructions, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
       ON CONFLICT (company_id) DO UPDATE SET
         cod_enabled=EXCLUDED.cod_enabled, cod_terms=EXCLUDED.cod_terms, custom_methods=EXCLUDED.custom_methods,
         instapay_handle=EXCLUDED.instapay_handle, wallet_number=EXCLUDED.wallet_number,
         payoneer_email=EXCLUDED.payoneer_email, bank_details=EXCLUDED.bank_details, gateway=EXCLUDED.gateway,
         gateway_public_key=EXCLUDED.gateway_public_key, gateway_secret=EXCLUDED.gateway_secret,
         gateway_integration_id=EXCLUDED.gateway_integration_id, gateway_iframe_id=EXCLUDED.gateway_iframe_id,
         gateway_exclusive=EXCLUDED.gateway_exclusive, instructions=EXCLUDED.instructions, updated_at=now()`,
      [req.company.id, b.cod_enabled === '1', (b.cod_terms || '').trim() || null, (b.custom_methods || '').trim() || null,
       (b.instapay_handle || '').trim() || null, (b.wallet_number || '').trim() || null,
       (b.payoneer_email || '').trim() || null, (b.bank_details || '').trim() || null, gateway,
       (b.gateway_public_key || '').trim() || null, (b.gateway_secret || '').trim() || null,
       (b.gateway_integration_id || '').trim() || null, (b.gateway_iframe_id || '').trim() || null,
       b.gateway_exclusive === '1', (b.instructions || '').trim() || null]
    );
  } catch (e) { console.error('[accounting payments]', e.message); }
  res.redirect('/accounting/payments?saved=1');
});

/* ─── Bulk import / update via spreadsheet (CSV, opens in Excel) ── */
router.get('/import', (req, res) => {
  const cols = sheet.columnsFor(req.company.page_type);
  res.render('accounting/import', {
    company: req.company, session: req.session, cols, result: null,
    supported: !!cols,
  });
});

// Download an Excel template in the admin's current language.
router.get('/import/template.xlsx', (req, res) => {
  const lang = res.locals.lang === 'en' ? 'en' : 'ar';
  const buf = sheet.buildTemplateXlsx(req.company.page_type, lang);
  if (!buf) return res.redirect('/accounting/import');
  const fname = 'oscardevs-' + req.company.page_type + '-template.xlsx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
  res.send(buf);
});

router.post('/import', withSheet, async (req, res) => {
  const cols = sheet.columnsFor(req.company.page_type);
  let result = null;
  try {
    if (!req.file || !req.file.buffer) {
      result = { error: true };
    } else {
      const rows = sheet.parseSheet(req.company.page_type, req.file.buffer);
      result = await sheet.applyRows(pool, req.company, rows);
      result.total = rows.length;
    }
  } catch (e) { console.error('[accounting import]', e.message); result = { error: true }; }
  res.render('accounting/import', {
    company: req.company, session: req.session, cols, result, supported: !!cols,
  });
});

module.exports = router;
