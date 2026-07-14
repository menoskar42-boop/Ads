// Shipping zones by governorate (Amazon roadmap phase 12).
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getZones(companyId) {
  if (!companyId) return [];
  try {
    return (await pool.query(
      'SELECT * FROM shipping_zones WHERE company_id=$1 AND is_active=true ORDER BY governorate',
      [companyId]
    )).rows;
  } catch (e) { return []; }
}

async function zoneFor(companyId, governorate) {
  if (!companyId || !governorate) return null;
  try {
    return (await pool.query(
      'SELECT * FROM shipping_zones WHERE company_id=$1 AND governorate=$2 AND is_active=true',
      [companyId, String(governorate).slice(0, 60)]
    )).rows[0] || null;
  } catch (e) { return null; }
}

// Shipping cost for a zone given the (post-discount) subtotal. Free over threshold.
function costFor(zone, subtotal) {
  if (!zone) return 0;
  if (zone.free_over != null && Number(subtotal) >= Number(zone.free_over)) return 0;
  return Number(zone.cost) || 0;
}

module.exports = { getZones, zoneFor, costFor };
