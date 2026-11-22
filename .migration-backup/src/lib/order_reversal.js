'use strict';
/**
 * Cancelling an order gave the customer nothing back.
 *
 * Placing one takes four things: money out of the wallet, points off the
 * balance, points added as a reward, and stock off the shelf. Cancelling it
 * flipped a status column and stopped there. So a customer who paid 200 from
 * their wallet and then had the order cancelled was simply 200 poorer, with no
 * record of it anywhere and nothing on any screen to explain it.
 *
 * Three rules shape this file.
 *
 * **Reverse everything or nothing.** All four moves happen in one transaction
 * with the status change. Returning the wallet but not the stock is a different
 * wrong state, not a smaller one.
 *
 * **Exactly once.** A merchant clicking cancel twice, or moving cancelled →
 * pending → cancelled, must not refund twice. The order carries a flag that is
 * set in the same statement that reads it, so the second attempt finds nothing
 * to do.
 *
 * **Reverse what the order actually recorded**, not what today's prices or
 * today's rules would give. The order stored `wallet_used`, `points_redeemed`
 * and `points_earned` when it was placed; those are the numbers that move back.
 */

/** Statuses that mean the goods are not going to the customer. */
const REVERSING = ['cancelled', 'refunded', 'returned'];

function isReversing(status) {
  return REVERSING.includes(String(status || '').toLowerCase());
}

/**
 * Undo an order's effects. Caller supplies the client and the transaction.
 *
 * @returns {{ done:boolean, wallet:number, pointsBack:number, pointsTaken:number, items:number }}
 *          `done:false` means it was already reversed and nothing moved.
 */
async function reverse(client, companyId, orderId) {
  /* The flag is set in the SAME statement that reads it, so two concurrent
   * cancels cannot both see "not yet reversed". A read followed by a write
   * would refund twice under exactly the double-click this exists to survive. */
  const o = (await client.query(
    `UPDATE orders
        SET reversed_at = now()
      WHERE id = $1 AND company_id = $2 AND reversed_at IS NULL
      RETURNING customer_id, wallet_used, points_redeemed, points_earned`,
    [orderId, companyId]
  )).rows[0];
  if (!o) return { done: false, wallet: 0, pointsBack: 0, pointsTaken: 0, items: 0 };

  const wallet = Number(o.wallet_used) || 0;
  const pointsBack = Number(o.points_redeemed) || 0;
  const pointsTaken = Number(o.points_earned) || 0;

  if (o.customer_id) {
    if (wallet > 0) {
      await client.query(
        'UPDATE customers SET wallet_balance = wallet_balance + $1 WHERE id = $2',
        [wallet, o.customer_id]
      );
    }
    // Points spent come back; points earned for a purchase that did not happen
    // go away. Floored at zero because a customer who already spent the reward
    // must not be pushed into a negative balance by a later cancellation.
    if (pointsBack || pointsTaken) {
      await client.query(
        'UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points + $1 - $2) WHERE id = $3',
        [pointsBack, pointsTaken, o.customer_id]
      );
    }
  }

  // Back on the shelf, and the movement is recorded rather than the earlier one
  // being erased — the history has to read forwards.
  const items = (await client.query(
    'SELECT product_id, quantity FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL',
    [orderId]
  )).rows;
  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    if (!qty) continue;
    await client.query(
      'UPDATE products SET stock = stock + $1 WHERE id = $2 AND company_id = $3',
      [qty, it.product_id, companyId]
    );
    await client.query(
      `INSERT INTO stock_movements (product_id, company_id, change_amount, reason, order_id)
       VALUES ($1, $2, $3, 'cancel', $4)`,
      [it.product_id, companyId, qty, orderId]
    );
  }

  return { done: true, wallet, pointsBack, pointsTaken, items: items.length };
}

module.exports = { REVERSING, isReversing, reverse };
