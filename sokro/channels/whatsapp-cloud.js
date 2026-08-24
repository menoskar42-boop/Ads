'use strict';

const crypto = require('crypto');

function configured() {
  return !!(process.env.SOKRO_WHATSAPP_TOKEN && process.env.SOKRO_WHATSAPP_PHONE_ID);
}
function verifyToken(value) {
  const a = Buffer.from(String(value || '')), b = Buffer.from(String(process.env.SOKRO_WHATSAPP_VERIFY_TOKEN || ''));
  return !!b.length && a.length === b.length && crypto.timingSafeEqual(a, b);
}
function verifySignature(rawBody, signature) {
  const secret = process.env.SOKRO_WHATSAPP_APP_SECRET;
  if (!secret || !signature || !String(signature).startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function send(to, text, opts = {}) {
  if (!configured()) throw new Error('WhatsApp Cloud API is not configured');
  const version = process.env.SOKRO_WHATSAPP_GRAPH_VERSION || 'v21.0';
  const r = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(process.env.SOKRO_WHATSAPP_PHONE_ID)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SOKRO_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: String(to), type: 'text', text: { preview_url: false, body: String(text).slice(0, 4096) }, ...(opts.template ? { template: opts.template } : {}) }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error && body.error.message || `WhatsApp API ${r.status}`);
  return body;
}
function incoming(payload) {
  const out = [];
  for (const entry of (payload && payload.entry) || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    for (const message of value.messages || []) {
      out.push({ phoneId: value.metadata && value.metadata.phone_number_id, messageId: message.id, from: message.from, text: message.text && message.text.body, type: message.type });
    }
  }
  return out;
}
module.exports = { configured, verifyToken, verifySignature, send, incoming };