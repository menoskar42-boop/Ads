// Recurring subscriptions (competitor phase 32). COD-style renewals: a daily
// job turns each due subscription into a normal pending order, decrements stock,
// and advances next_renewal by interval_days. No payment gateway required — the
// merchant fulfils and collects like any cash-on-delivery order.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const push = require('./push');

// Create a subscription for a logged-in customer. Returns the new id or null.
async function subscribe({ companyId, customerId, product, quantity, ship }) {
  const qty = Math.max(1, Math.min(50, parseInt(quantity, 10) || 1));
  const base = Number(product.price);
  const pct = Number(product.sub_discount_pct || 0);
  const unit = +(base * (1 - pct / 100)).toFixed(2);
  const days = Math.max(1, parseInt(product.sub_interval_days, 10) || 30);
  const r = await pool.query(
    `INSERT INTO subscriptions
       (company_id, customer_id, product_id, quantity, unit_price, interval_days, status, next_renewal, ship_name, ship_phone, ship_address)
     VALUES ($1,$2,$3,$4,$5,$6,'active', (CURRENT_DATE + ($6 || ' days')::interval)::date, $7,$8,$9)
     RETURNING id`,
    [companyId, customerId, product.id, qty, unit, days, ship.name || null, ship.phone || null, ship.address || null]
  );
  return r.rows[0] ? r.rows[0].id : null;
}

// Process one due subscription inside its own transaction: create the order,
/* Tell the merchant. Best-effort and never awaited: a renewal must not fail
   because a push did. */
function notify(sub, title, body) {
  try {
    require('./push').sendToCompany(sub.company_id,
      { title: '🔁 ' + title, body, url: '/company/subscriptions' }, 'order').catch(() => {});
  } catch (e) { /* push optional */ }
}

// decrement stock, advance the date. Returns 'ordered' | 'skipped' | 'error'.
async function renewOne(sub) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Re-check the product is active + has stock for the quantity.
    const prod = (await client.query(
      'SELECT id, name, price FROM products WHERE id=$1 AND company_id=$2 AND is_active=true FOR UPDATE',
      [sub.product_id, sub.company_id]
    )).rows[0];
    if (!prod) {
      /* The product is gone or switched off. Retrying every run forever, in
       * silence, is not a decision — it is the absence of one. The subscription
       * is paused and the merchant is told, because only they can decide
       * whether to point the customer at something else or refund them. */
      await client.query("UPDATE subscriptions SET status='paused' WHERE id=$1", [sub.id]);
      await client.query('COMMIT');
      notify(sub, 'المنتج مابقاش متاح', 'الاشتراك اتوقّف مؤقتاً — كلّم العميل أو رشّح له بديل');
      return 'skipped';
    }
    const dec = await client.query(
      'UPDATE products SET stock = stock - $1 WHERE id=$2 AND stock >= $1 RETURNING id',
      [sub.quantity, sub.product_id]
    );
    if (!dec.rows.length) {
      /* Out of stock on the day.
       *
       * The old behaviour pushed the renewal a WHOLE interval forward and said
       * nothing. A monthly subscriber whose product was out of stock that
       * morning lost the entire month — the shop restocked the next day and the
       * order still did not go out until the month after. Neither the customer
       * nor the merchant was told; the only trace was a line in a log.
       *
       * Now it retries TOMORROW, so a restock the next day still serves the
       * customer, and the merchant is told today that a renewal is waiting on
       * stock. Retrying tomorrow rather than every hour is what the interval
       * push was really for.
       */
      await client.query(
        "UPDATE subscriptions SET next_renewal = (CURRENT_DATE + 1) WHERE id=$1",
        [sub.id]
      );
      await client.query('COMMIT');
      notify(sub, 'اشتراك مستني مخزون', `«${prod.name}» خلص — فيه اشتراك متجدّد مستني، جهّزه واحنا هنعيد المحاولة بكرة`);
      return 'skipped';
    }
    const total = +(Number(sub.unit_price) * sub.quantity).toFixed(2);
    const ord = await client.query(
      `INSERT INTO orders (company_id, customer_id, customer_name, customer_phone, customer_email,
                           shipping_address, total_amount, status, notes, payment_method)
       VALUES ($1,$2,$3,$4,NULL,$5,$6,'pending',$7,'cod') RETURNING id`,
      [sub.company_id, sub.customer_id, sub.ship_name || 'اشتراك', sub.ship_phone || '',
       sub.ship_address || '', total, 'طلب اشتراك متكرر']
    );
    const orderId = ord.rows[0].id;
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
       VALUES ($1,$2,$3,$4,$5)`,
      [orderId, prod.id, prod.name, sub.unit_price, sub.quantity]
    );
    await client.query(
      "INSERT INTO order_status_history (order_id, status, note) VALUES ($1,'pending','طلب اشتراك تلقائي')",
      [orderId]
    );
    await client.query(
      "UPDATE subscriptions SET last_order_at = now(), next_renewal = (CURRENT_DATE + (interval_days || ' days')::interval)::date WHERE id=$1",
      [sub.id]
    );
    await client.query('COMMIT');
    push.sendToCompany(sub.company_id, {
      title: '🔁 طلب اشتراك جديد',
      body: `تجديد اشتراك: ${prod.name} ×${sub.quantity}`,
      url: '/company/orders',
    }, 'order').catch(() => {});
    return 'ordered';
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[subscriptions renewOne]', e.message);
    return 'error';
  } finally {
    client.release();
  }
}

// Run all subscriptions due today. Safe to call repeatedly (idempotent per day
// because renewOne advances next_renewal past today).
async function runDueRenewals() {
  let ordered = 0, skipped = 0, errors = 0;
  try {
    const due = (await pool.query(
      "SELECT * FROM subscriptions WHERE status='active' AND next_renewal <= CURRENT_DATE ORDER BY id LIMIT 500"
    )).rows;
    for (const sub of due) {
      const r = await renewOne(sub);
      if (r === 'ordered') ordered++;
      else if (r === 'skipped') skipped++;
      else errors++;
    }
    if (due.length) console.log(`[subscriptions] renewals: ${ordered} ordered, ${skipped} skipped, ${errors} errors`);
  } catch (e) {
    console.error('[subscriptions runDueRenewals]', e.message);
  }
  return { ordered, skipped, errors };
}

module.exports = { subscribe, renewOne, runDueRenewals };
