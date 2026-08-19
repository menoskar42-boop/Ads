// Manufacturing orders — the piece between the invoice and the van.
//
// A showroom sells a bedroom that does not exist yet. What happens next lived
// on a whiteboard: which pieces are being built, what they still need, and
// which timber has actually come off the shelf for them. The invoice could not
// answer any of it, and neither could the stock screen — the timber only ever
// moved when somebody remembered to type an adjustment.
//
// Three rules shape this file.
//
//  1. **Issuing materials happens exactly once.** The order claims its own
//     issue with a compare-and-swap on a NULL timestamp, so two foremen
//     pressing the button on two phones take the timber off the shelf once,
//     not twice. The button being pressed twice is not a hypothetical: it is
//     what a slow page teaches everybody to do.
//
//  2. **Not knowing is its own answer.** A piece with no bill of materials, or
//     with a component whose material has been deleted, is NOT an order that
//     needs zero timber. Issuing is refused and the screen says which of the
//     two it is — because "تم الصرف" over an empty list is the system telling
//     the workshop its stock is correct when nothing was ever counted.
//
//  3. **Nothing goes below zero, and nothing is silently floored.** Every
//     material comes off its own row with the quantity in the UPDATE's own
//     WHERE. A short material refuses the whole issue and names itself; the
//     workshop then buys, or corrects the count, deliberately.
'use strict';

const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

const STATUSES = ['queued', 'in_progress', 'done', 'cancelled'];
// Still the workshop's problem. `done` and `cancelled` are not.
const OPEN = ['queued', 'in_progress'];

const today = () => new Date().toISOString().slice(0, 10);

/** The moves a status may make. A finished order does not go back to the queue
 *  by pressing a button — that is a new order, and pretending otherwise loses
 *  the fact that the first one was ever finished. */
const NEXT = {
  queued: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

function canMove(from, to) {
  return STATUSES.includes(to) && (NEXT[from] || []).includes(to);
}

/**
 * Is this order late? Computed, never stored.
 *
 * A stored "late" flag is wrong the morning after it is written, and a due
 * date that was never given makes an order that cannot be late — not one that
 * is late today. Both cases are returned apart.
 */
function lateOf(order, ref) {
  if (!order || !OPEN.includes(order.status)) return { late: false, known: true };
  if (!order.due_date) return { late: false, known: false };
  const due = String(order.due_date).slice(0, 10);
  return { late: due < (ref || today()), known: true };
}

/**
 * What this order needs off the shelves, and whether it can have it.
 *
 * @param components rows from the product's bill of materials, each carrying
 *        the material's live `stock_qty`, or a null material_id when the
 *        material behind the line has gone.
 * @param qty how many pieces this order is for.
 *
 * @returns {{state, lines, shortCount, unknownCount}} where `state` is one of
 *   'ready'   — every component is known and on the shelf
 *   'short'   — known, but the shelf does not hold enough
 *   'unknown' — at least one component's material is gone
 *   'no_bom'  — the piece has no components recorded at all
 *
 * 'unknown' and 'no_bom' are deliberately not the same answer, and neither of
 * them is 'ready'. A piece nobody has costed is not a piece that needs nothing.
 */
function planFor(components, qty) {
  const n = Math.max(0, Number(qty) || 0);
  const list = components || [];
  if (!list.length) return { state: 'no_bom', lines: [], shortCount: 0, unknownCount: 0 };

  const lines = [];
  let shortCount = 0, unknownCount = 0;
  for (const c of list) {
    // A component whose material row is gone has no quantity and no shelf.
    // `Number(null)` is 0 and 0 is finite, which is exactly how a missing
    // material becomes "needs nothing, always in stock".
    const known = c.material_id != null && c.stock_qty != null;
    const need = round3((Number(c.qty_required) || 0) * n);
    const stock = known ? round3(Number(c.stock_qty)) : null;
    const short = known ? stock < need : null;
    if (!known) unknownCount += 1; else if (short) shortCount += 1;
    lines.push({
      material_id: c.material_id, name: c.material_name || null, unit: c.unit || null,
      per_unit: round3(Number(c.qty_required) || 0), need, stock, known, short,
    });
  }
  const state = unknownCount ? 'unknown' : shortCount ? 'short' : 'ready';
  return { state, lines, shortCount, unknownCount };
}

/**
 * Take the materials for one order off the shelves. Once.
 *
 * Returns `{ ok: true, lines }` or `{ ok: false, why }` with why one of
 * 'not_found' | 'already' | 'closed' | 'no_bom' | 'unknown' | 'short'.
 * Every refusal leaves the shelves and the order exactly as they were.
 */
async function issue(pool, companyId, orderId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // The claim IS the check. Reading `materials_issued_at` first and writing
    // it after would let two presses both read NULL and both issue.
    const claimed = (await client.query(
      `UPDATE furniture_production_orders SET materials_issued_at = now()
        WHERE id=$1 AND company_id=$2 AND materials_issued_at IS NULL
          AND status = ANY($3::text[])
        RETURNING id, product_id, qty, status`,
      [orderId, companyId, OPEN]
    )).rows[0];

    if (!claimed) {
      await client.query('ROLLBACK');
      // Why it did not claim, answered from the row rather than guessed.
      const row = (await pool.query(
        'SELECT status, materials_issued_at FROM furniture_production_orders WHERE id=$1 AND company_id=$2',
        [orderId, companyId])).rows[0];
      if (!row) return { ok: false, why: 'not_found' };
      if (row.materials_issued_at) return { ok: false, why: 'already' };
      return { ok: false, why: 'closed' };
    }

    const components = (await client.query(
      `SELECT pc.material_id, pc.qty_required, m.name AS material_name, m.unit,
              m.qty AS stock_qty
         FROM furniture_product_components pc
         LEFT JOIN furniture_materials m ON m.id = pc.material_id AND m.company_id = pc.company_id
        WHERE pc.company_id=$1 AND pc.product_id=$2
        ORDER BY pc.id`,
      [companyId, claimed.product_id]
    )).rows;

    const plan = planFor(components, claimed.qty);
    if (plan.state !== 'ready') {
      // The claim is rolled back with everything else: an order that refused to
      // issue must still be issuable once the timber arrives.
      await client.query('ROLLBACK');
      return { ok: false, why: plan.state, plan };
    }

    for (const l of plan.lines) {
      if (!(l.need > 0)) continue;
      // The quantity condition lives in the UPDATE's own WHERE, so two
      // workshops issuing the same timber at the same moment cannot both pass.
      const moved = (await client.query(
        `UPDATE furniture_materials SET qty = qty - $1
          WHERE id=$2 AND company_id=$3 AND qty >= $1 RETURNING id`,
        [l.need, l.material_id, companyId]
      )).rows[0];
      if (!moved) {
        await client.query('ROLLBACK');
        return { ok: false, why: 'short', material: l.name };
      }
      await client.query(
        `INSERT INTO furniture_stock_movements
           (company_id, material_id, move_type, qty, ref_type, ref_id, note)
         VALUES ($1,$2,'out',$3,'production',$4,$5)`,
        [companyId, l.material_id, l.need, orderId, 'MO #' + orderId]
      );
    }

    await client.query('COMMIT');
    return { ok: true, lines: plan.lines.filter((l) => l.need > 0) };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* the connection is going back anyway */ }
    throw e;
  } finally { client.release(); }
}

/**
 * What the screen should say about an order beyond its status.
 *
 * Finishing a piece whose timber never came off the shelf is allowed — a
 * workshop does build from offcuts — but it is never silent: the stock screen
 * would otherwise show timber that is standing in the showroom as a wardrobe.
 */
function notesFor(order) {
  const out = [];
  if (order.status === 'done' && !order.materials_issued_at) out.push('done_unissued');
  if (order.status === 'cancelled' && order.materials_issued_at) out.push('cancelled_issued');
  return out;
}

/** Counts for the board's tabs, computed from the rows the board already has. */
function tally(orders, ref) {
  const t = { open: 0, late: 0, done: 0, cancelled: 0 };
  for (const o of orders || []) {
    if (o.status === 'done') t.done += 1;
    else if (o.status === 'cancelled') t.cancelled += 1;
    else {
      t.open += 1;
      if (lateOf(o, ref).late) t.late += 1;
    }
  }
  return t;
}

module.exports = { STATUSES, OPEN, NEXT, canMove, lateOf, planFor, issue, notesFor, tally, today, round3 };
