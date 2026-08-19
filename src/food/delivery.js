'use strict';
/**
 * السائقين ومناطق التوصيل.
 *
 * ── The fee that was the same everywhere ────────────────────────────────────
 *
 * Delivery cost one number per branch, so the flat two streets away and the
 * village half an hour out paid the same. Restaurants deal with that by
 * refusing the far order, or by quietly losing money on it. Zones let the fee
 * follow the distance — and a restaurant that does not want zones simply has
 * none, and keeps the single branch fee it had, unchanged.
 *
 * ── The rider who could read every customer's address ───────────────────────
 *
 * The `delivery` role has always been allowed on the orders screen, because a
 * rider needs the address and the phone of the order they are delivering. What
 * nobody noticed is that this gave them every OTHER order too: every customer's
 * name, phone and home address, on a phone that leaves the building. A rider
 * sees the orders assigned to them, and nothing else.
 *
 * That is not a UI decision. `visibleTo` is applied where the rows are read.
 */

/** The fee a zone charges for this basket. Free over a threshold, if set. */
function feeForZone(zone, subtotal) {
  if (!zone) return null;
  const over = zone.free_over === null || zone.free_over === undefined || zone.free_over === ''
    ? null : Number(zone.free_over);
  if (over !== null && Number.isFinite(over) && over > 0 && Number(subtotal) >= over) return 0;
  const fee = Number(zone.fee);
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
}

/**
 * What a delivery costs, given the zones this branch has.
 *
 * Three cases, deliberately separate — the middle one is the bug this shape
 * exists to stop:
 *
 *   · no zones at all → the branch's own flat fee (nothing changed for them);
 *   · zones exist and the customer named one → that zone's fee;
 *   · zones exist and the customer named none, or one this branch does not
 *     deliver to → REFUSED, not "zero". A missing selection used to mean free
 *     delivery anywhere, which is the same defect the shop's checkout had.
 */
function quote(zones, zoneId, outletFee, subtotal) {
  const list = Array.isArray(zones) ? zones : [];
  if (!list.length) {
    const flat = Number(outletFee);
    return { ok: true, fee: Number.isFinite(flat) && flat > 0 ? flat : 0, zone: null };
  }
  const zone = list.find((z) => Number(z.id) === Number(zoneId));
  if (!zone) return { ok: false, why: 'zone', fee: 0, zone: null };
  const min = Number(zone.min_order);
  if (Number.isFinite(min) && min > 0 && Number(subtotal) < min) {
    return { ok: false, why: 'zone_min', fee: 0, zone };
  }
  return { ok: true, fee: feeForZone(zone, subtotal), zone };
}

/** Statuses where handing the order to a rider still means something. */
const ASSIGNABLE = ['pending', 'accepted', 'preparing', 'out_for_delivery'];

function canAssign(order) {
  if (!order) return { ok: false, why: 'missing' };
  if (String(order.order_type || 'delivery') !== 'delivery') return { ok: false, why: 'not_delivery' };
  if (!ASSIGNABLE.includes(String(order.status))) return { ok: false, why: 'closed' };
  return { ok: true, why: 'ok' };
}

/**
 * The orders this session may see.
 *
 * A rider sees theirs. Everybody else sees the shift's. Applied at the read,
 * not at the render — a filter in a template is a filter that the next screen
 * to be written does not have.
 */
function visibleTo(orders, perms, staffId) {
  const list = Array.isArray(orders) ? orders : [];
  if (!perms || perms.role !== 'delivery') return list;
  // `Number(null)` is 0 and 0 is finite, so a rider with no id would have
  // matched every UNASSIGNED order — the exact set a rider must not see.
  if (staffId === null || staffId === undefined || staffId === '') return [];
  const id = Number(staffId);
  if (!Number.isFinite(id) || id <= 0) return [];
  return list.filter((o) => {
    const d = o && o.driver_id;
    if (d === null || d === undefined || d === '') return false;
    return Number(d) === id;
  });
}

/** Is this session a rider? The one question the read has to ask. */
function isRider(perms) {
  return !!(perms && perms.role === 'delivery');
}

module.exports = { feeForZone, quote, canAssign, visibleTo, isRider, ASSIGNABLE };
