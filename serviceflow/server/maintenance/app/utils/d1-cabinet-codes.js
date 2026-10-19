const { createHmac } = require('node:crypto');

function configuration() {
  const config = {
    baseUrl: process.env.SF_D1_WORKER_URL,
    serviceToken: process.env.SF_D1_SERVICE_TOKEN,
    contextSecret: process.env.SF_D1_CONTEXT_SECRET,
    audience: process.env.SF_D1_CONTEXT_AUDIENCE,
  };
  if (Object.values(config).some((value) => !value)) {
    throw new Error('Maintenance D1 cabinet codes require SF_D1_WORKER_URL, SF_D1_SERVICE_TOKEN, SF_D1_CONTEXT_SECRET, and SF_D1_CONTEXT_AUDIENCE');
  }
  return config;
}

async function getCabinetCodes(actor) {
  if (!actor || actor.id == null || !actor.role) {
    throw new Error('Maintenance actor context is required for D1 cabinet-code access');
  }
  const config = configuration();
  const issuedAt = Math.floor(Date.now() / 1000);
  const context = Buffer.from(JSON.stringify({
    sub: String(actor.id),
    role: actor.role,
    aud: config.audience,
    iat: issuedAt,
    exp: issuedAt + 30,
  })).toString('base64url');
  const signature = createHmac('sha256', config.contextSecret).update(context).digest('base64url');
  const response = await fetch(new URL('/api/maintenance/cabinet-codes', config.baseUrl), {
    headers: {
      authorization: `Bearer ${config.serviceToken}`,
      'x-sf-cfm-context': context,
      'x-sf-cfm-signature': signature,
    },
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Maintenance D1 cabinet-code request failed (${response.status})`);
  }
  if (!Array.isArray(payload)) throw new Error('Maintenance D1 returned an invalid cabinet-code result');
  const fields = [
    'id', 'exchange_name', 'cabinet_number', 'exchange_code',
    'decent_life', 'area_technician', 'worker_code', 'cabinet_code',
  ];
  return payload.map((row) => {
    if (!row || typeof row !== 'object' ||
        Object.keys(row).some((key) => !fields.includes(key)) ||
        !Number.isSafeInteger(row.id) ||
        typeof row.exchange_name !== 'string' || !row.exchange_name ||
        typeof row.cabinet_number !== 'string' || !row.cabinet_number ||
        fields.slice(3).some((key) => row[key] != null && typeof row[key] !== 'string')) {
      throw new Error('Maintenance D1 returned an invalid cabinet-code row');
    }
    return Object.fromEntries(fields.map((key) => [key, row[key] ?? null]));
  });
}

module.exports = { getCabinetCodes };
