// ─── inventoryStore.ts ────────────────────────────────────────────────────────
// Inventory & supplier management with low-stock alerts
// Persisted to localStorage: cf_inventory_v1, cf_suppliers_v1, cf_inv_tx_v1

import { deductFIFO, logDispense } from './batchStore';
import { createTransaction } from './transactionStore';

export interface InventoryItem {
  id: string;
  clinicId: string;
  name: string;
  nameAr: string;
  category: InventoryCategory;
  unit: string;               // 'piece', 'box', 'pack', 'ml', 'g'
  currentStock: number;
  minStockLevel: number;      // alert threshold
  unitPrice: number;          // cost price
  supplierId?: string;
  expiryDate?: string;        // ISO date
  location?: string;          // shelf/room label
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type InventoryCategory =
  | 'consumable'    // gloves, masks, syringes
  | 'material'      // filling, impression material
  | 'instrument'    // tools, handpieces
  | 'medication'    // drugs, anesthetics
  | 'equipment'     // machines
  | 'other';

export interface Supplier {
  id: string;
  clinicId: string;
  name: string;
  nameAr: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  balance: number;            // amount owed to supplier
  isActive: boolean;
  createdAt: string;
}

export type TxType = 'add' | 'use' | 'adjust' | 'expire' | 'transfer';

export interface InventoryTransaction {
  id: string;
  clinicId: string;
  itemId: string;
  type: TxType;
  quantity: number;           // positive = in, negative = out
  unitCost?: number;
  supplierId?: string;
  notes?: string;
  userId: string;
  createdAt: string;
}

// ─── Persistence ──────────────────────────────────────────────────────────────
const ITEMS_KEY = 'cf_inventory_v1';
const SUPP_KEY  = 'cf_suppliers_v1';
const TX_KEY    = 'cf_inv_tx_v1';

function load<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function save<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}
function genId(p: string) { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`; }

// ─── Module guard ──────────────────────────────────────────────────────────────
// Reads module state directly from localStorage (same key written by useModules).
// Fail-safe: any parse/access error → allows the action (default = enabled).
function assertInventoryEnabled(clinicId: string): void {
  try {
    const raw = localStorage.getItem('cf_clinic_modules');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const mods = parsed[clinicId];
    if (mods && mods.inventory === false) {
      throw new Error('inventory_disabled');
    }
  } catch (e: any) {
    if (e?.message === 'inventory_disabled') throw e;
    // any other error (JSON parse, storage blocked) → fail-safe allow
  }
}

// ─── Seed demo data ───────────────────────────────────────────────────────────
function seedIfEmpty(clinicId: string) {
  const existing = load<InventoryItem>(ITEMS_KEY).filter(i => i.clinicId === clinicId);
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  const seeds: InventoryItem[] = [
    { id: `inv-${clinicId}-1`, clinicId, name: 'Latex Gloves (M)', nameAr: 'قفازات لاتيكس (M)', category: 'consumable', unit: 'box', currentStock: 5, minStockLevel: 3, unitPrice: 45, isActive: true, createdAt: now, updatedAt: now },
    { id: `inv-${clinicId}-2`, clinicId, name: 'Surgical Masks', nameAr: 'كمامات جراحية', category: 'consumable', unit: 'box', currentStock: 8, minStockLevel: 5, unitPrice: 30, isActive: true, createdAt: now, updatedAt: now },
    { id: `inv-${clinicId}-3`, clinicId, name: 'Composite (A2)', nameAr: 'كمبوزيت A2', category: 'material', unit: 'piece', currentStock: 2, minStockLevel: 3, unitPrice: 180, expiryDate: '2026-12-31', isActive: true, createdAt: now, updatedAt: now },
    { id: `inv-${clinicId}-4`, clinicId, name: 'Lidocaine 2%', nameAr: 'ليدوكايين 2%', category: 'medication', unit: 'box', currentStock: 10, minStockLevel: 5, unitPrice: 90, expiryDate: '2025-09-30', isActive: true, createdAt: now, updatedAt: now },
    { id: `inv-${clinicId}-5`, clinicId, name: 'Dental Floss', nameAr: 'خيط أسنان', category: 'consumable', unit: 'pack', currentStock: 15, minStockLevel: 5, unitPrice: 20, isActive: true, createdAt: now, updatedAt: now },
  ];
  save(ITEMS_KEY, [...load<InventoryItem>(ITEMS_KEY), ...seeds]);
}

// ─── Items API ────────────────────────────────────────────────────────────────
export function getClinicInventory(clinicId: string): InventoryItem[] {
  seedIfEmpty(clinicId);
  return load<InventoryItem>(ITEMS_KEY).filter(i => i.clinicId === clinicId && i.isActive);
}

export function getLowStockItems(clinicId: string): InventoryItem[] {
  return getClinicInventory(clinicId).filter(i => i.currentStock <= i.minStockLevel);
}

export function getExpiringSoonItems(clinicId: string, daysAhead = 60): InventoryItem[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);
  return getClinicInventory(clinicId).filter(i => i.expiryDate && new Date(i.expiryDate) <= cutoff);
}

export function addInventoryItem(data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>): InventoryItem {
  assertInventoryEnabled(data.clinicId);
  const item: InventoryItem = { ...data, id: genId('inv'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const items = load<InventoryItem>(ITEMS_KEY);
  items.push(item);
  save(ITEMS_KEY, items);
  return item;
}

export function updateInventoryItem(itemId: string, updates: Partial<InventoryItem>): void {
  const items = load<InventoryItem>(ITEMS_KEY).map(i =>
    i.id === itemId ? { ...i, ...updates, updatedAt: new Date().toISOString() } : i
  );
  save(ITEMS_KEY, items);
}

export function deleteInventoryItem(itemId: string): void {
  const items = load<InventoryItem>(ITEMS_KEY).map(i =>
    i.id === itemId ? { ...i, isActive: false, updatedAt: new Date().toISOString() } : i
  );
  save(ITEMS_KEY, items);
}

// ─── Stock transaction (use / restock / adjust) ───────────────────────────────
export function recordStockTransaction(data: Omit<InventoryTransaction, 'id' | 'createdAt'>): InventoryTransaction {
  assertInventoryEnabled(data.clinicId);
  const tx: InventoryTransaction = { ...data, id: genId('itx'), createdAt: new Date().toISOString() };
  const txs = load<InventoryTransaction>(TX_KEY);
  txs.push(tx);
  save(TX_KEY, txs);

  // Update current stock
  const items = load<InventoryItem>(ITEMS_KEY).map(item => {
    if (item.id !== data.itemId) return item;
    return { ...item, currentStock: Math.max(0, item.currentStock + data.quantity), updatedAt: new Date().toISOString() };
  });
  save(ITEMS_KEY, items);

  return tx;
}

export function getItemTransactions(itemId: string): InventoryTransaction[] {
  return load<InventoryTransaction>(TX_KEY)
    .filter(t => t.itemId === itemId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─── Suppliers API ────────────────────────────────────────────────────────────
export function getClinicSuppliers(clinicId: string): Supplier[] {
  return load<Supplier>(SUPP_KEY).filter(s => s.clinicId === clinicId && s.isActive);
}

export function addSupplier(data: Omit<Supplier, 'id' | 'createdAt' | 'balance'>): Supplier {
  const supplier: Supplier = { ...data, id: genId('sup'), balance: 0, createdAt: new Date().toISOString() };
  const suppliers = load<Supplier>(SUPP_KEY);
  suppliers.push(supplier);
  save(SUPP_KEY, suppliers);
  return supplier;
}

export function updateSupplier(supplierId: string, updates: Partial<Supplier>): void {
  const suppliers = load<Supplier>(SUPP_KEY).map(s => s.id === supplierId ? { ...s, ...updates } : s);
  save(SUPP_KEY, suppliers);
}

/** Generate WhatsApp purchase order for supplier */
export function generateSupplierWhatsApp(supplier: Supplier, items: Array<{ name: string; quantity: number; unit: string }>, clinicName: string): string {
  const itemList = items.map(i => `• ${i.name}: ${i.quantity} ${i.unit}`).join('\n');
  return encodeURIComponent(`📦 Purchase Order from ${clinicName}\n\nPlease prepare the following:\n${itemList}\n\nPlease confirm availability and pricing.\nThank you!`);
}

// ─── Category labels ──────────────────────────────────────────────────────────
export const CATEGORY_LABELS: Record<InventoryCategory, { en: string; ar: string }> = {
  consumable: { en: 'Consumable', ar: 'مستهلكات' },
  material:   { en: 'Material',   ar: 'مواد' },
  instrument: { en: 'Instrument', ar: 'أدوات' },
  medication: { en: 'Medication', ar: 'أدوية' },
  equipment:  { en: 'Equipment',  ar: 'معدات' },
  other:      { en: 'Other',      ar: 'أخرى' },
};

export const UNIT_OPTIONS = ['piece', 'box', 'pack', 'bottle', 'tube', 'roll', 'ml', 'g', 'pair', 'set'];

// ─── STEP 4: Dispense item ─────────────────────────────────────────────────────
export interface DispenseResult {
  ok: boolean;
  error?: string;
  errorAr?: string;
  deducted?: number;
}

/**
 * Dispense `quantity` units of `itemId` using FIFO batch deduction.
 * Links to patient + prescription, records stock tx + finance income tx.
 */
export function dispenseItem(params: {
  clinicId: string;
  itemId: string;
  quantity: number;
  patientId?: string;
  prescriptionId?: string;
  dispensedBy?: string;
  notes?: string;
}): DispenseResult {
  const { clinicId, itemId, quantity } = params;
  try { assertInventoryEnabled(clinicId); } catch {
    return { ok: false, error: 'inventory_disabled', errorAr: 'المخزن غير مفعّل' };
  }
  if (quantity <= 0) return { ok: false, error: 'Quantity must be > 0', errorAr: 'الكمية يجب أن تكون أكبر من 0' };

  const items = load<InventoryItem>(ITEMS_KEY);
  const item = items.find(i => i.id === itemId);
  if (!item) return { ok: false, error: 'Item not found', errorAr: 'الصنف غير موجود' };
  if (item.currentStock < quantity) {
    return { ok: false, error: `Insufficient stock (available: ${item.currentStock})`, errorAr: `المخزون غير كافٍ (متاح: ${item.currentStock})` };
  }

  // STEP 3 — FIFO deduction across batches
  const deductions = deductFIFO(itemId, quantity);

  // Update flat stock counter on item
  save(ITEMS_KEY, items.map(i =>
    i.id === itemId ? { ...i, currentStock: Math.max(0, i.currentStock - quantity), updatedAt: new Date().toISOString() } : i
  ));

  // Record inventory transaction
  recordStockTransaction({
    clinicId, itemId, type: 'use', quantity: -quantity,
    notes: params.notes ?? 'Dispensed to patient',
    userId: params.dispensedBy ?? '',
  });

  // Log dispense event (patient-linked)
  logDispense({
    clinicId, productId: itemId,
    batchId: deductions?.[0]?.batchId,
    patientId: params.patientId,
    prescriptionId: params.prescriptionId,
    quantity, dispensedBy: params.dispensedBy,
    notes: params.notes,
  });

  // STEP 4 — finance income transaction (selling price)
  if (item.unitPrice > 0) {
    createTransaction({
      clinicId, type: 'income', category: item.category === 'medication' ? 'procedure' : 'visit',
      amount: item.unitPrice * quantity,
      description: `Dispensed: ${item.name} ×${quantity}`,
      descriptionAr: `تم صرف: ${item.nameAr} ×${quantity}`,
      referenceId: `disp-${itemId}-${Date.now()}`,
      createdBy: params.dispensedBy,
    });
  }

  return { ok: true, deducted: quantity };
}
