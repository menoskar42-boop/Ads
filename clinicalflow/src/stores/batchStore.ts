// batchStore.ts — batch tracking per inventory item (STEP 2 + 3)
const BATCH_KEY   = 'cf_batches_v1';
const DISPENSE_KEY = 'cf_dispense_log_v1';

export interface Batch {
  id: string;
  productId: string;   // maps to InventoryItem.id
  clinicId: string;
  batchNumber: string;
  quantity: number;    // remaining in this batch
  costPrice?: number;
  expiryDate?: string; // ISO date
  receivedAt: string;  // ISO — used for FIFO ordering (oldest first)
  createdAt: string;
}

export interface DispenseRecord {
  id: string;
  clinicId: string;
  productId: string;
  batchId?: string;
  patientId?: string;
  prescriptionId?: string;
  quantity: number;
  dispensedBy?: string;
  notes?: string;
  createdAt: string;
}

// ─── Persistence ─────────────────────────────────────────────
function loadBatches(): Batch[] {
  try { return JSON.parse(localStorage.getItem(BATCH_KEY) || '[]'); } catch { return []; }
}
function saveBatches(data: Batch[]) {
  try { localStorage.setItem(BATCH_KEY, JSON.stringify(data)); } catch { /* storage full */ }
}
function loadDispenseLog(): DispenseRecord[] {
  try { return JSON.parse(localStorage.getItem(DISPENSE_KEY) || '[]'); } catch { return []; }
}
function saveDispenseLog(data: DispenseRecord[]) {
  try { localStorage.setItem(DISPENSE_KEY, JSON.stringify(data)); } catch { /* storage full */ }
}
function genId(p: string) { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

// ─── Batch API ────────────────────────────────────────────────
export function addBatch(data: Omit<Batch, 'id' | 'createdAt'>): Batch {
  const batch: Batch = { ...data, id: genId('bat'), createdAt: new Date().toISOString() };
  const batches = loadBatches();
  batches.push(batch);
  saveBatches(batches);
  return batch;
}

export function getBatchesForProduct(productId: string): Batch[] {
  return loadBatches()
    .filter(b => b.productId === productId && b.quantity > 0)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)); // oldest first = FIFO
}

export function getAllBatches(clinicId: string): Batch[] {
  return loadBatches()
    .filter(b => b.clinicId === clinicId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getExpiredBatches(clinicId: string): Batch[] {
  const today = new Date().toISOString().slice(0, 10);
  return loadBatches().filter(b => b.clinicId === clinicId && b.expiryDate && b.expiryDate < today && b.quantity > 0);
}

export function getExpiringBatches(clinicId: string, daysAhead = 60): Batch[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return loadBatches().filter(b =>
    b.clinicId === clinicId && b.expiryDate &&
    b.expiryDate >= today && b.expiryDate <= cutoffStr &&
    b.quantity > 0
  );
}

// ─── STEP 3: FIFO dispense ────────────────────────────────────
/**
 * Deduct `qty` units from the oldest batches first (FIFO).
 * Returns list of { batchId, deducted } for audit, or null if insufficient stock.
 */
export function deductFIFO(
  productId: string,
  qty: number,
): Array<{ batchId: string; deducted: number }> | null {
  const batches = getBatchesForProduct(productId); // already sorted oldest-first
  const totalAvail = batches.reduce((s, b) => s + b.quantity, 0);
  if (totalAvail < qty) return null;

  const deductions: Array<{ batchId: string; deducted: number }> = [];
  let remaining = qty;
  const allBatches = loadBatches();

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    deductions.push({ batchId: batch.id, deducted: take });
    remaining -= take;
    const idx = allBatches.findIndex(b => b.id === batch.id);
    if (idx !== -1) allBatches[idx].quantity -= take;
  }
  saveBatches(allBatches);
  return deductions;
}

// ─── Dispense log API ─────────────────────────────────────────
export function logDispense(record: Omit<DispenseRecord, 'id' | 'createdAt'>): DispenseRecord {
  const entry: DispenseRecord = { ...record, id: genId('dsp'), createdAt: new Date().toISOString() };
  const log = loadDispenseLog();
  log.push(entry);
  saveDispenseLog(log);
  return entry;
}

export function getDispenseHistory(clinicId: string, limit = 50): DispenseRecord[] {
  return loadDispenseLog()
    .filter(r => r.clinicId === clinicId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function getPatientDispenseHistory(patientId: string): DispenseRecord[] {
  return loadDispenseLog()
    .filter(r => r.patientId === patientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getMostDispensed(clinicId: string, limit = 10): Array<{ productId: string; total: number }> {
  const map: Record<string, number> = {};
  loadDispenseLog().filter(r => r.clinicId === clinicId).forEach(r => {
    map[r.productId] = (map[r.productId] ?? 0) + r.quantity;
  });
  return Object.entries(map)
    .map(([productId, total]) => ({ productId, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
