// Resolve the payment methods a merchant wants shown to buyers at checkout.
// Rule (owner): default is cash-on-delivery; methods only appear when the
// merchant enables/fills them. When a gateway is enabled the merchant can keep
// the other methods or rely on the gateway alone (gateway_exclusive).
function gatewayLabel(g) {
  return ({ paymob: 'Paymob', fawry: 'Fawry', stripe: 'Stripe', paypal: 'PayPal' })[g] || g;
}

async function loadPaymentMethods(pool, company, t) {
  let p = null;
  try { p = (await pool.query('SELECT * FROM payment_settings WHERE company_id = $1', [company.id])).rows[0] || null; }
  catch (e) { p = null; }

  const methods = [];
  const gatewayOn = !!(p && p.gateway && p.gateway !== 'none');
  const exclusive = gatewayOn && p.gateway_exclusive;

  if (gatewayOn) methods.push({ key: 'gateway', label: gatewayLabel(p.gateway), detail: null, online: true });

  if (!exclusive) {
    if (!p || p.cod_enabled !== false) {
      methods.push({ key: 'cod', label: (p && p.cod_terms) ? p.cod_terms : t('acct.payments.cod'), detail: null });
    }
    if (p) {
      // A payment link the merchant hosts themselves. Rendered as a real button
      // rather than a line of text: "pay here" that you cannot click is not a
      // payment method. http(s) only — a javascript: or data: URL pasted into
      // this box would run on the customer's page.
      if (p.payment_link && /^https?:\/\//i.test(String(p.payment_link).trim())) {
        methods.push({
          key: 'link', online: true,
          label: (p.payment_link_label || '').trim() || t('acct.payments.pay_link'),
          detail: null, url: String(p.payment_link).trim(),
        });
      }
      if (p.instapay_handle) methods.push({ key: 'instapay', label: 'InstaPay', detail: p.instapay_handle });
      if (p.wallet_number)   methods.push({ key: 'wallet', label: t('acct.payments.wallet'), detail: p.wallet_number });
      if (p.payoneer_email)  methods.push({ key: 'payoneer', label: 'Payoneer', detail: p.payoneer_email });
      if (p.bank_details)    methods.push({ key: 'bank', label: t('acct.payments.bank'), detail: p.bank_details });
      if (p.custom_methods) {
        String(p.custom_methods).split(/\r?\n+/).map((s) => s.trim()).filter(Boolean)
          .forEach((line) => methods.push({ key: 'custom', label: line, detail: null }));
      }
    }
  }
  // Always guarantee at least the default method.
  if (!methods.length) methods.push({ key: 'cod', label: t('acct.payments.cod'), detail: null });

  return { methods, instructions: (p && p.instructions) ? p.instructions : null };
}

module.exports = { loadPaymentMethods, gatewayLabel };
