// Per-clinic WhatsApp sender. Each clinic supplies its OWN credentials
// (stored in clinic_whatsapp), so messages go out from the clinic's number.
//
// Two providers are supported:
//   - cloud   : WhatsApp Cloud API (Meta) — POST to graph.facebook.com
//   - generic : any gateway that accepts { phone, message } JSON + Bearer token
//
// sendWhatsApp() never throws; it returns { ok, error }. Fire-and-forget safe.

const GRAPH_VERSION = 'v20.0';

// Normalize an Egyptian/local phone to WhatsApp E.164 digits (no '+').
// 01001234567 -> 201001234567 ; 00201234... -> 201234... ; keeps existing 20/intl.
function normalizePhone(raw) {
  let d = String(raw || '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '20' + d.slice(1);        // local Egyptian → +20
  else if (d.length === 10 && d.startsWith('1')) d = '20' + d; // 10-digit mobile
  return d;
}

// Fill {name} {doctor} {clinic} {time} placeholders in a template.
function renderTemplate(tpl, vars) {
  let s = String(tpl || '');
  for (const k of Object.keys(vars || {})) {
    s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k] == null ? '' : String(vars[k]));
  }
  return s;
}

async function sendWhatsApp(config, toPhone, message) {
  const phone = normalizePhone(toPhone);
  if (!config || !phone || !message) return { ok: false, error: 'missing config/phone/message' };
  try {
    if (config.provider === 'generic') {
      if (!config.api_url) return { ok: false, error: 'api_url not set' };
      const res = await fetch(config.api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.api_token ? { Authorization: 'Bearer ' + config.api_token } : {}),
        },
        body: JSON.stringify({ phone, message }),
      });
      if (!res.ok) return { ok: false, error: 'gateway HTTP ' + res.status };
      return { ok: true };
    }
    // Default: Meta Cloud API.
    if (!config.phone_number_id || !config.access_token) return { ok: false, error: 'cloud credentials not set' };
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(config.phone_number_id)}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.access_token },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    });
    if (!res.ok) {
      let detail = 'HTTP ' + res.status;
      try { const j = await res.json(); if (j && j.error && j.error.message) detail = j.error.message; } catch (_) {}
      return { ok: false, error: detail };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { sendWhatsApp, normalizePhone, renderTemplate };
