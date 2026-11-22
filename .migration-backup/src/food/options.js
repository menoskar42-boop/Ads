'use strict';
/**
 * أنواع الطلب والإضافات — the two things every restaurant asks for first.
 *
 * ── Order type ──────────────────────────────────────────────────────────────
 *
 * Every food order in this system was a delivery. Which meant a customer
 * collecting their own order was charged a delivery fee, and was made to type
 * an address for a driver who was never coming. The type is not decoration on
 * an order: it decides whether there is a fee, whether an address is needed,
 * and whether the kitchen is cooking for a table in the room.
 *
 * The three types are opt-in per outlet, and delivery is the one that starts
 * on, because that is what every existing restaurant on the platform is
 * already doing. Switching a type on is the restaurant's decision, like every
 * other feature here.
 *
 * ── Modifiers ───────────────────────────────────────────────────────────────
 *
 * "Large, extra cheese, no onion" is not a note in the comments box — it
 * changes the price and it changes what the kitchen makes. Two rules keep it
 * from becoming a way to order a large pizza at a small price:
 *
 *   · **The price is computed here, from the database, never taken from the
 *     browser.** The client sends which options were chosen; the server looks
 *     up what they cost.
 *   · **A chosen option must belong to the item it was chosen for.** Without
 *     that check, the id of a free extra on one item prices an expensive
 *     option on another.
 *
 * And the group rules (required, how many may be picked) are enforced on the
 * server too — a `required` attribute in a browser is a suggestion.
 */

const TYPES = ['delivery', 'pickup', 'dine_in'];

/** The type of an order, defaulting to what this system used to do. */
function typeOf(raw) {
  const t = String(raw || '').trim();
  return TYPES.includes(t) ? t : 'delivery';
}

/** Which types this outlet actually offers. Delivery starts on, the rest opt in. */
function allowed(outlet) {
  const o = outlet || {};
  return {
    delivery: o.allow_delivery !== false,
    pickup: o.allow_pickup === true,
    dine_in: o.allow_dine_in === true,
  };
}

function offers(outlet, type) {
  return allowed(outlet)[typeOf(type)] === true;
}

/** A fee for a driver who is not coming is not a fee. */
function feeFor(type, outletFee) {
  if (typeOf(type) !== 'delivery') return 0;
  const n = Number(outletFee);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** An address is a delivery's business; a table is the room's. */
function needsAddress(type) { return typeOf(type) === 'delivery'; }
function needsTable(type) { return typeOf(type) === 'dine_in'; }

/**
 * What the customer's browser sent, reduced to what the server will consider.
 * Anything unparseable disappears rather than becoming a zero or a NaN.
 */
function normalizeCart(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((x) => ({
    id: parseInt(x && x.id, 10),
    q: Math.max(1, parseInt(x && x.q, 10) || 1),
    opts: Array.from(new Set((Array.isArray(x && x.opts) ? x.opts : [])
      .map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v)))),
  })).filter((x) => Number.isFinite(x.id));
}

/**
 * Price one line, and say why not when it cannot be priced.
 *
 * @param {object} item   the menu row, as read from the database
 * @param {Array}  groups option groups for THIS item, each with its `values`
 * @param {Array}  chosen the ids the browser sent
 * @returns {{ok:true, price:number, chosen:Array} | {ok:false, why:string, group?:string}}
 */
function priceLine(item, groups, chosen) {
  // `Number(null)` is 0 and 0 is finite, so a menu row with no price at all
  // would have been sold for nothing. An absent price is a refusal, not a gift.
  const raw = item ? item.price : null;
  if (raw === null || raw === undefined || raw === '') return { ok: false, why: 'price' };
  const base = Number(raw);
  if (!Number.isFinite(base)) return { ok: false, why: 'price' };
  const picked = new Set((chosen || []).map(Number));
  const gs = Array.isArray(groups) ? groups : [];

  // Every id must belong to a group of this item. An id from another item's
  // menu is the whole reason this loop exists.
  const known = new Set();
  for (const g of gs) for (const v of (g.values || [])) known.add(Number(v.id));
  for (const id of picked) if (!known.has(id)) return { ok: false, why: 'unknown_option' };

  let delta = 0;
  const out = [];
  for (const g of gs) {
    const vals = (g.values || []).filter((v) => picked.has(Number(v.id)));
    const min = Math.max(0, parseInt(g.min_select, 10) || 0);
    const max = Math.max(0, parseInt(g.max_select, 10) || 0);
    if (g.required === true && vals.length < Math.max(1, min)) return { ok: false, why: 'required', group: g.name };
    if (min > 0 && vals.length > 0 && vals.length < min) return { ok: false, why: 'too_few', group: g.name };
    if (max > 0 && vals.length > max) return { ok: false, why: 'too_many', group: g.name };
    for (const v of vals) {
      const d = Number(v.price_delta);
      delta += Number.isFinite(d) ? d : 0;
      out.push({ group: g.name, name: v.name, delta: Number.isFinite(d) ? d : 0 });
    }
  }
  // A modifier that takes the price below zero is a mistake in the menu, not a
  // free meal.
  const price = Math.max(0, +(base + delta).toFixed(2));
  return { ok: true, price, chosen: out };
}

/** How a line reads on a ticket: «برجر — كبير · جبنة زيادة · بدون بصل». */
function describe(chosen, sep) {
  return (Array.isArray(chosen) ? chosen : []).map((c) => c.name).join(sep || ' · ');
}

module.exports = { TYPES, typeOf, allowed, offers, feeFor, needsAddress, needsTable, normalizeCart, priceLine, describe };
