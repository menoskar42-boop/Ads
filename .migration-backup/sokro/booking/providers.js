'use strict';

// A provider adapter is deliberately opt-in. No configured endpoint means
// manual handoff, never a fake success.
function configured() { return !!process.env.SOKRO_BOOKING_PROVIDER_URL; }
async function submit(booking) {
  if (!configured()) return { ok: false, manual: true, error: 'booking provider is not configured' };
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.SOKRO_BOOKING_PROVIDER_TOKEN) headers.Authorization = `Bearer ${process.env.SOKRO_BOOKING_PROVIDER_TOKEN}`;
  const r = await fetch(process.env.SOKRO_BOOKING_PROVIDER_URL, {
    method: 'POST', headers, body: JSON.stringify({ kind: booking.kind, fields: booking.fields }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, uncertain: r.status >= 500, error: body.error || `provider ${r.status}` };
  return { ok: true, reference: body.reference || body.id || null, raw: { status: r.status } };
}
module.exports = { configured, submit };