// Reservation-aware stock operations, shared by the public order flow and the
// pharmacy admin. Availability is always (qty - reserved_qty): stock held for
// an online order is reserved so it isn't sold again at the POS counter
// (owner's requirement #14).
//
// Each helper takes a live pg client (so callers can run them inside a single
// transaction) plus a companyId and an items array of { medicine_id, qty }.

// Hold stock for a new online order.
async function reserve(client, companyId, items) {
  for (const it of items) {
    await client.query(
      `UPDATE pharmacy_inventory
         SET reserved_qty = LEAST(qty, reserved_qty + $3), updated_at = now()
       WHERE company_id = $1 AND medicine_id = $2`,
      [companyId, it.medicine_id, it.qty]
    );
  }
}

// Release a hold without moving stock (order rejected/cancelled).
async function release(client, companyId, items) {
  for (const it of items) {
    await client.query(
      `UPDATE pharmacy_inventory
         SET reserved_qty = GREATEST(0, reserved_qty - $3), updated_at = now()
       WHERE company_id = $1 AND medicine_id = $2`,
      [companyId, it.medicine_id, it.qty]
    );
  }
}

// Stock actually leaves (order delivered / POS sale of reserved stock):
// decrement qty and drop the hold.
async function fulfill(client, companyId, items) {
  for (const it of items) {
    await client.query(
      `UPDATE pharmacy_inventory
         SET qty = GREATEST(0, qty - $3),
             reserved_qty = GREATEST(0, reserved_qty - $3),
             updated_at = now()
       WHERE company_id = $1 AND medicine_id = $2`,
      [companyId, it.medicine_id, it.qty]
    );
  }
}

// Direct counter sale (no prior reservation): decrement qty only.
/**
 * Take stock off the shelf for a sale that already happened.
 *
 * `GREATEST(0, …)` is deliberate and stays: an offline sale is a fact — the
 * customer walked out with the box — so refusing it would only make the
 * database disagree with the shelf in the other direction. But flooring at zero
 * SILENTLY is how a pharmacy ends up with a stock figure nobody trusts: the
 * system said 3, two tills sold 2 each, and the difference evaporated.
 *
 * So the shortfall is returned. The caller decides what to do with it; the
 * offline sync marks the sale for review, which is the only honest outcome —
 * somebody has to go and count that shelf.
 *
 * @returns {Array<{medicine_id, wanted, had, short}>} lines that oversold.
 */
async function sellDirect(client, companyId, items) {
  const short = [];
  for (const it of items) {
    // RETURNING gives the NEW value, so the old one is read in the same
    // statement through a CTE — a separate SELECT before the UPDATE would race
    // with the other till, which is the whole scenario this measures.
    const r = await client.query(
      `WITH cur AS (
         SELECT qty FROM pharmacy_inventory
          WHERE company_id = $1 AND medicine_id = $2 FOR UPDATE
       ), upd AS (
         UPDATE pharmacy_inventory
            SET qty = GREATEST(0, qty - $3), updated_at = now()
          WHERE company_id = $1 AND medicine_id = $2
          RETURNING qty AS after_qty
       )
       SELECT cur.qty AS before_qty, upd.after_qty FROM cur, upd`,
      [companyId, it.medicine_id, it.qty]
    );
    const row = r.rows[0];
    if (!row) {
      // Not in this pharmacy's inventory at all — the whole quantity is short.
      short.push({ medicine_id: it.medicine_id, wanted: it.qty, had: 0, short: it.qty });
      continue;
    }
    const before = Number(row.before_qty) || 0;
    if (before < it.qty) {
      short.push({ medicine_id: it.medicine_id, wanted: it.qty, had: before, short: it.qty - before });
    }
  }
  return short;
}

module.exports = { reserve, release, fulfill, sellDirect };
