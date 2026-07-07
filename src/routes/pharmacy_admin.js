// Pharmacy owner admin area (mounted at /pharmacy).
// Reuses the existing company session (req.session.companyId). Every route
// requires a logged-in company whose page_type is 'pharmacy'.
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const requireLogin = require('../middleware/auth');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Gate: logged-in + pharmacy tenant. Loads req.company and guarantees a
// settings row exists so the settings form always has a record to update.
async function requirePharmacy(req, res, next) {
  if (!req.session || !req.session.companyId) return res.redirect('/company/login');
  try {
    const r = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    if (!r.rows.length || r.rows[0].page_type !== 'pharmacy') {
      return res.status(404).render('404', { subdomain: null });
    }
    req.company = r.rows[0];
    await pool.query(
      'INSERT INTO pharmacy_settings (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING',
      [req.company.id]
    );
    next();
  } catch (e) {
    console.error('requirePharmacy error:', e.message);
    res.status(500).send('Error.');
  }
}

router.use(requireLogin, requirePharmacy);

function toNum(v, def) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
}
function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

/* ─── Dashboard ─────────────────────────────────────────── */
router.get('/', async (req, res) => {
  const cid = req.company.id;
  try {
    const stats = (await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE (qty - reserved_qty) <= 0)::int AS out_stock,
              COUNT(*) FILTER (WHERE (qty - reserved_qty) > 0 AND qty <= min_qty)::int AS low_stock
       FROM pharmacy_inventory WHERE company_id = $1`, [cid]
    )).rows[0];
    const today = (await pool.query(
      `SELECT COALESCE(SUM(total_amount),0)::numeric AS sales,
              COALESCE(SUM(profit),0)::numeric AS profit,
              COUNT(*)::int AS n
       FROM pharmacy_sales
       WHERE company_id = $1 AND kind = 'sale' AND created_at::date = now()::date`, [cid]
    )).rows[0];
    const pending = (await pool.query(
      "SELECT COUNT(*)::int AS n FROM pharmacy_orders WHERE company_id = $1 AND status = 'pending'", [cid]
    )).rows[0].n;
    const settings = (await pool.query('SELECT * FROM pharmacy_settings WHERE company_id = $1', [cid])).rows[0] || {};
    res.render('pharmacy_admin/dashboard', {
      company: req.company, stats, today, pendingOrders: pending, settings, session: req.session,
    });
  } catch (e) {
    console.error('pharmacy dashboard error:', e.message);
    res.status(500).send('Error.');
  }
});

/* ─── Inventory ─────────────────────────────────────────── */
router.get('/inventory', async (req, res) => {
  const cid = req.company.id;
  const q = (req.query.q || '').trim();
  try {
    const params = [cid];
    let where = 'pi.company_id = $1';
    if (q) {
      where += ' AND (m.name_ar ILIKE $' + (params.push('%' + q + '%')) +
               ' OR m.name_en ILIKE $' + params.length +
               ' OR pi.barcode = $' + (params.push(q)) + ' OR m.barcode = $' + params.length + ')';
    }
    const items = (await pool.query(
      `SELECT pi.*, m.name_ar, m.name_en, m.form, m.manufacturer,
              GREATEST(pi.qty - pi.reserved_qty, 0) AS available_qty
       FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
       WHERE ${where} ORDER BY m.name_ar`, params
    )).rows;
    // catalog medicines this pharmacy hasn't stocked yet (for the add dropdown)
    const catalog = (await pool.query(
      `SELECT id, name_ar, name_en, default_price FROM medicines
       WHERE is_active = true AND id NOT IN (SELECT medicine_id FROM pharmacy_inventory WHERE company_id = $1)
       ORDER BY name_ar LIMIT 500`, [cid]
    )).rows;
    res.render('pharmacy_admin/inventory', {
      company: req.company, items, catalog, currentSearch: q, session: req.session,
      saved: req.query.saved === '1', error: req.query.error || null,
    });
  } catch (e) {
    console.error('pharmacy inventory error:', e.message);
    res.status(500).send('Error.');
  }
});

// Add stock: either an existing catalog medicine (medicine_id) or a brand-new
// medicine created on the fly (new_name_ar). Upserts the inventory row.
router.post('/inventory/add', async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  try {
    let medicineId = toInt(b.medicine_id, null);
    const newName = (b.new_name_ar || '').trim();
    if (!medicineId && newName) {
      const ins = await pool.query(
        `INSERT INTO medicines (name_ar, name_en, form, manufacturer, barcode, default_price)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [newName, (b.new_name_en || '').trim() || null, (b.new_form || '').trim() || null,
         (b.new_manufacturer || '').trim() || null, (b.barcode || '').trim() || null, toNum(b.price, null)]
      );
      medicineId = ins.rows[0].id;
    }
    if (!medicineId) return res.redirect('/pharmacy/inventory?error=' + encodeURIComponent('اختر دواء أو اكتب اسم جديد'));
    await pool.query(
      `INSERT INTO pharmacy_inventory (company_id, medicine_id, qty, price, cost, min_qty, expiry, barcode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (company_id, medicine_id) DO UPDATE SET
         qty = pharmacy_inventory.qty + EXCLUDED.qty,
         price = COALESCE(EXCLUDED.price, pharmacy_inventory.price),
         cost = COALESCE(EXCLUDED.cost, pharmacy_inventory.cost),
         min_qty = EXCLUDED.min_qty, expiry = COALESCE(EXCLUDED.expiry, pharmacy_inventory.expiry),
         updated_at = now()`,
      [cid, medicineId, toInt(b.qty, 0), toNum(b.price, null), toNum(b.cost, null),
       toInt(b.min_qty, 0), (b.expiry || '').trim() || null, (b.barcode || '').trim() || null]
    );
    res.redirect('/pharmacy/inventory?saved=1');
  } catch (e) {
    console.error('inventory add error:', e.message);
    res.redirect('/pharmacy/inventory?error=' + encodeURIComponent('حصل خطأ، حاول تاني'));
  }
});

router.post('/inventory/:id/update', async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, null);
  const b = req.body || {};
  try {
    await pool.query(
      `UPDATE pharmacy_inventory SET qty=$1, price=$2, cost=$3, min_qty=$4,
         expiry=$5, barcode=$6, updated_at=now()
       WHERE id=$7 AND company_id=$8`,
      [toInt(b.qty, 0), toNum(b.price, null), toNum(b.cost, null), toInt(b.min_qty, 0),
       (b.expiry || '').trim() || null, (b.barcode || '').trim() || null, id, cid]
    );
    res.redirect('/pharmacy/inventory?saved=1');
  } catch (e) {
    console.error('inventory update error:', e.message);
    res.redirect('/pharmacy/inventory?error=' + encodeURIComponent('حصل خطأ'));
  }
});

router.post('/inventory/:id/delete', async (req, res) => {
  try {
    await pool.query('DELETE FROM pharmacy_inventory WHERE id=$1 AND company_id=$2',
      [toInt(req.params.id, null), req.company.id]);
    res.redirect('/pharmacy/inventory?saved=1');
  } catch (e) {
    console.error('inventory delete error:', e.message);
    res.redirect('/pharmacy/inventory?error=1');
  }
});

/* ─── Settings ──────────────────────────────────────────── */
router.get('/settings', async (req, res) => {
  const settings = (await pool.query('SELECT * FROM pharmacy_settings WHERE company_id = $1', [req.company.id])).rows[0] || {};
  res.render('pharmacy_admin/settings', {
    company: req.company, settings, session: req.session,
    saved: req.query.saved === '1',
  });
});

router.post('/settings', async (req, res) => {
  const b = req.body || {};
  try {
    await pool.query(
      `UPDATE pharmacy_settings SET
         online_store_enabled=$1, delivery_enabled=$2, delivery_fee=$3,
         is_night_shift=$4, whatsapp=$5, address=$6, updated_at=now()
       WHERE company_id=$7`,
      [b.online_store_enabled === 'on', b.delivery_enabled === 'on', toNum(b.delivery_fee, 0),
       b.is_night_shift === 'on', (b.whatsapp || '').trim() || null, (b.address || '').trim() || null,
       req.company.id]
    );
    res.redirect('/pharmacy/settings?saved=1');
  } catch (e) {
    console.error('settings update error:', e.message);
    res.redirect('/pharmacy/settings?error=1');
  }
});

module.exports = router;
