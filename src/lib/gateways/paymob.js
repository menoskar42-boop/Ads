// Paymob (Accept) payment initiation — uses EACH MERCHANT'S OWN credentials
// (stored per-company in payment_settings). The platform never holds a shared
// key; it transacts on behalf of the merchant with the keys that merchant
// entered in their own /accounting/payments page.
//
// Flow: auth token → register order → payment key → hosted iframe URL.
// Docs: https://developers.paymob.com/  (Egypt, EGP, amounts in piasters).
const crypto = require('crypto');
const BASE = process.env.PAYMOB_BASE || 'https://accept.paymob.com/api';

// Verify a Paymob transaction callback with the merchant's HMAC secret. Paymob
// concatenates a fixed ordered set of fields from the transaction object and
// signs with HMAC-SHA512. We recompute and compare in constant time.
const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
  'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
  'is_standalone_payment', 'is_voided', 'order', 'owner', 'pending',
  'source_data_pan', 'source_data_sub_type', 'source_data_type', 'success',
];
function verifyCallbackHmac(obj, hmacSecret, provided) {
  if (!hmacSecret || !provided || !obj) return false;
  const get = (k) => {
    if (k === 'order') return obj.order && obj.order.id != null ? obj.order.id : obj.order;
    if (k === 'source_data_pan') return obj.source_data && obj.source_data.pan;
    if (k === 'source_data_sub_type') return obj.source_data && obj.source_data.sub_type;
    if (k === 'source_data_type') return obj.source_data && obj.source_data.type;
    return obj[k];
  };
  const concat = HMAC_FIELDS.map((k) => { const v = get(k); return v == null ? '' : String(v); }).join('');
  const digest = crypto.createHmac('sha512', hmacSecret).update(concat).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(provided)));
  } catch (e) { return false; }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Paymob ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

// creds: { apiKey, integrationId, iframeId }
// order: { amountCents, currency='EGP', merchantOrderId, items?, billing? }
// Returns { url } — the hosted payment page to redirect the buyer to.
async function createPaymentUrl(creds, order) {
  if (!creds || !creds.apiKey || !creds.integrationId || !creds.iframeId) {
    throw new Error('Paymob credentials incomplete (need api key, integration id, iframe id).');
  }
  const amountCents = Math.max(1, Math.round(Number(order.amountCents) || 0));
  const currency = order.currency || 'EGP';

  // 1) Auth token.
  const auth = await postJson(`${BASE}/auth/tokens`, { api_key: creds.apiKey });
  const token = auth.token;

  // 2) Register order.
  const reg = await postJson(`${BASE}/ecommerce/orders`, {
    auth_token: token,
    delivery_needed: false,
    amount_cents: amountCents,
    currency,
    merchant_order_id: order.merchantOrderId ? String(order.merchantOrderId) : undefined,
    items: Array.isArray(order.items) ? order.items : [],
  });

  // 3) Payment key (billing data required; fill sane defaults).
  const b = order.billing || {};
  const billing_data = {
    first_name: b.first_name || 'Customer',
    last_name: b.last_name || 'NA',
    email: b.email || 'na@na.com',
    phone_number: b.phone || 'NA',
    apartment: 'NA', floor: 'NA', street: b.street || 'NA', building: 'NA',
    shipping_method: 'NA', postal_code: 'NA', city: b.city || 'NA',
    country: 'EG', state: 'NA',
  };
  const pk = await postJson(`${BASE}/acceptance/payment_keys`, {
    auth_token: token,
    amount_cents: amountCents,
    expiration: 3600,
    order_id: reg.id,
    billing_data,
    currency,
    integration_id: Number(creds.integrationId) || creds.integrationId,
  });

  return { url: `${BASE}/acceptance/iframes/${creds.iframeId}?payment_token=${pk.token}`, orderId: reg.id };
}

/**
 * Is this callback actually a payment for this order?
 *
 * A valid HMAC proves the message came from Paymob. It does not prove it paid
 * for the order we are about to mark paid. The webhook used to look at
 * `obj.success` alone, so ANY successful transaction on the merchant's account
 * whose merchant_order_id parsed to our order id would settle it — including
 * one for one pound. The signature would be perfect, because Paymob really did
 * sign it.
 *
 * So the amount is checked against what we asked for, and the states that mean
 * "not money yet" are checked too:
 *
 *   pending      — the gateway is still waiting on the customer;
 *   is_auth without is_capture — held on the card, not taken;
 *   is_voided / is_refunded    — taken and given back;
 *   error_occured.
 *
 * `>=` not `===` on the amount: overpaying is the merchant's problem to refund,
 * not a reason to leave a paid order showing unpaid.
 *
 * Returns { ok, why } — `why` is for the log, never for the buyer.
 */
function paymentAccepted(obj, expectedCents, currency) {
  const truthy = (v) => v === true || v === 'true';
  const why = [];
  if (!obj) return { ok: false, why: 'no transaction object' };
  if (!truthy(obj.success)) why.push('success=' + obj.success);
  if (truthy(obj.pending)) why.push('pending');
  if (truthy(obj.error_occured)) why.push('error_occured');
  if (truthy(obj.is_voided)) why.push('voided');
  if (truthy(obj.is_refunded)) why.push('refunded');
  if (truthy(obj.is_auth) && !truthy(obj.is_capture)) why.push('authorised but not captured');

  const paid = Number(obj.amount_cents);
  const want = Math.round(Number(expectedCents));
  if (!Number.isFinite(want) || want <= 0) why.push('no expected amount to compare');
  else if (!Number.isFinite(paid) || Math.round(paid) < want) why.push(`amount ${obj.amount_cents} < ${want}`);

  if (currency && obj.currency && String(obj.currency).toUpperCase() !== String(currency).toUpperCase()) {
    why.push(`currency ${obj.currency} != ${currency}`);
  }
  return { ok: why.length === 0, why: why.join('; ') };
}

module.exports = { createPaymentUrl, verifyCallbackHmac, paymentAccepted };
