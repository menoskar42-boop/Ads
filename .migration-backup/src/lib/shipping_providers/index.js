// Courier dispatcher (competitor phase 25). Loads the MERCHANT'S own courier
// settings and creates a shipment with the right provider. Adding a new courier
// = drop a module here + one PROVIDERS entry; nothing else changes.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const bosta = require('./bosta');

// Provider registry — label + whether it needs an API key. 'manual' works with
// any courier: the merchant just types the AWB and we build the tracking link.
const PROVIDERS = [
  { key: 'none',   label: 'بدون تكامل شحن',            needsKey: false, auto: false },
  { key: 'manual', label: 'إدخال يدوي (أي شركة شحن)',  needsKey: false, auto: false },
  { key: 'bosta',  label: 'Bosta (تلقائي بمفتاح API)', needsKey: true,  auto: true },
];

async function loadIntegration(companyId) {
  return (await pool.query('SELECT * FROM shipping_integrations WHERE company_id=$1', [companyId])).rows[0] || null;
}

// Is an AUTOMATIC provider ready (has the key it needs)?
function autoReady(integ) {
  if (!integ || !integ.enabled) return false;
  const p = PROVIDERS.find((x) => x.key === integ.provider);
  if (!p || !p.auto) return false;
  return !p.needsKey || !!integ.api_key;
}

async function saveIntegration(companyId, body) {
  const provider = ['none', 'manual', 'bosta'].includes(body.provider) ? body.provider : 'none';
  const apiKey = String(body.api_key || '').trim() || null;
  const enabled = provider !== 'none';
  await pool.query(
    `INSERT INTO shipping_integrations (company_id, provider, api_key, pickup_phone, pickup_address, enabled, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (company_id) DO UPDATE SET
       provider=EXCLUDED.provider, api_key=EXCLUDED.api_key,
       pickup_phone=EXCLUDED.pickup_phone, pickup_address=EXCLUDED.pickup_address,
       enabled=EXCLUDED.enabled, updated_at=now()`,
    [companyId, provider, apiKey, String(body.pickup_phone || '').trim() || null, String(body.pickup_address || '').trim() || null, enabled]
  );
}

// Create a shipment for an order. For 'bosta' this hits the API; for 'manual'
// it just records the AWB the merchant typed. Returns {awb, trackingUrl, status}.
async function createShipment(company, order, opts) {
  const integ = await loadIntegration(company.id);
  if (!integ || !integ.enabled || integ.provider === 'none') throw new Error('التاجر لم يفعّل تكامل شحن.');

  if (integ.provider === 'manual') {
    const awb = String((opts && opts.manualAwb) || '').trim();
    if (!awb) throw new Error('اكتب رقم البوليصة (AWB).');
    return { awb, trackingUrl: (opts && opts.manualTrackingUrl) || '', status: 'created', provider: 'manual' };
  }
  if (integ.provider === 'bosta') {
    const r = await bosta.createShipment({ apiKey: integ.api_key }, order);
    return { ...r, provider: 'bosta' };
  }
  throw new Error('مزوّد شحن غير مدعوم: ' + integ.provider);
}

module.exports = { PROVIDERS, loadIntegration, autoReady, saveIntegration, createShipment };
