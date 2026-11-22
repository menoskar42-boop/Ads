// Purchase orders and receiving.
//
// Receiving is the only place in the system where stock, cost and supplier debt
// all move at once, so it is the one place that must not half-happen. Every
// receipt runs in a transaction: the material's quantity, its costs, the stock
// movement row and the order's status either all land or none do. A quantity
// that rose without a movement behind it is a stock figure with no story, and
// nobody can ever work out afterwards where it came from.
'use strict';

const STATUSES = ['pending', 'partial', 'delivered', 'cancelled'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Order value, and the value of what has actually arrived.
 *
 * Rounded like every other money function in this folder. Three metres at 0.10
 * summed to 0.30000000000000004 here; the views hide it because they format to
 * two decimals, but the raw number was leaving this module and any future
 * caller that compares it to zero or stores it would inherit the noise.
 */
function orderTotals(items) {
  let ordered = 0, received = 0;
  for (const it of items || []) {
    ordered += Number(it.qty) * Number(it.unit_cost);
    received += Number(it.qty_received) * Number(it.unit_cost);
  }
  return { ordered: round2(ordered), received: round2(received) };
}

/** Status implied by the lines. Cancelled is a decision, not a calculation. */
function statusFromItems(items) {
  const rows = items || [];
  if (!rows.length) return 'pending';
  const anyReceived = rows.some((i) => Number(i.qty_received) > 0);
  const allReceived = rows.every((i) => Number(i.qty_received) >= Number(i.qty));
  if (allReceived) return 'delivered';
  return anyReceived ? 'partial' : 'pending';
}

/**
 * Moving average cost after a receipt.
 *
 * Averaging matters because the same timber bought at three prices is one pile
 * on the floor. Valuing it at the newest price would overstate stock the moment
 * prices rise, and understate the margin on everything already built from the
 * cheaper batch.
 */
function newAvgCost(oldQty, oldAvg, recvQty, unitCost) {
  const q0 = Math.max(0, Number(oldQty) || 0);
  const q1 = Number(recvQty) || 0;
  if (q1 <= 0) return Number(oldAvg) || 0;
  // No stock to average against — the arriving price simply becomes the cost.
  if (q0 <= 0) return Number(unitCost) || 0;
  const total = q0 * (Number(oldAvg) || 0) + q1 * (Number(unitCost) || 0);
  return total / (q0 + q1);
}

/**
 * Receive quantities against one order.
 *
 * @param deltas Map of item id -> quantity that arrived NOW (not cumulative).
 *               A line is skipped when its delta is zero or negative.
 * @returns {{lines:number, qty:number}} what was actually applied
 */
async function receive(pool, companyId, poId, deltas) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const po = (await client.query(
      'SELECT * FROM furniture_purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE',
      [poId, companyId]
    )).rows[0];
    if (!po) throw new Error('order not found');
    // Receiving against a cancelled order would put stock in from a delivery
    // the workshop has already decided is not happening.
    if (po.status === 'cancelled') throw new Error('order is cancelled');

    const items = (await client.query(
      'SELECT * FROM furniture_purchase_order_items WHERE po_id=$1 AND company_id=$2 ORDER BY id',
      [poId, companyId]
    )).rows;

    let lines = 0, totalQty = 0;
    for (const it of items) {
      const asked = Number(deltas[String(it.id)]);
      if (!Number.isFinite(asked) || asked <= 0) continue;

      // Never receive more than was ordered on the line. An over-delivery is a
      // real event, but silently inflating the order hides it; the workshop
      // should raise a second order rather than have this one quietly grow.
      const remaining = Number(it.qty) - Number(it.qty_received);
      const qty = Math.min(asked, Math.max(0, remaining));
      if (qty <= 0) continue;

      await client.query(
        'UPDATE furniture_purchase_order_items SET qty_received = qty_received + $1 WHERE id=$2 AND company_id=$3',
        [qty, it.id, companyId]
      );

      if (it.material_id) {
        const m = (await client.query(
          'SELECT qty, avg_cost FROM furniture_materials WHERE id=$1 AND company_id=$2 FOR UPDATE',
          [it.material_id, companyId]
        )).rows[0];
        if (m) {
          const avg = newAvgCost(m.qty, m.avg_cost, qty, it.unit_cost);
          await client.query(
            `UPDATE furniture_materials
                SET qty = qty + $1, last_purchase_price = $2, avg_cost = $3
              WHERE id=$4 AND company_id=$5`,
            [qty, it.unit_cost, avg, it.material_id, companyId]
          );
          await client.query(
            `INSERT INTO furniture_stock_movements
               (company_id, material_id, move_type, qty, ref_type, ref_id, note)
             VALUES ($1,$2,'in',$3,'purchase_order',$4,$5)`,
            [companyId, it.material_id, qty, poId, 'PO #' + poId]
          );
        }
      }
      lines += 1; totalQty += qty;
    }

    if (lines) {
      const after = (await client.query(
        'SELECT qty, qty_received FROM furniture_purchase_order_items WHERE po_id=$1 AND company_id=$2',
        [poId, companyId]
      )).rows;
      await client.query(
        'UPDATE furniture_purchase_orders SET status=$1 WHERE id=$2 AND company_id=$3',
        [statusFromItems(after), poId, companyId]
      );
    }

    await client.query('COMMIT');
    return { lines, qty: totalQty };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * What each supplier is owed.
 *
 * Deliberately the value RECEIVED, not the value ordered: an order placed but
 * not delivered is not yet a debt, and counting it would show a workshop owing
 * money for timber still sitting at the sawmill.
 */
async function supplierBalances(pool, companyId) {
  const r = await pool.query(
    `SELECT s.id, s.name,
            COALESCE(recv.value, 0)  AS received,
            COALESCE(pay.total, 0)   AS paid,
            COALESCE(recv.value, 0) - COALESCE(pay.total, 0) AS balance
       FROM furniture_suppliers s
       LEFT JOIN (
         SELECT po.supplier_id, SUM(i.qty_received * i.unit_cost) AS value
           FROM furniture_purchase_orders po
           JOIN furniture_purchase_order_items i ON i.po_id = po.id
          WHERE po.company_id = $1 AND po.status <> 'cancelled'
          GROUP BY po.supplier_id
       ) recv ON recv.supplier_id = s.id
       LEFT JOIN (
         SELECT supplier_id, SUM(amount) AS total
           FROM furniture_supplier_payments WHERE company_id = $1 GROUP BY supplier_id
       ) pay ON pay.supplier_id = s.id
      WHERE s.company_id = $1 AND s.is_active
      ORDER BY balance DESC, s.name`,
    [companyId]
  );
  return r.rows;
}

module.exports = { STATUSES, orderTotals, statusFromItems, newAvgCost, receive, supplierBalances };
