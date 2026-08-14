'use strict';
/**
 * Batches (تشغيلات) — the lot a box actually came from.
 *
 * The inventory row is one row per medicine with one expiry and one cost. A
 * pharmacy does not work that way: the same medicine arrives in lots, each with
 * its own number, its own expiry and its own price from the supplier. Without
 * lots there is no answer to "which batch is this box", no way to pull a
 * recalled lot off the shelf, no way to sell the nearest-expiry stock first,
 * and no true cost per sale.
 *
 * Two decisions shape everything here.
 *
 * **Batches are a detail layer, not a replacement.** `pharmacy_inventory.qty`
 * stays the number the till, the storefront and the reservations read. A
 * pharmacy that does not track lots has no batch rows and behaves exactly as it
 * did before this file existed. That is what keeps a schema change of this size
 * from touching every query in the product.
 *
 * **FEFO, not FIFO.** Nearest expiry first, not first received. For medicine
 * these give different answers and only one of them is right: a box received
 * last month that expires next week must leave before one received today that
 * expires next year. Batches with no expiry date go last — an unknown date is
 * not an early one.
 *
 * Every function takes a live pg client so the caller can run it inside the
 * same transaction as the sale it belongs to.
 */

/**
 * Write down a lot that arrived. Does NOT touch the aggregate.
 *
 * The existing "add stock" form already upserts `pharmacy_inventory.qty` along
 * with the price, the cost and the photo, so the lot is recorded beside that
 * rather than adding the quantity a second time. `receive()` below is the
 * version for callers that have no aggregate write of their own.
 */
async function record(client, companyId, medicineId, b) {
  const qty = Math.max(0, parseInt(b && b.qty, 10) || 0);
  if (!qty) return null;
  const row = (await client.query(
    `INSERT INTO pharmacy_batches (company_id, medicine_id, batch_no, expiry, qty, cost, supplier)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [companyId, medicineId,
      (b.batch_no || '').trim().slice(0, 60) || null,
      b.expiry || null, qty,
      b.cost == null || b.cost === '' ? null : Number(b.cost),
      (b.supplier || '').trim().slice(0, 120) || null]
  )).rows[0];
  await syncExpiry(client, companyId, medicineId);
  return row;
}

/** Record the lot AND add its quantity to the aggregate. */
async function receive(client, companyId, medicineId, b) {
  const row = await record(client, companyId, medicineId, b);
  if (!row) return null;
  // The aggregate has to move with it, or the shelf and the till disagree.
  await client.query(
    `INSERT INTO pharmacy_inventory (company_id, medicine_id, qty)
     VALUES ($1,$2,$3)
     ON CONFLICT (company_id, medicine_id) DO UPDATE
       SET qty = pharmacy_inventory.qty + EXCLUDED.qty, updated_at = now()`,
    [companyId, medicineId, row.qty]
  );
  await syncExpiry(client, companyId, medicineId);
  return row;
}

/**
 * Mirror the nearest sellable expiry onto the inventory row.
 *
 * The expiry alerts, the storefront and the near-expiry report all read
 * `pharmacy_inventory.expiry`, and with lots in play the meaningful date is the
 * earliest one still on the shelf. Keeping the mirror in step means those
 * screens get MORE accurate without any of them learning about batches.
 *
 * A recalled lot is excluded: it is not going to be sold, so its date is not
 * the one the pharmacist should be warned about.
 */
async function syncExpiry(client, companyId, medicineId) {
  await client.query(
    `UPDATE pharmacy_inventory pi
        SET expiry = COALESCE((
              SELECT MIN(b.expiry) FROM pharmacy_batches b
               WHERE b.company_id = pi.company_id AND b.medicine_id = pi.medicine_id
                 AND b.status = 'active' AND b.qty > 0 AND b.expiry IS NOT NULL
            ), pi.expiry),
            updated_at = now()
      WHERE pi.company_id = $1 AND pi.medicine_id = $2
        AND EXISTS (SELECT 1 FROM pharmacy_batches b2
                     WHERE b2.company_id = pi.company_id AND b2.medicine_id = pi.medicine_id
                       AND b2.status = 'active' AND b2.qty > 0)`,
    [companyId, medicineId]
  );
}

/**
 * Take `qty` off the batches, nearest expiry first.
 *
 * Does NOT touch the aggregate — the caller already does that (stock.fulfill,
 * stock.sellDirect), and doing it twice would double the deduction. This only
 * says WHICH lots the quantity came out of.
 *
 * Returns `{ lines, tracked, untracked }`. `untracked` is the part of the sale
 * no batch covered: a pharmacy that started tracking lots halfway through has
 * stock on the shelf that predates the batch records, and pretending otherwise
 * would either refuse a real sale or invent a lot number. It is reported, not
 * hidden.
 */
async function consumeFEFO(client, companyId, medicineId, qty) {
  let left = Math.max(0, parseInt(qty, 10) || 0);
  const lines = [];
  if (!left) return { lines, tracked: 0, untracked: 0 };

  // Locked in dispensing order so two tills cannot hand out the same box. The
  // order of the lock is the order of the index, which is what stops a deadlock
  // between two tills selling the same two medicines.
  const batches = (await client.query(
    `SELECT id, qty, cost, expiry, batch_no FROM pharmacy_batches
      WHERE company_id = $1 AND medicine_id = $2 AND status = 'active' AND qty > 0
      ORDER BY expiry NULLS LAST, id
      FOR UPDATE`,
    [companyId, medicineId]
  )).rows;

  for (const b of batches) {
    if (!left) break;
    const take = Math.min(left, Number(b.qty) || 0);
    if (!take) continue;
    // company_id again, even though the id came from the scoped SELECT above:
    // the rule in this codebase is that the scope lives in the SAME statement,
    // and a rule with one careful exception is a rule nobody applies.
    await client.query(
      'UPDATE pharmacy_batches SET qty = qty - $1 WHERE id = $2 AND company_id = $3',
      [take, b.id, companyId]);
    lines.push({ batch_id: b.id, batch_no: b.batch_no, expiry: b.expiry, qty: take, cost: b.cost });
    left -= take;
  }

  const tracked = lines.reduce((s, l) => s + l.qty, 0);
  if (tracked) await syncExpiry(client, companyId, medicineId);
  return { lines, tracked, untracked: left };
}

/** Write down which lots a sale came out of — the record a recall reads. */
async function recordSale(client, companyId, ref, medicineId, lines) {
  for (const l of lines || []) {
    await client.query(
      `INSERT INTO pharmacy_sale_batches (company_id, batch_id, medicine_id, sale_id, order_id, qty, cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [companyId, l.batch_id, medicineId,
        (ref && Number.isInteger(ref.saleId)) ? ref.saleId : null,
        (ref && Number.isInteger(ref.orderId)) ? ref.orderId : null,
        l.qty, l.cost == null ? null : Number(l.cost)]
    );
  }
}

/**
 * Consume and record in one call — what a sale actually wants.
 * Never throws the sale away: a batch failure must not lose the money line.
 */
async function dispense(client, companyId, ref, items) {
  const out = [];
  for (const it of items || []) {
    const mid = parseInt(it.medicine_id, 10);
    if (!Number.isInteger(mid)) continue;
    const r = await consumeFEFO(client, companyId, mid, it.qty);
    if (r.lines.length) await recordSale(client, companyId, ref, mid, r.lines);
    out.push(Object.assign({ medicine_id: mid }, r));
  }
  return out;
}

/**
 * Pull a lot off the shelf.
 *
 * The batch is NOT deleted and its quantity is NOT zeroed: those boxes are
 * physically in the pharmacy, they still have to be counted, and they have to
 * go back to the supplier. What changes is that they stop being sellable — so
 * the aggregate drops by exactly what the lot still holds, and the lot keeps
 * its number for the return.
 *
 * Scoped through company_id in the same statement, so a batch id from the
 * address bar cannot reach another pharmacy's shelf.
 */
async function recall(client, companyId, batchId, note) {
  const b = (await client.query(
    `UPDATE pharmacy_batches
        SET status = 'recalled', recall_note = $3
      WHERE id = $1 AND company_id = $2 AND status = 'active'
      RETURNING medicine_id, qty`,
    [batchId, companyId, (note || '').slice(0, 300) || null]
  )).rows[0];
  if (!b) return null;
  if (b.qty > 0) {
    await client.query(
      `UPDATE pharmacy_inventory SET qty = GREATEST(0, qty - $3), updated_at = now()
        WHERE company_id = $1 AND medicine_id = $2`,
      [companyId, b.medicine_id, b.qty]
    );
  }
  await syncExpiry(client, companyId, b.medicine_id);
  return b;
}

/** Who we sold a recalled lot to — the question a recall actually is. */
async function soldFrom(client, companyId, batchId) {
  return (await client.query(
    `SELECT sb.qty, sb.created_at, sb.sale_id, sb.order_id,
            o.customer_name, o.customer_phone
       FROM pharmacy_sale_batches sb
       LEFT JOIN pharmacy_orders o ON o.id = sb.order_id AND o.company_id = sb.company_id
      WHERE sb.company_id = $1 AND sb.batch_id = $2
      ORDER BY sb.created_at DESC LIMIT 500`,
    [companyId, batchId]
  )).rows;
}

/**
 * One medicine's lots, plus the part of its stock no lot covers.
 *
 * The untracked figure is the honest half of this feature. A pharmacy that
 * starts tracking lots today has shelves full of stock that predates the
 * records, and a screen that showed only the tracked total would read as though
 * the rest had vanished.
 */
async function forMedicine(client, companyId, medicineId) {
  const rows = (await client.query(
    `SELECT * FROM pharmacy_batches
      WHERE company_id = $1 AND medicine_id = $2
      ORDER BY status, expiry NULLS LAST, id`,
    [companyId, medicineId]
  )).rows;
  const agg = (await client.query(
    'SELECT qty, reserved_qty, expiry FROM pharmacy_inventory WHERE company_id=$1 AND medicine_id=$2',
    [companyId, medicineId]
  )).rows[0] || { qty: 0, reserved_qty: 0, expiry: null };
  const tracked = rows.filter((r) => r.status === 'active').reduce((s, r) => s + (Number(r.qty) || 0), 0);
  return {
    batches: rows,
    total: Number(agg.qty) || 0,
    reserved: Number(agg.reserved_qty) || 0,
    tracked,
    untracked: Math.max(0, (Number(agg.qty) || 0) - tracked),
  };
}

module.exports = {
  record, receive, consumeFEFO, recordSale, dispense, recall, soldFrom, forMedicine, syncExpiry,
};
