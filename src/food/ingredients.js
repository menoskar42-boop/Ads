'use strict';
/**
 * مخزون المكوّنات وتكلفة الطبق.
 *
 * A restaurant does not run out of "burgers", it runs out of buns. And it does
 * not lose money on an order, it loses money on a dish whose ingredients cost
 * more than the menu says. Neither question could be asked before this: stock
 * was tracked per menu item (which nobody counts) and cost was not tracked at
 * all.
 *
 * ── Unknown is not zero ─────────────────────────────────────────────────────
 *
 * If one ingredient in a recipe has no cost recorded, the dish's cost is
 * UNKNOWN — not the sum of the others. A cost that silently omits the meat is
 * worse than no cost at all, because a margin computed from it looks healthy
 * and is not. Every function here returns null for that case and every screen
 * says so.
 *
 * ── Once, and only once ─────────────────────────────────────────────────────
 *
 * Ingredients come off the shelf when an order is placed and go back if it is
 * cancelled. Both are claimed through `food_stock_moves`, which has a unique
 * index on (order_id, kind): a retried request, a double-tapped cancel, or two
 * instances racing all write one row and deduct one time. Without it the
 * kitchen's stock drifts a little every busy night, in the direction nobody
 * notices until they are counting.
 */

/** How much one portion of a dish costs to make, or null when we cannot know. */
function costOf(recipe, byId) {
  const lines = Array.isArray(recipe) ? recipe : [];
  if (!lines.length) return null;              // no recipe = no answer, not zero
  let total = 0;
  for (const l of lines) {
    const ing = byId && byId[l.ingredient_id];
    if (!ing) return null;
    const unit = ing.cost_per_unit;
    if (unit === null || unit === undefined || unit === '') return null;
    const c = Number(unit), q = Number(l.qty);
    if (!Number.isFinite(c) || !Number.isFinite(q)) return null;
    total += c * q;
  }
  return +total.toFixed(3);
}

/** Profit on one portion. Null in, null out — never a made-up margin. */
function marginOf(price, cost) {
  const p = Number(price);
  if (cost === null || cost === undefined || !Number.isFinite(p)) return null;
  const c = Number(cost);
  if (!Number.isFinite(c)) return null;
  const profit = +(p - c).toFixed(3);
  return { profit, percent: p > 0 ? Math.round((profit / p) * 100) : null };
}

/** What one order takes off the shelf, in ingredient totals. */
function needFor(lines, recipesByItem) {
  const need = new Map();
  for (const li of (Array.isArray(lines) ? lines : [])) {
    const recipe = (recipesByItem || {})[li.id] || [];
    const qty = Math.max(0, parseInt(li.qty, 10) || 0);
    for (const r of recipe) {
      const amount = Number(r.qty) * qty;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      need.set(r.ingredient_id, (need.get(r.ingredient_id) || 0) + amount);
    }
  }
  return need;
}

/** Ingredients at or below their minimum. Zero minimum means "not watched". */
function lowStock(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    const min = Number(r.min_qty);
    if (!Number.isFinite(min) || min <= 0) return false;
    return Number(r.stock_qty) <= min;
  });
}

/**
 * Take the ingredients off the shelf for an order — once.
 *
 * The claim is the INSERT: the unique index on (order_id, kind) means the
 * second attempt inserts nothing and this returns `{ok:false, why:'already'}`
 * without touching a single quantity.
 */
async function consume(client, companyId, orderId, need) {
  const claimed = await client.query(
    `INSERT INTO food_stock_moves (company_id, order_id, kind)
     VALUES ($1,$2,'consume') ON CONFLICT DO NOTHING RETURNING id`,
    [companyId, orderId]
  );
  if (!claimed.rows.length) return { ok: false, why: 'already' };
  for (const [ingredientId, amount] of need) {
    // Floored at zero: the food left the kitchen whatever the record said, and
    // a negative shelf helps nobody. The count is what needs fixing, not this.
    await client.query(
      `UPDATE food_ingredients SET stock_qty = GREATEST(0, stock_qty - $3), updated_at = now()
        WHERE id = $1 AND company_id = $2`,
      [ingredientId, companyId, amount]
    );
  }
  return { ok: true, lines: need.size };
}

/** Put them back when an order is cancelled — also once. */
async function restore(client, companyId, orderId, need) {
  const claimed = await client.query(
    `INSERT INTO food_stock_moves (company_id, order_id, kind)
     VALUES ($1,$2,'restore') ON CONFLICT DO NOTHING RETURNING id`,
    [companyId, orderId]
  );
  if (!claimed.rows.length) return { ok: false, why: 'already' };
  for (const [ingredientId, amount] of need) {
    await client.query(
      `UPDATE food_ingredients SET stock_qty = stock_qty + $3, updated_at = now()
        WHERE id = $1 AND company_id = $2`,
      [ingredientId, companyId, amount]
    );
  }
  return { ok: true, lines: need.size };
}

module.exports = { costOf, marginOf, needFor, lowStock, consume, restore };
