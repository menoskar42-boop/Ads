// ─── labOrderStore.ts ─────────────────────────────────────────────────────────
// Lab order management: create → send to lab → in-progress → received → delivered to patient
// Persisted to localStorage under key: cf_lab_orders_v1

export type LabOrderStatus =
  | 'draft'           // created, not sent yet
  | 'sent'            // sent to lab via WhatsApp or manual
  | 'in_progress'     // lab is working
  | 'ready'           // lab finished, ready for pickup
  | 'received'        // clinic received from lab
  | 'delivered'       // delivered to patient
  | 'cancelled';

export interface LabOrder {
  id: string;
  clinicId: string;
  patientId: string;
  doctorId: string;
  labId: string;
  labName: string;
  labPhone: string;
  status: LabOrderStatus;
  items: LabOrderItem[];
  notes?: string;
  dueDate: string;              // expected ready date
  sentAt?: string;
  receivedAt?: string;
  deliveredAt?: string;
  receivedByUserId?: string;
  totalPrice: number;
  paidAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LabOrderItem {
  id: string;
  name: string;
  nameAr: string;
  toothNumbers?: number[];      // dental chart positions
  shade?: string;               // e.g. A2, B1
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface Lab {
  id: string;
  clinicId: string;
  name: string;
  nameAr: string;
  phone: string;
  address?: string;
  isActive: boolean;
  createdAt: string;
}

// ─── Common dental lab items seed ────────────────────────────────────────────
export const COMMON_LAB_ITEMS: Array<{ name: string; nameAr: string }> = [
  { name: 'Full Crown (PFM)', nameAr: 'تاج معدن بورسلين' },
  { name: 'Full Crown (Zirconia)', nameAr: 'تاج زيركونيا' },
  { name: 'Full Crown (E-Max)', nameAr: 'تاج إيماكس' },
  { name: 'Dental Bridge', nameAr: 'جسر أسنان' },
  { name: 'Removable Partial Denture', nameAr: 'طقم جزئي متحرك' },
  { name: 'Complete Denture', nameAr: 'طقم أسنان كامل' },
  { name: 'Night Guard', nameAr: 'واقي ليلي' },
  { name: 'Retainer', nameAr: 'مثبت أسنان' },
  { name: 'Implant Crown', nameAr: 'تاج زرعة' },
  { name: 'Veneer', nameAr: 'فينير' },
  { name: 'Inlay / Onlay', nameAr: 'إنلاي / أونلاي' },
  { name: 'Mouth Guard', nameAr: 'واقي فم' },
];

// ─── Persistence ──────────────────────────────────────────────────────────────
const ORDERS_KEY = 'cf_lab_orders_v1';
const LABS_KEY = 'cf_labs_v1';

function loadOrders(): LabOrder[] {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]'); } catch { return []; }
}
function saveOrders(orders: LabOrder[]) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}
function loadLabs(): Lab[] {
  try { return JSON.parse(localStorage.getItem(LABS_KEY) || '[]'); } catch { return []; }
}
function saveLabs(labs: Lab[]) {
  localStorage.setItem(LABS_KEY, JSON.stringify(labs));
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Seed labs (demo) ─────────────────────────────────────────────────────────
function seedLabsIfEmpty(clinicId: string) {
  const existing = loadLabs().filter(l => l.clinicId === clinicId);
  if (existing.length > 0) return;
  const seed: Lab[] = [
    { id: `lab-${clinicId}-1`, clinicId, name: 'Elite Dental Lab', nameAr: 'مختبر إيليت', phone: '01001234567', address: 'Cairo', isActive: true, createdAt: new Date().toISOString() },
    { id: `lab-${clinicId}-2`, clinicId, name: 'Max Dental Labs', nameAr: 'مختبر ماكس', phone: '01009876543', address: 'Cairo', isActive: true, createdAt: new Date().toISOString() },
    { id: `lab-${clinicId}-3`, clinicId, name: 'Smile Lab', nameAr: 'مختبر سمايل', phone: '01112223334', address: 'Giza', isActive: true, createdAt: new Date().toISOString() },
  ];
  saveLabs([...loadLabs(), ...seed]);
}

// ─── Labs API ─────────────────────────────────────────────────────────────────
export function getClinicLabs(clinicId: string): Lab[] {
  seedLabsIfEmpty(clinicId);
  return loadLabs().filter(l => l.clinicId === clinicId && l.isActive);
}

export function addLab(data: Omit<Lab, 'id' | 'createdAt'>): Lab {
  const lab: Lab = { ...data, id: genId('lab'), createdAt: new Date().toISOString() };
  const labs = loadLabs();
  labs.push(lab);
  saveLabs(labs);
  return lab;
}

export function updateLab(labId: string, updates: Partial<Lab>): void {
  const labs = loadLabs().map(l => l.id === labId ? { ...l, ...updates } : l);
  saveLabs(labs);
}

// ─── Lab Orders API ───────────────────────────────────────────────────────────
export function createLabOrder(data: {
  clinicId: string;
  patientId: string;
  doctorId: string;
  labId: string;
  labName: string;
  labPhone: string;
  items: Omit<LabOrderItem, 'id'>[];
  notes?: string;
  dueDate: string;
}): LabOrder {
  const items: LabOrderItem[] = data.items.map(i => ({ ...i, id: genId('loi') }));
  const totalPrice = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const order: LabOrder = {
    id: genId('lab-ord'),
    ...data,
    items,
    status: 'draft',
    totalPrice,
    paidAmount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const orders = loadOrders();
  orders.push(order);
  saveOrders(orders);
  return order;
}

export function updateLabOrderStatus(
  orderId: string,
  status: LabOrderStatus,
  extra?: { receivedByUserId?: string },
): void {
  const now = new Date().toISOString();
  const orders = loadOrders().map(o => {
    if (o.id !== orderId) return o;
    const updates: Partial<LabOrder> = { status, updatedAt: now };
    if (status === 'sent') updates.sentAt = now;
    if (status === 'received') { updates.receivedAt = now; if (extra?.receivedByUserId) updates.receivedByUserId = extra.receivedByUserId; }
    if (status === 'delivered') updates.deliveredAt = now;
    return { ...o, ...updates };
  });
  saveOrders(orders);
}

export function updateLabOrderPayment(orderId: string, paidAmount: number): void {
  const orders = loadOrders().map(o =>
    o.id === orderId ? { ...o, paidAmount, updatedAt: new Date().toISOString() } : o
  );
  saveOrders(orders);
}

export function deleteLabOrder(orderId: string): void {
  saveOrders(loadOrders().filter(o => o.id !== orderId));
}

// ─── Query API ────────────────────────────────────────────────────────────────
export function getClinicLabOrders(clinicId: string): LabOrder[] {
  return loadOrders()
    .filter(o => o.clinicId === clinicId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPatientLabOrders(patientId: string, clinicId: string): LabOrder[] {
  return loadOrders()
    .filter(o => o.patientId === patientId && o.clinicId === clinicId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getLabOrderById(orderId: string): LabOrder | undefined {
  return loadOrders().find(o => o.id === orderId);
}

export function getPendingLabOrders(clinicId: string): LabOrder[] {
  return loadOrders().filter(o => o.clinicId === clinicId && !['delivered', 'cancelled'].includes(o.status));
}

/** Generate WhatsApp message for a lab order */
export function generateWhatsAppMessage(order: LabOrder, patientName: string, clinicName: string): string {
  const items = order.items.map(i =>
    `- ${i.name}${i.toothNumbers?.length ? ` (Teeth: ${i.toothNumbers.join(',')})` : ''}${i.shade ? ` Shade: ${i.shade}` : ''} x${i.quantity}`
  ).join('\n');
  return encodeURIComponent(
    `🦷 Lab Order from ${clinicName}\n\nPatient: ${patientName}\nDue: ${order.dueDate}\n\nItems:\n${items}\n\nTotal: ${order.totalPrice} EGP\n${order.notes ? `\nNotes: ${order.notes}` : ''}`
  );
}
