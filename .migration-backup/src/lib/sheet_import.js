// Bulk product/price import from an Excel (.xlsx) sheet, per merchant vertical.
// Uses SheetJS to write/read real Excel files (easiest for merchants to fill).
// The admin downloads a template in their own language, edits prices/data, and
// uploads it back. Images are NEVER touched here (added from the website); an
// existing image is preserved and only the row's price/data are updated.
/* ⚠️ استدعاء **اختياري ومتأخّر**، زي `compression` في server.js بالظبط.
 *
 * `xlsx` مش جاي من npm — جاي من رابط tarball على `cdn.sheetjs.com` في
 * package.json. فأي بناء ما يوصلش للـCDN بيطلع من غير الحزمة، والاستدعاء
 * على مستوى الموديول كان بيرمي `Cannot find module 'xlsx'` **وقت الإقلاع**.
 * والنتيجة إن العملية ما بتسمعش أصلاً، ومسبار النشر بيشوف ٥٠٠ على `/`
 * فيرفض الترقية — الموقع كله بيقع عشان ميزة استيراد إكسل.
 *
 * دلوقتي: الميزة دي بس هي اللي بتقف، والموقع بيقوم عادي. */
let XLSX = null;
function xlsx() {
  if (XLSX === null) {
    try { XLSX = require('xlsx'); }
    catch (e) { XLSX = false; console.warn('[sheet_import] xlsx مش متسطّبة — قراءة ملفات الإكسل متوقّفة'); }
  }
  return XLSX || null;
}
const XW = require('./xlsx_write');       // writing: see the note in that file

// Column sets per vertical. `key` is internal; `ar`/`en` are the header labels.
const COLUMNS = {
  shop: [
    { key: 'name', ar: 'الاسم', en: 'name' },
    { key: 'price', ar: 'سعر البيع', en: 'price' },
    { key: 'cost', ar: 'سعر الشراء', en: 'cost' },
    { key: 'stock', ar: 'الكمية', en: 'stock' },
    { key: 'description', ar: 'الوصف/ملاحظات', en: 'description' },
  ],
  pharmacy: [
    { key: 'barcode', ar: 'الباركود', en: 'barcode' },
    { key: 'name', ar: 'اسم الدواء', en: 'name' },
    { key: 'price', ar: 'سعر البيع', en: 'price' },
    { key: 'cost', ar: 'سعر الشراء', en: 'cost' },
    { key: 'qty', ar: 'الكمية', en: 'qty' },
    { key: 'free_samples', ar: 'عينات مجانية', en: 'free_samples' },
    { key: 'description', ar: 'الوصف/ملاحظات', en: 'description' },
  ],
  orders: [
    { key: 'outlet', ar: 'المنفذ', en: 'outlet' },
    { key: 'category', ar: 'التصنيف', en: 'category' },
    { key: 'name_ar', ar: 'الاسم بالعربي', en: 'name_ar' },
    { key: 'name_en', ar: 'الاسم بالإنجليزي', en: 'name_en' },
    { key: 'price', ar: 'سعر البيع', en: 'price' },
    { key: 'cost', ar: 'سعر الشراء', en: 'cost' },
    { key: 'description', ar: 'الوصف/ملاحظات', en: 'description' },
  ],
};

const EXAMPLES = {
  shop: { name: 'منتج تجريبي', price: '100', cost: '70', stock: '10', description: 'وصف قصير' },
  pharmacy: { barcode: '', name: 'باراسيتامول', price: '25', cost: '18', qty: '50', free_samples: '0', description: '' },
  orders: { outlet: 'restaurant', category: 'برجر', name_ar: 'برجر لحم', name_en: 'Beef Burger', price: '75', cost: '45', description: '' },
};

function columnsFor(pageType) { return COLUMNS[pageType] || null; }

// Build a downloadable .xlsx template (header row + one example), headers in
// `lang`. Returns a Buffer.
function buildTemplateXlsx(pageType, lang) {
  const cols = columnsFor(pageType);
  if (!cols) return null;
  const header = cols.map((c) => (lang === 'en' ? c.en : c.ar));
  const ex = EXAMPLES[pageType] || {};
  const example = cols.map((c) => (ex[c.key] != null ? ex[c.key] : ''));
  // Written by src/lib/xlsx_write.js, not SheetJS: the npm `xlsx` package is a
  // stub whose write() returns undefined, so this download produced an empty
  // response for every merchant until it was moved across.
  return XW.workbook(
    [{ name: 'template', rows: [header, example], widths: header.map(() => 22) }],
    { rtl: lang !== 'en' }
  );
}

// Parse an uploaded Excel buffer into row objects keyed by internal column key.
// Accepts headers in EITHER Arabic or English (matched case/space-insensitively).
function parseSheet(pageType, buffer) {
  const cols = columnsFor(pageType);
  if (!cols) return [];
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const headerMap = {};
  cols.forEach((c) => { headerMap[norm(c.ar)] = c.key; headerMap[norm(c.en)] = c.key; });

  let wb;
  const X = xlsx();
  if (!X) return [];
  try { wb = X.read(buffer, { type: 'buffer' }); } catch (e) { return []; }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const grid = X.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  if (!grid.length) return [];
  const headers = grid[0].map((h) => headerMap[norm(h)] || null);
  const out = [];
  for (let r = 1; r < grid.length; r++) {
    const obj = {};
    let any = false;
    grid[r].forEach((val, ci) => {
      const key = headers[ci];
      if (key) { obj[key] = String(val == null ? '' : val).trim(); if (obj[key]) any = true; }
    });
    if (any) out.push(obj);
  }
  return out;
}

function num(v, d) { const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : d; }
function int(v, d) { const n = parseInt(String(v).replace(/[^\d\-]/g, ''), 10); return Number.isFinite(n) ? n : d; }

// Apply parsed rows to the DB. Returns { created, updated, skipped, errors:[] }.
async function applyRows(pool, company, rows) {
  const res = { created: 0, updated: 0, skipped: 0, errors: [] };
  const cid = company.id;
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    try {
      if (company.page_type === 'shop') {
        const name = (row.name || '').trim();
        if (!name) { res.skipped++; continue; }
        const existing = (await pool.query('SELECT id FROM products WHERE company_id=$1 AND lower(name)=lower($2) LIMIT 1', [cid, name])).rows[0];
        if (existing) {
          await pool.query(
            `UPDATE products SET price=COALESCE($1,price), cost_price=COALESCE($2,cost_price),
               stock=COALESCE($3,stock), description=COALESCE($4,description) WHERE id=$5`,
            [num(row.price, null), num(row.cost, null), int(row.stock, null), row.description || null, existing.id]);
          res.updated++;
        } else {
          await pool.query(
            `INSERT INTO products (company_id, name, price, cost_price, stock, description, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,true)`,
            [cid, name, num(row.price, 0), num(row.cost, 0), int(row.stock, 0), row.description || null]);
          res.created++;
        }
      } else if (company.page_type === 'pharmacy') {
        const barcode = (row.barcode || '').trim();
        const name = (row.name || '').trim();
        let inv = null;
        if (barcode) inv = (await pool.query('SELECT id FROM pharmacy_inventory WHERE company_id=$1 AND barcode=$2 LIMIT 1', [cid, barcode])).rows[0];
        if (!inv && name) inv = (await pool.query(
          `SELECT pi.id FROM pharmacy_inventory pi JOIN medicines m ON m.id=pi.medicine_id
           WHERE pi.company_id=$1 AND (lower(m.name_ar)=lower($2) OR lower(m.name_en)=lower($2)) LIMIT 1`, [cid, name])).rows[0];
        if (inv) {
          await pool.query(
            `UPDATE pharmacy_inventory SET price=COALESCE($1,price), cost=COALESCE($2,cost),
               qty=COALESCE($3,qty), free_sample_qty=COALESCE($4,free_sample_qty), description=COALESCE($5,description) WHERE id=$6`,
            [num(row.price, null), num(row.cost, null), int(row.qty, null), int(row.free_samples, null), row.description || null, inv.id]);
          res.updated++;
        } else if (name) {
          // Match a medicine in the catalog to create an inventory row.
          const med = (await pool.query('SELECT id FROM medicines WHERE lower(name_ar)=lower($1) OR lower(name_en)=lower($1) LIMIT 1', [name])).rows[0];
          if (!med) { res.skipped++; res.errors.push({ row: idx + 2, msg: 'دواء غير موجود في الكتالوج: ' + name }); continue; }
          await pool.query(
            `INSERT INTO pharmacy_inventory (company_id, medicine_id, qty, price, cost, free_sample_qty, description, barcode)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (company_id, medicine_id) DO UPDATE SET price=EXCLUDED.price, cost=EXCLUDED.cost, qty=EXCLUDED.qty,
               free_sample_qty=EXCLUDED.free_sample_qty, description=EXCLUDED.description`,
            [cid, med.id, int(row.qty, 0), num(row.price, 0), num(row.cost, 0), int(row.free_samples, 0), row.description || null, barcode || null]);
          res.created++;
        } else { res.skipped++; }
      } else if (company.page_type === 'orders') {
        const nameAr = (row.name_ar || '').trim();
        const nameEn = (row.name_en || '').trim();
        const display = nameAr || nameEn;
        if (!display) { res.skipped++; continue; }
        const existing = (await pool.query(
          `SELECT fi.id FROM food_items fi JOIN food_outlets fo ON fo.id=fi.outlet_id
           WHERE fo.company_id=$1 AND (lower(fi.name_ar)=lower($2) OR lower(fi.name)=lower($3)) LIMIT 1`,
          [cid, nameAr || display, nameEn || display])).rows[0];
        if (existing) {
          await pool.query(
            `UPDATE food_items SET price=COALESCE($1,price), cost_price=COALESCE($2,cost_price),
               description=COALESCE($3,description), name=COALESCE(NULLIF($4,''),name), name_ar=COALESCE(NULLIF($5,''),name_ar) WHERE id=$6`,
            [num(row.price, null), num(row.cost, null), row.description || null, nameEn, nameAr, existing.id]);
          res.updated++;
        } else {
          // Create requires an outlet + category.
          const vraw = (row.outlet || '').trim().toLowerCase();
          const vertical = /market|سوبر|ماركت|بقال/.test(vraw) ? 'supermarket' : 'restaurant';
          const outlet = (await pool.query('SELECT id FROM food_outlets WHERE company_id=$1 AND vertical=$2 LIMIT 1', [cid, vertical])).rows[0];
          if (!outlet) { res.skipped++; res.errors.push({ row: idx + 2, msg: 'المنفذ غير مفعّل: ' + vertical }); continue; }
          const catName = (row.category || '').trim() || 'أخرى';
          let cat = (await pool.query('SELECT id FROM food_categories WHERE outlet_id=$1 AND (lower(name)=lower($2) OR lower(name_ar)=lower($2)) LIMIT 1', [outlet.id, catName])).rows[0];
          if (!cat) cat = (await pool.query(
            `INSERT INTO food_categories (outlet_id, name, name_ar, sort_order)
             VALUES ($1,$2,$3, COALESCE((SELECT MAX(sort_order)+1 FROM food_categories WHERE outlet_id=$1),0)) RETURNING id`,
            [outlet.id, catName, catName])).rows[0];
          await pool.query(
            `INSERT INTO food_items (outlet_id, category_id, name, name_ar, description, price, cost_price)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [outlet.id, cat.id, nameEn || display, nameAr || display, row.description || null, num(row.price, 0), num(row.cost, 0)]);
          res.created++;
        }
      } else { res.skipped++; }
    } catch (e) { res.errors.push({ row: idx + 2, msg: e.message }); }
  }
  return res;
}

module.exports = { columnsFor, buildTemplateXlsx, parseSheet, applyRows };
