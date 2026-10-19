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

async function getMaintenanceInspections(actor, filters = {}) {
  const params = new URLSearchParams();
  for (const key of ['exchange_id', 'cabinet_id', 'box_q', 'from', 'to']) {
    const value = filters[key];
    if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
  }
  const suffix = params.size ? `?${params.toString()}` : '';
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/inspections${suffix}`,
  );
  if (!Array.isArray(payload) || payload.some((row) =>
    !row || !Number.isSafeInteger(row.id) || !Number.isSafeInteger(row.box_id) ||
    !Number.isSafeInteger(row.inspector_id) || typeof row.box_number !== 'string' ||
    typeof row.cabinet_number !== 'string' || typeof row.exchange_name !== 'string')) {
    throw new Error('Maintenance hierarchy D1 returned invalid inspection rows');
  }
  return payload;
}

async function getMaintenanceInspectionDetails(actor, inspectionId) {
  if (!Number.isSafeInteger(Number(inspectionId)) || Number(inspectionId) <= 0) {
    throw new Error('Invalid inspection id');
  }
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/inspections/${encodeURIComponent(inspectionId)}`,
  );
  if (!payload || !payload.inspection || !Number.isSafeInteger(payload.inspection.id) ||
      !Number.isSafeInteger(payload.inspection.box_id) || !Array.isArray(payload.items) ||
      !payload.itemStatusMap || typeof payload.itemStatusMap !== 'object' ||
      (payload.task && !Number.isSafeInteger(payload.task.id))) {
    throw new Error('Maintenance hierarchy D1 returned invalid inspection details');
  }
  return payload;
}

async function getMaintenancePhotos(actor, inspectionId) {
  if (!Number.isSafeInteger(Number(inspectionId)) || Number(inspectionId) <= 0) {
    throw new Error('Invalid maintenance inspection id');
  }
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/photos?inspection_id=${encodeURIComponent(inspectionId)}`,
  );
  if (!Array.isArray(payload) || payload.some((row) =>
    !row || !Number.isSafeInteger(row.id) || !Number.isSafeInteger(row.box_id) ||
    row.inspection_id !== Number(inspectionId) || typeof row.filename !== 'string' ||
    typeof row.storage_key !== 'string' || !['before', 'after'].includes(row.photo_type) ||
    !['photo', 'video'].includes(row.media_type))) {
    throw new Error('Maintenance hierarchy D1 returned invalid photo metadata');
  }
  return payload;
}

async function getMaintenancePhotosForBox(actor, boxId) {
  const id = Number(boxId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid maintenance box id');
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/photos?box_id=${encodeURIComponent(id)}`,
  );
  if (!Array.isArray(payload) || payload.some((row) =>
    !row || !Number.isSafeInteger(row.id) || row.box_id !== id ||
    typeof row.filename !== 'string' || typeof row.storage_key !== 'string' ||
    !['before', 'after'].includes(row.photo_type) || !['photo', 'video'].includes(row.media_type))) {
    throw new Error('Maintenance hierarchy D1 returned invalid box photo metadata');
  }
  return payload;
}

async function getMaintenancePhotoByFilename(actor, filename) {
  if (typeof filename !== 'string' || !filename || filename.length > 255 ||
      filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Invalid maintenance photo filename');
  }
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/photos/by-filename/${encodeURIComponent(filename)}`,
  );
  if (!payload || typeof payload.filename !== 'string' || typeof payload.storage_key !== 'string' ||
      !['photo', 'video'].includes(payload.media_type)) {
    throw new Error('Maintenance hierarchy D1 returned invalid photo metadata');
  }
  return payload;
}

async function getMaintenancePhotoForDelivery(filename) {
  if (typeof filename !== 'string' || !filename || filename.length > 255 ||
      filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Invalid maintenance photo filename');
  }
  const baseUrl = process.env.SF_D1_WORKER_URL;
  const serviceToken = process.env.SF_D1_SERVICE_TOKEN;
  if (!baseUrl || !serviceToken) throw new Error('Maintenance photo delivery requires the private D1 Worker');
  const response = await fetch(new URL(
    `/api/maintenance/hierarchy/photos/by-filename/${encodeURIComponent(filename)}`, baseUrl,
  ), {
    headers: { authorization: `Bearer ${serviceToken}` },
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `Maintenance photo lookup failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  if (!payload || payload.filename !== filename || typeof payload.storage_key !== 'string' ||
      !['photo', 'video'].includes(payload.media_type)) {
    throw new Error('Maintenance hierarchy D1 returned invalid photo metadata');
  }
  return payload;
}

async function createMaintenancePhoto(actor, photo) {
  if (!photo || !Number.isSafeInteger(Number(photo.boxId)) || !Number.isSafeInteger(Number(photo.inspectionId)) ||
      !['before', 'after'].includes(photo.photoType) || !['photo', 'video'].includes(photo.mediaType) ||
      typeof photo.filename !== 'string' || !photo.filename.trim() ||
      typeof photo.storageKey !== 'string' || !photo.storageKey.trim()) {
    throw new Error('Invalid maintenance photo metadata');
  }
  const payload = await maintenanceHierarchyRequest(
    actor, '/api/maintenance/hierarchy/photos',
    { method: 'POST', body: { ...photo, boxId: Number(photo.boxId), inspectionId: Number(photo.inspectionId) } },
  );
  if (!payload || !Number.isSafeInteger(payload.id) || typeof payload.storage_key !== 'string') {
    throw new Error('Maintenance hierarchy D1 returned invalid photo metadata');
  }
  return payload;
}

async function updateMaintenancePhotoLocation(actor, photoId, latitude, longitude) {
  const id = Number(photoId);
  if (!Number.isSafeInteger(id) || id <= 0 ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Invalid maintenance photo location');
  }
  return maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/photos/${id}`,
    { method: 'PATCH', body: { latitude, longitude } },
  );
}

async function deleteMaintenancePhoto(actor, photoId) {
  const id = Number(photoId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid maintenance photo id');
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/photos/${id}`, { method: 'DELETE' },
  );
  if (!payload?.photo || payload.photo.id !== id || !payload.photo.storage_key) {
    throw new Error('Maintenance hierarchy D1 returned invalid deleted photo metadata');
  }
  return payload.photo;
}

async function getMaintenanceTasks(actor, filters = {}) {
  const params = new URLSearchParams();
  for (const key of ['status', 'q', 'exchange_id', 'cabinet_id', 'box_q', 'from', 'to', 'review']) {
    const value = filters[key];
    if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
  }
  const suffix = params.size ? `?${params.toString()}` : '';
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/tasks${suffix}`,
  );
  const validTask = (row) => row && Number.isSafeInteger(row.id) &&
    Number.isSafeInteger(row.inspection_id) && Number.isSafeInteger(row.box_id) &&
    typeof row.status === 'string' && typeof row.box_number === 'string' &&
    typeof row.cabinet_number === 'string' && typeof row.exchange_name === 'string';
  if (!payload || !Array.isArray(payload.tasks) || !Array.isArray(payload.archivedTasks) ||
      !Number.isSafeInteger(payload.reviewCount) ||
      payload.tasks.some((row) => !validTask(row)) ||
      payload.archivedTasks.some((row) => !validTask(row))) {
    throw new Error('Maintenance hierarchy D1 returned invalid task rows');
  }
  return payload;
}

async function getMaintenanceTaskDetails(actor, taskId) {
  if (!Number.isSafeInteger(Number(taskId)) || Number(taskId) <= 0) {
    throw new Error('Invalid maintenance task id');
  }
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/tasks/${encodeURIComponent(taskId)}`,
  );
  if (!payload || !payload.task || !Number.isSafeInteger(payload.task.id) ||
      !Number.isSafeInteger(payload.task.inspection_id) || !Array.isArray(payload.inspItems) ||
      !Array.isArray(payload.itemStatuses) || !Array.isArray(payload.boxPhones)) {
    throw new Error('Maintenance hierarchy D1 returned invalid task details');
  }
  return payload;
}

async function applyMaintenanceTaskAction(actor, taskId, action) {
  if (!Number.isSafeInteger(Number(taskId)) || Number(taskId) <= 0 ||
      !action || typeof action.action !== 'string') {
    throw new Error('Invalid maintenance task action');
  }
  const payload = await maintenanceHierarchyRequest(
    actor,
    `/api/maintenance/hierarchy/tasks/${encodeURIComponent(taskId)}/action`,
    { method: 'POST', body: action },
  );
  if (!payload || payload.ok !== true) throw new Error('Maintenance task action was not applied');
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

async function updateMaintenanceInspectionLocation(actor, inspectionId, lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isSafeInteger(Number(inspectionId)) || Number(inspectionId) <= 0 ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Valid inspection coordinates are required');
  }
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/inspections/${encodeURIComponent(inspectionId)}/location`,
    { method: 'POST', body: { latitude, longitude } },
  );
  if (!payload || payload.ok !== true) throw new Error('Maintenance hierarchy D1 rejected inspection coordinates');
  return payload;
}

async function createMaintenanceInspection(actor, boxId, inspection) {
  if (!Number.isSafeInteger(Number(boxId)) || Number(boxId) <= 0 ||
      !inspection || typeof inspection.generalNotes !== 'string' || !Array.isArray(inspection.items)) {
    throw new Error('Invalid maintenance inspection');
  }
  const payload = await maintenanceHierarchyRequest(
    actor,
    '/api/maintenance/hierarchy/inspections',
    { method: 'POST', body: { boxId: Number(boxId), ...inspection } },
  );
  if (!payload || !Number.isSafeInteger(payload.id) || typeof payload.needsMaintenance !== 'boolean') {
    throw new Error('Maintenance hierarchy D1 returned an invalid inspection result');
  }
  return payload;
}

async function createMaintenanceBoxDataReview(actor, review) {
  if (!review || !Number.isSafeInteger(Number(review.inspectorId)) || Number(review.inspectorId) <= 0 ||
      !['central', 'cabinet', 'box'].every((key) =>
        typeof review[key] === 'string' && review[key].trim() && review[key].trim().length <= 120) ||
      !Array.isArray(review.phones) || review.phones.length > 5000) {
    throw new Error('Invalid maintenance box data-review request');
  }
  const payload = await maintenanceHierarchyRequest(
    actor,
    '/api/maintenance/hierarchy/integration/box-data-review',
    {
      method: 'POST',
      body: {
        inspectorId: Number(review.inspectorId),
        central: review.central.trim(),
        cabinet: review.cabinet.trim(),
        box: review.box.trim(),
        openedBy: String(review.openedBy || '').trim(),
        origin: String(review.origin || '').trim(),
        originRef: String(review.originRef || '').trim(),
        phones: review.phones,
      },
    },
  );
  if (!payload || payload.ok !== true || !Number.isSafeInteger(payload.inspectionId) ||
      !Number.isSafeInteger(payload.boxId) || typeof payload.created !== 'boolean' ||
      !Number.isSafeInteger(payload.phonesAdded) || payload.phonesAdded < 0) {
    throw new Error('Maintenance hierarchy D1 returned an invalid data-review result');
  }
  return payload;
}

async function getMaintenanceBoxDataReviewReports(actor, range = {}) {
  const query = new URLSearchParams();
  for (const key of ['fromUtc', 'toUtc']) {
    if (range[key] != null && range[key] !== '') {
      if (Number.isNaN(Date.parse(range[key]))) throw new Error(`Invalid report range: ${key}`);
      query.set(key === 'fromUtc' ? 'from_utc' : 'to_utc', range[key]);
    }
  }
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/data-review/reports${query.size ? `?${query}` : ''}`,
  );
  if (!Array.isArray(payload) || payload.some((row) =>
    !row || !Number.isSafeInteger(row.inspectionId) || typeof row.central !== 'string' ||
    typeof row.cabinet !== 'string' || typeof row.box !== 'string' ||
    !Number.isSafeInteger(row.phonesCount) ||
    (row.reviewedById !== null && !Number.isSafeInteger(row.reviewedById)))) {
    throw new Error('Maintenance hierarchy D1 returned invalid review report rows');
  }
  return payload;
}

async function getMaintenanceBoxDataReviewReportPhones(actor, inspectionId) {
  if (!Number.isSafeInteger(Number(inspectionId)) || Number(inspectionId) <= 0) {
    throw new Error('Invalid data-review report inspection id');
  }
  const payload = await maintenanceHierarchyRequest(
    actor, `/api/maintenance/hierarchy/data-review/reports/${encodeURIComponent(inspectionId)}/phones`,
  );
  if (!Array.isArray(payload) || payload.some((row) =>
    !row || typeof row.phone !== 'string' || typeof row.notes !== 'string' ||
    typeof row.source !== 'string')) {
    throw new Error('Maintenance hierarchy D1 returned invalid review phone rows');
  }
  return payload;
}

async function getCabinetCapacity(actor) {
  const payload = await maintenanceHierarchyRequest(actor, '/api/cabinet-capacity');
  if (!Array.isArray(payload) || payload.some((row) =>
    !row || !Number.isSafeInteger(row.id) ||
    (row.centralName !== null && typeof row.centralName !== 'string') ||
    (row.exchCode !== null && typeof row.exchCode !== 'string') ||
    (row.exchName !== null && typeof row.exchName !== 'string') ||
    (row.cabinNumber !== null && typeof row.cabinNumber !== 'string') ||
    (row.cabinetType !== null && typeof row.cabinetType !== 'string') ||
    (row.primaryCapacity !== null && !Number.isSafeInteger(row.primaryCapacity)) ||
    (row.secondaryCapacity !== null && !Number.isSafeInteger(row.secondaryCapacity)))) {
    throw new Error('Maintenance hierarchy D1 returned invalid cabinet capacity rows');
  }
  return payload;
}

async function replaceCabinetCapacity(actor, rows) {
  if (!Array.isArray(rows) || rows.length > 5000 || rows.some((row) =>
    !row || (row.primaryCapacity !== null && !Number.isSafeInteger(row.primaryCapacity)) ||
    (row.secondaryCapacity !== null && !Number.isSafeInteger(row.secondaryCapacity)))) {
    throw new Error('Invalid cabinet capacity import rows');
  }
  const payload = await maintenanceHierarchyRequest(actor, '/api/cabinet-capacity', {
    method: 'POST', body: { rows },
  });
  if (!payload || payload.inserted !== rows.length) {
    throw new Error('Maintenance hierarchy D1 did not replace the complete cabinet capacity set');
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
  updateMaintenanceInspectionLocation,
  createMaintenanceInspection,
  createMaintenanceBoxDataReview,
  getMaintenanceBoxDataReviewReports,
  getMaintenanceBoxDataReviewReportPhones,
  getCabinetCapacity,
  replaceCabinetCapacity,
  getMaintenanceBoxes,
  getMaintenanceCabinet,
  deleteMaintenanceCabinet,
  deleteMaintenanceExchange,
  getMaintenanceBoxDetails,
  getMaintenanceInspections,
  getMaintenanceInspectionDetails,
  getMaintenancePhotos,
  getMaintenancePhotosForBox,
  getMaintenancePhotoByFilename,
  getMaintenancePhotoForDelivery,
  createMaintenancePhoto,
  updateMaintenancePhotoLocation,
  deleteMaintenancePhoto,
  getMaintenanceTasks,
  getMaintenanceTaskDetails,
  applyMaintenanceTaskAction,
  getMaintenanceCabinets,
  getMaintenanceExchanges,
  isMaintenanceHierarchyProofEnabled,
};
