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

module.exports = { createPaymentUrl, verifyCallbackHmac };
