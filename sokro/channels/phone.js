'use strict';

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
module.exports = { configured, call };