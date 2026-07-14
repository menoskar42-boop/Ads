// Back-in-stock notifier (Amazon roadmap phase 18). Finds pending
// notifications whose product is now in stock, emails the subscriber, and marks
// them notified. Best-effort — never throws. Run periodically + after restocks.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let mailer = null;
try { mailer = require('./mailer'); } catch (e) { /* email optional */ }

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://oscardevs.com';

async function checkAndNotify() {
  let rows = [];
  try {
    rows = (await pool.query(
      `SELECT n.id, n.email, p.name, p.name_ar, c.slug
       FROM stock_notifications n
       JOIN products p ON p.id = n.product_id
       JOIN companies c ON c.id = p.company_id
       WHERE n.notified = false AND n.notify_on = 'back_in_stock' AND p.stock > 0 AND p.is_active = true
       LIMIT 200`
    )).rows;
  } catch (e) { return { sent: 0 }; }
  let sent = 0;
  for (const r of rows) {
    const name = r.name_ar || r.name;
    const url = `${SITE_ORIGIN}/shop/${r.slug}/product/${r.id}`;
    try {
      if (mailer && mailer.sendMail) {
        await mailer.sendMail({
          to: r.email,
          subject: `المنتج «${name}» رجع متاح`,
          html: `<div dir="rtl" style="font-family:sans-serif"><p>المنتج اللي طلبت نبلّغك عنه رجع متوفّر:</p><p><a href="${url}">${name}</a></p></div>`,
          text: `${name} رجع متاح: ${url}`,
        });
      }
      await pool.query('UPDATE stock_notifications SET notified = true WHERE id = $1', [r.id]);
      sent++;
    } catch (e) { /* skip this one */ }
  }
  return { sent };
}

module.exports = { checkAndNotify };
