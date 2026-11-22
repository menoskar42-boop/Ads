// Gym membership expiry alerts (the core of the idea: never lose a renewal).
// Once a day, push each gym owner a summary of members whose membership expires
// within the next 3 days, so they can nudge them to renew.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const push = require('./push');

async function runExpiryAlerts() {
  try {
    const rows = (await pool.query(`
      SELECT company_id, COUNT(DISTINCT member_id)::int AS n
      FROM gym_memberships
      WHERE status='active' AND end_date >= CURRENT_DATE AND end_date <= CURRENT_DATE + 3
      GROUP BY company_id`)).rows;
    for (const r of rows) {
      push.sendToCompany(r.company_id, {
        title: '⏳ اشتراكات قرب تنتهي',
        body: `عندك ${r.n} عضو اشتراكه بينتهي خلال 3 أيام — ذكّرهم بالتجديد`,
        url: '/gym',
      }, 'order').catch(() => {});
    }
    if (rows.length) console.log(`[gym_alerts] notified ${rows.length} gym(s) of expiring memberships`);
  } catch (e) {
    console.error('[gym_alerts]', e.message);
  }
}

module.exports = { runExpiryAlerts };
