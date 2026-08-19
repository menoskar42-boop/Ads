// Pharmacy owner admin area (mounted at /pharmacy).
// Reuses the existing company session (req.session.companyId). Every route
// requires a logged-in company whose page_type is 'pharmacy'.
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const requireLogin = require('../middleware/auth');
const staffScope = require('../lib/staff_scope');
const stock = require('../pharmacy/stock');
const batches = require('../pharmacy/batches');
const returns = require('../pharmacy/returns');
const discount = require('../pharmacy/discount');
const gs1 = require('../pharmacy/gs1');
const purchase = require('../pharmacy/purchase');
const reports = require('../pharmacy/reports');
const push = require('../lib/push');
const { syncMedicinesSafe } = require('../pharmacy/medicine_sync');
const multer = require('multer');
const uploads = require('../lib/uploads');
const path = require('path');
const fs = require('fs');
const { compressImage } = require('../lib/media');

// Image uploads (medicine photos + banner slides) — same disk-storage pattern
// as the company area, into public/uploads. Fail-open: a bad upload never
// breaks the form, the image is just skipped.
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
// SVG excluded on purpose (active content). Only passive raster formats.
const imageMimeRegex = /^image\/(png|jpeg|jpg|gif|webp)$/;
function pharmUploader(prefix) {
  return uploads.guard(multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const ext = uploads.extname(file, '.bin');
        cb(null, `${prefix}-${req.session.companyId}-${Date.now()}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => imageMimeRegex.test(file.mimetype) ? cb(null, true) : cb(new Error('image only')),
  }).single('image_file'), 'image');
}
const uploadMedImage = pharmUploader('phmed');
const uploadBanner = pharmUploader('phbanner');
// Run an uploader but swallow its error so the request still completes.
function withImage(upload) {
  return (req, res, next) => upload(req, res, () => next());
}

// Customer-facing status notifications (Talabat-style).
const STATUS_NOTIF = {
  accepted:  { t: '✅ تم تأكيد طلبك', b: 'أكّدت الصيدلية طلبك وجاري تجهيزه.' },
  preparing: { t: '⏳ طلبك قيد التحضير', b: 'الصيدلية بتجهّز طلبك دلوقتي.' },
  ready:     { t: '📦 طلبك جاهز', b: 'طلبك جاهز للاستلام أو التوصيل.' },
  out_for_delivery: { t: '🚗 طلبك في الطريق', b: 'مندوب التوصيل في الطريق إليك.' },
  delivered: { t: '🎉 تم تسليم طلبك', b: 'شكراً لطلبك من الصيدلية.' },
  rejected:  { t: '❌ تعذّر تنفيذ طلبك', b: 'نأسف، الصيدلية اعتذرت عن الطلب.' },
  cancelled: { t: 'تم إلغاء طلبك', b: 'تم إلغاء الطلب.' },
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Gate: logged-in + pharmacy tenant. Loads req.company and guarantees a
// settings row exists so the settings form always has a record to update.
async function requirePharmacy(req, res, next) {
  if (!req.session || !req.session.companyId) return res.redirect('/company/login');
  try {
    const r = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    // Suspended (is_active = false) pharmacies lose dashboard access immediately.
    if (!r.rows.length || r.rows[0].page_type !== 'pharmacy' || r.rows[0].is_active === false) {
      return res.status(404).render('404', { subdomain: null });
    }
    req.company = r.rows[0];
    await pool.query(
      'INSERT INTO pharmacy_settings (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING',
      [req.company.id]
    );
    // Effective role + permissions. The company owner (company_users login) has
    // everything; staff (pharmacy_staff login) are scoped by role.
    const role = req.session.staffId ? (req.session.staffRole || 'cashier') : 'owner';
    const canFinance = role === 'owner' ? true : (req.session.canSeeFinance === true);
    const perms = {
      role,
      canFinance,
      inventory: role === 'owner' || role === 'pharmacist',
      pos:       role === 'owner' || role === 'pharmacist' || role === 'cashier',
      orders:    role === 'owner' || role === 'pharmacist' || role === 'cashier' || role === 'delivery',
      settings:  role === 'owner',
      staff:     role === 'owner',
      deliveryOnly: role === 'delivery',
    };
    req.perms = perms;
    res.locals.perms = perms;
    res.locals.staffName = req.session.staffName || null;
    next();
  } catch (e) {
    console.error('requirePharmacy error:', e.message);
    res.status(500).send('Error.');
  }
}

// Route-level permission gate.
function gate(key) {
  return function (req, res, next) {
    if (req.perms && req.perms[key]) return next();
    return res.status(403).render('404', { subdomain: null });
  };
}

// The pharmacy's own staff pass; another system's staff go back to theirs.
router.use(requireLogin, staffScope.only('/pharmacy'), requirePharmacy);

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
              COUNT(*) FILTER (WHERE GREATEST(qty - reserved_qty, 0) <= 0)::int AS out_stock,
              -- Available, not gross qty: ten boxes with nine reserved is one
              -- box, and the dashboard used to call that "in stock".
              COUNT(*) FILTER (WHERE GREATEST(qty - reserved_qty, 0) > 0
                AND GREATEST(qty - reserved_qty, 0) <= min_qty)::int AS low_stock
       FROM pharmacy_inventory WHERE company_id = $1`, [cid]
    )).rows[0];
    // Returns included, and that is the point of them being rows here: a return
    // carries a NEGATIVE total, so the takings net themselves. Filtering to
    // kind='sale' would show the pharmacist money that already went back over
    // the counter. `n` still counts sales only — a refund is not a sale.
    const today = (await pool.query(
      `SELECT COALESCE(SUM(total_amount),0)::numeric AS sales,
              COALESCE(SUM(profit),0)::numeric AS profit,
              COUNT(*) FILTER (WHERE kind = 'sale')::int AS n,
              COUNT(*) FILTER (WHERE kind = 'return')::int AS returns
       FROM pharmacy_sales
       WHERE company_id = $1 AND kind IN ('sale','return') AND created_at::date = now()::date`, [cid]
    )).rows[0];
    const pending = (await pool.query(
      "SELECT COUNT(*)::int AS n FROM pharmacy_orders WHERE company_id = $1 AND status = 'pending'", [cid]
    )).rows[0].n;
    // Offline sales that took more off the shelf than the system had.
    const review = (await pool.query(
      'SELECT COUNT(*)::int AS n FROM pharmacy_sales WHERE company_id = $1 AND needs_review = true AND reviewed_at IS NULL',
      [cid]
    )).rows[0].n;
    const settings = (await pool.query('SELECT * FROM pharmacy_settings WHERE company_id = $1', [cid])).rows[0] || {};
    res.render('pharmacy_admin/dashboard', {
      company: req.company, stats, today, pendingOrders: pending, reviewCount: review, settings, session: req.session,
    });
  } catch (e) {
    console.error('pharmacy dashboard error:', e.message);
    res.status(500).send('Error.');
  }
});

/* ─── Inventory ─────────────────────────────────────────── */
// How long before an expiry date counts as "coming up". 60 days is the window a
// pharmacy can still act in: most suppliers accept returns while there are two
// months left, and after that the stock is simply money on a shelf.
const EXPIRY_SOON_DAYS = 60;

router.get('/inventory', gate('inventory'), async (req, res) => {
  const cid = req.company.id;
  const q = (req.query.q || '').trim();
  // 'expired' | 'soon' | 'low' | 'out' — anything else shows everything.
  const filter = ['expired', 'soon', 'low', 'out'].includes(String(req.query.filter)) ? req.query.filter : '';
  try {
    const params = [cid];
    let where = 'pi.company_id = $1';
    if (q) {
      where += ' AND (m.name_ar ILIKE $' + (params.push('%' + q + '%')) +
               ' OR m.name_en ILIKE $' + params.length +
               ' OR pi.barcode = $' + (params.push(q)) + ' OR m.barcode = $' + params.length + ')';
    }
    // The expiry date was stored and edited but never looked at: nothing sorted
    // or warned on it, so a pharmacist could only find near-expiry stock by
    // reading every row. Classified in SQL so the filter and the ordering are
    // the database's job, and a pharmacy with thousands of lines still works.
    //
    // Ordering puts anything expiring first, soonest at the top — the only
    // order that matters when this list is what you act on.
    const dayIdx = params.push(EXPIRY_SOON_DAYS);
    const expiryCase = `CASE
        WHEN pi.expiry IS NULL THEN NULL
        WHEN pi.expiry < CURRENT_DATE THEN 'expired'
        WHEN pi.expiry <= CURRENT_DATE + ($${dayIdx} || ' days')::interval THEN 'soon'
        ELSE 'ok' END`;
    // Stock level, on the SAME footing as expiry. The dashboard has counted
    // "نواقص" for a long time and the row has always carried an amber badge —
    // but there was no way to ASK for the list. A count you cannot open is a
    // number, not a screen: with a few hundred lines the pharmacist had to scan
    // the whole table to find the twelve the dashboard was talking about.
    //
    // Availability is qty MINUS what is reserved for online orders, everywhere.
    // The badge used bare qty, so ten boxes with nine reserved showed green
    // "متوفر" while one was actually sellable.
    const stockCase = `CASE
        WHEN GREATEST(pi.qty - pi.reserved_qty, 0) <= 0 THEN 'out'
        WHEN GREATEST(pi.qty - pi.reserved_qty, 0) <= pi.min_qty THEN 'low'
        ELSE 'ok' END`;
    if (filter === 'low' || filter === 'out') where += ` AND (${stockCase}) = '${filter}'`;
    else if (filter) where += ` AND (${expiryCase}) = '${filter}'`;
    const items = (await pool.query(
      `SELECT pi.*, m.name_ar, m.name_en, m.form, m.manufacturer,
              GREATEST(pi.qty - pi.reserved_qty, 0) AS available_qty,
              ${expiryCase} AS expiry_status,
              ${stockCase} AS stock_status,
              (pi.expiry - CURRENT_DATE) AS days_to_expiry
       FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
       WHERE ${where}
       ORDER BY CASE ${stockCase} WHEN 'out' THEN 0 WHEN 'low' THEN 1 ELSE 2 END,
                CASE ${expiryCase} WHEN 'expired' THEN 0 WHEN 'soon' THEN 1 ELSE 2 END,
                pi.expiry NULLS LAST, m.name_ar`, params
    )).rows;

    // Counted over the whole pharmacy, never over the current search — the
    // header has to say "you have 4 expired items" even while you are looking
    // at one you searched for.
    const counts = (await pool.query(
      `SELECT COUNT(*) FILTER (WHERE pi.expiry < CURRENT_DATE)::int AS expired,
              COUNT(*) FILTER (WHERE pi.expiry >= CURRENT_DATE
                AND pi.expiry <= CURRENT_DATE + ($2 || ' days')::interval)::int AS soon,
              COUNT(*) FILTER (WHERE GREATEST(pi.qty - pi.reserved_qty, 0) <= 0)::int AS out,
              COUNT(*) FILTER (WHERE GREATEST(pi.qty - pi.reserved_qty, 0) > 0
                AND GREATEST(pi.qty - pi.reserved_qty, 0) <= pi.min_qty)::int AS low
         FROM pharmacy_inventory pi WHERE pi.company_id = $1`,
      [cid, EXPIRY_SOON_DAYS]
    )).rows[0];
    // The catalog can be ~25k rows, so we don't ship it all to the page; the
    // add form uses a type-ahead (/pharmacy/api/catalog-search) instead. Here
    // we just show how big the catalog is and when it last refreshed.
    const catalogCount = (await pool.query(
      'SELECT COUNT(*)::int AS n FROM medicines WHERE is_active = true'
    )).rows[0].n;
    const lastSyncRow = (await pool.query(
      "SELECT value FROM app_meta WHERE key = 'medicines_synced_at'"
    )).rows[0];
    res.render('pharmacy_admin/inventory', {
      company: req.company, items, catalogCount,
      lastSync: lastSyncRow ? lastSyncRow.value : null,
      expiryCounts: counts, expiryFilter: filter, expirySoonDays: EXPIRY_SOON_DAYS,
      currentSearch: q, session: req.session,
      saved: req.query.saved === '1', error: req.query.error || null,
      synced: req.query.synced === '1',
    });
  } catch (e) {
    console.error('pharmacy inventory error:', e.message);
    res.status(500).send('Error.');
  }
});

// Add stock: either an existing catalog medicine (medicine_id) or a brand-new
// medicine created on the fly (new_name_ar). Upserts the inventory row.
router.post('/inventory/add', gate('inventory'), withImage(uploadMedImage), async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  try {
    let imageUrl = null;
    if (req.file) { await compressImage(req.file.path); imageUrl = '/uploads/' + req.file.filename; }
    let medicineId = toInt(b.medicine_id, null);
    const newName = (b.new_name_ar || '').trim();
    if (!medicineId && newName) {
      const ins = await pool.query(
        // edited_at marks this as a human's row, so the nightly importer will
        // not rewrite the name or the price underneath the pharmacy.
        `INSERT INTO medicines (name_ar, name_en, form, manufacturer, barcode, default_price, edited_at)
         VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING id`,
        [newName, (b.new_name_en || '').trim() || null, (b.new_form || '').trim() || null,
         (b.new_manufacturer || '').trim() || null, (b.barcode || '').trim() || null, toNum(b.price, null)]
      );
      medicineId = ins.rows[0].id;
    }
    if (!medicineId) return res.redirect('/pharmacy/inventory?error=' + encodeURIComponent('اختر دواء أو اكتب اسم جديد'));
    // A lot number or an expiry date turns this from "add 20 boxes" into "20
    // boxes of lot X that expire in March". Leave both blank and nothing about
    // this pharmacy changes — batches are opt-in, per delivery.
    const wantsBatch = !!((b.batch_no || '').trim() || (b.expiry || '').trim()) && toInt(b.qty, 0) > 0;
    await pool.query(
      `INSERT INTO pharmacy_inventory (company_id, medicine_id, qty, price, cost, min_qty, expiry, barcode, image_url, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (company_id, medicine_id) DO UPDATE SET
         qty = pharmacy_inventory.qty + EXCLUDED.qty,
         price = COALESCE(EXCLUDED.price, pharmacy_inventory.price),
         cost = COALESCE(EXCLUDED.cost, pharmacy_inventory.cost),
         min_qty = EXCLUDED.min_qty, expiry = COALESCE(EXCLUDED.expiry, pharmacy_inventory.expiry),
         image_url = COALESCE(EXCLUDED.image_url, pharmacy_inventory.image_url),
         description = COALESCE(EXCLUDED.description, pharmacy_inventory.description),
         updated_at = now()`,
      [cid, medicineId, toInt(b.qty, 0), toNum(b.price, null), toNum(b.cost, null),
       toInt(b.min_qty, 0), (b.expiry || '').trim() || null, (b.barcode || '').trim() || null, imageUrl,
       (b.description || '').trim() || null]
    );
    // Recorded beside the upsert above, which already moved the aggregate —
    // hence `record` and not `receive`, or the boxes would be counted twice.
    if (wantsBatch) {
      await batches.record(pool, cid, medicineId, {
        qty: toInt(b.qty, 0), batch_no: b.batch_no, expiry: (b.expiry || '').trim() || null,
        cost: toNum(b.cost, null), supplier: b.supplier,
      });
    }
    res.redirect('/pharmacy/inventory?saved=1');
  } catch (e) {
    console.error('inventory add error:', e.message);
    res.redirect('/pharmacy/inventory?error=' + encodeURIComponent('حصل خطأ، حاول تاني'));
  }
});

router.post('/inventory/:id/update', gate('inventory'), withImage(uploadMedImage), async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, null);
  const b = req.body || {};
  try {
    let imageUrl = null;
    if (req.file) { await compressImage(req.file.path); imageUrl = '/uploads/' + req.file.filename; }
    // QA: a pharmacist could type a quantity BELOW what is already reserved for
    // open orders, which makes available_qty (qty − reserved_qty) negative — the
    // shelf owes stock it does not have, and the orders holding it silently
    // become unfulfillable. Refuse, and say what the floor is; correcting the
    // count is right, promising stock that is already spoken for is not.
    const wanted = toInt(b.qty, 0);
    const cur = (await pool.query(
      'SELECT reserved_qty FROM pharmacy_inventory WHERE id=$1 AND company_id=$2', [id, cid]
    )).rows[0];
    const reserved = cur ? Number(cur.reserved_qty) || 0 : 0;
    if (wanted < reserved) {
      return res.redirect('/pharmacy/inventory?error=' + encodeURIComponent(
        `فيه ${reserved} محجوزين لطلبات مفتوحة — الكمية ماينفعش تقل عن كده. الغِ الطلبات الأول لو عايز تنزّلها.`));
    }
    await pool.query(
      `UPDATE pharmacy_inventory SET qty=$1, price=$2, cost=$3, min_qty=$4,
         expiry=$5, barcode=$6, image_url=COALESCE($9, image_url), description=$10, updated_at=now()
       WHERE id=$7 AND company_id=$8`,
      [wanted, toNum(b.price, null), toNum(b.cost, null), toInt(b.min_qty, 0),
       (b.expiry || '').trim() || null, (b.barcode || '').trim() || null, id, cid, imageUrl,
       (b.description || '').trim() || null]
    );
    res.redirect('/pharmacy/inventory?saved=1');
  } catch (e) {
    console.error('inventory update error:', e.message);
    res.redirect('/pharmacy/inventory?error=' + encodeURIComponent('حصل خطأ'));
  }
});

router.post('/inventory/:id/delete', gate('inventory'), async (req, res) => {
  try {
    await pool.query('DELETE FROM pharmacy_inventory WHERE id=$1 AND company_id=$2',
      [toInt(req.params.id, null), req.company.id]);
    res.redirect('/pharmacy/inventory?saved=1');
  } catch (e) {
    console.error('inventory delete error:', e.message);
    res.redirect('/pharmacy/inventory?error=1');
  }
});

/* ─── Sales & returns (المبيعات والمرتجعات) ─────────────────────────────── */
/* There was no list of sales at all, which is why there were no returns: you
 * cannot hand money back against a receipt you cannot find.
 */
router.get('/sales', gate('pos'), async (req, res) => {
  const cid = req.company.id;
  try {
    const rows = (await pool.query(
      `SELECT s.id, s.kind, s.total_amount, s.profit, s.created_at, s.ref_sale_id,
              s.restock, s.reason, s.needs_review, st.name AS staff_name,
              COALESCE(json_agg(json_build_object('name', si.name, 'qty', si.qty, 'price', si.price)
                       ORDER BY si.id) FILTER (WHERE si.id IS NOT NULL), '[]') AS items,
              (SELECT COUNT(*)::int FROM pharmacy_sales r
                WHERE r.company_id = s.company_id AND r.ref_sale_id = s.id AND r.kind = 'return') AS return_count
         FROM pharmacy_sales s
         LEFT JOIN pharmacy_sale_items si ON si.sale_id = s.id
         LEFT JOIN pharmacy_staff st ON st.id = s.staff_id AND st.company_id = s.company_id
        WHERE s.company_id = $1 AND s.kind IN ('sale','return')
        GROUP BY s.id, st.name
        ORDER BY s.created_at DESC, s.id DESC LIMIT 200`, [cid]
    )).rows;
    // Net of returns, over the same window the list shows — the header must not
    // disagree with the rows under it.
    const totals = (await pool.query(
      `SELECT COALESCE(SUM(total_amount),0)::numeric AS net,
              COALESCE(SUM(total_amount) FILTER (WHERE kind='return'),0)::numeric AS refunded
         FROM pharmacy_sales
        WHERE company_id = $1 AND kind IN ('sale','return') AND created_at::date = now()::date`, [cid]
    )).rows[0];
    res.render('pharmacy_admin/sales', {
      company: req.company, session: req.session, rows, totals,
      saved: req.query.saved === '1',
      errorCode: String(req.query.error || '') || null,
      errorName: String(req.query.name || '').slice(0, 80) || null,
      errorLeft: toInt(req.query.left, null),
    });
  } catch (e) {
    console.error('[sales]', e.message);
    res.status(500).send('Error.');
  }
});

// The return form for one receipt: what is still returnable, line by line.
router.get('/sales/:id/return', gate('pos'), async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, null);
  try {
    const state = await returns.returnable(pool, cid, id);
    if (!state) return res.redirect('/pharmacy/sales');
    res.render('pharmacy_admin/return', {
      company: req.company, session: req.session,
      sale: state.sale, lines: state.lines,
      errorCode: String(req.query.error || '') || null,
    });
  } catch (e) {
    console.error('[return form]', e.message);
    res.redirect('/pharmacy/sales?error=save');
  }
});

router.post('/sales/:id/return', gate('pos'), async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, null);
  const b = req.body || {};
  // qty[<medicine_id>] — only the lines with a quantity typed into them.
  const lines = Object.keys(b.qty || {}).map((k) => ({
    medicine_id: toInt(k, null), qty: toInt((b.qty || {})[k], 0),
  })).filter((l) => l.medicine_id && l.qty > 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await returns.record(client, cid, id, {
      lines,
      // Never a convenient default: putting an opened box back on the shelf is
      // the mistake that costs a patient, not the pharmacy.
      restock: b.restock === '1',
      reason: b.reason,
      staffId: req.session.staffId || null,
    });
    if (out.error) {
      await client.query('ROLLBACK');
      const q = new URLSearchParams({ error: out.error });
      if (out.name) q.set('name', out.name);
      if (out.left != null) q.set('left', String(out.left));
      return res.redirect('/pharmacy/sales/' + id + '/return?' + q.toString());
    }
    await client.query('COMMIT');
    res.redirect('/pharmacy/sales?saved=1');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[return]', e.message);
    res.redirect('/pharmacy/sales/' + id + '/return?error=save');
  } finally { client.release(); }
});

/* ─── Batches (تشغيلات) ─────────────────────────────────────────────────── */
/* One medicine's lots: what is on the shelf, from which delivery, expiring when.
 *
 * The screen shows the untracked remainder too. A pharmacy that starts tracking
 * lots today has shelves full of stock that predates the records, and a page
 * showing only the tracked total would read as though the rest had vanished.
 */
router.get('/inventory/:id/batches', gate('inventory'), async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, null);
  try {
    const inv = (await pool.query(
      `SELECT pi.id, pi.medicine_id, pi.qty, pi.reserved_qty, pi.expiry, m.name_ar, m.name_en, m.form
         FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
        WHERE pi.id = $1 AND pi.company_id = $2`, [id, cid])).rows[0];
    if (!inv) return res.redirect('/pharmacy/inventory');
    const data = await batches.forMedicine(pool, cid, inv.medicine_id);
    // Only asked for when a lot is being looked at — the recall list is the
    // point of the whole feature but it is not the everyday view.
    const soldFrom = toInt(req.query.sold, null);
    const sold = soldFrom ? await batches.soldFrom(pool, cid, soldFrom) : null;
    res.render('pharmacy_admin/batches', {
      company: req.company, session: req.session, inv, sold, soldFrom,
      batches: data.batches, total: data.total, reserved: data.reserved,
      tracked: data.tracked, untracked: data.untracked,
      saved: req.query.saved === '1',
      errorCode: String(req.query.error || '') || null,
    });
  } catch (e) {
    console.error('[batches]', e.message);
    res.redirect('/pharmacy/inventory?error=1');
  }
});

// Add a lot to a medicine already in stock. This one DOES move the aggregate:
// unlike the add-stock form, there is no other write doing it.
router.post('/inventory/:id/batches', gate('inventory'), async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, null);
  const b = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inv = (await client.query(
      'SELECT medicine_id FROM pharmacy_inventory WHERE id=$1 AND company_id=$2', [id, cid])).rows[0];
    if (!inv) { await client.query('ROLLBACK'); return res.redirect('/pharmacy/inventory'); }
    if (toInt(b.qty, 0) <= 0) {
      await client.query('ROLLBACK');
      return res.redirect('/pharmacy/inventory/' + id + '/batches?error=qty');
    }
    await batches.receive(client, cid, inv.medicine_id, {
      qty: toInt(b.qty, 0), batch_no: b.batch_no, expiry: (b.expiry || '').trim() || null,
      cost: toNum(b.cost, null), supplier: b.supplier,
    });
    await client.query('COMMIT');
    res.redirect('/pharmacy/inventory/' + id + '/batches?saved=1');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[batch add]', e.message);
    res.redirect('/pharmacy/inventory/' + id + '/batches?error=save');
  } finally { client.release(); }
});

/* Pull a lot off the shelf.
 *
 * Not a delete: those boxes are physically in the pharmacy, they still have to
 * be counted, and they have to go back to the supplier with their lot number
 * on the paperwork. What changes is that they stop being sellable.
 */
router.post('/inventory/:id/batches/:bid/recall', gate('inventory'), async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, null);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const done = await batches.recall(client, cid, toInt(req.params.bid, null),
      String((req.body || {}).note || ''));
    await client.query('COMMIT');
    // Straight to "who did we sell it to" — that question IS the recall.
    return res.redirect('/pharmacy/inventory/' + id + '/batches?saved=1'
      + (done ? '&sold=' + toInt(req.params.bid, null) : ''));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[batch recall]', e.message);
    res.redirect('/pharmacy/inventory/' + id + '/batches?error=save');
  } finally { client.release(); }
});

// Type-ahead over the full (~25k) medicine catalog for the "add stock" form,
// so every Egyptian medicine is reachable without shipping the whole list.
router.get('/api/catalog-search', gate('inventory'), async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  try {
    const like = '%' + q + '%';
    const rows = (await pool.query(
      `SELECT id, name_ar, name_en, form, manufacturer, default_price
       FROM medicines
       WHERE is_active = true AND (name_ar ILIKE $1 OR name_en ILIKE $1 OR scientific_name ILIKE $1)
       ORDER BY (name_en ILIKE $2) DESC, name_ar
       LIMIT 25`, [like, q + '%']
    )).rows;
    res.json(rows);
  } catch (e) {
    console.error('catalog search error:', e.message);
    res.status(500).json([]);
  }
});

// Manual "refresh the medicines list now" button. The site also refreshes it
// automatically (on boot + daily), but this lets the owner force it. Fire and
// forget so the request returns immediately.
router.post('/catalog/sync', gate('inventory'), (req, res) => {
  syncMedicinesSafe({ force: true });
  res.redirect('/pharmacy/inventory?synced=1');
});

/* ─── Banner slides (storefront carousel) ───────────────── */
router.get('/banners', gate('settings'), async (req, res) => {
  const banners = (await pool.query(
    'SELECT * FROM banner_slides WHERE company_id = $1 ORDER BY order_index, created_at',
    [req.company.id]
  )).rows;
  res.render('pharmacy_admin/banners', {
    company: req.company, banners, session: req.session,
    saved: req.query.saved === '1', error: req.query.err || null,
  });
});

router.post('/banners/add', gate('settings'), withImage(uploadBanner), async (req, res) => {
  if (!req.file) return res.redirect('/pharmacy/banners?err=' + encodeURIComponent('اختر صورة أولاً'));
  try {
    await compressImage(req.file.path);
    await pool.query(
      `INSERT INTO banner_slides (company_id, image_url, target_url, caption, order_index)
       VALUES ($1,$2,$3,$4, COALESCE((SELECT MAX(order_index)+1 FROM banner_slides WHERE company_id=$1),0))`,
      [req.company.id, '/uploads/' + req.file.filename, require('../lib/safeUrl').cleanUrlForStore(req.body.target_url), (req.body.caption || '').trim() || null]
    );
    res.redirect('/pharmacy/banners?saved=1');
  } catch (e) {
    console.error('pharmacy banner add error:', e.message);
    res.redirect('/pharmacy/banners?err=' + encodeURIComponent('فشل الحفظ'));
  }
});

router.post('/banners/:id/toggle', gate('settings'), async (req, res) => {
  await pool.query('UPDATE banner_slides SET is_active = NOT is_active WHERE id=$1 AND company_id=$2',
    [toInt(req.params.id, null), req.company.id]);
  res.redirect('/pharmacy/banners');
});

router.post('/banners/:id/delete', gate('settings'), async (req, res) => {
  await pool.query('DELETE FROM banner_slides WHERE id=$1 AND company_id=$2',
    [toInt(req.params.id, null), req.company.id]);
  res.redirect('/pharmacy/banners');
});

/* ─── Settings ──────────────────────────────────────────── */
router.get('/settings', gate('settings'), async (req, res) => {
  const settings = (await pool.query('SELECT * FROM pharmacy_settings WHERE company_id = $1', [req.company.id])).rows[0] || {};
  res.render('pharmacy_admin/settings', {
    company: req.company, settings, session: req.session,
    saved: req.query.saved === '1',
  });
});

router.post('/settings', gate('settings'), async (req, res) => {
  const b = req.body || {};
  try {
    // Map location: keep only valid coordinate ranges, else null.
    let lat = toNum(b.lat, null); let lng = toNum(b.lng, null);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) { lat = null; lng = null; }
    await pool.query(
      `UPDATE pharmacy_settings SET
         online_store_enabled=$1, delivery_enabled=$2, delivery_fee=$3,
         is_night_shift=$4, whatsapp=$5, address=$6, lat=$7, lng=$8,
         show_images=$9, cashier_discount_max=$10, updated_at=now()
       WHERE company_id=$11`,
      [b.online_store_enabled === 'on', b.delivery_enabled === 'on', toNum(b.delivery_fee, 0),
       b.is_night_shift === 'on', (b.whatsapp || '').trim() || null, (b.address || '').trim() || null,
       lat, lng, b.show_images === 'on',
       // Clamped here as well as in the form: a percent over 100 is not a
       // discount, it is the pharmacy paying the customer to leave.
       Math.min(100, Math.max(0, toNum(b.cashier_discount_max, 0))), req.company.id]
    );
    res.redirect('/pharmacy/settings?saved=1');
  } catch (e) {
    console.error('settings update error:', e.message);
    res.redirect('/pharmacy/settings?error=1');
  }
});

/* ─── POS (point of sale) ───────────────────────────────── */
router.get('/pos', gate('pos'), async (req, res) => {
  const st = (await pool.query(
    'SELECT cashier_discount_max FROM pharmacy_settings WHERE company_id = $1', [req.company.id]
  )).rows[0] || {};
  // What THIS cashier may give away without fetching anybody. The server checks
  // it again at checkout — this only decides whether the till asks.
  const max = req.session.staffId
    ? (discount.APPROVER_ROLES.includes(req.session.staffRole)
      ? 100 : Number(st.cashier_discount_max) || 0)
    : 100;
  res.render('pharmacy_admin/pos', { company: req.company, session: req.session, discountMax: max });
});

// JSON search over this pharmacy's stock — used by the POS and (later) the
// barcode scanner. Matches Arabic/English name or barcode.
// The GS1 parser, served to the till from the SAME file the server uses. A
// second copy in a <script> tag is how two implementations of one rule start
// disagreeing — and this one has to work offline, so it cannot be an API call.
router.get('/js/gs1.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(require('path').join(__dirname, '..', 'pharmacy', 'gs1.js'));
});

router.get('/api/inventory-search', gate('pos'), async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    // A GS1 DataMatrix off an Egyptian pack arrives as one long string holding
    // the GTIN, the batch and the expiry. Searching for that whole string finds
    // nothing — so it is decoded first, and the GTIN's EAN-13 form is what the
    // inventory is actually keyed on.
    const code = gs1.parse(q);
    const keys = gs1.searchKeys(code);
    const rows = (await pool.query(
      `SELECT pi.medicine_id, pi.price, GREATEST(pi.qty - pi.reserved_qty,0) AS available,
              pi.expiry, m.name_ar, m.name_en
       FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
       WHERE pi.company_id = $1 AND (
         m.name_ar ILIKE $2 OR m.name_en ILIKE $2
         OR pi.barcode = ANY($3) OR m.barcode = ANY($3))
       ORDER BY m.name_ar LIMIT 30`,
      [req.company.id, '%' + q + '%', keys.length ? keys.concat([q]) : [q]]
    )).rows;
    // The pack told us its batch and expiry; hand them back so the till can
    // show them and the pharmacist can see a mismatch with what is on file.
    res.json(code.gs1
      ? { items: rows, scanned: { gtin: code.gtin || null, batch: code.batch || null,
        expiry: code.expiry || null, serial: code.serial || null, partial: !!code.partial } }
      : rows);
  } catch (e) { console.error('pos search error:', e.message); res.status(500).json([]); }
});

// Checkout a counter sale: validate availability, decrement stock, record the
// sale + profit. Body: { items: [{ medicine_id, qty }] }.
router.post('/pos/checkout', gate('pos'), async (req, res) => {
  const cid = req.company.id;
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ ok: false, error: 'empty' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let total = 0, profit = 0;
    const lines = [];
    for (const raw of items) {
      const mid = parseInt(raw.medicine_id, 10);
      const qty = Math.max(1, parseInt(raw.qty, 10) || 0);
      if (!mid) continue;
      const inv = (await client.query(
        `SELECT pi.qty, pi.reserved_qty, pi.price, pi.cost, m.name_ar
         FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
         WHERE pi.company_id = $1 AND pi.medicine_id = $2 FOR UPDATE`, [cid, mid]
      )).rows[0];
      if (!inv) { await client.query('ROLLBACK'); return res.status(400).json({ ok: false, error: 'not_found' }); }
      const available = Math.max(0, inv.qty - inv.reserved_qty);
      if (available < qty) { await client.query('ROLLBACK'); return res.status(400).json({ ok: false, error: 'insufficient', name: inv.name_ar }); }
      const price = Number(inv.price) || 0;
      const cost = Number(inv.cost) || 0;
      total += price * qty;
      profit += (price - cost) * qty;
      lines.push({ medicine_id: mid, name: inv.name_ar, qty, price, cost });
    }
    if (!lines.length) { await client.query('ROLLBACK'); return res.status(400).json({ ok: false, error: 'empty' }); }

    // The discount is settled on the SERVER against the price the server just
    // computed. A percent from the browser is a request; a role from the
    // browser is a suggestion; neither decides anything on its own.
    const settings = (await client.query(
      'SELECT cashier_discount_max FROM pharmacy_settings WHERE company_id = $1', [cid])).rows[0] || {};
    const disc = await discount.settle(pool, cid, req.session, settings, total, req.body || {});
    if (disc.error) {
      await client.query('ROLLBACK');
      return res.status(403).json({ ok: false, error: disc.error,
        max: Number(settings.cashier_discount_max) || 0 });
    }
    total -= disc.amount;
    profit -= disc.amount;      // a discount comes out of the margin, not the cost

    await stock.sellDirect(client, cid, lines);
    const sale = (await client.query(
      `INSERT INTO pharmacy_sales (company_id, kind, total_amount, profit, staff_id,
                                   discount_amount, discount_percent, discount_by, discount_by_name)
       VALUES ($1,'sale',$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [cid, total, profit, req.session.staffId || null,
        disc.amount, disc.percent, disc.byId, disc.byName]
    )).rows[0];
    // Which lots the boxes came out of, nearest expiry first. The aggregate has
    // already moved above; this only writes down WHICH batch, so a recall can
    // later ask who we sold it to.
    await batches.dispense(client, cid, { saleId: sale.id }, lines);
    for (const l of lines) {
      await client.query(
        `INSERT INTO pharmacy_sale_items (sale_id, medicine_id, name, qty, price, cost) VALUES ($1,$2,$3,$4,$5,$6)`,
        [sale.id, l.medicine_id, l.name, l.qty, l.price, l.cost]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, total, profit, discount: disc.amount, approved_by: disc.byName });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('pos checkout error:', e.message);
    res.status(500).json({ ok: false, error: 'server' });
  } finally {
    client.release();
  }
});

// Full inventory snapshot for the offline POS (cached in the browser's
// IndexedDB so search + sell keep working with no connection).
router.get('/api/inventory-all', gate('pos'), async (req, res) => {
  try {
    const rows = (await pool.query(
      `SELECT pi.medicine_id, pi.price, GREATEST(pi.qty - pi.reserved_qty, 0) AS available,
              COALESCE(NULLIF(pi.barcode,''), m.barcode) AS barcode, m.name_ar, m.name_en
       FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
       WHERE pi.company_id = $1 ORDER BY m.name_ar`, [req.company.id]
    )).rows;
    res.json(rows);
  } catch (e) { console.error('inventory-all error:', e.message); res.status(500).json([]); }
});

/* ─── Offline sales that oversold ────────────────────────────────────────
 *
 * A flag nobody can see is the same silence it replaced, so here is the list.
 * Marking one reviewed does not change any number — it records that a human
 * went and counted the shelf, which is the only thing that can actually settle
 * the difference.
 */
/* ─── التقارير (backlog 81) ──────────────────────────────── */
//
// Three questions, one page: what sells, what is standing still, and what was
// lost. The queries live in src/pharmacy/reports.js — read the note there about
// why every one of them nets returns instead of summing quantities.
router.get('/reports', gate('inventory'), async (req, res) => {
  const cid = req.company.id;
  const days = reports.windowDays(req.query.days, 30);
  const idleDays = reports.windowDays(req.query.idle, 60);
  try {
    // Three independent reads; one slow one must not hold the other two.
    const [top, slow, waste] = await Promise.all([
      pool.query(reports.topSellers, [cid, String(days)]),
      pool.query(reports.slowMoving, [cid, String(idleDays)]),
      pool.query(reports.waste, [cid, String(days)]),
    ]);
    res.render('pharmacy_admin/reports', {
      company: req.company, session: req.session,
      days, idleDays,
      top: top.rows, slow: slow.rows, waste: waste.rows,
      wasteTotals: reports.wasteTotals(waste.rows),
    });
  } catch (e) {
    console.error('[pharmacy reports]', e.message);
    res.redirect('/pharmacy');
  }
});

/* ─── أوامر الشراء (backlog 81) ──────────────────────────── */
//
// The list, one order, and the two writes: sending it, and receiving what came.
// Everything about "how far along is this" is derived by src/pharmacy/purchase.js
// from the lines themselves — see the note there about why none of it is stored.

router.get('/purchases', gate('inventory'), async (req, res) => {
  const cid = req.company.id;
  try {
    const orders = (await pool.query(
      `SELECT p.*,
              COALESCE(SUM(i.qty_ordered), 0)::int  AS qty_ordered,
              COALESCE(SUM(i.qty_received), 0)::int AS qty_received,
              COUNT(i.id)::int                      AS lines,
              COALESCE(SUM(CASE WHEN i.qty_received < i.qty_ordered THEN 1 ELSE 0 END), 0)::int AS open_lines
         FROM pharmacy_po p LEFT JOIN pharmacy_po_items i ON i.po_id = p.id
        WHERE p.company_id = $1
        GROUP BY p.id ORDER BY p.created_at DESC LIMIT 200`, [cid]
    )).rows;
    // The list needs each order's derived state, and the derivation wants the
    // lines. One synthetic line per order carries the same information for it:
    // ordered vs received in total is exactly what `stateOf` reads.
    const rows = orders.map((o) => Object.assign({}, o, {
      state: o.lines === 0
        ? purchase.stateOf(o, [])
        : purchase.stateOf(o, [{ qty_ordered: o.qty_ordered, qty_received: o.qty_received }]),
    }));
    res.render('pharmacy_admin/purchases', {
      company: req.company, rows, session: req.session,
      saved: req.query.saved === '1', err: req.query.err || null,
    });
  } catch (e) {
    console.error('[purchases]', e.message);
    res.redirect('/pharmacy');
  }
});

// Start an order from what the shelf is short of. The quantities are a
// suggestion and every one of them is editable before the order is sent.
router.get('/purchases/new', gate('inventory'), async (req, res) => {
  const cid = req.company.id;
  try {
    const rows = (await pool.query(
      `SELECT inv.medicine_id, inv.min_qty, inv.cost,
              GREATEST(inv.qty - inv.reserved_qty, 0)::int AS available,
              COALESCE(m.name_ar, m.name_en) AS name
         FROM pharmacy_inventory inv JOIN medicines m ON m.id = inv.medicine_id
        WHERE inv.company_id = $1
        ORDER BY (GREATEST(inv.qty - inv.reserved_qty, 0)::float / NULLIF(inv.min_qty, 0)) ASC NULLS LAST
        LIMIT 300`, [cid]
    )).rows;
    res.render('pharmacy_admin/purchase_new', {
      company: req.company, session: req.session,
      suggestions: purchase.suggestions(rows),
    });
  } catch (e) {
    console.error('[purchase new]', e.message);
    res.redirect('/pharmacy/purchases');
  }
});

router.post('/purchases/new', gate('inventory'), async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  const ids = [].concat(b.medicine_id || []);
  const qtys = [].concat(b.qty || []);
  const costs = [].concat(b.cost || []);
  const names = [].concat(b.name || []);
  // Only the lines the pharmacist actually asked for. A form with 300 rows on it
  // posts 300 fields, and 297 of them are zeros.
  const lines = [];
  const seen = new Set();
  for (let i = 0; i < ids.length; i++) {
    const mid = toInt(ids[i], 0);
    const qty = toInt(qtys[i], 0);
    if (!mid || qty <= 0 || seen.has(mid)) continue;
    seen.add(mid);
    lines.push({ mid, qty, cost: costs[i] === '' || costs[i] == null ? null : toNum(costs[i], null), name: String(names[i] || '').slice(0, 200) });
  }
  if (!lines.length) return res.redirect('/pharmacy/purchases/new?err=empty');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const po = (await client.query(
      `INSERT INTO pharmacy_po (company_id, supplier, note, created_by, status)
       VALUES ($1,$2,$3,$4,'draft') RETURNING id`,
      [cid, String(b.supplier || '').trim().slice(0, 120) || null,
        String(b.note || '').trim().slice(0, 500) || null,
        req.session.staffName || 'المالك']
    )).rows[0];
    for (const l of lines) {
      await client.query(
        `INSERT INTO pharmacy_po_items (po_id, company_id, medicine_id, name_at_order, qty_ordered, cost)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [po.id, cid, l.mid, l.name || null, l.qty, l.cost]
      );
    }
    await client.query('COMMIT');
    res.redirect('/pharmacy/purchases/' + po.id);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[purchase create]', e.message);
    // A save that did not happen does not answer with «اتحفظ».
    res.redirect('/pharmacy/purchases/new?err=save');
  } finally {
    client.release();
  }
});

router.get('/purchases/:id', gate('inventory'), async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, 0);
  try {
    const po = (await pool.query('SELECT * FROM pharmacy_po WHERE id=$1 AND company_id=$2', [id, cid])).rows[0];
    if (!po) return res.status(404).render('404', { subdomain: null });
    const items = (await pool.query(
      `SELECT i.*, COALESCE(m.name_ar, m.name_en) AS name
         FROM pharmacy_po_items i JOIN medicines m ON m.id = i.medicine_id
        WHERE i.po_id = $1 ORDER BY i.id`, [id]
    )).rows;
    const receipts = (await pool.query(
      'SELECT * FROM pharmacy_po_receipts WHERE po_id=$1 ORDER BY created_at DESC LIMIT 200', [id]
    )).rows;
    res.render('pharmacy_admin/purchase_detail', {
      company: req.company, session: req.session, po, receipts,
      items: items.map((i) => Object.assign({}, i, {
        lineState: purchase.lineState(i), outstanding: purchase.outstanding(i),
      })),
      state: purchase.stateOf(po, items),
      totals: purchase.totals(items),
      canEdit: purchase.canEdit(po, items),
      canReceive: purchase.canReceive(po, items),
      saved: req.query.saved === '1', err: req.query.err || null,
    });
  } catch (e) {
    console.error('[purchase detail]', e.message);
    res.redirect('/pharmacy/purchases');
  }
});

// Sent / cancelled — the two states a human sets. `received` is not one of them.
router.post('/purchases/:id/status', gate('inventory'), async (req, res) => {
  const id = toInt(req.params.id, 0);
  const want = String((req.body || {}).status || '');
  if (!['sent', 'cancelled', 'draft'].includes(want)) return res.redirect('/pharmacy/purchases/' + id + '?err=state');
  try {
    await pool.query(
      `UPDATE pharmacy_po SET status=$3, sent_at = CASE WHEN $3='sent' THEN now() ELSE sent_at END
        WHERE id=$1 AND company_id=$2`,
      [id, req.company.id, want]
    );
  } catch (e) {
    console.error('[purchase status]', e.message);
    return res.redirect('/pharmacy/purchases/' + id + '?err=save');
  }
  res.redirect('/pharmacy/purchases/' + id + '?saved=1');
});

/**
 * Receiving what arrived.
 *
 * One line, one delivery. Three things happen together or none of them do: the
 * line's received count moves, the delivery is written down, and the stock
 * arrives as a batch (nearest-expiry-first dispensing needs the lot, not just
 * the number).
 *
 * The double-submit guard is `expected`: the quantity the form was rendered
 * with. The UPDATE only matches while that is still the value in the table, so
 * a second press of the same button adds nothing. This is the write in the
 * pharmacy panel most likely to be double-submitted — it is at the end of a
 * form, on a phone, in a shop.
 */
router.post('/purchases/:id/receive', gate('inventory'), async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, 0);
  const b = req.body || {};
  const itemId = toInt(b.item_id, 0);
  const qty = toInt(b.qty, 0);
  const expected = toInt(b.expected, -1);
  if (!itemId || qty <= 0) return res.redirect('/pharmacy/purchases/' + id + '?err=qty');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const po = (await client.query(
      'SELECT * FROM pharmacy_po WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid]
    )).rows[0];
    if (!po) { await client.query('ROLLBACK'); return res.status(404).render('404', { subdomain: null }); }
    const items = (await client.query('SELECT * FROM pharmacy_po_items WHERE po_id=$1', [id])).rows;
    const verdict = purchase.canReceive(po, items);
    if (!verdict.ok) { await client.query('ROLLBACK'); return res.redirect('/pharmacy/purchases/' + id + '?err=' + verdict.why); }
    const item = items.find((i) => i.id === itemId);
    if (!item) { await client.query('ROLLBACK'); return res.redirect('/pharmacy/purchases/' + id + '?err=line'); }

    const claimed = await client.query(
      `UPDATE pharmacy_po_items SET qty_received = qty_received + $3
        WHERE id = $1 AND po_id = $2 AND qty_received = $4
        RETURNING id, qty_received`,
      [itemId, id, qty, expected]
    );
    if (!claimed.rows[0]) {
      await client.query('ROLLBACK');
      // Somebody (or the same finger, twice) already recorded this delivery.
      return res.redirect('/pharmacy/purchases/' + id + '?err=already');
    }

    const cost = b.cost === '' || b.cost == null ? (item.cost == null ? null : Number(item.cost)) : toNum(b.cost, null);
    // The order and the line are named by the rows this transaction already
    // read under lock — not by the numbers that came off the form — and the
    // statement scopes them to this pharmacy itself rather than trusting the
    // SELECT above to have done it. A read then a write is not a rule; a rule
    // is a rule inside the statement that writes.
    await client.query(
      `INSERT INTO pharmacy_po_receipts (company_id, po_id, item_id, qty, batch_no, expiry, cost, received_by)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8
        WHERE EXISTS (SELECT 1 FROM pharmacy_po WHERE id=$2 AND company_id=$1)
          AND EXISTS (SELECT 1 FROM pharmacy_po_items WHERE id=$3 AND po_id=$2 AND company_id=$1)`,
      [cid, po.id, item.id, qty,
        String(b.batch_no || '').trim().slice(0, 60) || null,
        b.expiry || null, cost, req.session.staffName || 'المالك']
    );
    // The stock itself, as a lot. Same client, same transaction: the shelf and
    // the order move together or neither does.
    await batches.receive(client, cid, item.medicine_id, {
      qty, batch_no: b.batch_no, expiry: b.expiry, cost,
      supplier: po.supplier || null,
    });
    await client.query('COMMIT');
    res.redirect('/pharmacy/purchases/' + id + '?saved=1');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[purchase receive]', e.message);
    res.redirect('/pharmacy/purchases/' + id + '?err=save');
  } finally {
    client.release();
  }
});

router.get('/stock-review', gate('inventory'), async (req, res) => {
  const cid = req.company.id;
  try {
    const rows = (await pool.query(
      `SELECT s.*, COALESCE(json_agg(json_build_object('name', si.name, 'qty', si.qty))
                            FILTER (WHERE si.id IS NOT NULL), '[]') AS items
         FROM pharmacy_sales s
         LEFT JOIN pharmacy_sale_items si ON si.sale_id = s.id
        WHERE s.company_id = $1 AND s.needs_review = true AND s.reviewed_at IS NULL
        GROUP BY s.id
        ORDER BY s.created_at DESC LIMIT 200`, [cid]
    )).rows;
    res.render('pharmacy_admin/stock_review', {
      company: req.company, rows, session: req.session,
      saved: req.query.saved === '1',
    });
  } catch (e) {
    console.error('[stock review]', e.message);
    res.status(500).send('error');
  }
});

router.post('/stock-review/:id/done', gate('inventory'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE pharmacy_sales SET reviewed_at = now() WHERE id=$1 AND company_id=$2 AND needs_review = true',
      [parseInt(req.params.id, 10), req.company.id]
    );
  } catch (e) { console.error('[stock review done]', e.message); }
  res.redirect('/pharmacy/stock-review?saved=1');
});

// Sync a batch of sales made offline. Each carries an offline_uid; replays are
// idempotent (a uid already recorded is skipped). Offline sales are facts that
// already happened at the counter, so they're always applied (no availability
// rejection) — stock is decremented and floored at zero.
router.post('/pos/sync', gate('pos'), async (req, res) => {
  const cid = req.company.id;
  const sales = Array.isArray(req.body && req.body.sales) ? req.body.sales : [];
  const synced = [];
  // Read once, not per sale — a queue flush can carry a whole morning.
  const psettings = (await pool.query(
    'SELECT cashier_discount_max FROM pharmacy_settings WHERE company_id = $1', [cid])).rows[0] || {};
  for (const s of sales) {
    const uid = String((s && s.offline_uid) || '').slice(0, 64);
    const items = Array.isArray(s && s.items) ? s.items : [];
    if (!uid || !items.length) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      /* Claim the uid BEFORE touching the shelf.
       *
       * The old order was: check whether the uid exists, take the stock, then
       * insert with ON CONFLICT DO NOTHING. Two syncs of the same queue — a
       * double tap on "sync", or a retry after a timed-out response — both
       * find no row (neither has committed), and BOTH run sellDirect. The
       * conflict clause then quietly drops the second INSERT, so one sale is
       * recorded and the shelf is down by twice the quantity.
       *
       * The unique index is the only thing both requests are guaranteed to
       * agree about, so the row is claimed first and filled in after. The
       * second request blocks on the index, then gets no row back and knows
       * this sale is already handled. If the rest fails, the ROLLBACK takes
       * the claim with it — the sale is not recorded and not double-counted.
       */
      const claim = (await client.query(
        `INSERT INTO pharmacy_sales (company_id, kind, offline_uid, staff_id, total_amount, profit)
         VALUES ($1,'sale',$2,$3,0,0)
         ON CONFLICT (company_id, offline_uid) DO NOTHING RETURNING id`,
        [cid, uid, req.session.staffId || null]
      )).rows[0];
      if (!claim) { await client.query('COMMIT'); synced.push(uid); continue; }
      let total = 0, profit = 0; const lines = [];
      for (const raw of items) {
        const mid = parseInt(raw.medicine_id, 10);
        const qty = Math.max(1, parseInt(raw.qty, 10) || 0);
        if (!mid) continue;
        const inv = (await client.query(
          'SELECT pi.price, pi.cost, m.name_ar FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id WHERE pi.company_id=$1 AND pi.medicine_id=$2 FOR UPDATE',
          [cid, mid]
        )).rows[0];
        const price = inv ? (Number(inv.price) || 0) : (Number(raw.price) || 0);
        const cost = inv ? (Number(inv.cost) || 0) : 0;
        total += price * qty; profit += (price - cost) * qty;
        lines.push({ medicine_id: mid, name: inv ? inv.name_ar : (raw.name || ''), qty, price, cost });
      }
      if (!lines.length) { await client.query('ROLLBACK'); continue; }
      /* A discount that arrives from an offline queue.
       *
       * Only up to the cashier's own ceiling. An over-limit discount needs a
       * manager to sign in, and there was no server to check that against when
       * the till was offline — so accepting a queued 40% because the browser
       * says a manager approved it would make the approval theatre. The sale
       * still goes through at the discount the cashier WAS allowed to give, and
       * the difference is flagged for the same review list as a stock
       * discrepancy: a human decides, which is the only honest outcome.
       */
      const askedPct = discount.normalise(s && s.discount_percent);
      const ceiling = Number(psettings.cashier_discount_max) || 0;
      const allowedPct = req.session.staffId ? Math.min(askedPct, ceiling) : askedPct;
      const discAmt = discount.amountOf(total, allowedPct);
      const discCut = askedPct > allowedPct;
      total -= discAmt; profit -= discAmt;

      // The sale is applied either way — it already happened at the counter.
      // But if the shelf did not have what it sold, that is a discrepancy
      // somebody has to walk over and count, not a number to floor at zero and
      // forget. The pharmacist gets a review list instead of a quiet loss.
      const short = await stock.sellDirect(client, cid, lines);
      const notes = short.map((x) => {
        const l = lines.find((y) => y.medicine_id === x.medicine_id);
        return `${(l && l.name) || ('#' + x.medicine_id)}: اتباع ${x.wanted} والنظام كان شايف ${x.had}`;
      });
      if (discCut) {
        notes.push(`خصم ${askedPct}% اتسجّل ${allowedPct}% — محتاج موافقة مدير ومكانش فيه نت`);
      }
      const note = notes.length ? notes.join(' · ').slice(0, 500) : null;
      // Fill in the row claimed above. No conflict clause here: this id is ours.
      const sale = claim;
      await client.query(
        `UPDATE pharmacy_sales
            SET total_amount=$1, profit=$2, needs_review=$3, review_note=$4,
                discount_amount=$5, discount_percent=$6
          WHERE id=$7 AND company_id=$8`,
        [total, profit, short.length > 0 || discCut, note, discAmt, allowedPct, sale.id, cid]
      );
      for (const l of lines) {
        await client.query(
          'INSERT INTO pharmacy_sale_items (sale_id, medicine_id, name, qty, price, cost) VALUES ($1,$2,$3,$4,$5,$6)',
          [sale.id, l.medicine_id, l.name, l.qty, l.price, l.cost]
        );
      }
      // An offline sale left the shelf hours ago; the lots come off now, in
      // the same order they would have then.
      await batches.dispense(client, cid, { saleId: sale.id }, lines);
      await client.query('COMMIT'); synced.push(uid);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('pos sync error:', e.message);
    } finally { client.release(); }
  }
  res.json({ ok: true, synced });
});

/* ─── Online orders inbox ───────────────────────────────── */
const ORDER_FLOW = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'rejected', 'cancelled'];

router.get('/orders', gate('orders'), async (req, res) => {
  const cid = req.company.id;
  try {
    const orders = (await pool.query(
      `SELECT * FROM pharmacy_orders WHERE company_id = $1 ORDER BY
         CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 200`, [cid]
    )).rows;
    const ids = orders.map(o => o.id);
    let itemsByOrder = {};
    let lastEvent = {};
    if (ids.length) {
      const its = (await pool.query(
        `SELECT oi.*, m.name_en AS med_en FROM pharmacy_order_items oi
         LEFT JOIN medicines m ON m.id = oi.medicine_id WHERE oi.order_id = ANY($1::int[])`, [ids]
      )).rows;
      for (const it of its) { (itemsByOrder[it.order_id] = itemsByOrder[it.order_id] || []).push(it); }
      const evs = (await pool.query(
        `SELECT DISTINCT ON (order_id) order_id, actor, actor_role, created_at
         FROM pharmacy_order_events WHERE order_id = ANY($1::int[])
         ORDER BY order_id, created_at DESC`, [ids]
      )).rows;
      for (const e of evs) lastEvent[e.order_id] = e;
    }
    res.render('pharmacy_admin/orders', {
      company: req.company, orders, itemsByOrder, lastEvent, flow: ORDER_FLOW, session: req.session,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('orders list error:', e.message); res.status(500).send('Error.'); }
});

// Change an order's status and apply the reservation lifecycle:
//  → delivered: stock leaves (fulfill) + record the sale/profit.
//  → rejected/cancelled: release the hold.
//  other transitions keep the existing reservation.
router.post('/orders/:id/status', gate('orders'), async (req, res) => {
  const cid = req.company.id;
  const oid = parseInt(req.params.id, 10);
  const next = String((req.body && req.body.status) || '').trim();
  if (!ORDER_FLOW.includes(next)) return res.redirect('/pharmacy/orders?error=1');
  // Delivery drivers may only move an order out-for-delivery / delivered.
  if (req.perms.deliveryOnly && !['out_for_delivery', 'delivered'].includes(next)) {
    return res.status(403).render('404', { subdomain: null });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ord = (await client.query(
      'SELECT * FROM pharmacy_orders WHERE id = $1 AND company_id = $2 FOR UPDATE', [oid, cid]
    )).rows[0];
    if (!ord) { await client.query('ROLLBACK'); return res.redirect('/pharmacy/orders?error=1'); }
    const prev = ord.status;
    const terminalDone = ['delivered', 'rejected', 'cancelled'].includes(prev);
    // A finished order is finished. `terminalDone` was computed and only used to
    // guard the release branch, so delivered → preparing → delivered walked
    // straight back through the fulfil branch: stock left the shelf a SECOND
    // time and the day's takings counted the order twice. Reported by QA.
    // Re-selecting the same status is a harmless no-op and stays allowed.
    if (terminalDone && next !== prev) {
      await client.query('ROLLBACK');
      return res.redirect('/pharmacy/orders?error=final');
    }
    const items = (await client.query(
      'SELECT medicine_id, qty FROM pharmacy_order_items WHERE order_id = $1', [oid]
    )).rows.filter(i => i.medicine_id);

    if (next === 'delivered' && prev !== 'delivered' && !['rejected', 'cancelled'].includes(prev)) {
      await stock.fulfill(client, cid, items);
      // The order id, not a sale id: a recall on a delivered order needs the
      // customer's name and phone, and the order is where those live.
      await batches.dispense(client, cid, { orderId: oid }, items);
      // record the sale + profit (cost pulled from current inventory)
      let total = 0, profit = 0;
      const lines = (await client.query(
        `SELECT oi.medicine_id, oi.name, oi.qty, oi.price, pi.cost
         FROM pharmacy_order_items oi
         LEFT JOIN pharmacy_inventory pi ON pi.company_id = $2 AND pi.medicine_id = oi.medicine_id
         WHERE oi.order_id = $1`, [oid, cid]
      )).rows;
      for (const l of lines) {
        const price = Number(l.price) || 0, cost = Number(l.cost) || 0, qty = Number(l.qty) || 0;
        total += price * qty; profit += (price - cost) * qty;
      }
      const sale = (await client.query(
        `INSERT INTO pharmacy_sales (company_id, kind, total_amount, profit, staff_id) VALUES ($1,'sale',$2,$3,$4) RETURNING id`,
        [cid, total, profit, req.session.staffId || null]
      )).rows[0];
      for (const l of lines) {
        await client.query(
          `INSERT INTO pharmacy_sale_items (sale_id, medicine_id, name, qty, price, cost) VALUES ($1,$2,$3,$4,$5,$6)`,
          [sale.id, l.medicine_id, l.name, l.qty, l.price, Number(l.cost) || null]
        );
      }
    } else if (['rejected', 'cancelled'].includes(next) && !terminalDone) {
      await stock.release(client, cid, items);
    }

    await client.query('UPDATE pharmacy_orders SET status = $1 WHERE id = $2', [next, oid]);
    // Audit: record who changed the status.
    await client.query(
      `INSERT INTO pharmacy_order_events (order_id, status, actor, actor_role) VALUES ($1,$2,$3,$4)`,
      [oid, next, req.session.staffName || 'المالك', req.perms.role]
    );
    await client.query('COMMIT');
    // Notify the customer tracking this order (Talabat-style status update).
    const notif = STATUS_NOTIF[next];
    if (notif && ord.track_token) {
      push.sendToOrder(oid, {
        title: notif.t,
        body: (req.company.company_name || '') + ' — ' + notif.b,
        url: 'https://' + req.company.slug + '.oscardevs.com/order/track/' + ord.track_token,
      }).catch((e) => console.error('[push order->customer] error:', e.message));
    }
    res.redirect('/pharmacy/orders?saved=1');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('order status error:', e.message);
    res.redirect('/pharmacy/orders?error=1');
  } finally {
    client.release();
  }
});

/* ─── Delivery driver live location (GPS) ───────────────── */
// Driver (or any staff with orders access) posts their current location for an
// order that's out for delivery. The pharmacy + the customer see it on a map.
router.post('/orders/:id/location', gate('orders'), async (req, res) => {
  const oid = toInt(req.params.id, null);
  const lat = parseFloat(req.body && req.body.lat);
  const lng = parseFloat(req.body && req.body.lng);
  if (!oid || !Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ ok: false });
  await pool.query(
    'UPDATE pharmacy_orders SET driver_lat=$1, driver_lng=$2, driver_loc_at=now() WHERE id=$3 AND company_id=$4',
    [lat, lng, oid, req.company.id]
  ).catch(() => {});
  res.json({ ok: true });
});

// Pharmacy-side poll for a driver's latest location.
router.get('/orders/:id/location', gate('orders'), async (req, res) => {
  try {
    const r = (await pool.query(
      'SELECT driver_lat AS lat, driver_lng AS lng, driver_loc_at AS at, status FROM pharmacy_orders WHERE id=$1 AND company_id=$2',
      [toInt(req.params.id, null), req.company.id]
    )).rows[0];
    res.json(r || {});
  } catch (e) { res.status(500).json({}); }
});

/* ─── Staff & roles (owner only) ────────────────────────── */
router.get('/staff', gate('staff'), async (req, res) => {
  try {
    const staff = (await pool.query(
      'SELECT * FROM pharmacy_staff WHERE company_id = $1 ORDER BY is_active DESC, created_at DESC', [req.company.id]
    )).rows;
    res.render('pharmacy_admin/staff', {
      company: req.company, staff, session: req.session,
      saved: req.query.saved === '1', error: req.query.error || null,
    });
  } catch (e) { console.error('staff list error:', e.message); res.status(500).send('Error.'); }
});

router.post('/staff/add', gate('staff'), async (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  const username = (b.username || '').trim().toLowerCase();
  const pw = String(b.password || '');
  const role = ['pharmacist', 'cashier', 'delivery'].includes(b.role) ? b.role : 'cashier';
  if (!name || !username || !pw) return res.redirect('/pharmacy/staff?error=' + encodeURIComponent('اكمل الاسم واسم المستخدم وكلمة السر'));
  try {
    const hash = await bcrypt.hash(pw, 10);
    // Pharmacist sees finances by default; cashier & delivery do not.
    const canFin = role === 'pharmacist';
    await pool.query(
      `INSERT INTO pharmacy_staff (company_id, name, username, password_hash, role, can_see_finance, phone, commission_percent, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [req.company.id, name, username, hash, role, canFin, (b.phone || '').trim() || null, toNum(b.commission_percent, 0)]
    );
    res.redirect('/pharmacy/staff?saved=1');
  } catch (e) {
    console.error('staff add error:', e.message);
    const msg = /unique|duplicate/i.test(e.message) ? 'اسم المستخدم مستخدم بالفعل' : 'حصل خطأ، حاول تاني';
    res.redirect('/pharmacy/staff?error=' + encodeURIComponent(msg));
  }
});

router.post('/staff/:id/toggle', gate('staff'), async (req, res) => {
  await pool.query('UPDATE pharmacy_staff SET is_active = NOT is_active WHERE id = $1 AND company_id = $2',
    [toInt(req.params.id, null), req.company.id]).catch(() => {});
  res.redirect('/pharmacy/staff?saved=1');
});

router.post('/staff/:id/delete', gate('staff'), async (req, res) => {
  await pool.query('DELETE FROM pharmacy_staff WHERE id = $1 AND company_id = $2',
    [toInt(req.params.id, null), req.company.id]).catch(() => {});
  res.redirect('/pharmacy/staff?saved=1');
});

module.exports = router;
