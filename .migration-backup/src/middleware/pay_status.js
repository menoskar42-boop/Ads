'use strict';

// ── The two merchant tools nobody could find ─────────────────────────────────
//
// The payment settings live at `/accounting/payments` and nothing else linked
// to them. A gym owner, a workshop, a nursery — every panel that sells
// something — had no way to reach the page, and no way to know their gateway
// was never configured. The answer to "why did nobody pay online?" was one
// screen away and invisible.
//
// This runs ONCE for the whole app rather than in each sector's routes, so a
// panel written next year gets the answer by existing.
const { Pool } = require('pg');

let pool = null;
function db() {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

// One indexed lookup per company per minute. Rendering an admin page must not
// cost a query every time, and the answer changes only when somebody saves the
// settings page.
const cache = new Map();
const TTL = 60000;

/**
 * Ready means: there is SOME way for a customer to hand over money. A payment
 * gateway, a payment link, cash on delivery, a wallet number, InstaPay — any
 * one of them is a yes. Insisting on a gateway would nag the many merchants
 * who take cash on purpose.
 */
function readyFrom(row) {
  if (!row) return false;
  const gateway = String(row.gateway || 'none') !== 'none';
  const link = !!String(row.payment_link || '').trim();
  const cod = row.cod_enabled === true;
  const wallet = !!String(row.wallet_number || '').trim();
  const instapay = !!String(row.instapay_handle || '').trim();
  const bank = !!String(row.bank_details || '').trim();
  const custom = Array.isArray(row.custom_methods) ? row.custom_methods.length > 0
    : !!String(row.custom_methods || '').trim();
  return gateway || link || cod || wallet || instapay || bank || custom;
}

async function readyFor(companyId) {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value = null;
  try {
    const r = await db().query(
      `SELECT gateway, payment_link, cod_enabled, wallet_number, instapay_handle, bank_details, custom_methods
         FROM payment_settings WHERE company_id=$1`, [companyId]);
    value = readyFrom(r.rows[0]);
  } catch (_) {
    // A read that failed is not a "no": telling a merchant who HAS configured
    // payments that they have not is worse than saying nothing.
    value = null;
  }
  cache.set(companyId, { at: Date.now(), value });
  return value;
}

/**
 * Is the e-invoice switched on for this merchant?
 *
 * Same shape of problem, same shape of fix: the page exists at `/einvoice` and
 * nothing led to it. Different in one way that matters — the feature is
 * OPTIONAL by the owner's rule, so "off" is a legitimate state and the chip
 * must not nag about it the way an unconfigured payment method does.
 */
const einvoiceCache = new Map();
async function einvoiceOn(companyId) {
  const hit = einvoiceCache.get(companyId);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value = null;
  try {
    const r = await db().query('SELECT enabled FROM einvoice_settings WHERE company_id=$1', [companyId]);
    value = !!(r.rows[0] && r.rows[0].enabled);
  } catch (_) { value = null; }
  einvoiceCache.set(companyId, { at: Date.now(), value });
  return value;
}

/** Drop the cached answers the moment the merchant saves either page. */
function forget(companyId) { cache.delete(companyId); einvoiceCache.delete(companyId); }

function middleware() {
  return async function payStatus(req, res, next) {
    res.locals.payLink = '/accounting/payments';
    res.locals.einvoiceLink = '/einvoice';
    res.locals.payReady = null;
    res.locals.einvoiceOn = null;
    const id = req.session && req.session.companyId;
    if (!id) return next();
    // Both facts in one pass: a panel render must not cost two round trips.
    const [pay, inv] = await Promise.all([readyFor(id), einvoiceOn(id)]);
    res.locals.payReady = pay;
    res.locals.einvoiceOn = inv;
    next();
  };
}

module.exports = { middleware, readyFor, readyFrom, einvoiceOn, forget, _cache: cache, _einvoiceCache: einvoiceCache };
