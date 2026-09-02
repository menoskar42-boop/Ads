// Outbound messaging through each workshop's own provider account.
'use strict';

const GRAPH_VERSION = 'v20.0';

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = '20' + digits.slice(1);
  else if (digits.length === 10 && digits.startsWith('1')) digits = '20' + digits;
  return digits;
}

function resultError(error) {
  return { ok: false, error: String(error || 'provider rejected the message').slice(0, 500) };
}

async function request(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('provider request timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function sendTwilio(config, channel, phone, body) {
  if (!config.accountSid || !config.authToken) return resultError('Twilio credentials are incomplete');
  const from = channel === 'whatsapp' ? config.whatsappFrom : config.smsFrom;
  if (!from) return resultError(channel === 'whatsapp' ? 'WhatsApp sender is not configured' : 'SMS sender is not configured');
  const to = channel === 'whatsapp' ? `whatsapp:+${phone}` : `+${phone}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
  const response = await request(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!response.ok) return resultError(data.message || `Twilio HTTP ${response.status}`);
  return { ok: true, providerMessageId: data.sid || null, providerStatus: data.status || 'queued' };
}

async function sendMeta(config, channel, phone, body) {
  if (channel !== 'whatsapp') return resultError('Meta Cloud API supports WhatsApp, not SMS');
  if (!config.metaPhoneNumberId || !config.metaAccessToken) {
    return resultError('Meta WhatsApp credentials are incomplete');
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(config.metaPhoneNumberId)}/messages`;
  const response = await request(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.metaAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { body },
    }),
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}
  if (!response.ok) return resultError(data.error && data.error.message ? data.error.message : `Meta HTTP ${response.status}`);
  return {
    ok: true,
    providerMessageId: data.messages && data.messages[0] ? data.messages[0].id : null,
    providerStatus: 'accepted',
  };
}

async function sendWorkshopMessage(config, channel, recipient, body) {
  const phone = normalizePhone(recipient);
  if (!phone || !body) return resultError('recipient and message are required');
  if (!config || !config.active) return resultError('messaging is not enabled for this workshop');
  try {
    const provider = channel === 'sms' ? config.smsProvider : config.whatsappProvider;
    if (provider === 'twilio') return await sendTwilio(config, channel, phone, body);
    if (provider === 'meta') return await sendMeta(config, channel, phone, body);
    return resultError(`${channel === 'sms' ? 'SMS' : 'WhatsApp'} provider is not configured`);
  } catch (e) {
    return resultError(e.message);
  }
}

module.exports = { normalizePhone, sendWorkshopMessage };