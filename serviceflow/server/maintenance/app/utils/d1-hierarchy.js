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
    error.payload = payload;
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

async function getMaintenanceCabinet(actor, cabinetId) {
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/cabinets/${encodeURIComponent(cabinetId)}`,
  );
  if (!payload || !Number.isSafeInteger(payload.id) || !Number.isSafeInteger(payload.exchange_id) ||
      typeof payload.number !== 'string' || typeof payload.exchange_name !== 'string') {
    throw new Error('Maintenance hierarchy D1 returned an invalid cabinet');
  }
  return payload;
}

async function getMaintenanceBoxes(actor, filters = {}) {
  const query = new URLSearchParams();
  for (const key of ['status', 'exchange_id', 'cabinet_id', 'search']) {
    if (filters[key] != null && String(filters[key]) !== '') query.set(key, String(filters[key]));
  }
  const suffix = query.size ? `?${query.toString()}` : '';
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/boxes${suffix}`,
  );
  if (!payload || !Array.isArray(payload.boxes) || !Array.isArray(payload.exchanges) ||
      !Array.isArray(payload.cabinets) || !payload.counts || typeof payload.counts !== 'object' ||
      payload.boxes.some((row) => !row || !Number.isSafeInteger(row.id) ||
        !Number.isSafeInteger(row.cabinet_id) || typeof row.number !== 'string' ||
        typeof row.status !== 'string' || typeof row.cabinet_number !== 'string' ||
        typeof row.exchange_name !== 'string')) {
    throw new Error('Maintenance hierarchy D1 returned invalid box rows');
  }
  return payload;
}

async function getMaintenanceBoxDetails(actor, boxId) {
  if (!Number.isSafeInteger(Number(boxId)) || Number(boxId) <= 0) {
    throw new Error('Invalid box id');
  }
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/boxes/${encodeURIComponent(boxId)}`,
  );
  if (!payload || !payload.box || !Number.isSafeInteger(payload.box.id) ||
      !Number.isSafeInteger(payload.box.cabinet_id) || typeof payload.box.number !== 'string' ||
      !Array.isArray(payload.archivedInspections) || !Array.isArray(payload.items) ||
      !payload.itemStatusMap || typeof payload.itemStatusMap !== 'object' ||
      (payload.inspection && !Number.isSafeInteger(payload.inspection.id)) ||
      (payload.task && !Number.isSafeInteger(payload.task.id))) {
    throw new Error('Maintenance hierarchy D1 returned invalid box details');
  }
  return payload;
}

async function createMaintenanceBox(actor, cabinetId, number) {
  if (!Number.isSafeInteger(Number(cabinetId)) || Number(cabinetId) <= 0 ||
      typeof number !== 'string' || !number.trim() || number.trim().length > 120) {
    throw new Error('A valid cabinet and box number are required');
  }
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/cabinets/${encodeURIComponent(cabinetId)}/boxes`,
    { method: 'POST', body: { number: number.trim() } },
  );
  if (!payload || !Number.isSafeInteger(payload.id) || payload.cabinet_id !== Number(cabinetId) ||
      payload.number !== number.trim() || typeof payload.status !== 'string') {
    throw new Error('Maintenance hierarchy D1 returned an invalid box');
  }
  return payload;
}

async function updateMaintenanceBoxLocation(actor, boxId, lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isSafeInteger(Number(boxId)) || Number(boxId) <= 0 ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Valid box coordinates are required');
  }
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/boxes/${encodeURIComponent(boxId)}/location`,
    { method: 'POST', body: { lat: latitude, lng: longitude } },
  );
  if (!payload || payload.ok !== true || payload.lat !== latitude || payload.lng !== longitude) {
    throw new Error('Maintenance hierarchy D1 returned an invalid location result');
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

async function deleteMaintenanceExchange(actor, exchangeId) {
  if (!Number.isSafeInteger(Number(exchangeId)) || Number(exchangeId) <= 0) {
    throw new Error('Invalid exchange id');
  }
  return maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/exchanges/${encodeURIComponent(exchangeId)}`,
    { method: 'DELETE' },
  );
}

async function deleteMaintenanceCabinet(actor, cabinetId) {
  if (!Number.isSafeInteger(Number(cabinetId)) || Number(cabinetId) <= 0) {
    throw new Error('Invalid cabinet id');
  }
  return maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/cabinets/${encodeURIComponent(cabinetId)}`,
    { method: 'DELETE' },
  );
}

module.exports = {
  createMaintenanceCabinet,
  createMaintenanceBox,
  createMaintenanceExchange,
  updateMaintenanceBoxLocation,
  getMaintenanceBoxes,
  getMaintenanceCabinet,
  deleteMaintenanceCabinet,
  deleteMaintenanceExchange,
  getMaintenanceBoxDetails,
  getMaintenanceCabinets,
  getMaintenanceExchanges,
  isMaintenanceHierarchyProofEnabled,
};
