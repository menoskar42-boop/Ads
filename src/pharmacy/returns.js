'use strict';
/**
 * Returns (مرتجعات) — the box that came back over the counter.
 *
 * A pharmacy takes returns every day and there was nowhere to record one. So
 * the day's takings counted money that had already been handed back, and the
 * shelf count stayed short of a box that was standing on the shelf. Two numbers
 * wrong, quietly, every day, in opposite directions.
 *
 * Three decisions shape this file.
 *
 * **A return is a sale row with kind='return'.** Not a separate table. The
 * takings are then a plain SUM that nets itself, and every screen that already
 * reads sales keeps working. The header carries signed money — a return's
 * total and profit are negative — while the item rows carry positive
 * quantities and `kind` says which way the boxes went.
 *
 * **You cannot return more than was sold.** The quantity available to return is
 * the sale's own line minus everything already returned against it, computed in
 * the same transaction under a lock. Otherwise two tills refunding the same
 * sale at once each see "2 left" and hand back four.
 *
 * **Not every return goes back on the shelf.** An opened box, or a fridge item
 * that spent an afternoon in a car, is a loss — not stock. The pharmacist says
 * which, per return. Getting this wrong in the generous direction puts unsafe
 * medicine back on sale, so `restock` is a decision and never a default that
 * happens to be convenient.
 */

/**
 * What is still returnable on a sale, line by line.
 *
 * Locks the sale so the answer cannot go stale between reading it and writing
 * the return — two tills refunding the same receipt is exactly the case this
 * has to survive.
 */
async function returnable(client, companyId, saleId, opts) {
  const lock = opts && opts.lock ? ' FOR UPDATE' : '';
  const sale = (await client.query(
    `SELECT id, kind, total_amount, profit, created_at
       FROM pharmacy_sales
      WHERE id = $1 AND company_id = $2 AND kind = 'sale'` + lock,
    [saleId, companyId]
  )).rows[0];
  if (!sale) return null;

  const sold = (await client.query(
    `SELECT medicine_id, name, SUM(qty)::int AS qty,
            MAX(price) AS price, MAX(cost) AS cost
       FROM pharmacy_sale_items WHERE sale_id = $1
      GROUP BY medicine_id, name`,
    [saleId]
  )).rows;

  // Everything already sent back against this sale, whether it was restocked or
  // written off — a written-off return still used up the customer's right to
  // return that box.
  const back = (await client.query(
    `SELECT si.medicine_id, SUM(si.qty)::int AS qty
       FROM pharmacy_sale_items si
       JOIN pharmacy_sales s ON s.id = si.sale_id
      WHERE s.company_id = $1 AND s.ref_sale_id = $2 AND s.kind = 'return'
      GROUP BY si.medicine_id`,
    [companyId, saleId]
  )).rows;
  const already = new Map(back.map((r) => [r.medicine_id, Number(r.qty) || 0]));

  return {
    sale,
    lines: sold.map((l) => {
      const done = already.get(l.medicine_id) || 0;
      return {
        medicine_id: l.medicine_id,
        name: l.name,
        price: Number(l.price) || 0,
        cost: Number(l.cost) || 0,
        sold: Number(l.qty) || 0,
        returned: done,
        left: Math.max(0, (Number(l.qty) || 0) - done),
      };
    }),
  };
}

/**
 * Put returned boxes back into the lots they came out of.
 *
 * Which matters more than it looks: a returned box belongs to ITS lot, with its
 * own expiry. Adding it to whichever lot happens to be first would give a box
 * an expiry date it does not have — and since dispensing is nearest-expiry
 * first, that date decides who gets it next.
 *
 * Newest movement first, so a return undoes the most recent dispense.
 */
async function restockBatches(client, companyId, saleId, medicineId, qty) {
  let left = qty;
  const moved = (await client.query(
    `SELECT id, batch_id, qty, cost FROM pharmacy_sale_batches
      WHERE company_id = $1 AND sale_id = $2 AND medicine_id = $3 AND batch_id IS NOT NULL AND qty > 0
      ORDER BY created_at DESC, id DESC`,
    [companyId, saleId, medicineId]
  )).rows;

  for (const m of moved) {
    if (!left) break;
    // Only as much as this movement actually took, minus anything a previous
    // return already put back against it.
    const backAlready = Number((await client.query(
      `SELECT COALESCE(SUM(-qty),0)::int AS n FROM pharmacy_sale_batches
        WHERE company_id = $1 AND batch_id = $2 AND sale_id = $3 AND qty < 0`,
      [companyId, m.batch_id, saleId]
    )).rows[0].n) || 0;
    const room = Math.max(0, (Number(m.qty) || 0) - backAlready);
    const take = Math.min(left, room);
    if (!take) continue;
    await client.query(
      'UPDATE pharmacy_batches SET qty = qty + $1 WHERE id = $2 AND company_id = $3',
      [take, m.batch_id, companyId]
    );
    // A negative movement row: the trail reads forwards and backwards, and the
    // recall list still adds up.
    await client.query(
      `INSERT INTO pharmacy_sale_batches (company_id, batch_id, medicine_id, sale_id, qty, cost)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [companyId, m.batch_id, medicineId, saleId, -take, m.cost]
    );
    left -= take;
  }
  return { restored: qty - left, untracked: left };
}

/**
 * Record a return. Everything, or it does not happen — the caller supplies the
 * transaction.
 *
 * @param lines [{ medicine_id, qty }]
 * @returns { id, total, lines } or { error }
 */
async function record(client, companyId, saleId, opts) {
  const o = opts || {};
  const state = await returnable(client, companyId, saleId, { lock: true });
  if (!state) return { error: 'not_found' };

  const byId = new Map(state.lines.map((l) => [l.medicine_id, l]));
  const take = [];
  for (const raw of o.lines || []) {
    const mid = parseInt(raw.medicine_id, 10);
    const qty = Math.max(0, parseInt(raw.qty, 10) || 0);
    if (!qty || !Number.isInteger(mid)) continue;
    const line = byId.get(mid);
    if (!line) return { error: 'not_on_sale' };
    // The check that makes the whole thing trustworthy, inside the lock.
    if (qty > line.left) return { error: 'too_many', name: line.name, left: line.left };
    take.push({ line, qty });
  }
  if (!take.length) return { error: 'empty' };

  const restock = o.restock !== false;
  let total = 0, profit = 0;
  for (const t of take) {
    total += t.line.price * t.qty;
    profit += (t.line.price - t.line.cost) * t.qty;
  }

  // Negative: money leaving the till, and profit that was never earned.
  const ret = (await client.query(
    `INSERT INTO pharmacy_sales (company_id, kind, total_amount, profit, staff_id, ref_sale_id, restock, reason)
     VALUES ($1,'return',$2,$3,$4,$5,$6,$7) RETURNING id`,
    [companyId, -total, -profit, Number.isInteger(o.staffId) ? o.staffId : null,
      saleId, restock, (o.reason || '').slice(0, 300) || null]
  )).rows[0];

  const detail = [];
  for (const t of take) {
    await client.query(
      'INSERT INTO pharmacy_sale_items (sale_id, medicine_id, name, qty, price, cost) VALUES ($1,$2,$3,$4,$5,$6)',
      [ret.id, t.line.medicine_id, t.line.name, t.qty, t.line.price, t.line.cost]
    );
    if (restock) {
      // Back on the shelf: the aggregate, and the lot it came from.
      await client.query(
        `UPDATE pharmacy_inventory SET qty = qty + $3, updated_at = now()
          WHERE company_id = $1 AND medicine_id = $2`,
        [companyId, t.line.medicine_id, t.qty]
      );
      const r = await restockBatches(client, companyId, saleId, t.line.medicine_id, t.qty);
      detail.push(Object.assign({ medicine_id: t.line.medicine_id, qty: t.qty }, r));
    } else {
      detail.push({ medicine_id: t.line.medicine_id, qty: t.qty, restored: 0, untracked: 0 });
    }
  }

  return { id: ret.id, total, profit, restock, lines: detail };
}

module.exports = { returnable, record, restockBatches };
