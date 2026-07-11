import {
  Appointment, Visit, Invoice, InvoiceItem, Payment,
  InvoiceStatus, VisitStatus, AppointmentStatus, VisitPriority,
} from '@/types';
import { createStore } from './createStore';
import { serviceStore } from './specialtyStore';
import { visitTypeStore } from './visitTypeStore';
import { userStore } from './userStore';
import { getClinicQueueStrategy, updateQueueStrategy } from './queueStrategyStore';
import { getQueueSettings, appendQueueAudit } from './queueEngineStore';
import { earnPointsForVisit } from './loyaltyStore';
import { createTransaction } from './transactionStore';
import { recordDoctorEarning } from './doctorEarningsStore';
import { calculateBillingSplit, createClaim } from './insuranceStore';
import { patientStore } from './patientStore';

// ─── Finance module guard (mirrors assertInventoryEnabled in inventoryStore) ───
// Fail-safe: any parse/access error → allows action (module assumed enabled).
function assertFinanceEnabled(clinicId: string): void {
  try {
    const raw = localStorage.getItem('cf_clinic_modules');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const mods = parsed[clinicId];
    if (mods && mods.finance === false) {
      throw new Error('finance_disabled');
    }
  } catch (e: any) {
    if (e?.message === 'finance_disabled') throw e;
    // parse error / storage blocked → fail-safe allow
  }
}

// ─── Stores ───
export const appointmentStore = createStore<Appointment>([], 'cf_appointments');
export const visitStore       = createStore<Visit>([],        'cf_visits');
export const invoiceStore     = createStore<Invoice>([],      'cf_invoices');
export const invoiceItemStore = createStore<InvoiceItem>([], 'cf_invoice_items');
export const paymentStore     = createStore<Payment>([],      'cf_payments');

// ─── Transactional invoice recomputation ───
export function recomputeInvoice(invoiceId: string) {
  const invoice = invoiceStore.get(i => i.id === invoiceId);
  if (!invoice || invoice.status === 'refunded') return;

  const items = invoiceItemStore.filter(i => i.invoiceId === invoiceId);
  const payments = paymentStore.filter(p => p.invoiceId === invoiceId && p.isActive);

  const grossAmount = items.reduce((sum, i) => sum + (Number(i.totalPrice) || 0), 0);
  const discountAmt = invoice.discountType === 'percentage'
    ? Math.round(grossAmount * (invoice.discountValue || 0) / 100)
    : invoice.discountType === 'fixed'
    ? Math.min(invoice.discountValue || 0, grossAmount)
    : 0;
  const totalAmount = Math.max(0, grossAmount - discountAmt);
  const paidAmount = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  // Zero-total invoice (free service / $0 visit) is treated as 'paid' immediately
  // so the Egyptian check-in flow still moves the visit to the waiting queue.
  const status: InvoiceStatus =
    totalAmount === 0 ? 'paid' :
    (paidAmount >= totalAmount) ? 'paid' :
    paidAmount > 0 ? 'partially_paid' : 'pending';

  const wasPending = invoice.status === 'pending' || invoice.status === 'partially_paid';

  invoiceStore.update(
    i => i.id === invoiceId,
    { totalAmount, paidAmount, status }
  );

  // STEP 2 — record income transaction when invoice becomes fully paid
  if (status === 'paid' && wasPending) {
    const visit = visitStore.get(v => v.invoiceId === invoiceId);
    if (visit) {
      const lastPayment = paymentStore.filter(p => p.invoiceId === invoiceId && p.isActive).slice(-1)[0];
      createTransaction({
        clinicId: visit.clinicId,
        type: 'income',
        category: 'visit',
        amount: totalAmount,
        paymentMethod: (lastPayment?.method as any) ?? 'cash',
        referenceId: invoiceId,
        description: `Invoice paid — visit ${visit.id}`,
        descriptionAr: `تم سداد الفاتورة — زيارة ${visit.id}`,
        createdBy: lastPayment?.receivedBy,
      });
      // STEP 5 — record doctor earnings from doctorShare on invoice items
      const doctorShare = items.reduce((s, i) => s + (i.doctorShare ?? 0), 0);
      if (doctorShare > 0) {
        recordDoctorEarning({
          clinicId: visit.clinicId,
          doctorId: visit.doctorId,
          invoiceId,
          appointmentId: visit.appointmentId,
          baseAmount: doctorShare,
        });
      }

      // STEP 4 (insurance) — auto-create claim if patient has insurance
      const patient = patientStore.get(p => p.id === visit.patientId);
      if (patient?.insuranceCompanyId) {
        const apt = visit.appointmentId ? appointmentStore.get(a => a.id === visit.appointmentId) : null;
        const serviceName = apt?.specialtyId ?? 'Consultation';
        const split = calculateBillingSplit(visit.clinicId, patient.insuranceCompanyId, serviceName, totalAmount);
        createClaim({
          clinicId: visit.clinicId,
          insuranceCompanyId: patient.insuranceCompanyId,
          invoiceId,
          patientId: visit.patientId,
          serviceName,
          totalAmount: split.totalAmount,
          insuranceAmount: split.insurancePays,
          copayAmount: split.patientPays,
          status: 'pending',
        });
      }
    }
  }

  // Egyptian workflow: payment = arrival → auto-move to waiting queue
  if (status === 'paid' && wasPending) {
    const visit = visitStore.get(v => v.invoiceId === invoiceId);
    if (visit && (visit.status === 'checked_in' || visit.status === 'booked')) {
      const apt = visit.appointmentId ? appointmentStore.get(a => a.id === visit.appointmentId) : null;
      const isUrgentFlag = apt?.isUrgent || visit.isUrgent || false;
      visitStore.update(v => v.id === visit.id, {
        status: 'waiting' as VisitStatus,
        arrivalTime: new Date().toISOString(),
        isUrgent: isUrgentFlag,
        priority: visit.priority ?? (isUrgentFlag ? 'urgent' : 'normal') as VisitPriority,
      });
    }
  }
}

// ─── Add to Waiting Queue ───
// Moves a visit into the waiting queue with an arrival timestamp.
// Returns false (no-op) if the visit is already at or past the waiting stage.
export function addToQueue(visitId: string): boolean {
  const visit = visitStore.get(v => v.id === visitId);
  if (!visit) return false;
  if (['waiting', 'in_consultation', 'completed'].includes(visit.status)) return false;
  visitStore.update(v => v.id === visitId, {
    status: 'waiting' as VisitStatus,
    arrivalTime: new Date().toISOString(),
    priority: visit.priority ?? (visit.isUrgent ? 'urgent' : 'normal') as VisitPriority,
  });
  return true;
}

// ─── Create Visit atomically with Invoice ───
export function createVisitWithInvoice(data: {
  appointmentId?: string;
  patientId: string;
  doctorId: string;
  specialtyId: string;
  date: string;
  time: string;
  clinicId: string;
  notes?: string;
  serviceIds?: string[];
  visitTypeId?: string;
  isHomeVisit?: boolean;
  homeAddress?: string;
  homeArea?: string;
  homeCity?: string;
}): { visit: Visit; invoice: Invoice } {
  const now = new Date().toISOString();
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  const visitId = `v-${ts}-${rand}`;
  const invoiceId = `inv-${ts}-${rand}`;

  const invoice: Invoice = {
    id: invoiceId,
    visitId,
    patientId: data.patientId,
    status: 'pending',
    totalAmount: 0,
    paidAmount: 0,
    discountType: 'none',
    discountValue: 0,
    isActive: true,
    createdAt: now,
  };

  const visit: Visit = {
    id: visitId,
    appointmentId: data.appointmentId,
    patientId: data.patientId,
    doctorId: data.doctorId,
    specialtyId: data.specialtyId,
    status: data.appointmentId ? 'checked_in' : 'booked',
    invoiceId,
    date: data.date,
    time: data.time,
    clinicId: data.clinicId,
    notes: data.notes,
    createdAt: now,
    visitTypeId: data.visitTypeId,
    isHomeVisit: data.isHomeVisit,
    homeAddress: data.homeAddress,
    homeArea: data.homeArea,
    homeCity: data.homeCity,
  };

  invoiceStore.add(invoice);
  visitStore.add(visit);

  // Add services as invoice items if provided
  if (data.serviceIds?.length) {
    data.serviceIds.forEach(serviceId => {
      addInvoiceItem(invoiceId, serviceId);
    });
  }

  return { visit, invoice };
}

// ─── Add Invoice Item ───
export function addInvoiceItem(invoiceId: string, serviceId: string, quantity = 1) {
  const inv = invoiceStore.get(i => i.id === invoiceId);
  const visit = inv ? visitStore.get(v => v.id === inv.visitId) : null;
  if (visit?.clinicId) assertFinanceEnabled(visit.clinicId);

  const service = serviceStore.get(s => s.id === serviceId);
  if (!service) return;

  const unitPrice = service.price;
  const totalPrice = unitPrice * quantity;
  const doctorShare = Math.round(totalPrice * service.doctorPercentage / 100);

  const item: InvoiceItem = {
    id: `ii-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    invoiceId,
    serviceId,
    quantity,
    unitPrice,
    totalPrice,
    doctorShare,
  };

  invoiceItemStore.add(item);
  recomputeInvoice(invoiceId);
}

// ─── Add Visit Type as Invoice Item ───
export function addVisitTypeInvoiceItem(invoiceId: string, visitType: { id: string; name: string; nameAr: string; price: number }) {
  const item: InvoiceItem = {
    id: `ii-vt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    invoiceId,
    serviceId: visitType.id, // reuse serviceId field to store visitTypeId
    quantity: 1,
    unitPrice: visitType.price,
    totalPrice: visitType.price,
    doctorShare: 0,
  };
  invoiceItemStore.add(item);
  recomputeInvoice(invoiceId);
}

// ─── Add Payment ───
export function addPayment(data: {
  invoiceId: string;
  amount: number;
  method: Payment['method'];
  receivedBy: string;
}) {
  const inv = invoiceStore.get(i => i.id === data.invoiceId);
  const visit = inv ? visitStore.get(v => v.id === inv.visitId) : null;
  if (visit?.clinicId) assertFinanceEnabled(visit.clinicId);

  const payment: Payment = {
    id: `pay-${Date.now()}`,
    invoiceId: data.invoiceId,
    amount: data.amount,
    method: data.method,
    date: new Date().toISOString().split('T')[0],
    receivedBy: data.receivedBy,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  paymentStore.add(payment);
  recomputeInvoice(data.invoiceId);
}

// ─── Update Invoice Discount ───
export function updateInvoiceDiscount(invoiceId: string, discountType: Invoice['discountType'], discountValue: number) {
  const inv = invoiceStore.get(i => i.id === invoiceId);
  const visit = inv ? visitStore.get(v => v.id === inv.visitId) : null;
  if (visit?.clinicId) assertFinanceEnabled(visit.clinicId);

  // Clamp: negative discount would increase the total — never allow
  const safeValue = Math.max(0, discountValue);
  // Clamp percentage to [0, 100]
  const clampedValue = discountType === 'percentage' ? Math.min(100, safeValue) : safeValue;
  invoiceStore.update(
    i => i.id === invoiceId,
    { discountType, discountValue: clampedValue }
  );
  recomputeInvoice(invoiceId);
}

// ─── Update Visit Status ───
export function updateVisitStatus(visitId: string, status: VisitStatus) {
  visitStore.update(v => v.id === visitId, { status });
}

// ─── Workflow: Mark Waiting (checked_in → waiting) ───
// Returns { ok: false, blocked: 'unpaid' } when the invoice has not been paid.
// Pass force=true to bypass the check (insurance / credit / staff override).
export function markWaiting(
  visitId: string,
  force = false,
): { ok: boolean; blocked?: 'unpaid' } {
  const visit = visitStore.get(v => v.id === visitId);
  if (!visit || visit.status !== 'checked_in') return { ok: false };

  if (!force && visit.invoiceId) {
    const invoice = invoiceStore.get(i => i.id === visit.invoiceId);
    if (invoice && invoice.status !== 'paid') {
      return { ok: false, blocked: 'unpaid' };
    }
  }

  visitStore.update(v => v.id === visitId, {
    status: 'waiting' as VisitStatus,
    arrivalTime: new Date().toISOString(),
  });
  return { ok: true };
}

// ─── Confirm Check-In (staff override — bypasses payment gate) ───
// For insurance / post-consultation billing / credit arrangements.
// Moves checked_in or booked → waiting without requiring a paid invoice.
export function confirmCheckIn(visitId: string): boolean {
  const visit = visitStore.get(v => v.id === visitId);
  if (!visit || (visit.status !== 'checked_in' && visit.status !== 'booked')) return false;
  visitStore.update(v => v.id === visitId, {
    status: 'waiting' as VisitStatus,
    arrivalTime: new Date().toISOString(),
  });
  return true;
}

// ─── Update Visit Priority ───
// Valid values: 'normal' | 'urgent' | 'emergency'
// Blocked if the visit is already in_consultation or completed (STEP 6 safety).
export function updatePriority(
  visitId: string,
  priority: VisitPriority,
): { ok: boolean; blocked?: 'in_consultation' } {
  const visit = visitStore.get(v => v.id === visitId);
  if (!visit) return { ok: false };
  if (visit.status === 'in_consultation' || visit.status === 'completed') {
    return { ok: false, blocked: 'in_consultation' };
  }
  visitStore.update(v => v.id === visitId, {
    priority,
    isUrgent: priority !== 'normal',
  });
  return { ok: true };
}

// ─── Workflow: Send to Doctor (checked_in/waiting → in_consultation) ───
export function sendToDoctor(visitId: string) {
  const visit = visitStore.get(v => v.id === visitId);
  if (!visit || (visit.status !== 'checked_in' && visit.status !== 'waiting')) return false;
  visitStore.update(v => v.id === visitId, {
    status: 'in_consultation' as VisitStatus,
    visitStartTime: new Date().toISOString(),
  });
  return true;
}

// ─── Workflow: Complete Visit (in_consultation → completed) ───
export function completeVisit(visitId: string) {
  const visit = visitStore.get(v => v.id === visitId);
  if (!visit || visit.status !== 'in_consultation') return false;
  visitStore.update(v => v.id === visitId, {
    status: 'completed' as VisitStatus,
    visitEndTime: new Date().toISOString(),
  });
  if (visit.appointmentId) {
    appointmentStore.update(a => a.id === visit.appointmentId, { status: 'completed' as AppointmentStatus });
  }
  // STEP 3 — award +10 loyalty points on visit completion
  if (visit.patientId && visit.clinicId) {
    earnPointsForVisit(visit.patientId, visit.clinicId, visit.appointmentId ?? visitId);
  }
  return true;
}

// ─── Smart Queue: Average visit duration (last 20 completed, fallback 10 min) ───
export function getAvgVisitDuration(doctorId: string): number {
  const completed = visitStore.filter(
    v => v.doctorId === doctorId && v.status === 'completed'
      && !!v.visitStartTime && !!v.visitEndTime
  );
  const recent = completed
    .sort((a, b) => b.visitEndTime!.localeCompare(a.visitEndTime!))
    .slice(0, 20);
  if (recent.length === 0) return 10;
  const avgMs = recent.reduce((sum, v) =>
    sum + (new Date(v.visitEndTime!).getTime() - new Date(v.visitStartTime!).getTime()), 0
  ) / recent.length;
  return Math.max(1, Math.round(avgMs / 60_000));
}

// ─── Smart Queue: Position + estimated wait for a waiting visit ───
export function getQueueInfo(doctorId: string, visitId: string): {
  position: number;
  estimatedWaitMinutes: number;
  estimatedReadyAt: string;
} {
  const today = new Date().toISOString().split('T')[0];
  const waiting = visitStore.filter(
    v => v.doctorId === doctorId && v.date === today && v.status === 'waiting' && !v.isHomeVisit
  );
  const priorityWeight = (v: Visit): number => {
    if (v.priority === 'emergency') return 3;
    if (v.priority === 'urgent' || (!v.priority && v.isUrgent)) return 2;
    return 1;
  };
  waiting.sort((a, b) => {
    const pw = priorityWeight(b) - priorityWeight(a);
    if (pw !== 0) return pw;
    return (a.arrivalTime || a.createdAt).localeCompare(b.arrivalTime || b.createdAt);
  });
  const position = waiting.findIndex(v => v.id === visitId) + 1;
  if (position === 0) return { position: 0, estimatedWaitMinutes: 0, estimatedReadyAt: new Date().toISOString() };

  const avg = getAvgVisitDuration(doctorId);
  const inConsult = visitStore.get(
    v => v.doctorId === doctorId && v.date === today && v.status === 'in_consultation'
  );
  let currentRemainingMs = avg * 60_000;
  if (inConsult?.visitStartTime) {
    const elapsed = Date.now() - new Date(inConsult.visitStartTime).getTime();
    currentRemainingMs = Math.max(0, avg * 60_000 - elapsed);
  }
  const waitMs = currentRemainingMs + (position - 1) * avg * 60_000;
  return {
    position,
    estimatedWaitMinutes: Math.round(waitMs / 60_000),
    estimatedReadyAt: new Date(Date.now() + waitMs).toISOString(),
  };
}

// ─── Smart Queue: Move waiting patient to end of queue (no-show recovery) ───
export function skipToEnd(visitId: string): boolean {
  const visit = visitStore.get(v => v.id === visitId);
  if (!visit || visit.status !== 'waiting') return false;
  visitStore.update(v => v.id === visitId, {
    arrivalTime: new Date().toISOString(),
    priority: 'normal' as VisitPriority,
    isUrgent: false,
  });
  return true;
}

// ─── Check In Appointment → Visit + Invoice ───
export function checkInAppointment(appointmentId: string): { visit: Visit; invoice: Invoice } | null {
  const apt = appointmentStore.get(a => a.id === appointmentId);
  if (!apt || (apt.status !== 'scheduled' && apt.status !== 'confirmed')) return null;

  // Idempotent: if visit was pre-created at booking time, just upgrade to checked_in
  const existingVisit = visitStore.get(v => v.appointmentId === appointmentId);
  if (existingVisit && existingVisit.invoiceId) {
    const existingInvoice = invoiceStore.get(i => i.id === existingVisit.invoiceId);
    if (existingInvoice) {
      appointmentStore.update(a => a.id === appointmentId, { status: 'converted' as AppointmentStatus });
      if (existingInvoice.status === 'paid') {
        // Pre-paid (e.g. online) → skip checked_in and go straight to the waiting queue
        addToQueue(existingVisit.id);
        const queuedVisit = visitStore.get(v => v.id === existingVisit.id)!;
        return { visit: queuedVisit, invoice: existingInvoice };
      }
      visitStore.update(v => v.id === existingVisit.id, { status: 'checked_in' as VisitStatus });
      return { visit: { ...existingVisit, status: 'checked_in' as VisitStatus }, invoice: existingInvoice };
    }
  }

  // Find first consultation service for this specialty
  const consultService = serviceStore.get(s => s.specialtyId === apt.specialtyId && s.isActive);

  // If appointment has a visit type with a price, use that price as an item
  const visitType = apt.visitTypeId ? visitTypeStore.get(vt => vt.id === apt.visitTypeId) : null;

  // Update appointment status to converted
  appointmentStore.update(a => a.id === appointmentId, { status: 'converted' as AppointmentStatus });

  // Create visit with invoice — pass visitTypeId + home visit fields through
  const result = createVisitWithInvoice({
    appointmentId,
    patientId: apt.patientId,
    doctorId: apt.doctorId,
    specialtyId: apt.specialtyId,
    date: apt.date,
    time: apt.time,
    clinicId: apt.clinicId,
    notes: apt.notes,
    serviceIds: !visitType && !apt.isHomeVisit && consultService ? [consultService.id] : [],
    visitTypeId: apt.visitTypeId,
    isHomeVisit: apt.isHomeVisit,
    homeAddress: apt.homeAddress,
    homeArea: apt.homeArea,
    homeCity: apt.homeCity,
  });

  // Auto-add visit type as invoice item if selected
  if (visitType && result) {
    addVisitTypeInvoiceItem(result.invoice.id, visitType);
  }

  // Auto-add home visit fee as invoice item
  if (apt.isHomeVisit && result) {
    const doctor = userStore.get(u => u.id === apt.doctorId);
    const hvPrice = doctor?.homeVisitPrice || 0;
    if (hvPrice > 0) {
      addHomeVisitInvoiceItem(result.invoice.id, hvPrice);
    }
  }

  return result;
}

// ─── Pre-create visit+invoice at booking time ───
// Visit status = 'booked' (patient not yet arrived). Invoice = 'pending'.
// Allows receptionist to pay invoice when patient arrives → waiting queue.
// checkInAppointment is idempotent: finds this visit and upgrades to 'checked_in'.
export function preBookAppointment(appointmentId: string): { visit: Visit; invoice: Invoice } | null {
  const apt = appointmentStore.get(a => a.id === appointmentId);
  if (!apt) return null;
  // Don't duplicate
  if (visitStore.get(v => v.appointmentId === appointmentId)) return null;

  const consultService = serviceStore.get(s => s.specialtyId === apt.specialtyId && s.isActive);
  const visitType = apt.visitTypeId ? visitTypeStore.get(vt => vt.id === apt.visitTypeId) : null;

  // Create WITHOUT passing appointmentId → status = 'booked', not 'checked_in'
  const result = createVisitWithInvoice({
    patientId:   apt.patientId,
    doctorId:    apt.doctorId,
    specialtyId: apt.specialtyId,
    date:        apt.date,
    time:        apt.time,
    clinicId:    apt.clinicId || '',
    notes:       apt.notes,
    serviceIds:  !visitType && !apt.isHomeVisit && consultService ? [consultService.id] : [],
    visitTypeId: apt.visitTypeId,
    isHomeVisit: apt.isHomeVisit,
    homeAddress: apt.homeAddress,
    homeArea:    apt.homeArea,
    homeCity:    apt.homeCity,
  });

  if (result) {
    // Link visit back to appointment
    visitStore.update(v => v.id === result.visit.id, { appointmentId });
    if (visitType) addVisitTypeInvoiceItem(result.invoice.id, visitType);
    if (apt.isHomeVisit) {
      const doctor = userStore.get(u => u.id === apt.doctorId);
      const hvPrice = doctor?.homeVisitPrice || 0;
      if (hvPrice > 0) addHomeVisitInvoiceItem(result.invoice.id, hvPrice);
    }
  }
  return result;
}

// ─── Migration: retroactively create invoices for existing scheduled appointments ───
// Runs once in demo mode on billing/dashboard load. Safe to call multiple times
// (preBookAppointment skips if visit already exists).
export function ensureAppointmentInvoices() {
  const scheduledApts = appointmentStore.filter(
    a => a.status === 'scheduled' || a.status === 'confirmed'
  );
  for (const apt of scheduledApts) {
    preBookAppointment(apt.id);
  }
}

// ─── Safeguard: rescue visits stuck in 'checked_in' with a paid invoice ───────
// Called by queue components on mount to auto-heal any visits that missed the
// recomputeInvoice transition (e.g. because React state was stale during payment).
export function rescueStuckVisits(): number {
  const today = new Date().toISOString().slice(0, 10);
  const stuck = visitStore.filter(
    v => v.date === today && (v.status === 'checked_in' || v.status === 'booked')
  );
  let rescued = 0;
  for (const visit of stuck) {
    if (!visit.invoiceId) continue;
    const invoice = invoiceStore.get(i => i.id === visit.invoiceId);
    if (invoice && invoice.status === 'paid') {
      visitStore.update(v => v.id === visit.id, {
        status: 'waiting' as VisitStatus,
        arrivalTime: visit.arrivalTime ?? new Date().toISOString(),
        priority: visit.priority ?? (visit.isUrgent ? 'urgent' : 'normal') as VisitPriority,
      });
      rescued++;
    }
  }
  return rescued;
}

// ─── No-show configuration ───
export const NO_SHOW_THRESHOLD_MINUTES = 15;

export function markNoShow(appointmentId: string) {
  const visit = visitStore.get(v => v.appointmentId === appointmentId);
  // Do not downgrade a visit that is already active or finished
  if (visit?.status === 'in_consultation' || visit?.status === 'completed') return;

  appointmentStore.update(a => a.id === appointmentId, { status: 'no_show' as AppointmentStatus });
  if (visit) {
    visitStore.update(v => v.id === visit.id, { status: 'no_show' as VisitStatus });
  }
}

// ─── Automatic No-show Detection ───
// Scans all visits that are still 'booked' or 'checked_in' (patient expected but
// has not paid / entered the queue) and marks them as no_show when the
// appointment time + NO_SHOW_THRESHOLD_MINUTES has elapsed.
// Also handles the edge case where a waiting patient was manually queued via
// confirmCheckIn without payment (insurance/credit path).
//
// Returns the list of visitIds that were newly marked no_show.
// Pass `onNoShow` for an optional notification hook (STEP 7).
export function detectNoShow(
  onNoShow?: (visitId: string, patientId: string) => void,
): string[] {
  const now = Date.now();
  const thresholdMs = NO_SHOW_THRESHOLD_MINUTES * 60 * 1000;
  const markedIds: string[] = [];

  // Visits eligible for no-show: expected but not yet in active consultation/completed
  const candidates = visitStore.filter(
    v => v.status === 'booked' || v.status === 'checked_in',
  );

  for (const visit of candidates) {
    // Resolve appointment time from the linked appointment or the visit's own date/time
    const apt = visit.appointmentId
      ? appointmentStore.get(a => a.id === visit.appointmentId)
      : null;

    const dateStr = apt?.date ?? visit.date;
    const timeStr = apt?.time ?? visit.time;
    if (!dateStr || !timeStr) continue;

    const aptTime = new Date(`${dateStr}T${timeStr}:00`).getTime();
    if (isNaN(aptTime)) continue;

    if (now > aptTime + thresholdMs) {
      // Mark visit as no_show — removes it from all queue queries automatically
      visitStore.update(v => v.id === visit.id, { status: 'no_show' as VisitStatus });
      // Keep appointment in sync
      if (apt && apt.status !== 'no_show' && apt.status !== 'completed') {
        appointmentStore.update(a => a.id === apt.id, { status: 'no_show' as AppointmentStatus });
      }
      markedIds.push(visit.id);
      onNoShow?.(visit.id, visit.patientId);
    }
  }

  return markedIds;
}

// ─── Confirm Payment + Enter Queue (Smart Queue Engine STEP 3) ───
// Sets payment_confirmed flag and moves appointment → in_queue.
// The linked visit (if exists) is also moved to 'waiting'.
// Pass byUserId for audit trail.
export function confirmPaymentAndQueue(
  appointmentId: string,
  byUserId?: string,
): { ok: boolean; reason?: 'not_found' | 'already_queued' } {
  const apt = appointmentStore.get(a => a.id === appointmentId);
  if (!apt) return { ok: false, reason: 'not_found' };
  if (apt.status === 'in_queue' || apt.status === 'with_doctor' || apt.status === 'done') {
    return { ok: false, reason: 'already_queued' };
  }
  const now = new Date().toISOString();
  appointmentStore.update(a => a.id === appointmentId, {
    paymentConfirmed: true,
    checkedInAt: now,
    status: 'in_queue' as AppointmentStatus,
  });
  // Mirror on the linked visit if it exists
  const visit = visitStore.get(v => v.appointmentId === appointmentId);
  if (visit && !['waiting', 'in_consultation', 'completed'].includes(visit.status)) {
    visitStore.update(v => v.id === visit.id, {
      status: 'waiting' as VisitStatus,
      arrivalTime: now,
      priority: visit.priority ?? (apt.isEmergency ? 'emergency' : apt.isUrgent ? 'urgent' : 'normal') as VisitPriority,
    });
  }
  appendQueueAudit({ clinicId: apt.clinicId, action: 'confirm_payment', appointmentId, by: byUserId });
  return { ok: true };
}

// ─── Mark Emergency (Smart Queue Engine STEP 5) ───
// Escalates an appointment to emergency priority. Safe to call even if
// appointment is already in_queue — it re-sorts on next buildQueue call.
export function markAsEmergency(
  appointmentId: string,
  byUserId?: string,
): { ok: boolean; reason?: 'not_found' | 'completed' } {
  const apt = appointmentStore.get(a => a.id === appointmentId);
  if (!apt) return { ok: false, reason: 'not_found' };
  if (apt.status === 'done' || apt.status === 'completed') return { ok: false, reason: 'completed' };

  appointmentStore.update(a => a.id === appointmentId, {
    isEmergency: true,
    isUrgent: true,
    status: apt.status === 'expected' || apt.status === 'scheduled' || apt.status === 'confirmed'
      ? 'in_queue' as AppointmentStatus
      : apt.status,
    checkedInAt: apt.checkedInAt ?? new Date().toISOString(),
    paymentConfirmed: true,
  });
  // Escalate linked visit
  const visit = visitStore.get(v => v.appointmentId === appointmentId);
  if (visit) {
    visitStore.update(v => v.id === visit.id, {
      priority: 'emergency' as VisitPriority,
      isUrgent: true,
      status: ['booked', 'checked_in'].includes(visit.status) ? 'waiting' as VisitStatus : visit.status,
      arrivalTime: visit.arrivalTime ?? new Date().toISOString(),
    });
  }
  appendQueueAudit({ clinicId: apt.clinicId, action: 'mark_emergency', appointmentId, by: byUserId });
  return { ok: true };
}

// ─── Remove from Queue ───
// Pulls an appointment back from in_queue to expected (not cancelled).
export function removeFromQueue(
  appointmentId: string,
  byUserId?: string,
): boolean {
  const apt = appointmentStore.get(a => a.id === appointmentId);
  if (!apt || apt.status !== 'in_queue') return false;
  appointmentStore.update(a => a.id === appointmentId, {
    status: 'expected' as AppointmentStatus,
    checkedInAt: undefined,
    paymentConfirmed: false,
  });
  const visit = visitStore.get(v => v.appointmentId === appointmentId);
  if (visit?.status === 'waiting') {
    visitStore.update(v => v.id === visit.id, { status: 'checked_in' as VisitStatus });
  }
  appendQueueAudit({ clinicId: apt.clinicId, action: 'remove_from_queue', appointmentId, by: byUserId });
  return true;
}

// ─── Build Queue (Smart Queue Engine STEP 4) ───
// Returns the ordered list of in_queue appointments for a clinic,
// sorted by the clinic's strategy. Used by the Queue UI and API.
export function buildQueue(clinicId: string): Appointment[] {
  const settings = getQueueSettings(clinicId);

  const queued = appointmentStore.filter(
    a => a.clinicId === clinicId && a.status === 'in_queue',
  );

  if (queued.length === 0) return [];

  // Safety: drop any entries missing checkedInAt (STEP 8)
  const safe = queued.filter(a => !!a.checkedInAt);

  const byCheckin = (a: Appointment, b: Appointment) =>
    (a.checkedInAt!).localeCompare(b.checkedInAt!);

  // Partition
  const emergencies = safe.filter(a => a.isEmergency);
  const urgents     = safe.filter(a => !a.isEmergency && a.isUrgent);
  const normals     = safe.filter(a => !a.isEmergency && !a.isUrgent);

  emergencies.sort(byCheckin);
  urgents.sort(byCheckin);
  normals.sort(byCheckin);

  // Emergency patients always jump to front if allowEmergency is true
  const priorityBlock: Appointment[] = settings.allowEmergency
    ? [...emergencies, ...urgents]
    : [...urgents, ...emergencies];

  let sortedNormals: Appointment[];

  switch (settings.strategyType) {
    case 'urgent_first':
      // Already handled above; normals just FIFO
      sortedNormals = normals;
      break;

    case 'consult_first': {
      const consults   = normals.filter(a => a.visitTypeCategory === 'consultation');
      const checkups   = normals.filter(a => a.visitTypeCategory !== 'consultation');
      consults.sort(byCheckin);
      checkups.sort(byCheckin);
      sortedNormals = [...consults, ...checkups];
      break;
    }

    case 'consult_mix': {
      // Interleave: consultation, checkup, consultation, checkup…
      const consults = normals.filter(a => a.visitTypeCategory === 'consultation');
      const checkups = normals.filter(a => a.visitTypeCategory !== 'consultation');
      consults.sort(byCheckin);
      checkups.sort(byCheckin);
      const mixed: Appointment[] = [];
      const maxLen = Math.max(consults.length, checkups.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < consults.length) mixed.push(consults[i]);
        if (i < checkups.length) mixed.push(checkups[i]);
      }
      sortedNormals = mixed;
      break;
    }

    case 'custom': {
      if (settings.customPattern.length === 0) {
        sortedNormals = normals;
      } else {
        const buckets: Record<string, Appointment[]> = {};
        settings.customPattern.forEach(cat => { buckets[cat] = []; });
        buckets['_other'] = [];
        normals.forEach(a => {
          const cat = a.visitTypeCategory ?? '_other';
          (buckets[cat] ?? buckets['_other']).push(a);
        });
        Object.values(buckets).forEach(b => b.sort(byCheckin));
        const maxB = Math.max(...Object.values(buckets).map(b => b.length));
        const mixed: Appointment[] = [];
        for (let i = 0; i < maxB; i++) {
          settings.customPattern.forEach(cat => {
            if (i < (buckets[cat] ?? []).length) mixed.push(buckets[cat][i]);
          });
          if (i < buckets['_other'].length) mixed.push(buckets['_other'][i]);
        }
        sortedNormals = mixed;
      }
      break;
    }

    case 'fifo':
    default:
      sortedNormals = normals;
      break;
  }

  return [...priorityBlock, ...sortedNormals];
}

// ─── Mark Urgent (كشف مستعجل) ───
export function markUrgent(appointmentId: string) {
  appointmentStore.update(a => a.id === appointmentId, { isUrgent: true });
  const visit = visitStore.get(v => v.appointmentId === appointmentId);
  if (visit) {
    visitStore.update(v => v.id === visit.id, {
      isUrgent: true,
      priority: visit.priority === 'emergency' ? 'emergency' : 'urgent' as VisitPriority,
    });
  }
  return true;
}

// ─── Refund Invoice ───
export function refundInvoice(invoiceId: string) {
  const invoice = invoiceStore.get(i => i.id === invoiceId);
  if (!invoice || invoice.status === 'refunded') return false;
  const visit = visitStore.get(v => v.invoiceId === invoiceId);
  if (visit?.clinicId) assertFinanceEnabled(visit.clinicId);

  invoiceStore.update(i => i.id === invoiceId, { status: 'refunded' as InvoiceStatus });
  // Payment reversed → pull patient back out of the waiting queue
  if (visit?.status === 'waiting') {
    visitStore.update(v => v.id === visit.id, { status: 'checked_in' as VisitStatus });
  }
  // Record refund as expense in finance ledger so income reports stay accurate.
  // Use a unique referenceId (prefixed) to avoid the idempotency check collision
  // with the original income transaction that used invoiceId directly.
  if (visit?.clinicId && invoice.paidAmount > 0) {
    createTransaction({
      clinicId: visit.clinicId,
      type: 'expense',
      category: 'other',
      amount: invoice.paidAmount,
      referenceId: `refund-${invoiceId}`,
      description: `Refund — invoice ${invoiceId}`,
      descriptionAr: `استرداد — فاتورة ${invoiceId}`,
    });
  }
  return true;
}

// ─── Merge Urgent + Emergency Queue Blocks (STEP 8) ───
// Interleaves urgent and emergency patients: U1, E1, U2, E2 …
// `lastServedTier` is persisted state that determines whose slot comes first.
// If no urgents → emergencies fill the entire block (and vice versa).
// Safety: inputs are disjoint partitions — no duplicate visits can appear.
export function mergeUrgentWithEmergency(
  urgents: Visit[],
  emergencies: Visit[],
  lastServedTier: 'urgent' | 'emergency' | null,
): Visit[] {
  if (urgents.length === 0) return [...emergencies];
  if (emergencies.length === 0) return [...urgents];

  const result: Visit[] = [];
  let uIdx = 0, eIdx = 0;
  // Pattern starts with 'urgent' unless last served was 'urgent' (then 'emergency' leads).
  let turn: 'urgent' | 'emergency' = lastServedTier === 'urgent' ? 'emergency' : 'urgent';

  while (uIdx < urgents.length || eIdx < emergencies.length) {
    if (turn === 'urgent') {
      if (uIdx < urgents.length) result.push(urgents[uIdx++]);
      turn = 'emergency';
    } else {
      if (eIdx < emergencies.length) result.push(emergencies[eIdx++]);
      turn = 'urgent';
    }
  }
  return result;
}

// ─── Merge Priority Block + Normal Queue (STEP 8) ───
// Priority block (interleaved urgent+emergency) always precedes strategy-sorted normals.
export function mergeWithNormal(priorityBlock: Visit[], normals: Visit[]): Visit[] {
  return [...priorityBlock, ...normals];
}

// ─── Call Next Patient (moves next waiting → in_consultation for a doctor) ───
export function callNextPatient(doctorId: string): Visit | null {
  const waiting = visitStore.filter(
    v => v.doctorId === doctorId && v.status === 'waiting' && !v.isHomeVisit
  );
  if (waiting.length === 0) return null;

  // Look up clinic and strategy
  const doctor = userStore.get(u => u.id === doctorId);
  const clinicId = doctor?.clinicId;
  const qConfig = clinicId ? getClinicQueueStrategy(clinicId) : null;
  const strategy = qConfig?.strategy || 'B';
  const urgentFirst = qConfig?.urgentAlwaysFirst ?? true;

  const byArrival = (a: Visit, b: Visit) =>
    (a.arrivalTime || a.createdAt).localeCompare(b.arrivalTime || b.createdAt);

  // Priority weight: emergency=3, urgent=2, normal=1 (higher = served first)
  // Respects new `priority` field; falls back to legacy `isUrgent` boolean.
  const priorityWeight = (v: Visit): number => {
    if (v.priority === 'emergency') return 3;
    if (v.priority === 'urgent' || (!v.priority && v.isUrgent)) return 2;
    return 1;
  };

  // 3-level partition (emergency | urgent | normal)
  const emergencies = waiting.filter(v => priorityWeight(v) === 3);
  const urgents     = waiting.filter(v => priorityWeight(v) === 2);
  const normals     = waiting.filter(v => priorityWeight(v) === 1);

  let next!: Visit;
  let servedFromPriority = false;

  // ── Priority block: emergency always before urgent ───────────────────────────
  if (urgentFirst || strategy === 'E') {
    emergencies.sort(byArrival);
    urgents.sort(byArrival);
    const priorityBlock = [...emergencies, ...urgents];
    if (priorityBlock.length > 0) {
      next = priorityBlock[0];
      servedFromPriority = true;
    }
  }

  // ── Normal strategy layer — applies only when priority block is empty ─────────
  if (!servedFromPriority) {
    const pool = (urgentFirst || strategy === 'E') ? normals : waiting;

    switch (strategy) {
      case 'A':
      case 'E': {
        // Payment/arrival order only
        pool.sort(byArrival);
        next = pool[0];
        break;
      }

      case 'B': {
        // Visit type priority (sortOrder) then arrival
        pool.sort((a, b) => {
          const vtA = a.visitTypeId ? visitTypeStore.get(vt => vt.id === a.visitTypeId) : null;
          const vtB = b.visitTypeId ? visitTypeStore.get(vt => vt.id === b.visitTypeId) : null;
          const orderA = vtA ? vtA.sortOrder : 999;
          const orderB = vtB ? vtB.sortOrder : 999;
          if (orderA !== orderB) return orderA - orderB;
          return byArrival(a, b);
        });
        next = pool[0];
        break;
      }

      case 'C': {
        // Alternating: primary type (lowest sortOrder) vs. secondary types
        const allTypes = clinicId
          ? visitTypeStore
              .filter(vt => vt.clinicId === clinicId && !vt.isUrgent && vt.isEnabled)
              .sort((a, b) => a.sortOrder - b.sortOrder)
          : [];
        const primaryId = allTypes[0]?.id;

        const primary = pool.filter(v => v.visitTypeId === primaryId);
        const secondary = pool.filter(v => v.visitTypeId !== primaryId);

        const lastCat = qConfig?.lastServedCategory;
        let preferred: Visit[];
        let fallback: Visit[];

        if (lastCat === 'primary') {
          preferred = secondary;
          fallback = primary;
        } else {
          preferred = primary;
          fallback = secondary;
        }

        const serveFrom = preferred.length > 0 ? preferred : (fallback.length > 0 ? fallback : pool);
        serveFrom.sort(byArrival);
        next = serveFrom[0];

        // Track what category was served
        if (clinicId) {
          const newCat = next.visitTypeId === primaryId ? 'primary' : 'secondary';
          updateQueueStrategy(clinicId, { lastServedCategory: newCat });
        }
        break;
      }

      case 'D': {
        // Custom rotation pattern
        const pattern = qConfig?.rotationPattern || [];
        if (pattern.length === 0) {
          pool.sort(byArrival);
          next = pool[0];
        } else {
          const rotIdx = (qConfig?.rotationIndex || 0) % pattern.length;
          const expectedTypeId = pattern[rotIdx];
          const ofExpected = pool.filter(v => v.visitTypeId === expectedTypeId);
          const serveFrom = ofExpected.length > 0 ? ofExpected : pool;
          serveFrom.sort(byArrival);
          next = serveFrom[0];
          if (clinicId) {
            updateQueueStrategy(clinicId, { rotationIndex: rotIdx + 1 });
          }
        }
        break;
      }

      default: {
        pool.sort(byArrival);
        next = pool[0];
      }
    }
  }

  visitStore.update(v => v.id === next.id, { status: 'in_consultation' as VisitStatus, visitStartTime: new Date().toISOString() });
  return next;
}

// ─── Conflict Detection ───
export function hasConflict(doctorId: string, date: string, time: string, excludeId?: string): boolean {
  return appointmentStore.filter(
    a => a.doctorId === doctorId &&
         a.date === date &&
         a.time === time &&
         a.status !== 'cancelled' &&
         a.status !== 'no_show' &&
         (excludeId ? a.id !== excludeId : true)
  ).length > 0;
}

// ─── Cancel appointment with invoice guard ───────────────────────────────────
// Returns { ok: true } if cancelled (and deactivates any unpaid invoice).
// Returns { ok: false, blocked: 'paid' | 'partially_paid' } if invoice has payments.
export function cancelAppointmentWithCheck(
  appointmentId: string,
): { ok: boolean; blocked?: 'paid' | 'partially_paid' | 'in_consultation' | 'completed' } {
  const visit = visitStore.get(v => v.appointmentId === appointmentId);

  // Cannot cancel a visit already in progress or completed
  if (visit?.status === 'in_consultation') return { ok: false, blocked: 'in_consultation' };
  if (visit?.status === 'completed')       return { ok: false, blocked: 'completed' };

  if (visit?.invoiceId) {
    const invoice = invoiceStore.get(i => i.id === visit.invoiceId);
    if (invoice) {
      if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
        return { ok: false, blocked: invoice.status };
      }
      // Pending invoice → deactivate so it disappears from billing
      if (invoice.isActive) {
        invoiceStore.update(i => i.id === invoice.id, { isActive: false });
      }
    }
  }
  // Remove from waiting queue if patient was manually added via staff override
  if (visit?.status === 'waiting') {
    visitStore.update(v => v.id === visit.id, { status: 'cancelled' as VisitStatus });
  }
  appointmentStore.update(a => a.id === appointmentId, { status: 'cancelled' });
  return { ok: true };
}

// ─── Add Home Visit as Invoice Item ───
export function addHomeVisitInvoiceItem(invoiceId: string, price: number, language: string = 'en') {
  const item: InvoiceItem = {
    id: `ii-hv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    invoiceId,
    serviceId: 'home-visit',
    quantity: 1,
    unitPrice: price,
    totalPrice: price,
    doctorShare: 0,
  };
  invoiceItemStore.add(item);
  recomputeInvoice(invoiceId);
}

// ─── Create Appointment ───
export function createAppointment(data: {
  patientId: string;
  doctorId: string;
  specialtyId: string;
  date: string;
  time: string;
  clinicId: string;
  notes?: string;
  visitTypeId?: string;
  isUrgent?: boolean;
  isHomeVisit?: boolean;
  homeAddress?: string;
  homeArea?: string;
  homeCity?: string;
  homeLocationPin?: string;
}): Appointment {
  if (hasConflict(data.doctorId, data.date, data.time)) {
    throw new Error('SLOT_CONFLICT');
  }

  // Auto-flag as urgent if the selected visit type is an urgent type
  const visitType = data.visitTypeId ? visitTypeStore.get(vt => vt.id === data.visitTypeId) : null;
  const isUrgent = data.isUrgent || visitType?.isUrgent || false;

  const appointment: Appointment = {
    id: `apt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    patientId: data.patientId,
    doctorId: data.doctorId,
    specialtyId: data.specialtyId,
    date: data.date,
    time: data.time,
    status: 'scheduled',
    clinicId: data.clinicId,
    notes: data.notes,
    createdAt: new Date().toISOString(),
    visitTypeId: data.visitTypeId,
    visitTypeCategory: visitType?.category,
    isUrgent,
    isHomeVisit: data.isHomeVisit,
    homeAddress: data.homeAddress,
    homeArea: data.homeArea,
    homeCity: data.homeCity,
    homeLocationPin: data.homeLocationPin,
  };

  return appointmentStore.add(appointment);
}

// ─── Seed demo data (disabled — app uses Supabase) ───
// function seedDemoData() {
function _disabledSeedDemoData() {
  const C1 = 'clinic-1'; // Nile Medical Center
  const C2 = 'clinic-2'; // Cairo Health Clinic
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString().split('T')[0];

  // ─── Clinic 1 — Today's appointments in various workflow stages ───

  // 1. Scheduled (not arrived yet)
  createAppointment({ patientId: 'pt-1', doctorId: 'u-2', specialtyId: 'sp-1', date: today, time: '09:00', clinicId: C1, notes: 'Follow-up checkup' });
  createAppointment({ patientId: 'pt-6', doctorId: 'u-3', specialtyId: 'sp-2', date: today, time: '09:30', clinicId: C1 });
  createAppointment({ patientId: 'pt-7', doctorId: 'u-2', specialtyId: 'sp-1', date: today, time: '14:00', clinicId: C1, notes: 'Asthma follow-up' });

  // 2. Checked in — invoice pending
  const aptCheckedIn = createAppointment({ patientId: 'pt-2', doctorId: 'u-3', specialtyId: 'sp-2', date: today, time: '10:00', clinicId: C1 });
  checkInAppointment(aptCheckedIn.id);

  // 3. Paid → auto-moved to waiting queue
  const aptPaid = createAppointment({ patientId: 'pt-3', doctorId: 'u-4', specialtyId: 'sp-3', date: today, time: '10:30', clinicId: C1 });
  const resultPaid = checkInAppointment(aptPaid.id);
  if (resultPaid) {
    addPayment({ invoiceId: resultPaid.invoice.id, amount: resultPaid.invoice.totalAmount || 150, method: 'cash', receivedBy: 'u-6' });
    recomputeInvoice(resultPaid.invoice.id);
  }

  // 3b. Urgent patient in waiting queue
  const aptUrgent = createAppointment({ patientId: 'pt-8', doctorId: 'u-2', specialtyId: 'sp-1', date: today, time: '11:30', clinicId: C1 });
  markUrgent(aptUrgent.id);
  const resultUrgent = checkInAppointment(aptUrgent.id);
  if (resultUrgent) {
    addPayment({ invoiceId: resultUrgent.invoice.id, amount: resultUrgent.invoice.totalAmount || 150, method: 'cash', receivedBy: 'u-6' });
    recomputeInvoice(resultUrgent.invoice.id);
  }

  // 4. In consultation
  const aptInConsult = createAppointment({ patientId: 'pt-4', doctorId: 'u-3', specialtyId: 'sp-2', date: today, time: '11:00', clinicId: C1, notes: 'Prenatal checkup' });
  const resultConsult = checkInAppointment(aptInConsult.id);
  if (resultConsult) {
    addPayment({ invoiceId: resultConsult.invoice.id, amount: resultConsult.invoice.totalAmount || 200, method: 'card', receivedBy: 'u-6' });
    recomputeInvoice(resultConsult.invoice.id);
    sendToDoctor(resultConsult.visit.id);
  }

  // 5. Completed visit today
  const aptDone = createAppointment({ patientId: 'pt-5', doctorId: 'u-2', specialtyId: 'sp-1', date: today, time: '08:00', clinicId: C1 });
  const resultDone = checkInAppointment(aptDone.id);
  if (resultDone) {
    addPayment({ invoiceId: resultDone.invoice.id, amount: resultDone.invoice.totalAmount || 150, method: 'cash', receivedBy: 'u-6' });
    recomputeInvoice(resultDone.invoice.id);
    sendToDoctor(resultDone.visit.id);
    completeVisit(resultDone.visit.id);
  }

  // --- Tomorrow ---
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  createAppointment({ patientId: 'pt-8', doctorId: 'u-5', specialtyId: 'sp-4', date: tomorrow, time: '11:30', clinicId: C1 });

  // --- Past completed visits for clinic-1 ---
  const { invoice: inv1 } = createVisitWithInvoice({ patientId: 'pt-1', doctorId: 'u-2', specialtyId: 'sp-1', date: twoDaysAgo, time: '09:00', clinicId: C1, serviceIds: ['svc-1', 'svc-2'] });
  const pastVisit1 = visitStore.getAll().find(v => v.invoiceId === inv1.id);
  if (pastVisit1) updateVisitStatus(pastVisit1.id, 'completed');
  addPayment({ invoiceId: inv1.id, amount: inv1.totalAmount || 225, method: 'cash', receivedBy: 'u-6' });
  recomputeInvoice(inv1.id);

  const { invoice: inv2 } = createVisitWithInvoice({ patientId: 'pt-3', doctorId: 'u-4', specialtyId: 'sp-3', date: yesterday, time: '11:00', clinicId: C1, serviceIds: ['svc-5'] });
  const pastVisit2 = visitStore.getAll().find(v => v.invoiceId === inv2.id);
  if (pastVisit2) updateVisitStatus(pastVisit2.id, 'completed');
  addPayment({ invoiceId: inv2.id, amount: 120, method: 'card', receivedBy: 'u-6' });
  recomputeInvoice(inv2.id);

  const { invoice: inv3 } = createVisitWithInvoice({ patientId: 'pt-4', doctorId: 'u-3', specialtyId: 'sp-2', date: twoDaysAgo, time: '14:00', clinicId: C1, serviceIds: ['svc-3'] });
  const pastVisit3 = visitStore.getAll().find(v => v.invoiceId === inv3.id);
  if (pastVisit3) updateVisitStatus(pastVisit3.id, 'completed');

  const { invoice: inv4 } = createVisitWithInvoice({ patientId: 'pt-5', doctorId: 'u-2', specialtyId: 'sp-1', date: yesterday, time: '15:00', clinicId: C1, serviceIds: ['svc-1'] });
  const pastVisit4 = visitStore.getAll().find(v => v.invoiceId === inv4.id);
  if (pastVisit4) updateVisitStatus(pastVisit4.id, 'completed');
  addPayment({ invoiceId: inv4.id, amount: 100, method: 'insurance', receivedBy: 'u-6' });
  recomputeInvoice(inv4.id);

  // ─── Clinic 2 — Cairo Health Clinic seed data ───
  const aptC2 = createAppointment({ patientId: 'pt-20', doctorId: 'u-11', specialtyId: 'sp-1', date: today, time: '10:00', clinicId: C2 });
  const resultC2 = checkInAppointment(aptC2.id);
  if (resultC2) {
    addPayment({ invoiceId: resultC2.invoice.id, amount: 200, method: 'cash', receivedBy: 'u-12' });
    recomputeInvoice(resultC2.invoice.id);
  }
  createAppointment({ patientId: 'pt-21', doctorId: 'u-11', specialtyId: 'sp-1', date: today, time: '11:00', clinicId: C2 });

  const { invoice: invC2 } = createVisitWithInvoice({ patientId: 'pt-22', doctorId: 'u-11', specialtyId: 'sp-1', date: yesterday, time: '09:00', clinicId: C2, serviceIds: ['svc-1'] });
  const pastC2 = visitStore.getAll().find(v => v.invoiceId === invC2.id);
  if (pastC2) updateVisitStatus(pastC2.id, 'completed');
  addPayment({ invoiceId: invC2.id, amount: 150, method: 'cash', receivedBy: 'u-12' });
  recomputeInvoice(invC2.id);
}

// seedDemoData(); // disabled — data comes from Supabase
