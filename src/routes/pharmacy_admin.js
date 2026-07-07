// Pharmacy owner admin area (mounted at /pharmacy).
// Reuses the existing company session (req.session.companyId). Every route
// requires a logged-in company whose page_type is 'pharmacy'.
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const requireLogin = require('../middleware/auth');
const stock = require('../pharmacy/stock');
const push = require('../lib/push');

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
    if (!r.rows.length || r.rows[0].page_type !== 'pharmacy') {
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
router.get('/inventory', gate('inventory'), async (req, res) => {
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
router.post('/inventory/add', gate('inventory'), async (req, res) => {
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

router.post('/inventory/:id/update', gate('inventory'), async (req, res) => {
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

/* ─── POS (point of sale) ───────────────────────────────── */
router.get('/pos', gate('pos'), (req, res) => {
  res.render('pharmacy_admin/pos', { company: req.company, session: req.session });
});

// JSON search over this pharmacy's stock — used by the POS and (later) the
// barcode scanner. Matches Arabic/English name or barcode.
router.get('/api/inventory-search', gate('pos'), async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const rows = (await pool.query(
      `SELECT pi.medicine_id, pi.price, GREATEST(pi.qty - pi.reserved_qty,0) AS available,
              m.name_ar, m.name_en
       FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
       WHERE pi.company_id = $1 AND (
         m.name_ar ILIKE $2 OR m.name_en ILIKE $2 OR pi.barcode = $3 OR m.barcode = $3)
       ORDER BY m.name_ar LIMIT 30`,
      [req.company.id, '%' + q + '%', q]
    )).rows;
    res.json(rows);
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
    await stock.sellDirect(client, cid, lines);
    const sale = (await client.query(
      `INSERT INTO pharmacy_sales (company_id, kind, total_amount, profit, staff_id) VALUES ($1,'sale',$2,$3,$4) RETURNING id`,
      [cid, total, profit, req.session.staffId || null]
    )).rows[0];
    for (const l of lines) {
      await client.query(
        `INSERT INTO pharmacy_sale_items (sale_id, medicine_id, name, qty, price, cost) VALUES ($1,$2,$3,$4,$5,$6)`,
        [sale.id, l.medicine_id, l.name, l.qty, l.price, l.cost]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, total, profit });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('pos checkout error:', e.message);
    res.status(500).json({ ok: false, error: 'server' });
  } finally {
    client.release();
  }
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
    const items = (await client.query(
      'SELECT medicine_id, qty FROM pharmacy_order_items WHERE order_id = $1', [oid]
    )).rows.filter(i => i.medicine_id);

    if (next === 'delivered' && prev !== 'delivered' && !['rejected', 'cancelled'].includes(prev)) {
      await stock.fulfill(client, cid, items);
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
