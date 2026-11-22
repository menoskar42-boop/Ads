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
      `SELECT n.id, n.email, p.id AS product_id, p.name, p.name_ar, c.slug
       FROM stock_notifications n
       JOIN products p ON p.id = n.product_id
       JOIN companies c ON c.id = p.company_id
       WHERE n.notified = false AND n.notify_on = 'back_in_stock' AND p.stock > 0 AND p.is_active = true
       LIMIT 200`
    )).rows;
  } catch (e) { return { sent: 0 }; }
  /* No mailer configured is not "nothing to do" — it is "cannot do it". The
     rows stay pending so they go out when email is configured, instead of being
     marked done in silence. Said once per run, not once per row. */
  if (!mailer || !mailer.sendMail) {
    if (rows.length) console.warn(`[stock_notifier] ${rows.length} pending alert(s) but no mailer configured — left pending.`);
    return { sent: 0, pending: rows.length };
  }
  let sent = 0, failed = 0;
  for (const r of rows) {
    const name = r.name_ar || r.name;
    // r.product_id, not r.id: r.id is the NOTIFICATION's id, so every one of
    // these links pointed at whatever product happened to share that number —
    // or at a 404. The email arrived and still did not do its job.
    const url = `${SITE_ORIGIN}/shop/${r.slug}/product/${r.product_id}`;
    try {
      await mailer.sendMail({
        to: r.email,
        subject: `المنتج «${name}» رجع متاح`,
        html: `<div dir="rtl" style="font-family:sans-serif"><p>المنتج اللي طلبت نبلّغك عنه رجع متوفّر:</p><p><a href="${url}">${name}</a></p></div>`,
        text: `${name} رجع متاح: ${url}`,
      });
    } catch (e) {
      /* The mail did not go. Marking it notified anyway is how a customer who
         asked to be told never gets told, and the row that would have told them
         is gone. Leave it pending and try again next run. */
      failed++;
      console.error('[stock_notifier] send failed for', r.email, '-', e.message);
      continue;
    }
    // Only after the send succeeded.
    try {
      await pool.query('UPDATE stock_notifications SET notified = true WHERE id = $1', [r.id]);
      sent++;
    } catch (e) {
      /* Sent but not recorded: the customer may get a second email next run.
         That is the right way round — a duplicate is an annoyance, a silence is
         a lost sale. */
      console.error('[stock_notifier] sent but could not mark id', r.id, '-', e.message);
    }
  }
  if (failed) console.warn(`[stock_notifier] ${failed} alert(s) failed and stay pending.`);
  return { sent, failed };
}

module.exports = { checkAndNotify };
