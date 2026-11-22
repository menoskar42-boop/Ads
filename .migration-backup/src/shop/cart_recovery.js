'use strict';
/**
 * The reminder that actually goes out by itself — and the one that never
 * pretends to.
 *
 * The abandoned-cart page has existed for a while: it lists who reached the
 * checkout and left, and offers a WhatsApp link the merchant clicks. Which
 * means the feature only worked while somebody was sitting at the panel. A
 * cart left at 11pm was recovered at 10am the next day, if at all — and the
 * competitors all sell this as "automatic".
 *
 * ── What is automatic here, and what is not ─────────────────────────────────
 *
 * Email IS automatic: the platform has SMTP, so a shop can switch this on and
 * the reminder leaves on its own.
 *
 * WhatsApp is NOT, and this file will not say otherwise. Sending WhatsApp
 * without a person pressing send needs an official WhatsApp Business account
 * (Cloud API) registered to the merchant's own number — `src/lib/whatsapp.js`
 * does exactly that for clinics, from credentials the clinic entered. A shop
 * has no such screen yet, so for a shop the WhatsApp button stays what it
 * honestly is: a link that opens the conversation with the message written.
 *
 * Claiming otherwise would be the worst version of this bug — a merchant who
 * believes their carts are being chased, and a queue of customers nobody ever
 * messaged.
 *
 * ── The rules that keep it from becoming spam ───────────────────────────────
 *
 *  · Off by default. Every merchant feature is the merchant's choice.
 *  · One message per abandoned cart, claimed in the database before it is
 *    sent, so two instances of the app cannot both send it.
 *  · A cooldown before the same customer can be reminded again, and a hard cap
 *    on attempts, so a failing address is not retried forever.
 *  · A customer with no email address is `no_contact`, not `pending` — the
 *    panel says so rather than showing a reminder that will never leave.
 */

const { renderTemplate } = require('../lib/whatsapp');

/** Off, an hour's grace, a week between messages, two tries. */
const DEFAULTS = {
  enabled: false,
  delayMinutes: 60,
  cooldownDays: 7,
  maxAttempts: 2,
  subject: '',
  body: '',
  couponCode: '',
};

/** Only email sends by itself. See the note above before adding to this list. */
const AUTO_CHANNELS = ['email'];

const MINUTE = 60000;
const DAY = 24 * 60 * MINUTE;

function clamp(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** Settings for one shop, with every value inside a range that cannot spam. */
function settingsFrom(row) {
  if (!row) return Object.assign({}, DEFAULTS);
  return {
    enabled: row.enabled === true,
    // Fifteen minutes at the earliest: anything shorter reaches a customer who
    // is still deciding. A week at the latest — after that it is not a
    // reminder, it is a cold email.
    delayMinutes: clamp(row.delay_minutes, 15, 7 * 24 * 60, DEFAULTS.delayMinutes),
    cooldownDays: clamp(row.cooldown_days, 1, 90, DEFAULTS.cooldownDays),
    maxAttempts: clamp(row.max_attempts, 1, 3, DEFAULTS.maxAttempts),
    subject: String(row.subject || '').slice(0, 160),
    body: String(row.body || '').slice(0, 2000),
    couponCode: String(row.coupon_code || '').trim().slice(0, 40),
  };
}

/** What the panel shows for one cart: the truth, including "never will". */
function stateOf(cart) {
  const s = String((cart && cart.reminder_state) || '') || null;
  if (s === 'sent' || s === 'failed' || s === 'sending') return s;
  return 'none';
}

/**
 * Should this cart be reminded now?
 *
 * Returns a reason either way, because the panel shows the reason next to the
 * cart — "why did this one not get a message" is the question a merchant asks,
 * and a silent no is what makes people distrust the feature.
 *
 * @returns {{due: boolean, why: string}}
 */
function isDue(cart, settings, now) {
  const s = settings || DEFAULTS;
  const t = (now instanceof Date ? now : new Date(now || Date.now())).getTime();
  if (!s.enabled) return { due: false, why: 'off' };
  if (!cart) return { due: false, why: 'empty' };
  if (!(Number(cart.item_count) > 0)) return { due: false, why: 'empty' };
  // No address, no message. Said plainly rather than left pending forever.
  if (!String(cart.customer_email || '').trim()) return { due: false, why: 'no_contact' };

  const left = new Date(cart.updated_at || 0).getTime();
  if (!Number.isFinite(left)) return { due: false, why: 'empty' };
  if (t - left < s.delayMinutes * MINUTE) return { due: false, why: 'young' };

  const attempts = Number(cart.reminder_attempts) || 0;
  const state = stateOf(cart);
  const at = cart.reminder_at ? new Date(cart.reminder_at).getTime() : null;

  // Somebody else is on it right now.
  if (state === 'sending') return { due: false, why: 'sending' };
  if (attempts >= s.maxAttempts && state !== 'none') {
    // A failure that ran out of tries is finished; a success is finished until
    // the customer comes back and abandons a NEWER cart.
    if (state === 'failed') return { due: false, why: 'attempts' };
  }
  if (state === 'sent' || state === 'failed') {
    if (at === null) return { due: false, why: 'sent' };
    // The same customer, a fresh cart, and enough time since we last wrote:
    // both conditions, so neither a stale row nor an eager one re-sends.
    if (left <= at) return { due: false, why: 'sent' };
    if (t - at < s.cooldownDays * DAY) return { due: false, why: 'cooldown' };
    if (state === 'failed' && attempts >= s.maxAttempts) return { due: false, why: 'attempts' };
  }
  return { due: true, why: 'due' };
}

/** When this cart becomes eligible — used to tell the merchant "in 40 min". */
function dueAt(cart, settings) {
  const s = settings || DEFAULTS;
  const left = new Date((cart && cart.updated_at) || 0).getTime();
  if (!Number.isFinite(left)) return null;
  return new Date(left + s.delayMinutes * MINUTE);
}

const DEFAULT_SUBJECT = 'نسيت حاجة في السلة؟';
const DEFAULT_BODY =
  'أهلاً {name}، سلتك في {store} لسه مستنية: {items}.'
  + '\nتقدر تكمّل الطلب من هنا: {url}';

/**
 * The message itself. Placeholders are the merchant's, and anything they did
 * not use simply does not appear — a template is not a schema.
 */
function message(cart, ctx, settings) {
  const s = settings || DEFAULTS;
  const vars = {
    name: (cart && cart.customer_name) || '',
    store: (ctx && ctx.store) || '',
    items: (cart && cart.items_summary) || '',
    total: cart ? String(cart.total) : '',
    url: (ctx && ctx.url) || '',
    coupon: s.couponCode || '',
  };
  return {
    subject: renderTemplate(s.subject || DEFAULT_SUBJECT, vars).slice(0, 200),
    text: renderTemplate(s.body || DEFAULT_BODY, vars).slice(0, 4000),
  };
}

module.exports = {
  DEFAULTS, AUTO_CHANNELS, DEFAULT_SUBJECT, DEFAULT_BODY,
  settingsFrom, stateOf, isDue, dueAt, message,
};
