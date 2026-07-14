// Deals / Deal of the Day (Amazon roadmap phase 10). An active deal discounts a
// product's price by discount_pct until ends_at. Used for storefront display and
// enforced at checkout so the customer actually pays the deal price.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Map of productId -> { discount_pct, ends_at } for a company's currently-active
// deals (is_active + not expired). Never throws.
async function activeDealsMap(companyId) {
  const map = {};
  if (!companyId) return map;
  try {
    const r = await pool.query(
      `SELECT product_id, discount_pct, ends_at FROM deals
       WHERE company_id=$1 AND is_active=true AND (ends_at IS NULL OR ends_at > now())`,
      [companyId]
    );
    r.rows.forEach((d) => { map[d.product_id] = { discount_pct: d.discount_pct, ends_at: d.ends_at }; });
  } catch (e) { /* none */ }
  return map;
}

// The active deal for one product (checkout enforcement). Never throws.
async function dealForProduct(companyId, productId) {
  try {
    const r = await pool.query(
      `SELECT discount_pct, ends_at FROM deals
       WHERE company_id=$1 AND product_id=$2 AND is_active=true AND (ends_at IS NULL OR ends_at > now())
       ORDER BY discount_pct DESC LIMIT 1`,
      [companyId, productId]
    );
    return r.rows[0] || null;
  } catch (e) { return null; }
}

function applyPct(price, pct) {
  const p = Number(price) || 0;
  const d = Math.max(0, Math.min(90, Number(pct) || 0));
  return +(p * (1 - d / 100)).toFixed(2);
}

module.exports = { activeDealsMap, dealForProduct, applyPct };
