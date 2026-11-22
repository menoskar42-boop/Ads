// Bill of materials: what each piece is made of, and what that costs.
//
// The cost used here is the material's MOVING AVERAGE (avg_cost), not its last
// purchase price. The average is what the timber on the floor is actually worth;
// pricing a wardrobe off the newest invoice would show a margin the workshop
// does not have the moment prices move.
//
// One honesty rule runs through this file: material cost is NOT total cost.
// Labour, finishing and overhead are not in it, so what the components produce
// is a MATERIAL margin. Calling it profit would tell a workshop it is making
// money on a piece it may well be losing on, so nothing here uses that word.
'use strict';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Cost one product from its components.
 *
 * @param components rows with qty_required, material avg_cost / qty / name
 * @returns {{cost:number, unknown:number, buildable:number|null, lines:Array}}
 *   `unknown` counts components whose material has gone (archived away or
 *   deleted). They are reported, never counted as zero: a missing price that
 *   silently costs nothing makes every piece look more profitable than it is.
 */
function costOf(components) {
  let cost = 0, unknown = 0;
  let buildable = null;
  const lines = [];

  for (const c of components || []) {
    const need = Number(c.qty_required) || 0;
    const known = c.material_id != null && c.avg_cost != null;
    const unitCost = known ? Number(c.avg_cost) : null;
    const lineCost = known ? round2(need * unitCost) : null;

    if (known) cost += lineCost; else unknown += 1;

    // How many complete pieces the current stock allows. A component needing
    // nothing cannot limit anything, so it is skipped rather than dividing by 0.
    if (known && need > 0) {
      const can = Math.floor((Number(c.stock_qty) || 0) / need);
      buildable = buildable == null ? can : Math.min(buildable, can);
    }

    lines.push({ ...c, unit_cost: unitCost, line_cost: lineCost, known });
  }

  return { cost: round2(cost), unknown, buildable, lines };
}

/**
 * Material margin for one product.
 *
 * `costed` is false when the product has no components at all — then the
 * showroom's own typed estimate is the only figure there is, and the page must
 * say which of the two it is showing rather than quietly mixing them.
 */
function marginOf(sellingPrice, materialCost, hasComponents) {
  const price = Number(sellingPrice) || 0;
  const cost = Number(materialCost) || 0;
  const margin = round2(price - cost);
  return {
    price: round2(price),
    cost: round2(cost),
    margin,
    // A percentage of a zero price is meaningless, not zero.
    percent: price > 0 ? Math.round((margin / price) * 1000) / 10 : null,
    costed: !!hasComponents,
  };
}

/** Components of one product, with each material's live cost and stock. */
async function componentsOf(pool, companyId, productId) {
  const r = await pool.query(
    `SELECT pc.id, pc.material_id, pc.qty_required,
            m.name AS material_name, m.unit, m.avg_cost, m.qty AS stock_qty
       FROM furniture_product_components pc
       LEFT JOIN furniture_materials m ON m.id = pc.material_id
      WHERE pc.company_id=$1 AND pc.product_id=$2
      ORDER BY pc.id`,
    [companyId, productId]
  );
  return r.rows;
}

/**
 * Every product with its computed material cost, in one pass.
 * Done in SQL rather than N queries because a catalogue of a few hundred pieces
 * would otherwise be a few hundred round trips to draw one list.
 */
async function productCosts(pool, companyId) {
  const r = await pool.query(
    `SELECT p.id, p.name, p.category, p.selling_price, p.estimated_cost,
            COALESCE(c.n, 0)::int AS component_count,
            COALESCE(c.cost, 0)   AS material_cost,
            COALESCE(c.unknown, 0)::int AS unknown_count
       FROM furniture_products p
       LEFT JOIN (
         SELECT pc.product_id,
                COUNT(*) AS n,
                SUM(pc.qty_required * COALESCE(m.avg_cost, 0)) AS cost,
                COUNT(*) FILTER (WHERE m.id IS NULL) AS unknown
           FROM furniture_product_components pc
           LEFT JOIN furniture_materials m ON m.id = pc.material_id
          WHERE pc.company_id = $1
          GROUP BY pc.product_id
       ) c ON c.product_id = p.id
      WHERE p.company_id = $1 AND p.is_active
      ORDER BY p.name`,
    [companyId]
  );
  return r.rows.map((p) => ({
    ...p,
    ...marginOf(p.selling_price, p.component_count ? p.material_cost : p.estimated_cost, p.component_count > 0),
  }));
}

module.exports = { round2, costOf, marginOf, componentsOf, productCosts };
