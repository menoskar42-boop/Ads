// Product reviews (Amazon roadmap phase 4). Keeps products.avg_rating +
// review_count in sync from approved reviews, and gates who may review.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Recompute + cache the product's rating aggregates from approved reviews.
async function recompute(productId) {
  try {
    await pool.query(
      `UPDATE products p SET
         review_count = COALESCE(s.n, 0),
         avg_rating   = COALESCE(s.avg, 0)
       FROM (SELECT COUNT(*) AS n, ROUND(AVG(rating)::numeric, 2) AS avg
             FROM product_reviews WHERE product_id = $1 AND is_approved = true) s
       WHERE p.id = $1`,
      [productId]
    );
  } catch (e) { console.error('[reviews recompute]', e.message); }
}

// The customer bought this product (has a matching order_item) → may review once.
async function hasPurchased(customerId, productId) {
  if (!customerId || !productId) return null;
  try {
    const r = await pool.query(
      `SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = $1 AND oi.product_id = $2 ORDER BY o.id DESC LIMIT 1`,
      [customerId, productId]
    );
    return r.rows.length ? r.rows[0].id : null;
  } catch (e) { return null; }
}

async function existingReview(customerId, productId) {
  if (!customerId || !productId) return null;
  try {
    const r = await pool.query('SELECT id, rating FROM product_reviews WHERE customer_id = $1 AND product_id = $2', [customerId, productId]);
    return r.rows[0] || null;
  } catch (e) { return null; }
}

// Load approved reviews + a 5..1 star breakdown for the product page.
async function forProduct(productId, limit) {
  try {
    const [list, breakdown] = await Promise.all([
      pool.query(
        `SELECT r.rating, r.title, r.body, r.author_name, r.is_verified, r.created_at,
                c.full_name AS customer_name
         FROM product_reviews r LEFT JOIN customers c ON c.id = r.customer_id
         WHERE r.product_id = $1 AND r.is_approved = true
         ORDER BY r.created_at DESC LIMIT $2`,
        [productId, limit || 20]
      ),
      pool.query(
        `SELECT rating, COUNT(*)::int n FROM product_reviews
         WHERE product_id = $1 AND is_approved = true GROUP BY rating`,
        [productId]
      ),
    ]);
    const stars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    breakdown.rows.forEach((b) => { stars[b.rating] = b.n; });
    return {
      reviews: list.rows.map((r) => ({
        rating: r.rating, title: r.title, body: r.body,
        author: r.author_name || r.customer_name || 'عميل',
        verified: r.is_verified, created_at: r.created_at,
      })),
      breakdown: stars,
    };
  } catch (e) { console.error('[reviews forProduct]', e.message); return { reviews: [], breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }; }
}

module.exports = { recompute, hasPurchased, existingReview, forProduct };
