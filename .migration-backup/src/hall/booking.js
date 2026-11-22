// What a booking costs, and whether a date can be sold.
//
// The pricing rule that matters: a hall quotes a base price plus a per-head
// price, and the per-head part is the whole margin. So the headcount is treated
// as a live number with consequences — changing it changes the quote, and the
// change is recorded rather than silently overwritten, because "we agreed 300"
// three weeks before a wedding is an argument nobody wins from memory.
'use strict';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const STATUSES = ['held', 'confirmed', 'done', 'cancelled'];
// A held date is off the market exactly like a confirmed one. A date promised
// on the phone is a date sold, and treating a hold as "not really booked" is
// how two families end up with the same Thursday.
const BLOCKING = ['held', 'confirmed', 'done'];
const SLOTS = ['afternoon', 'evening', 'full'];

const ENQUIRY_STATUSES = ['new', 'contacted', 'viewing_booked', 'viewed', 'quoted', 'won', 'lost'];
const OPEN_ENQUIRY = ['new', 'contacted', 'viewing_booked', 'viewed', 'quoted'];

/**
 * Price one booking.
 *
 * @param booking { base_price, price_per_head, guests, discount }
 * @param extras  rows of { qty, unit_price }
 * @param payments rows of { amount }
 * @returns every component separately — a hall argues about the per-head line
 *          specifically, so it has to be visible on its own, not folded into a
 *          total.
 */
function totals(booking, extras, payments) {
  const b = booking || {};
  const guests = Math.max(0, Number(b.guests || 0));
  const perHead = Math.max(0, Number(b.price_per_head || 0));
  const base = Math.max(0, Number(b.base_price || 0));

  const headTotal = round2(guests * perHead);
  let extrasTotal = 0;
  for (const e of extras || []) {
    extrasTotal = round2(extrasTotal + Number(e.qty || 0) * Number(e.unit_price || 0));
  }

  const subtotal = round2(base + headTotal + extrasTotal);
  const discount = Math.min(subtotal, Math.max(0, Number(b.discount || 0)));
  const total = round2(subtotal - discount);

  let paid = 0;
  for (const p of payments || []) paid = round2(paid + Number(p.amount || 0));

  return {
    base: round2(base),
    guests,
    perHead: round2(perHead),
    headTotal,
    extrasTotal: round2(extrasTotal),
    subtotal,
    discount: round2(discount),
    total,
    paid,
    due: round2(Math.max(0, total - paid)),
  };
}

/**
 * What the deposit should be, given the hall's percentage.
 * Returned rather than charged — the hall decides, and a round number is often
 * what actually gets asked for.
 */
function depositFor(total, percent) {
  const p = Math.min(100, Math.max(0, Number(percent || 0)));
  return round2((Number(total) || 0) * (p / 100));
}

/**
 * Does this date/slot collide with something already sold?
 *
 * A 'full' booking collides with everything on that date, and any slot collides
 * with a 'full' — otherwise a hall sells an afternoon on top of a day-long
 * wedding. The database's unique index cannot express that on its own (it
 * compares slots as strings), so this is the check that runs first and the
 * index is the backstop for the race.
 */
/**
 * Normalise a date to YYYY-MM-DD before comparing.
 *
 * Postgres returns a DATE column as a JS Date; a form sends the string
 * '2026-11-20'. Comparing them with String() gave
 * 'Fri Nov 20 2026 00:00:00 GMT+0000…' against '2026-11-20', which never
 * matched — so collides() returned false for every real booking and the only
 * thing stopping a double booking was the database index. Same-slot clashes
 * still failed (with the wrong message), and a full-day booking laid on top of
 * an evening one went straight through, because the index compares slots as
 * strings and 'full' is not 'evening'.
 */
function sameDay(a, b) {
  const norm = (v) => {
    if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
    const s = String(v || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return isNaN(d) ? s : d.toISOString().slice(0, 10);
  };
  const x = norm(a);
  return !!x && x === norm(b);
}

function collides(wanted, existing) {
  if (!existing || !BLOCKING.includes(existing.status)) return false;
  if (!sameDay(existing.event_date, wanted.event_date)) return false;
  const a = existing.venue_id == null ? 0 : Number(existing.venue_id);
  const b = wanted.venue_id == null ? 0 : Number(wanted.venue_id);
  if (a !== b) return false;
  if (existing.slot === 'full' || wanted.slot === 'full') return true;
  return existing.slot === wanted.slot;
}

/** The first colliding booking, or null. */
function findCollision(wanted, rows) {
  for (const r of rows || []) {
    if (wanted.id && Number(r.id) === Number(wanted.id)) continue; // editing itself
    if (collides(wanted, r)) return r;
  }
  return null;
}

/**
 * Split the remaining balance into instalments between today and the event.
 * Returned for the hall to accept or edit — never written without them seeing
 * it, because a payment plan somebody did not agree to is a plan they will not
 * follow.
 */
function suggestInstallments(due, eventDate, count) {
  const n = Math.max(1, Math.min(12, Number(count) || 3));
  const amount = Number(due) || 0;
  if (amount <= 0) return [];
  const ev = new Date(eventDate);
  if (isNaN(ev)) return [];
  const now = new Date();
  // Everything falls due before the event, never on it: money collected on the
  // day is money not collected.
  const gapMs = ev - now;
  if (gapMs <= 0) return [{ amount: round2(amount), due_on: ev.toISOString().slice(0, 10) }];

  const out = [];
  const each = round2(amount / n);
  let allocated = 0;
  for (let i = 1; i <= n; i += 1) {
    const at = new Date(now.getTime() + (gapMs * i) / (n + 1));
    // The last instalment absorbs the rounding, so the parts always sum to the
    // whole — three instalments of 333.33 leaving one piastre unpaid is the
    // kind of thing that keeps a booking "open" forever.
    const amt = i === n ? round2(amount - allocated) : each;
    allocated = round2(allocated + amt);
    out.push({ amount: amt, due_on: at.toISOString().slice(0, 10) });
  }
  return out;
}

/** A short human code for a booking. */
function bookingCode(id) {
  return 'HL-' + String(id || 0).padStart(5, '0');
}

module.exports = {
  STATUSES, BLOCKING, SLOTS, ENQUIRY_STATUSES, OPEN_ENQUIRY, sameDay,
  totals, depositFor, collides, findCollision, suggestInstallments, bookingCode, round2,
};
