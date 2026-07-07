// Orders merchant admin (mounted at /food) — manage the restaurant / supermarket
// outlets, their categories, and menu items. Reuses the company session; every
// route requires a logged-in company whose page_type is 'orders'.
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const requireLogin = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { compressImage } = require('../lib/media');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const imageMimeRegex = /^image\/(png|jpeg|jpg|gif|webp|svg\+xml)$/;
const uploadFoodImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `food-${req.session.companyId}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => imageMimeRegex.test(file.mimetype) ? cb(null, true) : cb(new Error('image only')),
}).single('image_file');
function withImage(req, res, next) { uploadFoodImage(req, res, () => next()); }

function toNum(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function toInt(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }

async function requireOrders(req, res, next) {
  if (!req.session || !req.session.companyId) return res.redirect('/company/login');
  try {
    const r = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    if (!r.rows.length || r.rows[0].page_type !== 'orders') {
      return res.status(404).render('404', { subdomain: null });
    }
    req.company = r.rows[0];
    next();
  } catch (e) { console.error('requireOrders error:', e.message); res.status(500).send('Error.'); }
}
router.use(requireLogin, requireOrders);

// Owns this outlet? (guards outlet/category/item mutations to the company)
async function ownsOutlet(companyId, outletId) {
  const r = await pool.query('SELECT 1 FROM food_outlets WHERE id = $1 AND company_id = $2', [outletId, companyId]);
  return r.rows.length > 0;
}

/* ─── Menu manager (main page) ──────────────────────────── */
router.get('/', async (req, res) => {
  const cid = req.company.id;
  try {
    const outlets = (await pool.query('SELECT * FROM food_outlets WHERE company_id = $1 ORDER BY vertical', [cid])).rows;
    for (const o of outlets) {
      o.categories = (await pool.query('SELECT * FROM food_categories WHERE outlet_id = $1 ORDER BY sort_order, id', [o.id])).rows;
      o.items = (await pool.query('SELECT * FROM food_items WHERE outlet_id = $1 ORDER BY sort_order, id', [o.id])).rows;
    }
    const pending = (await pool.query("SELECT COUNT(*)::int AS n FROM food_orders WHERE company_id = $1 AND status = 'pending'", [cid])).rows[0].n;
    res.render('food_admin/menu', {
      company: req.company, outlets, pendingOrders: pending, session: req.session,
      saved: req.query.saved === '1', error: req.query.error || null,
    });
  } catch (e) {
    console.error('food menu error:', e.message);
    res.status(500).send('Error.');
  }
});

/* ─── Outlets ───────────────────────────────────────────── */
// Create or update the restaurant / supermarket outlet (one of each per company).
router.post('/outlet/save', withImage, async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  const vertical = b.vertical === 'supermarket' ? 'supermarket' : 'restaurant';
  const image = req.file ? '/uploads/' + req.file.filename : null;
  try {
    if (req.file) await compressImage(req.file.path);
    const id = toInt(b.id, null);
    if (id && await ownsOutlet(cid, id)) {
      await pool.query(
        `UPDATE food_outlets SET name=$1, name_ar=$2, description=$3,
           delivery_fee=$4, delivery_time_min=$5, min_order=$6,
           opening_time=$7, closing_time=$8, image_url=COALESCE($9, image_url)
         WHERE id=$10 AND company_id=$11`,
        [(b.name || '').trim() || vertical, (b.name_ar || '').trim() || null, (b.description || '').trim() || null,
         toNum(b.delivery_fee, 0), toInt(b.delivery_time_min, 30), toNum(b.min_order, 0),
         (b.opening_time || '09:00').trim(), (b.closing_time || '23:00').trim(), image, id, cid]
      );
    } else {
      await pool.query(
        `INSERT INTO food_outlets (company_id, vertical, name, name_ar, description, delivery_fee, delivery_time_min, min_order, opening_time, closing_time, image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (company_id, vertical) DO UPDATE SET
           name=EXCLUDED.name, name_ar=EXCLUDED.name_ar, description=EXCLUDED.description,
           delivery_fee=EXCLUDED.delivery_fee, delivery_time_min=EXCLUDED.delivery_time_min,
           min_order=EXCLUDED.min_order, opening_time=EXCLUDED.opening_time,
           closing_time=EXCLUDED.closing_time, image_url=COALESCE(EXCLUDED.image_url, food_outlets.image_url)`,
        [cid, vertical, (b.name || '').trim() || vertical, (b.name_ar || '').trim() || null, (b.description || '').trim() || null,
         toNum(b.delivery_fee, 0), toInt(b.delivery_time_min, 30), toNum(b.min_order, 0),
         (b.opening_time || '09:00').trim(), (b.closing_time || '23:00').trim(), image]
      );
    }
    res.redirect('/food?saved=1');
  } catch (e) {
    console.error('outlet save error:', e.message);
    res.redirect('/food?error=' + encodeURIComponent('حصل خطأ'));
  }
});

router.post('/outlet/:id/toggle', async (req, res) => {
  await pool.query('UPDATE food_outlets SET is_active = NOT is_active WHERE id=$1 AND company_id=$2',
    [toInt(req.params.id, null), req.company.id]);
  res.redirect('/food');
});

/* ─── Categories ────────────────────────────────────────── */
router.post('/category/add', async (req, res) => {
  const b = req.body || {};
  const outletId = toInt(b.outlet_id, null);
  if (outletId && await ownsOutlet(req.company.id, outletId) && (b.name || b.name_ar)) {
    await pool.query(
      `INSERT INTO food_categories (outlet_id, name, name_ar, sort_order)
       VALUES ($1,$2,$3, COALESCE((SELECT MAX(sort_order)+1 FROM food_categories WHERE outlet_id=$1),0))`,
      [outletId, (b.name || b.name_ar || '').trim(), (b.name_ar || '').trim() || null]
    );
  }
  res.redirect('/food?saved=1');
});

router.post('/category/:id/delete', async (req, res) => {
  await pool.query(
    `DELETE FROM food_categories WHERE id=$1 AND outlet_id IN (SELECT id FROM food_outlets WHERE company_id=$2)`,
    [toInt(req.params.id, null), req.company.id]
  );
  res.redirect('/food');
});

/* ─── Items ─────────────────────────────────────────────── */
router.post('/item/add', withImage, async (req, res) => {
  const b = req.body || {};
  const outletId = toInt(b.outlet_id, null);
  if (!outletId || !(await ownsOutlet(req.company.id, outletId))) return res.redirect('/food');
  const image = req.file ? '/uploads/' + req.file.filename : null;
  if (req.file) await compressImage(req.file.path);
  await pool.query(
    `INSERT INTO food_items (outlet_id, category_id, name, name_ar, description, price, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [outletId, toInt(b.category_id, null), (b.name || b.name_ar || '').trim(), (b.name_ar || '').trim() || null,
     (b.description || '').trim() || null, toNum(b.price, 0), image]
  );
  res.redirect('/food?saved=1');
});

router.post('/item/:id/update', withImage, async (req, res) => {
  const b = req.body || {};
  const image = req.file ? '/uploads/' + req.file.filename : null;
  if (req.file) await compressImage(req.file.path);
  await pool.query(
    `UPDATE food_items SET name=$1, name_ar=$2, description=$3, price=$4,
       category_id=$5, is_available=$6, image_url=COALESCE($7, image_url)
     WHERE id=$8 AND outlet_id IN (SELECT id FROM food_outlets WHERE company_id=$9)`,
    [(b.name || '').trim(), (b.name_ar || '').trim() || null, (b.description || '').trim() || null,
     toNum(b.price, 0), toInt(b.category_id, null), b.is_available === 'on',
     image, toInt(req.params.id, null), req.company.id]
  );
  res.redirect('/food?saved=1');
});

router.post('/item/:id/delete', async (req, res) => {
  await pool.query(
    `DELETE FROM food_items WHERE id=$1 AND outlet_id IN (SELECT id FROM food_outlets WHERE company_id=$2)`,
    [toInt(req.params.id, null), req.company.id]
  );
  res.redirect('/food');
});

/* ─── Orders (incoming) ─────────────────────────────────── */
const FOOD_FLOW = ['pending', 'accepted', 'preparing', 'out_for_delivery', 'delivered', 'rejected', 'cancelled'];

router.get('/orders', async (req, res) => {
  const cid = req.company.id;
  try {
    const orders = (await pool.query(
      'SELECT * FROM food_orders WHERE company_id = $1 ORDER BY created_at DESC LIMIT 100', [cid]
    )).rows;
    for (const o of orders) {
      o.items = (await pool.query('SELECT * FROM food_order_items WHERE order_id = $1', [o.id])).rows;
    }
    res.render('food_admin/orders', { company: req.company, orders, session: req.session, flow: FOOD_FLOW });
  } catch (e) { console.error('food orders error:', e.message); res.status(500).send('Error.'); }
});

router.post('/orders/:id/status', async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, null);
  const status = FOOD_FLOW.includes(req.body.status) ? req.body.status : null;
  if (status) {
    const r = await pool.query('UPDATE food_orders SET status=$1, updated_at=now() WHERE id=$2 AND company_id=$3 RETURNING id', [status, id, cid]);
    if (r.rows.length) {
      await pool.query('INSERT INTO food_order_events (order_id, status, note) VALUES ($1,$2,$3)', [id, status, 'admin']);
    }
  }
  res.redirect('/food/orders');
});

// New-order poll (drives the sound alert on the orders screen).
router.get('/orders/count', async (req, res) => {
  try {
    const n = (await pool.query("SELECT COUNT(*)::int AS n FROM food_orders WHERE company_id=$1 AND status='pending'", [req.company.id])).rows[0].n;
    res.json({ pending: n });
  } catch (e) { res.json({ pending: 0 }); }
});

module.exports = router;
