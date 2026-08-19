// Product specifications and variants — the two questions a showroom is asked
// before anything else: "مقاسه كام؟" and "فيه منه خشب زان؟".
//
// Both used to be answered in the notes field, which meant nobody could put a
// price on the answer. A variant is a real row here because it carries money:
// the same wardrobe in beech and in MDF are one product at two prices, and a
// system that models the second as a separate product loses the fact that
// they are the same piece the moment somebody edits one of them.
//
// Two rules run through this file and are the reason it exists at all.
//
//  1. **A blank measurement is not zero.** `Number('')` is 0 and 0 is finite,
//     so a width nobody typed stores as "0 cm" and prints on the catalogue as
//     a real measurement. The dimensions here are therefore NULL when nobody
//     filled them in, unreadable input is REFUSED rather than rounded down to
//     zero, and the page says nothing at all rather than saying zero.
//
//  2. **An unknown variant is refused, never sold at the base price.** If a
//     form sends a variant this product does not have — a stale tab, an edited
//     option, another showroom's id — the line does not quietly become the
//     plain version at the plain price. That is the failure that puts a piece
//     on an invoice at a price nobody agreed to.
'use strict';

const M = require('../lib/money');

// The measurements, in the order a carpenter says them.
const DIMS = ['width_cm', 'depth_cm', 'height_cm'];
// Free text about the piece itself. Kept short: these print on the catalogue
// card, and a paragraph there is a paragraph nobody reads.
const TEXT_SPECS = [['material', 60], ['finish', 60]];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Read the spec fields off a submitted body.
 *
 * Returns `{ values, bad }`. `bad` names the fields that were typed but could
 * not be read (or were negative); the caller refuses the save rather than
 * storing a number the merchant did not mean. A field left blank is not bad —
 * it is simply not recorded, and lands as null.
 */
function readSpecs(body) {
  const b = body || {};
  const values = {};
  const bad = [];
  for (const key of DIMS) {
    const r = M.read(b[key]);
    if (!r.ok) {
      // 'blank' is an answer: this piece's width is not recorded.
      if (r.why !== 'blank') bad.push(key);
      values[key] = null;
      continue;
    }
    // A measurement of zero, or below it, is not a measurement. Storing it
    // would print "0 سم" on the catalogue as though somebody had measured.
    if (!(r.value > 0)) { bad.push(key); values[key] = null; continue; }
    values[key] = round2(r.value);
  }
  for (const [key, max] of TEXT_SPECS) {
    const v = String(b[key] == null ? '' : b[key]).trim().slice(0, max);
    values[key] = v || null;
  }
  return { values, bad };
}

/** Is this measurement recorded? `null`/`undefined` no, 0 no, "" no. */
function hasDim(v) {
  if (v === null || v === undefined || v === '') return false;
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/**
 * The measurements as the catalogue should print them.
 *
 * All three known → one combined "180 × 90 × 75". Some missing → each known
 * one on its own line, labelled, because "180 × 75" with the middle number
 * silently dropped reads as a depth. Nothing known → an empty list, and the
 * card shows no size row rather than an empty one.
 */
function dimLines(product) {
  const p = product || {};
  const known = DIMS.filter((k) => hasDim(p[k]));
  if (!known.length) return [];
  if (known.length === DIMS.length) {
    return [{ key: 'dims', value: DIMS.map((k) => trimNum(p[k])).join(' × ') }];
  }
  return known.map((k) => ({ key: k, value: trimNum(p[k]) }));
}

/** 180.0 → "180", 89.5 → "89.5". A trailing ".00" reads as false precision. */
function trimNum(v) {
  const n = round2(Number(v));
  return String(Number.isInteger(n) ? n : n);
}

/**
 * Everything the catalogue can say about a piece besides its price, with the
 * unknown parts left out. The caller translates the `key`; the value is the
 * showroom's own text and is printed as typed.
 */
function specLines(product) {
  const p = product || {};
  const out = dimLines(p);
  for (const [key] of TEXT_SPECS) {
    const v = String(p[key] == null ? '' : p[key]).trim();
    if (v) out.push({ key, value: v });
  }
  return out;
}

/**
 * What one variant sells for.
 *
 * Computed here from the stored delta, never taken from the form: the browser
 * is told the price so it can show it, and is not believed when it repeats it
 * back. A delta that would drive the price below zero is floored — the base
 * price minus a bigger discount is a mistake, not a gift.
 */
function priceOf(basePrice, variant) {
  const base = Math.max(0, round2(basePrice));
  if (!variant) return base;
  return Math.max(0, round2(base + round2(variant.price_delta)));
}

/**
 * Pick the variant a form asked for.
 *
 *   nothing sent            → { ok: true, variant: null }  (the plain piece)
 *   a variant of this piece → { ok: true, variant }
 *   anything else           → { ok: false, why: 'unknown_variant' }
 *
 * The last case is the point of the function. Falling back to the plain piece
 * there would put a wardrobe on an invoice at the beech price after the beech
 * option was deleted, and nothing on the screen would look wrong.
 */
function resolveVariant(variants, rawId, productId) {
  const raw = rawId == null ? '' : String(rawId).trim();
  if (raw === '') return { ok: true, variant: null };
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, why: 'unknown_variant' };
  const v = (variants || []).find((x) => Number(x.id) === id);
  if (!v) return { ok: false, why: 'unknown_variant' };
  // A variant row that belongs to another product is not this product's
  // option, even when both belong to this showroom.
  if (productId != null && Number(v.product_id) !== Number(productId)) {
    return { ok: false, why: 'unknown_variant' };
  }
  return { ok: true, variant: v };
}

/**
 * The options to show for a piece, priced. The plain piece is first and is
 * always offered — a showroom that adds "زان" to a wardrobe has not stopped
 * selling the wardrobe.
 */
function optionsFor(product, variants) {
  const base = Math.max(0, round2((product || {}).selling_price));
  const list = [{ id: '', name: null, price: base }];
  for (const v of variants || []) {
    if (v.is_active === false) continue;
    list.push({ id: v.id, name: v.name, code: v.code || null, price: priceOf(base, v) });
  }
  return list;
}

/** Coerce a submitted variant row. The delta may be negative — that is what
 *  makes "بدون رخامة" cheaper — but it is money, so it is read like money. */
function readVariant(body) {
  const b = body || {};
  const name = String(b.name == null ? '' : b.name).trim().slice(0, 80);
  const code = String(b.code == null ? '' : b.code).trim().slice(0, 40) || null;
  const d = M.read(b.price_delta);
  return {
    name,
    code,
    // Blank is a real answer here: an option that costs the same as the plain
    // piece. Unreadable is not, and is reported so the save can be refused.
    price_delta: d.ok ? round2(d.value) : 0,
    bad: !d.ok && d.why !== 'blank',
  };
}

module.exports = {
  DIMS, TEXT_SPECS, readSpecs, specLines, dimLines, hasDim,
  priceOf, resolveVariant, optionsFor, readVariant, round2,
};
