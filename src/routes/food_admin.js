// Orders merchant admin (mounted at /food) — manage the restaurant / supermarket
// outlets, their categories, and menu items. Reuses the company session; every
// route requires a logged-in company whose page_type is 'orders'.
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const flow = require('../lib/order_flow');
const foodPerms = require('../food/perms');
const bcrypt = require('bcryptjs');
const requireLogin = require('../middleware/auth');
const staffScope = require('../lib/staff_scope');
const multer = require('multer');
const uploads = require('../lib/uploads');
const path = require('path');
const fs = require('fs');
const { compressImage } = require('../lib/media');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
// SVG excluded on purpose (active content). Only passive raster formats.
const imageMimeRegex = /^image\/(png|jpeg|jpg|gif|webp)$/;
const uploadFoodImage = uploads.guard(multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `food-${req.session.companyId}-${Date.now()}${uploads.extname(file, '.bin')}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => imageMimeRegex.test(file.mimetype) ? cb(null, true) : cb(new Error('image only')),
}).single('image_file'), 'image');
function withImage(req, res, next) { uploadFoodImage(req, res, () => next()); }

function toNum(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
const money = require('../lib/money');
function toInt(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }

async function requireOrders(req, res, next) {
  if (!req.session || !req.session.companyId) return res.redirect('/company/login');
  try {
    const r = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    // Suspended (is_active = false) orders tenants lose dashboard access immediately.
    if (!r.rows.length || r.rows[0].page_type !== 'orders' || r.rows[0].is_active === false) {
      return res.status(404).render('404', { subdomain: null });
    }
    req.company = r.rows[0];
    // Who is on this screen — the owner, or a cashier / shift manager / the
    // kitchen tablet / a rider. Computed once, here, so no route has to.
    const perms = foodPerms.permsFor(req.session);
    req.perms = perms;
    res.locals.perms = perms;
    next();
  } catch (e) { console.error('requireOrders error:', e.message); res.status(500).send('Error.'); }
}
// One guard for the whole router: permission comes from the path prefix (see
// src/food/perms.js), so a route added later is covered by where it lives.
router.use(requireLogin, staffScope.only('/food'), requireOrders, foodPerms.guard());

// Owns this outlet? (guards outlet/category/item mutations to the company)
async function ownsOutlet(companyId, outletId) {
  const r = await pool.query('SELECT 1 FROM food_outlets WHERE id = $1 AND company_id = $2', [outletId, companyId]);
  return r.rows.length > 0;
}

/* ─── Menu manager (main page) ──────────────────────────── */
/* The first screen after login.
 *
 * It used to be the menu manager — the screen a restaurant touches once a
 * month. What they open forty times a shift is "what has to go out now", and
 * that was two clicks away. The menu is still one click away at /food/menu;
 * they have simply swapped places, which is what the external review asked for.
 */
// …for whoever may open it. The kitchen tablet may not read the orders list at
// all, so a fixed redirect would greet it with a locked door every sign-in.
router.get('/', (req, res) => res.redirect(foodPerms.homeFor(req.perms)));

router.get('/menu', async (req, res) => {
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
      saved: req.query.saved === '1',
      // A CODE, not a sentence. The page used to print whatever ?error= said,
      // so a link could put any text on the merchant's own screen.
      errorCode: String(req.query.error || '') || null,
      errorN: toInt(req.query.n, 0),
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
    res.redirect('/food/menu?saved=1');
  } catch (e) {
    console.error('outlet save error:', e.message);
    res.redirect('/food/menu?error=save');
  }
});

router.post('/outlet/:id/toggle', async (req, res) => {
  await pool.query('UPDATE food_outlets SET is_active = NOT is_active WHERE id=$1 AND company_id=$2',
    [toInt(req.params.id, null), req.company.id]);
  res.redirect('/food/menu');
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
  res.redirect('/food/menu?saved=1');
});

/* Deleting a section with food still in it.
 *
 * The foreign key is ON DELETE SET NULL, so the items survived the category and
 * ended up belonging to nothing: still on the books, in no section, invisible on
 * a menu that renders section by section. A restaurant tidying its menu lost
 * dishes without being told.
 *
 * So the merchant has to say what happens to them: move them somewhere, or
 * delete them too. Refusing outright would just make people delete the items
 * one by one first, which is the same decision with more clicks.
 */
router.post('/category/:id/delete', async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, null);
  const moveTo = String((req.body || {}).move_to || '').trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Scoped through the outlet, in the same statement as everything below.
    const cat = (await client.query(
      `SELECT c.id, c.outlet_id FROM food_categories c
        WHERE c.id=$1 AND c.outlet_id IN (SELECT id FROM food_outlets WHERE company_id=$2)`,
      [id, cid])).rows[0];
    if (!cat) { await client.query('ROLLBACK'); return res.redirect('/food/menu'); }

    const n = (await client.query(
      'SELECT COUNT(*)::int AS n FROM food_items WHERE category_id=$1', [id])).rows[0].n;

    if (n > 0) {
      if (moveTo === 'delete') {
        await client.query('DELETE FROM food_items WHERE category_id=$1', [id]);
      } else {
        const target = toInt(moveTo, null);
        // The destination has to be a real section of the SAME outlet — moving
        // a dish to another branch's menu is not a tidy-up, it is a bug.
        const ok = target && (await client.query(
          'SELECT 1 FROM food_categories WHERE id=$1 AND outlet_id=$2 AND id <> $3',
          [target, cat.outlet_id, id])).rowCount;
        if (!ok) {
          await client.query('ROLLBACK');
          return res.redirect('/food/menu?error=cat_has_items&n=' + n + '&cat=' + id);
        }
        await client.query('UPDATE food_items SET category_id=$1 WHERE category_id=$2', [target, id]);
      }
    }
    await client.query('DELETE FROM food_categories WHERE id=$1', [id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[category delete]', e.message);
    return res.redirect('/food/menu?error=save');
  } finally { client.release(); }
  res.redirect('/food/menu?saved=1');
});

/* ─── Items ─────────────────────────────────────────────── */
router.post('/item/add', withImage, async (req, res) => {
  const b = req.body || {};
  const outletId = toInt(b.outlet_id, null);
  if (!outletId || !(await ownsOutlet(req.company.id, outletId))) return res.redirect('/food/menu');
  const image = req.file ? '/uploads/' + req.file.filename : null;
  if (req.file) await compressImage(req.file.path);
  await pool.query(
    `INSERT INTO food_items (outlet_id, category_id, name, name_ar, description, price, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [outletId, toInt(b.category_id, null), (b.name || b.name_ar || '').trim(), (b.name_ar || '').trim() || null,
     (b.description || '').trim() || null, toNum(b.price, 0), image]
  );
  res.redirect('/food/menu?saved=1');
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
  res.redirect('/food/menu?saved=1');
});

router.post('/item/:id/delete', async (req, res) => {
  await pool.query(
    `DELETE FROM food_items WHERE id=$1 AND outlet_id IN (SELECT id FROM food_outlets WHERE company_id=$2)`,
    [toInt(req.params.id, null), req.company.id]
  );
  res.redirect('/food/menu');
});

/* ─── Orders (incoming) ─────────────────────────────────── */
const FOOD_FLOW = ['pending', 'accepted', 'preparing', 'out_for_delivery', 'delivered', 'rejected', 'cancelled'];

/* ─── KDS: the kitchen display ────────────────────────────────────────────
 *
 * The orders screen is built for whoever answers the phone: prices, statuses,
 * a dropdown per order. A kitchen needs the opposite — item, quantity, note,
 * how long it has been waiting, in type big enough to read from two metres
 * away with wet hands. No prices (they are none of the kitchen's business and
 * they crowd the screen) and one button.
 *
 * It refreshes itself, because nobody in a kitchen is going to press F5.
 */
router.get('/kds', async (req, res) => {
  const cid = req.company.id;
  try {
    // Only what is still cooking. Delivered and cancelled belong on the other
    // screen; here they are noise.
    const orders = (await pool.query(
      `SELECT id, status, customer_name, notes, created_at, outlet_id
         FROM food_orders
        WHERE company_id = $1 AND status IN ('pending','accepted','preparing')
        ORDER BY created_at ASC LIMIT 60`, [cid]
    )).rows;
    for (const o of orders) {
      o.items = (await pool.query(
        'SELECT name_snapshot, quantity FROM food_order_items WHERE order_id = $1 ORDER BY id', [o.id]
      )).rows;
    }
    res.render('food_admin/kds', { company: req.company, orders, session: req.session });
  } catch (e) { console.error('[kds]', e.message); res.status(500).send('Error.'); }
});

// The kitchen's one action: this is done, it can go out.
router.post('/kds/:id/ready', async (req, res) => {
  const cid = req.company.id;
  const id = toInt(req.params.id, null);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = (await client.query(
      'SELECT status FROM food_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid])).rows[0];
    if (cur && flow.canMove(FOOD_FLOW, cur.status, 'out_for_delivery').ok) {
      await client.query('UPDATE food_orders SET status=$1, updated_at=now() WHERE id=$2 AND company_id=$3',
        ['out_for_delivery', id, cid]);
      await client.query('INSERT INTO food_order_events (order_id, status, note) VALUES ($1,$2,$3)',
        [id, 'out_for_delivery', 'kds']);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[kds ready]', e.message);
  } finally { client.release(); }
  res.redirect('/food/kds');
});

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
  if (!status) return res.redirect('/food/orders');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // FOR UPDATE, because two people on two screens moving the same order is
    // the normal case in a restaurant, not the rare one.
    const cur = (await client.query(
      'SELECT status FROM food_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid])).rows[0];
    if (!cur) { await client.query('ROLLBACK'); return res.redirect('/food/orders'); }
    // A delivered order that goes back to preparing and forward again is how
    // the pharmacy sold the same stock twice. Same rule here, from the shared
    // module rather than a second copy of the same `if`.
    const move = flow.canMove(FOOD_FLOW, cur.status, status);
    if (!move.ok) {
      await client.query('ROLLBACK');
      return res.redirect('/food/orders?error=' + move.reason);
    }
    await client.query('UPDATE food_orders SET status=$1, updated_at=now() WHERE id=$2 AND company_id=$3',
      [status, id, cid]);
    await client.query('INSERT INTO food_order_events (order_id, status, note) VALUES ($1,$2,$3)',
      [id, status, 'admin']);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[food order status]', e.message);
    return res.redirect('/food/orders?error=save');
  } finally { client.release(); }
  res.redirect('/food/orders');
});

// New-order poll (drives the sound alert on the orders screen).
router.get('/orders/count', async (req, res) => {
  try {
    const n = (await pool.query("SELECT COUNT(*)::int AS n FROM food_orders WHERE company_id=$1 AND status='pending'", [req.company.id])).rows[0].n;
    res.json({ pending: n });
  } catch (e) { res.json({ pending: 0 }); }
});

/* ─── Coupons ───────────────────────────────────────────── */
router.get('/coupons', async (req, res) => {
  const coupons = (await pool.query('SELECT * FROM food_coupons WHERE company_id = $1 ORDER BY id DESC', [req.company.id])).rows;
  res.render('food_admin/coupons', {
    company: req.company, coupons, session: req.session,
    saved: req.query.saved === '1',
    errorCode: String(req.query.error || '') || null,
  });
});

router.post('/coupons/add', async (req, res) => {
  const b = req.body || {};
  const code = (b.code || '').trim().toUpperCase().slice(0, 40);
  if (!code) return res.redirect('/food/coupons?error=no_code');
  try {
    await pool.query(
      `INSERT INTO food_coupons (company_id, code, discount_percent, max_discount, min_order, usage_limit, expires_at, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       ON CONFLICT (company_id, code) DO UPDATE SET
         discount_percent=EXCLUDED.discount_percent, max_discount=EXCLUDED.max_discount,
         min_order=EXCLUDED.min_order, usage_limit=EXCLUDED.usage_limit, expires_at=EXCLUDED.expires_at, is_active=true`,
      // `discount_percent=150` used to be saved as written, and a hundred and
      // fifty percent of a basket is more than the basket. A percentage is
      // 0–100 by definition, and the definition belongs here — on the way in —
      // so no row can hold a number that makes the ordering page do the wrong
      // arithmetic later.
      [req.company.id, code, money.percent(b.discount_percent, 0),
       b.max_discount === '' || b.max_discount == null ? null : money.positive(b.max_discount, 0),
       money.positive(b.min_order, 0), money.count(b.usage_limit, 0), (b.expires_at || '').trim() || null]
    );
    res.redirect('/food/coupons?saved=1');
  } catch (e) { console.error('coupon add error:', e.message); res.redirect('/food/coupons?error=save'); }
});

router.post('/coupons/:id/toggle', async (req, res) => {
  await pool.query('UPDATE food_coupons SET is_active = NOT is_active WHERE id=$1 AND company_id=$2', [toInt(req.params.id, null), req.company.id]);
  res.redirect('/food/coupons');
});

router.post('/coupons/:id/delete', async (req, res) => {
  await pool.query('DELETE FROM food_coupons WHERE id=$1 AND company_id=$2', [toInt(req.params.id, null), req.company.id]);
  res.redirect('/food/coupons');
});

/* ─── AI assistant (paid) — subscription + usage view ───── */
async function loadSub(companyId) {
  try { return (await pool.query('SELECT * FROM food_ai_subscriptions WHERE company_id = $1', [companyId])).rows[0] || null; }
  catch (e) { console.error('ai sub load:', e.message); return null; }
}
function subActive(sub) {
  return Boolean(sub && sub.status === 'active' && (!sub.expires_at || new Date(sub.expires_at).getTime() >= Date.now()));
}

router.get('/ai', async (req, res) => {
  const sub = await loadSub(req.company.id);
  const now = Date.now();
  const active = subActive(sub);
  const expired = sub && sub.status === 'active' && sub.expires_at && new Date(sub.expires_at).getTime() < now;
  res.render('food_admin/ai', {
    company: req.company, session: req.session, sub, active, expired,
  });
});

// Toggle the AI upsell suggestions on/off (merchant control; needs a sub).
router.post('/ai/upsell', async (req, res) => {
  try {
    const on = req.body.upsell_enabled === '1' || req.body.upsell_enabled === 'on';
    await pool.query('UPDATE food_ai_subscriptions SET upsell_enabled = $1 WHERE company_id = $2', [on, req.company.id]);
  } catch (e) { console.error('upsell toggle:', e.message); }
  res.redirect('/food/ai');
});

/* ─── Smart reports (paid) — sales analytics ────────────── */
router.get('/reports', async (req, res) => {
  const cid = req.company.id;
  const sub = await loadSub(cid);
  const active = subActive(sub);
  let data = null;
  if (active) {
    try {
      // Revenue counts money that came in. A rejected order and a cancelled
      // order are the two states where it did not, and they were being summed
      // with the rest — so the report's headline number was the takings PLUS
      // everything the kitchen refused. The item tables below already
      // excluded both, which is how the same page could disagree with itself.
      //
      // The counts stay over ALL orders on purpose: "orders" and "lost" are
      // about how the night went, and hiding the refused ones would answer a
      // different question than the owner is asking.
      const summary = (await pool.query(`
        SELECT COUNT(*)::int AS orders,
               COALESCE(SUM(total) FILTER (WHERE status NOT IN ('rejected','cancelled')),0)::numeric AS revenue,
               COALESCE(AVG(total) FILTER (WHERE status NOT IN ('rejected','cancelled')),0)::numeric AS avg_order,
               COUNT(*) FILTER (WHERE status='delivered')::int AS delivered,
               COUNT(*) FILTER (WHERE status IN ('rejected','cancelled'))::int AS lost,
               COALESCE(SUM(total) FILTER (WHERE status IN ('rejected','cancelled')),0)::numeric AS lost_value
        FROM food_orders WHERE company_id = $1`, [cid])).rows[0];
      const top = (await pool.query(`
        SELECT oi.name_snapshot AS name, SUM(oi.quantity)::int AS qty, COALESCE(SUM(oi.quantity*oi.price),0)::numeric AS revenue
        FROM food_order_items oi JOIN food_orders o ON o.id = oi.order_id
        WHERE o.company_id = $1 AND o.status <> 'rejected' AND o.status <> 'cancelled'
        GROUP BY oi.name_snapshot ORDER BY qty DESC LIMIT 8`, [cid])).rows;
      const bottom = (await pool.query(`
        SELECT oi.name_snapshot AS name, SUM(oi.quantity)::int AS qty
        FROM food_order_items oi JOIN food_orders o ON o.id = oi.order_id
        WHERE o.company_id = $1 AND o.status <> 'rejected' AND o.status <> 'cancelled'
        GROUP BY oi.name_snapshot ORDER BY qty ASC LIMIT 5`, [cid])).rows;
      const hours = (await pool.query(`
        SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Africa/Cairo'))::int AS hour, COUNT(*)::int AS n
        FROM food_orders WHERE company_id = $1 GROUP BY hour ORDER BY n DESC LIMIT 3`, [cid])).rows;
      const byStatus = (await pool.query(`
        SELECT status, COUNT(*)::int AS n FROM food_orders WHERE company_id = $1 GROUP BY status`, [cid])).rows;
      data = { summary, top, bottom, hours, byStatus };
    } catch (e) { console.error('[reports]', e.message); }
  }
  res.render('food_admin/reports', { company: req.company, session: req.session, active, data });
});

/* ─── Shift staff ───────────────────────────────────────── */
/* The cashier, the shift manager, the kitchen tablet, the rider.
 *
 * Before this, all four were the owner's login. A restaurant will not hand a
 * delivery rider the account that holds the menu prices and the day's takings,
 * so in practice the owner had to stand at the till all night — the system was
 * unusable during an actual shift, which is the only time a restaurant uses it.
 *
 * Only the owner reaches this screen (`staff` is owner-only in perms.js): a
 * shift manager promoting itself would undo the whole point.
 */
router.get('/staff', async (req, res) => {
  try {
    const staff = (await pool.query(
      `SELECT id, name, username, perm_role, phone, login_enabled, is_active
         FROM food_staff WHERE company_id=$1 ORDER BY is_active DESC, id`,
      [req.company.id])).rows;
    res.render('food_admin/staff', {
      company: req.company, session: req.session, staff,
      roles: foodPerms.ROLE_KEYS, ROLES: foodPerms.ROLES, pendingOrders: 0,
      saved: req.query.saved === '1',
      errorCode: String(req.query.error || '') || null,
    });
  } catch (e) { console.error('[food staff]', e.message); res.status(500).send('Error.'); }
});

router.post('/staff/add', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 120);
  if (!name) return res.redirect('/food/staff?error=no_name');
  const role = foodPerms.ROLE_KEYS.includes(b.perm_role) ? b.perm_role : 'cashier';
  try {
    await pool.query(
      'INSERT INTO food_staff (company_id, name, perm_role, phone) VALUES ($1,$2,$3,$4)',
      [req.company.id, name, role, String(b.phone || '').trim().slice(0, 30) || null]);
  } catch (e) { console.error('[food staff add]', e.message); return res.redirect('/food/staff?error=save'); }
  res.redirect('/food/staff?saved=1');
});

// Give a row a login, change its role, or take the login away again.
router.post('/staff/:id/login', async (req, res) => {
  const cid = req.company.id, sid = toInt(req.params.id, null);
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase().slice(0, 60);
  const role = foodPerms.ROLE_KEYS.includes(b.perm_role) ? b.perm_role : 'cashier';
  const enabled = b.login_enabled === '1';
  try {
    if (!username) {
      // No username means no account. The row stays as a name on the rota.
      await pool.query(
        'UPDATE food_staff SET username=NULL, password_hash=NULL, login_enabled=false, perm_role=$1 WHERE id=$2 AND company_id=$3',
        [role, sid, cid]);
      return res.redirect('/food/staff?saved=1');
    }
    const password = String(b.password || '');
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE food_staff SET username=$1, password_hash=$2, perm_role=$3, login_enabled=$4 WHERE id=$5 AND company_id=$6',
        [username, hash, role, enabled, sid, cid]);
    } else {
      // A blank password keeps the old one — moving somebody from cashier to
      // shift manager should not require knowing their password.
      await pool.query(
        'UPDATE food_staff SET username=$1, perm_role=$2, login_enabled=$3 WHERE id=$4 AND company_id=$5',
        [username, role, enabled, sid, cid]);
    }
    res.redirect('/food/staff?saved=1');
  } catch (e) {
    console.error('[food staff login]', e.message);
    // The unique index is the only realistic failure here.
    res.redirect('/food/staff?error=username');
  }
});

router.post('/staff/:id/delete', async (req, res) => {
  try {
    await pool.query('DELETE FROM food_staff WHERE id=$1 AND company_id=$2', [toInt(req.params.id, null), req.company.id]);
  } catch (e) { console.error('[food staff delete]', e.message); }
  res.redirect('/food/staff?saved=1');
});

module.exports = router;
