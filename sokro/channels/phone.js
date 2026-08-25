'use strict';
const crypto = require('crypto');

function configured() {
  return !!(process.env.SOKRO_TWILIO_ACCOUNT_SID && process.env.SOKRO_TWILIO_AUTH_TOKEN && process.env.SOKRO_TWILIO_FROM);
}
async function call(to, callbackUrl, statusCallback) {
  if (!configured()) throw new Error('phone provider is not configured');
  const sid = process.env.SOKRO_TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.SOKRO_TWILIO_AUTH_TOKEN}`).toString('base64');
  const form = new URLSearchParams({ To: String(to), From: process.env.SOKRO_TWILIO_FROM, Url: String(callbackUrl), StatusCallback: String(statusCallback || callbackUrl), StatusCallbackMethod: 'POST' });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`, {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.message || `phone provider ${r.status}`);
  return { id: body.sid, status: body.status };
}
async function hangup(externalId) {
  if (!configured()) throw new Error('phone provider is not configured');
  const sid = process.env.SOKRO_TWILIO_ACCOUNT_SID;
  const credentials = Buffer.from(`${sid}:${process.env.SOKRO_TWILIO_AUTH_TOKEN}`).toString('base64');
  const form = new URLSearchParams({ Status: 'completed' });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls/${encodeURIComponent(externalId)}.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.message || `phone provider ${r.status}`);
  return { id: body.sid, status: body.status };
}
function verifySignature(url, params, signature) {
  const token = process.env.SOKRO_TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const data = String(url) + Object.keys(params || {}).sort().map(k => k + String(params[k])).join('');
  const expected = crypto.createHmac('sha1', token).update(data).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { configured, call, hangup, verifySignature };