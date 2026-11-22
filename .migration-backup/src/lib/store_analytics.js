// Store analytics (competitor phase 29). Lightweight, self-contained visit
// logging + aggregation for the merchant's analytics dashboard. All inserts are
// best-effort and never block a page render.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Bucket a raw referrer URL into a coarse traffic source the merchant cares
// about. Same-host referrers (internal navigation) count as 'direct' so we
// don't inflate the numbers.
function sourceFromReferrer(referrer, selfHost) {
  const ref = String(referrer || '').trim();
  if (!ref) return 'direct';
  let host = '';
  try { host = new URL(ref).hostname.toLowerCase().replace(/^www\./, ''); }
  catch (e) { return 'direct'; }
  if (selfHost && (host === selfHost || host.endsWith('.oscardevs.com'))) return 'direct';
  if (/(^|\.)google\./.test(host) || host.includes('bing.') || host.includes('yahoo') || host.includes('duckduckgo')) return 'search';
  if (host.includes('facebook') || host === 'fb.com' || host.includes('fb.me') || host.includes('l.facebook')) return 'facebook';
  if (host.includes('instagram')) return 'instagram';
  if (host.includes('tiktok')) return 'tiktok';
  if (host.includes('wa.me') || host.includes('whatsapp')) return 'whatsapp';
  if (host.includes('t.co') || host.includes('twitter') || host === 'x.com') return 'twitter';
  if (host.includes('youtube') || host.includes('youtu.be')) return 'youtube';
  return 'referral';
}

// Record a storefront visit. `kind` is 'store' | 'product'. Never throws.
function logVisit(companyId, kind, referrer, selfHost) {
  if (!companyId) return;
  const source = sourceFromReferrer(referrer, selfHost);
  pool.query(
    'INSERT INTO store_visits (company_id, kind, source) VALUES ($1,$2,$3)',
    [companyId, kind === 'product' ? 'product' : 'store', source]
  ).catch((e) => console.error('[store_analytics logVisit]', e.message));
}

// Aggregate the last `days` days for the merchant dashboard.
async function summary(companyId, days) {
  const d = Math.max(1, Math.min(365, parseInt(days, 10) || 30));
  const since = `now() - interval '${d} days'`;
  const [visits, sources, daily, topProducts, orders] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE kind='product')::int AS product_views
                  FROM store_visits WHERE company_id=$1 AND visited_at >= ${since}`, [companyId]),
    pool.query(`SELECT source, COUNT(*)::int AS n FROM store_visits
                 WHERE company_id=$1 AND visited_at >= ${since}
                 GROUP BY source ORDER BY n DESC`, [companyId]),
    pool.query(`SELECT visited_at::date AS day, COUNT(*)::int AS n FROM store_visits
                 WHERE company_id=$1 AND visited_at >= ${since}
                 GROUP BY day ORDER BY day`, [companyId]),
    pool.query(`SELECT p.name, p.sold_count FROM products p
                 WHERE p.company_id=$1 AND p.is_active=true
                 ORDER BY p.sold_count DESC NULLS LAST, p.created_at DESC LIMIT 8`, [companyId]),
    pool.query(`SELECT COUNT(*)::int AS n,
                       COALESCE(SUM(total_amount) FILTER (WHERE status <> 'cancelled'),0) AS revenue
                  FROM orders WHERE company_id=$1 AND created_at >= ${since}`, [companyId]),
  ]);
  const totalVisits = visits.rows[0].total || 0;
  const orderCount = orders.rows[0].n || 0;
  const conversion = totalVisits > 0 ? +(orderCount / totalVisits * 100).toFixed(2) : 0;
  return {
    days: d,
    totalVisits,
    productViews: visits.rows[0].product_views || 0,
    orders: orderCount,
    revenue: Number(orders.rows[0].revenue || 0),
    conversion,
    sources: sources.rows,
    daily: daily.rows,
    topProducts: topProducts.rows,
  };
}

module.exports = { logVisit, sourceFromReferrer, summary };
