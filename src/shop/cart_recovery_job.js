'use strict';
/**
 * The job that sends the abandoned-cart reminders.
 *
 * Two properties matter more than anything else here, because these are real
 * emails to real customers from the merchant's name:
 *
 * 1. **Never twice.** Autoscale runs more than one instance, each with its own
 *    timer, so "did I already send this?" cannot be answered in memory. The row
 *    is claimed with a compare-and-swap on the attempt count — the same shape as
 *    the quote that becomes one invoice and the offline sale that posts once.
 *    Exactly one instance gets the row back; the other gets nothing and moves on.
 *
 * 2. **Never lie about it.** A send that failed is written down as `failed`
 *    with the reason, not left looking sent. The panel shows that reason, so a
 *    merchant with a broken SMTP setup finds out from the screen instead of
 *    from a quiet month.
 *
 * Everything fails soft: one shop's error never stops the others, and the job
 * never throws into the timer that called it.
 */

let mailer = null;
try { mailer = require('../lib/mailer'); } catch (_) { /* email optional */ }
const R = require('./cart_recovery');

const SITE_ORIGIN = () => (process.env.SITE_ORIGIN || 'https://oscardevs.com').replace(/\/+$/, '');

/**
 * The cart page the customer can actually open.
 *
 * Deliberately NOT `https://<slug>.oscardevs.com/cart`, tempting as that is:
 * the cart routes are mounted under `/shop/:slug` on the main origin, and a
 * reminder that links to an address which does not serve the cart is worse
 * than no reminder — the customer clicked, found nothing, and is gone. A wrong
 * link in a message to a customer is a real problem, not a typo (CLAUDE.md).
 */
function cartUrl(slug) {
  return `${SITE_ORIGIN()}/shop/${encodeURIComponent(slug)}/cart`;
}

/**
 * Send every reminder that is due right now.
 *
 * `opts.send` exists so the guard script can drive this whole function — the
 * claim, the failure path, the recording — against a fake sender. A rule about
 * never double-sending that is only asserted by reading the source is a rule
 * nobody has actually tested.
 *
 * @param {import('pg').Pool} pool
 * @param {{now?: Date, limit?: number, send?: Function}} [opts]
 */
async function runDue(pool, opts = {}) {
  const stats = { considered: 0, sent: 0, failed: 0, skipped: 0, shops: 0 };
  const now = opts.now instanceof Date ? opts.now : new Date();
  const limit = Number(opts.limit) || 200;

  let rows = [];
  try {
    // Only shops that switched it on. The join is what makes "off by default"
    // free: a merchant with no settings row is not in this result at all.
    rows = (await pool.query(
      `SELECT a.id, a.company_id, a.customer_name, a.items_summary, a.total, a.item_count,
              a.updated_at, a.reminder_state, a.reminder_at, a.reminder_attempts,
              cu.email AS customer_email,
              c.slug, c.company_name,
              s.enabled, s.delay_minutes, s.cooldown_days, s.max_attempts,
              s.subject, s.body, s.coupon_code
         FROM abandoned_carts a
         JOIN cart_recovery_settings s ON s.company_id = a.company_id AND s.enabled = true
         JOIN companies c ON c.id = a.company_id AND c.is_active = true
         LEFT JOIN customers cu ON cu.id = a.customer_id
        WHERE a.item_count > 0
          AND (a.reminder_state IS NULL OR a.reminder_state <> 'sending')
        ORDER BY a.updated_at ASC
        LIMIT $1`,
      [limit]
    )).rows;
  } catch (e) {
    console.error('[cart_recovery] could not read due carts:', e.message);
    return stats;
  }

  stats.shops = new Set(rows.map((r) => r.company_id)).size;

  /* No mailer configured is "cannot", not "nothing to do". Leaving the rows
     untouched means they go out when SMTP is configured, instead of being
     marked done in silence — same rule as the back-in-stock notifier. */
  const send = opts.send || (mailer && mailer.sendMail ? mailer.sendMail : null);
  if (!send) {
    if (rows.length) console.warn(`[cart_recovery] ${rows.length} cart(s) due but no mailer configured — left pending.`);
    stats.skipped = rows.length;
    return stats;
  }

  for (const row of rows) {
    stats.considered++;
    const settings = R.settingsFrom(row);
    const verdict = R.isDue(row, settings, now);
    if (!verdict.due) { stats.skipped++; continue; }

    // ── The claim ───────────────────────────────────────────────────────────
    // Same statement reads and writes: the attempt count we just read has to
    // still be the count in the table. Two instances racing on one cart means
    // one UPDATE matches and the other matches nothing.
    let claimed = false;
    try {
      const r = await pool.query(
        `UPDATE abandoned_carts
            SET reminder_state = 'sending', reminder_at = now(), reminder_attempts = reminder_attempts + 1
          WHERE id = $1 AND reminder_attempts = $2
            AND (reminder_state IS NULL OR reminder_state <> 'sending')
          RETURNING id`,
        [row.id, Number(row.reminder_attempts) || 0]
      );
      claimed = r.rows.length > 0;
    } catch (e) {
      console.error('[cart_recovery] claim failed for cart', row.id, '-', e.message);
    }
    if (!claimed) { stats.skipped++; continue; }

    const url = cartUrl(row.slug);
    const msg = R.message(row, { store: row.company_name || '', url, origin: SITE_ORIGIN() }, settings);
    let error = null;
    try {
      const ok = await send({
        to: row.customer_email,
        subject: msg.subject,
        html: `<div dir="rtl" style="font-family:sans-serif;line-height:1.7">`
          + msg.text.split('\n').map((l) => `<p>${escapeHtml(l)}</p>`).join('')
          + `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p></div>`,
        text: `${msg.text}\n${url}`,
      });
      // `sendMail` reports false when SMTP is not configured or the send threw;
      // treating that as success is exactly the lie this file is here to avoid.
      if (ok === false) error = 'mailer refused';
    } catch (e) {
      error = e.message;
    }

    try {
      await pool.query(
        `UPDATE abandoned_carts SET reminder_state = $2, reminder_error = $3 WHERE id = $1`,
        [row.id, error ? 'failed' : 'sent', error ? String(error).slice(0, 300) : null]
      );
    } catch (e) {
      // Sent but not recorded. The row stays 'sending', which blocks a second
      // send rather than causing one — the safe side of this particular fence.
      console.error('[cart_recovery] sent but could not record cart', row.id, '-', e.message);
    }
    if (error) { stats.failed++; console.error('[cart_recovery] send failed for cart', row.id, '-', error); }
    else stats.sent++;
  }

  return stats;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = { runDue, cartUrl };
