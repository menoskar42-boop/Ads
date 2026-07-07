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
async function sellDirect(client, companyId, items) {
  for (const it of items) {
    await client.query(
      `UPDATE pharmacy_inventory
         SET qty = GREATEST(0, qty - $3), updated_at = now()
       WHERE company_id = $1 AND medicine_id = $2`,
      [companyId, it.medicine_id, it.qty]
    );
  }
}

module.exports = { reserve, release, fulfill, sellDirect };
