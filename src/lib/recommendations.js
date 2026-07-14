// Product recommendations (Amazon roadmap phase 5).
//  - "اشترى الناس أيضاً" = products that co-occur in the same orders.
//  - "قد يعجبك" = top sellers in the same category (fallback / fill).
// Results cached in-memory for 24h per product (keyed productId).

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map(); // productId -> { at, items }

function shape(rows) {
  return rows.map((r) => ({ id: r.id, name: r.name_ar || r.name, price: Number(r.price) || 0, image: r.image_url || '' }));
}

async function boughtTogether(productId, companyId, limit) {
  const r = await pool.query(
    `SELECT p.id, p.name, p.name_ar, p.price, p.image_url, COUNT(*) AS freq
     FROM order_items oi1
     JOIN order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.product_id <> oi1.product_id
     JOIN products p ON p.id = oi2.product_id
     WHERE oi1.product_id = $1 AND p.company_id = $2 AND p.is_active = true
     GROUP BY p.id ORDER BY freq DESC, p.sold_count DESC NULLS LAST LIMIT $3`,
    [productId, companyId, limit]
  );
  return r.rows;
}

async function topInCategory(companyId, categoryId, excludeId, limit) {
  const r = await pool.query(
    `SELECT id, name, name_ar, price, image_url FROM products
     WHERE company_id = $1 AND is_active = true AND id <> $2
       AND ($3::int IS NULL OR category_id = $3)
     ORDER BY sold_count DESC NULLS LAST, review_count DESC NULLS LAST, created_at DESC LIMIT $4`,
    [companyId, excludeId, categoryId || null, limit]
  );
  return r.rows;
}

// Up to `limit` recommendations: co-bought first, filled with category top-sellers.
async function forProduct(product, limit) {
  const want = limit || 6;
  const key = 'p' + product.id;
  const hit = cache.get(key);
  if (hit && (Date.now() - hit.at) < TTL_MS) return hit.items;
  let items = [];
  try {
    const co = await boughtTogether(product.id, product.company_id, want);
    const seen = new Set([product.id]);
    co.forEach((r) => { if (!seen.has(r.id)) { seen.add(r.id); items.push(r); } });
    if (items.length < want) {
      const fill = await topInCategory(product.company_id, product.category_id, product.id, want * 2);
      for (const r of fill) { if (items.length >= want) break; if (!seen.has(r.id)) { seen.add(r.id); items.push(r); } }
    }
  } catch (e) { console.error('[recommendations]', e.message); }
  const out = shape(items.slice(0, want));
  cache.set(key, { at: Date.now(), items: out });
  return out;
}

module.exports = { forProduct };
