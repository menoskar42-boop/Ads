const { createHmac } = require('node:crypto');

function isMaintenanceHierarchyProofEnabled() {
  const enabled = process.env.SF_MAINTENANCE_HIERARCHY_PROOF === 'd1';
  if (enabled && process.env.NODE_ENV === 'production') {
    throw new Error('The maintenance hierarchy D1 read proof is local-only');
  }
  return enabled;
}

async function maintenanceHierarchyRequest(actor, path, { method = 'GET', body } = {}) {
  if (!actor || actor.id == null || !actor.role) {
    throw new Error('Maintenance actor context is required for D1 hierarchy access');
  }
  const config = {
    baseUrl: process.env.SF_D1_WORKER_URL,
    serviceToken: process.env.SF_D1_SERVICE_TOKEN,
    contextSecret: process.env.SF_D1_CONTEXT_SECRET,
    audience: process.env.SF_D1_CONTEXT_AUDIENCE,
  };
  if (Object.values(config).some((value) => !value)) {
    throw new Error('Maintenance hierarchy D1 requires the configured Worker service credentials');
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const context = Buffer.from(JSON.stringify({
    sub: String(actor.id),
    role: actor.role,
    aud: config.audience,
    iat: issuedAt,
    exp: issuedAt + 30,
  })).toString('base64url');
  const signature = createHmac('sha256', config.contextSecret).update(context).digest('base64url');
  const headers = {
      authorization: `Bearer ${config.serviceToken}`,
      'x-sf-cfm-context': context,
      'x-sf-cfm-signature': signature,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(new URL(path, config.baseUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `Maintenance hierarchy D1 request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function getMaintenanceExchanges(actor) {
  const payload = await maintenanceHierarchyRequest(actor, '/api/maintenance/hierarchy/exchanges');
  if (!Array.isArray(payload) || payload.some((row) =>
    !row || !Number.isSafeInteger(row.id) || typeof row.name !== 'string' ||
    !Number.isSafeInteger(row.cabinet_count) || !Number.isSafeInteger(row.box_count))) {
    throw new Error('Maintenance hierarchy D1 returned invalid exchange rows');
  }
  return payload;
}

async function createMaintenanceExchange(actor, name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    throw new Error('Exchange name must be between 1 and 120 characters');
  }
  return maintenanceHierarchyRequest(actor, '/api/maintenance/hierarchy/exchanges', {
    method: 'POST',
    body: { name: name.trim() },
  });
}

async function getMaintenanceCabinets(actor, exchangeId) {
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/exchanges/${encodeURIComponent(exchangeId)}/cabinets`,
  );
  if (!payload || !payload.exchange || !Array.isArray(payload.cabinets) ||
      !Number.isSafeInteger(payload.exchange.id) || typeof payload.exchange.name !== 'string' ||
      payload.cabinets.some((row) => !row || !Number.isSafeInteger(row.id) ||
        !Number.isSafeInteger(row.box_count) || typeof row.number !== 'string')) {
    throw new Error('Maintenance hierarchy D1 returned invalid cabinet rows');
  }
  return payload;
}

async function createMaintenanceCabinet(actor, exchangeId, number) {
  if (typeof number !== 'string' || !number.trim() || number.trim().length > 120) {
    throw new Error('Cabinet number must be between 1 and 120 characters');
  }
  return maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/exchanges/${encodeURIComponent(exchangeId)}/cabinets`,
    { method: 'POST', body: { number: number.trim() } },
  );
}

module.exports = {
  createMaintenanceCabinet,
  createMaintenanceExchange,
  getMaintenanceCabinets,
  getMaintenanceExchanges,
  isMaintenanceHierarchyProofEnabled,
};
