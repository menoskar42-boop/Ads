// Backup (phase 8): every row this showroom owns, in one .xlsx workbook.
//
// This is an EXPORT, not a restore. Reading rows back into a live multi-tenant
// database means re-pointing every foreign key and deciding what to do about
// ids that already exist — done wrong it corrupts the very data it was meant
// to protect, and done half-way it is worse than not offering it. So: a
// complete, readable copy the owner keeps, and restoring is a deliberate
// operation with a person in the loop. The page says so rather than implying
// a one-click round trip that does not exist.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const XL = require('../lib/xlsx_write');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Sheet name → table. Every table carries company_id, which is also what makes
// this safe: one tenant can only ever export its own rows.
const TABLES = [
  ['settings', 'furniture_settings'],
  ['flags', 'furniture_flags'],
  ['suppliers', 'furniture_suppliers'],
  ['customers', 'furniture_customers'],
  ['workers', 'furniture_workers'],
  ['materials', 'furniture_materials'],
  ['products', 'furniture_products'],
  ['components', 'furniture_product_components'],
  ['purchase_orders', 'furniture_purchase_orders'],
  ['purchase_items', 'furniture_purchase_order_items'],
  ['supplier_payments', 'furniture_supplier_payments'],
  ['stock_moves', 'furniture_stock_movements'],
  ['sales', 'furniture_sales'],
  ['sale_items', 'furniture_sale_items'],
  ['customer_payments', 'furniture_customer_payments'],
  ['returns', 'furniture_returns'],
  ['return_items', 'furniture_return_items'],
  ['deliveries', 'furniture_deliveries'],
  ['warranties', 'furniture_warranties'],
  ['attendance', 'furniture_attendance'],
  ['adjustments', 'furniture_payroll_adjustments'],
  ['payroll', 'furniture_payroll_runs'],
  ['canteen', 'furniture_canteen_purchases'],
  ['expenses', 'furniture_expenses'],
  ['activity', 'furniture_activity_log'],
];

/** Values Excel can hold. Dates go out as ISO text so they survive a reopen in
 *  any locale — a date that reads 03/08 in one country and 08/03 in another is
 *  not a backup of anything. */
function cell(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'object') return JSON.stringify(v);
  // Numeric columns come back from pg as strings; keep them summable.
  const s = String(v);
  return /^-?\d+(\.\d+)?$/.test(s) && s.length < 15 ? Number(s) : s;
}

router.get('/', (req, res) => {
  res.render('furniture_admin/backup', {
    company: req.company, tab: 'backup', tables: TABLES.map((x) => x[0]),
  });
});

router.get('/download', async (req, res) => {
  const cid = req.company.id;
  try {
    const sheets = [];
    for (const [name, table] of TABLES) {
      let rows = [];
      try {
        rows = (await pool.query(`SELECT * FROM ${table} WHERE company_id=$1 ORDER BY 1`, [cid])).rows;
      } catch (e) {
        // A table this deployment has not created yet must not sink the whole
        // backup — the other twenty-four sheets are still worth having.
        console.error('[furniture backup]', table, e.message);
        sheets.push({ name, rows: [['error', e.message]] });
        continue;
      }
      if (!rows.length) { sheets.push({ name, rows: [['—']] }); continue; }
      const cols = Object.keys(rows[0]);
      sheets.push({ name, rows: [cols, ...rows.map((r) => cols.map((c) => cell(r[c])))] });
    }
    const buf = XL.workbook(sheets, { rtl: res.locals.lang !== 'en' });
    const name = `${req.company.slug || 'furniture'}-backup.xlsx`;
    res.setHeader('Content-Type', XL.MIME);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Content-Disposition',
      `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    req.flog('backup.download', 'settings', null, String(sheets.length));
    res.end(buf);
  } catch (e) {
    console.error('[furniture backup]', e.message);
    res.redirect('/furniture/backup');
  }
});

module.exports = router;
module.exports.TABLES = TABLES;
