// Gateway dispatcher — loads the MERCHANT'S OWN stored credentials and initiates
// a payment with the right provider. Each merchant pays through their own
// gateway account; the platform holds no shared keys.
const paymob = require('./paymob');
const payVault = require('../pay_vault');

// The API key is encrypted at rest now (src/lib/pay_vault.js). Rows written
// before that still hold the plaintext column, so this prefers the encrypted
// value and falls back — a merchant's checkout must not break on deploy day.
const apiKeyOf = (p) => payVault.read(p && p.gateway_secret_enc, p && p.gateway_secret);

async function loadPaySettings(pool, companyId) {
  return (await pool.query('SELECT * FROM payment_settings WHERE company_id = $1', [companyId])).rows[0] || null;
}

function gatewayReady(p) {
  if (!p || !p.gateway || p.gateway === 'none') return false;
  if (p.gateway === 'paymob') return !!(apiKeyOf(p) && p.gateway_integration_id && p.gateway_iframe_id);
  return false; // other providers: scaffold only for now
}

// order: { amountCents, currency, merchantOrderId, billing, items }
async function createGatewayPayment(pool, company, order) {
  const p = await loadPaySettings(pool, company.id);
  if (!gatewayReady(p)) throw new Error('Gateway not configured for this merchant.');
  if (p.gateway === 'paymob') {
    return paymob.createPaymentUrl(
      { apiKey: apiKeyOf(p), integrationId: p.gateway_integration_id, iframeId: p.gateway_iframe_id },
      order
    );
  }
  throw new Error('Gateway not supported yet: ' + p.gateway);
}

module.exports = { createGatewayPayment, loadPaySettings, gatewayReady };
