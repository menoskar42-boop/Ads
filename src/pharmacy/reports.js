'use strict';
/**
 * The three reports a pharmacy actually runs on: what sells, what does not, and
 * what was lost.
 *
 * ── The one rule that decides whether any of them are true ──────────────────
 *
 * A return is a row in `pharmacy_sales` with `kind='return'`, and — this is the
 * part that catches everybody — its ITEM rows carry POSITIVE quantities. The
 * direction lives in `kind`, not in the sign of the line (the header carries
 * the signed money). So the obvious `SUM(si.qty)` counts a box that came back
 * over the counter as a box that was sold:
 *
 *   · «أكثر مبيعاً» promotes a medicine that customers keep returning;
 *   · «راكد» thinks a shelf is moving when the only movement was a refund.
 *
 * Every query here therefore nets the direction explicitly. It is written the
 * same way in all three so the rule is one thing to learn, and the guard
 * script fails if any of them stops doing it.
 *
 * The queries live here rather than inline in the route so that the rule is in
 * one file, and so the check can read them.
 */

/** A reporting window a person chose, kept inside something sensible. */
function windowDays(v, dflt) {
  const n = parseInt(v, 10);
  const d = Number.isFinite(dflt) ? dflt : 30;
  if (!Number.isFinite(n)) return d;
  return Math.min(365, Math.max(1, n));
}

/**
 * The direction of a line, as SQL. A sale adds, a return subtracts, and
 * anything else (there is nothing else today) adds — a new `kind` that means
 * "out of stock but not sold" would have to say so here.
 */
const NET_QTY = "SUM(CASE WHEN s.kind = 'return' THEN -si.qty ELSE si.qty END)";
const NET_MONEY = "SUM(CASE WHEN s.kind = 'return' THEN -(si.qty * si.price) ELSE si.qty * si.price END)";

/** أكثر مبيعاً — by boxes that stayed sold, over a window. */
const topSellers = `
  SELECT si.medicine_id,
         COALESCE(m.name_ar, m.name_en, si.name) AS name,
         ${NET_QTY}::int      AS qty,
         ${NET_MONEY}::numeric AS revenue
    FROM pharmacy_sale_items si
    JOIN pharmacy_sales s ON s.id = si.sale_id
    LEFT JOIN medicines m ON m.id = si.medicine_id
   WHERE s.company_id = $1 AND s.created_at >= now() - ($2 || ' days')::interval
   GROUP BY si.medicine_id, COALESCE(m.name_ar, m.name_en, si.name)
  HAVING ${NET_QTY} > 0
   ORDER BY qty DESC
   LIMIT 50`;

/**
 * راكد — on the shelf, and nothing left it in the window.
 *
 * A medicine that never sold at all belongs here, so the sales side is a
 * NOT EXISTS rather than a join: an item with no rows to join to would simply
 * vanish from the report that exists to find it.
 */
const slowMoving = `
  SELECT inv.medicine_id,
         COALESCE(m.name_ar, m.name_en) AS name,
         GREATEST(inv.qty - inv.reserved_qty, 0)::int AS available,
         inv.cost,
         (SELECT MAX(s.created_at) FROM pharmacy_sale_items si
            JOIN pharmacy_sales s ON s.id = si.sale_id
           WHERE s.company_id = inv.company_id AND si.medicine_id = inv.medicine_id
             AND s.kind <> 'return') AS last_sold
    FROM pharmacy_inventory inv
    JOIN medicines m ON m.id = inv.medicine_id
   WHERE inv.company_id = $1
     AND GREATEST(inv.qty - inv.reserved_qty, 0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM pharmacy_sale_items si
         JOIN pharmacy_sales s ON s.id = si.sale_id
        WHERE s.company_id = inv.company_id
          AND si.medicine_id = inv.medicine_id
          AND s.kind <> 'return'
          AND s.created_at >= now() - ($2 || ' days')::interval)
   ORDER BY available DESC
   LIMIT 100`;

/**
 * هالك — two different losses, in one list.
 *
 *  · a return the pharmacist did NOT put back on the shelf (an opened box, a
 *    fridge item that spent the afternoon in a car);
 *  · a batch that expired with stock still on it.
 *
 * They are separate rows with a `source` column rather than one merged number,
 * because the two have different cures: one is a counter decision, the other is
 * ordering too much.
 */
const waste = `
  (SELECT 'return'::text AS source,
          s.created_at   AS at,
          COALESCE(m.name_ar, m.name_en, si.name) AS name,
          si.qty::int    AS qty,
          si.cost        AS cost,
          s.reason       AS note
     FROM pharmacy_sales s
     JOIN pharmacy_sale_items si ON si.sale_id = s.id
     LEFT JOIN medicines m ON m.id = si.medicine_id
    WHERE s.company_id = $1 AND s.kind = 'return' AND s.restock = false
      AND s.created_at >= now() - ($2 || ' days')::interval)
  UNION ALL
  (SELECT 'expired'::text AS source,
          b.expiry::timestamptz AS at,
          COALESCE(m.name_ar, m.name_en) AS name,
          b.qty::int   AS qty,
          b.cost       AS cost,
          b.batch_no   AS note
     FROM pharmacy_batches b
     LEFT JOIN medicines m ON m.id = b.medicine_id
    WHERE b.company_id = $1 AND b.qty > 0
      AND b.expiry IS NOT NULL AND b.expiry < CURRENT_DATE)
  ORDER BY at DESC
  LIMIT 200`;

/** What the waste cost, split by where it came from. A missing cost is zero. */
function wasteTotals(rows) {
  const out = { returns: 0, expired: 0, total: 0, units: 0 };
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const qty = Math.max(0, parseInt(r.qty, 10) || 0);
    const cost = Number(r.cost);
    const value = Number.isFinite(cost) ? cost * qty : 0;
    out.units += qty;
    if (r.source === 'expired') out.expired += value; else out.returns += value;
  }
  out.returns = +out.returns.toFixed(2);
  out.expired = +out.expired.toFixed(2);
  out.total = +(out.returns + out.expired).toFixed(2);
  return out;
}

module.exports = { windowDays, topSellers, slowMoving, waste, wasteTotals, NET_QTY, NET_MONEY };
