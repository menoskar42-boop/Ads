import { useState, useEffect, useCallback, useRef } from 'react';
import { Visit, Appointment, Invoice, InvoiceItem, Payment } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { getToken } from '@/utils/authToken';
// In-memory fallback stores (used when Supabase not configured)
import { visitStore, appointmentStore, invoiceStore, invoiceItemStore, paymentStore, preBookAppointment, ensureAppointmentInvoices, rescueStuckVisits, addPayment as addPaymentLocal, cancelAppointmentWithCheck, markWaiting as markWaitingLocal, confirmCheckIn as confirmCheckInLocal, addToQueue as addToQueueLocal, updatePriority as updatePriorityLocal, updateVisitStatus as updateVisitStatusLocal, sendToDoctor as sendToDoctorLocal, completeVisit as completeVisitLocal, markNoShow as markNoShowLocal, markUrgent as markUrgentLocal, checkInAppointment as checkInAppointmentLocal, addInvoiceItem as addInvoiceItemLocal, refundInvoice as refundInvoiceLocal, updateInvoiceDiscount as updateInvoiceDiscountLocal } from '@/stores/visitStore';
import { VisitPriority } from '@/types';
import { getDoctorsForClinic } from '@/stores/doctorClinicStore';
import { enqueueAction } from '@/stores/offlineQueue';
import { visitTypeStore } from '@/stores/visitTypeStore';
import { handleBookingByStrategy } from '@/stores/schedulingStrategyStore';

// ── shared fetch helper ───────────────────────────────────────────────────────
const API = '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ── useVisits ─────────────────────────────────────────────────────────────────
function filterVisitsForUser(all: Visit[], user: ReturnType<typeof useAuth>['user']) {
  if (!user) return all;
  if (user.role === 'doctor') return all.filter(v => v.doctorId === user.id);
  if (!user.clinicId) return all;
  return all.filter(v => v.clinicId === user.clinicId);
}

export const useVisits = () => {
  const { user } = useAuth();
  const [visits, setVisits]   = useState<Visit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async (date?: string) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // If no token, fall back immediately to in-memory store
      if (!getToken()) {
        rescueStuckVisits(); // heal any checked_in visits with paid invoices
        const all = visitStore.getAll();
        const filtered = filterVisitsForUser(all, user);
        setVisits(filtered);
        setLoading(false);
        return;
      }
      const qs = date ? `?date=${date}` : '';
      const data = await apiFetch<any[]>(`/visits${qs}`);
      // Normalise snake_case → camelCase for the existing UI components
      setVisits(data.map(v => ({
        id:             v.id,
        appointmentId:  v.appointment_id,
        patientId:      v.patient_id,
        doctorId:       v.doctor_id,
        specialtyId:    v.specialty_id,
        visitTypeId:    v.visit_type_id,
        invoiceId:      v.invoice_id,
        status:         v.status,
        date:           v.date,
        time:           v.time?.slice(0, 5) ?? '',
        isUrgent:       v.is_urgent,
        priority:       v.priority ?? (v.is_urgent ? 'urgent' : 'normal'),
        arrivalTime:    v.arrival_time,
        clinicId:       v.clinic_id,
        notes:          v.notes,
        isHomeVisit:    v.is_home_visit,
        homeAddress:    v.home_address,
        homeArea:       v.home_area,
        homeCity:       v.home_city,
        createdAt:      v.created_at,
      })));
    } catch (e: any) {
      // API failed → fallback to in-memory store
      const all = visitStore.getAll();
      const filtered = filterVisitsForUser(all, user);
      setVisits(filtered);
      setError(null); // don't show error when falling back gracefully
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial load + poll every 15 s for live queue updates
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    load(today);
    const id = setInterval(() => load(today), 15_000);
    return () => clearInterval(id);
  }, [load]);

  // Demo mode: re-sync immediately when visitStore changes (e.g. recomputeInvoice → 'waiting')
  useEffect(() => {
    if (getToken()) return; // API mode uses polling above
    return visitStore.subscribe(() => {
      if (!getToken() && user) {
        const all = visitStore.getAll();
        setVisits(filterVisitsForUser(all, user));
      }
    });
  }, [user]);

  const updateVisitStatus = useCallback(async (visitId: string, status: Visit['status']) => {
    if (!getToken()) {
      updateVisitStatusLocal(visitId, status);
      setVisits(prev => prev.map(v => v.id === visitId ? { ...v, status } : v));
      return;
    }
    await apiFetch(`/visits/${visitId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    setVisits(prev => prev.map(v => v.id === visitId ? { ...v, status } : v));
  }, []);

  const sendToDoctor = useCallback(async (visitId: string) => {
    if (!getToken()) {
      const ok = sendToDoctorLocal(visitId);
      if (ok) {
        setVisits(prev => prev.map(v =>
          v.id === visitId
            ? { ...v, status: 'in_consultation' as Visit['status'], visitStartTime: new Date().toISOString() }
            : v
        ));
      }
      return ok;
    }
    await updateVisitStatus(visitId, 'in_consultation');
    return true;
  }, [updateVisitStatus]);

  const completeVisit = useCallback(async (visitId: string) => {
    if (!getToken()) {
      completeVisitLocal(visitId);
      setVisits(prev => prev.map(v => v.id === visitId ? { ...v, status: 'completed' as Visit['status'] } : v));
      return true;
    }
    await updateVisitStatus(visitId, 'completed');
    return true;
  }, [updateVisitStatus]);

  const markWaiting = useCallback(async (
    visitId: string,
    force = false,
  ): Promise<{ ok: boolean; blocked?: 'unpaid' }> => {
    if (!getToken()) {
      const result = markWaitingLocal(visitId, force);
      if (result.ok) {
        setVisits(prev => prev.map(v =>
          v.id === visitId ? { ...v, status: 'waiting' as Visit['status'], arrivalTime: new Date().toISOString() } : v
        ));
      }
      return result;
    }
    try {
      await updateVisitStatus(visitId, 'waiting');
      return { ok: true };
    } catch {
      // Offline — apply locally and queue sync
      markWaitingLocal(visitId, true);
      setVisits(prev => prev.map(v =>
        v.id === visitId ? { ...v, status: 'waiting' as Visit['status'], arrivalTime: new Date().toISOString() } : v
      ));
      enqueueAction({
        action: 'queue_update',
        endpoint: `/visits/${visitId}`,
        method: 'PATCH',
        body: { status: 'waiting', arrival_time: new Date().toISOString() },
        timestamp: new Date().toISOString(),
        localId: visitId,
      });
      return { ok: true };
    }
  }, [updateVisitStatus]);

  const confirmCheckIn = useCallback(async (visitId: string): Promise<boolean> => {
    if (!getToken()) {
      const ok = confirmCheckInLocal(visitId);
      if (ok) {
        setVisits(prev => prev.map(v =>
          v.id === visitId ? { ...v, status: 'waiting' as Visit['status'], arrivalTime: new Date().toISOString() } : v
        ));
      }
      return ok;
    }
    await apiFetch(`/queue/${visitId}/confirm-checkin`, { method: 'PATCH' });
    return true;
  }, []);

  const addToQueue = useCallback(async (visitId: string): Promise<boolean> => {
    if (!getToken()) {
      const ok = addToQueueLocal(visitId);
      if (ok) {
        setVisits(prev => prev.map(v =>
          v.id === visitId ? { ...v, status: 'waiting' as Visit['status'], arrivalTime: new Date().toISOString() } : v
        ));
      }
      return ok;
    }
    await apiFetch(`/queue/${visitId}/add`, { method: 'POST' });
    return true;
  }, []);

  const updatePriority = useCallback(async (
    visitId: string,
    priority: VisitPriority,
  ): Promise<{ ok: boolean; blocked?: 'in_consultation' }> => {
    if (!getToken()) {
      const result = updatePriorityLocal(visitId, priority);
      if (result.ok) {
        setVisits(prev => prev.map(v =>
          v.id === visitId ? { ...v, priority, isUrgent: priority !== 'normal' } : v
        ));
      }
      return result;
    }
    await apiFetch(`/queue/${visitId}/priority`, {
      method: 'PATCH',
      body: JSON.stringify({ priority }),
    });
    return { ok: true };
  }, []);

  const callNextPatient = useCallback(async (doctorId: string) => {
    // Find first urgent then by arrival in local state (server already sorted)
    const waiting = visits.filter(
      v => v.doctorId === doctorId && v.status === 'waiting' && !v.isHomeVisit
    );
    if (!waiting.length) return null;
    waiting.sort((a, b) => {
      if (a.isUrgent && !b.isUrgent) return -1;
      if (!a.isUrgent && b.isUrgent) return 1;
      return (a.arrivalTime || a.createdAt).localeCompare(b.arrivalTime || b.createdAt);
    });
    const next = waiting[0];
    await updateVisitStatus(next.id, 'in_consultation');
    return next;
  }, [visits, updateVisitStatus]);

  const createVisitWithInvoice = useCallback(async (data: {
    patientId: string; doctorId: string; specialtyId?: string;
    visitTypeId?: string; appointmentId?: string; date: string;
    time: string; clinicId?: string; notes?: string;
    isHomeVisit?: boolean; homeAddress?: string; homeArea?: string; homeCity?: string;
  }) => {
    const result = await apiFetch<{ visit: any; invoice: any }>('/visits', {
      method: 'POST',
      body: JSON.stringify({
        patientId:     data.patientId,
        doctorId:      data.doctorId,
        specialtyId:   data.specialtyId,
        visitTypeId:   data.visitTypeId,
        appointmentId: data.appointmentId,
        date:          data.date,
        time:          data.time,
        notes:         data.notes,
        isHomeVisit:   data.isHomeVisit,
        homeAddress:   data.homeAddress,
        homeArea:      data.homeArea,
        homeCity:      data.homeCity,
      }),
    });
    // Refresh list
    const today = new Date().toISOString().split('T')[0];
    load(today);
    return result;
  }, [load]);

  return {
    visits, loading, error, reload: load,
    createVisitWithInvoice,
    updateVisitStatus,
    sendToDoctor,
    completeVisit,
    markWaiting,
    confirmCheckIn,
    addToQueue,
    updatePriority,
    callNextPatient,
  };
};

// ── useAppointments ───────────────────────────────────────────────────────────

// Appointments filter:
// - Doctor: always see appointments where they are the assigned doctor (by user.id)
// - Admin/Reception: see all appointments in their clinic (by clinicId)
//   with fallback for old data that has empty clinicId (match by doctorId in clinic)
function filterAppointmentsForUser(all: Appointment[], user: ReturnType<typeof useAuth>['user']) {
  if (!user) return all;
  if (user.role === 'doctor') {
    // Doctors always see their own appointments regardless of clinicId
    return all.filter(a => a.doctorId === user.id);
  }
  if (!user.clinicId) return all;
  const clinicDoctorIds = new Set(getDoctorsForClinic(user.clinicId));
  return all.filter(a =>
    a.clinicId === user.clinicId ||
    ((!a.clinicId || a.clinicId === '') && clinicDoctorIds.has(a.doctorId))
  );
}

export const useAppointments = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  const normalise = (a: any): Appointment => ({
    id:             a.id,
    patientId:      a.patient_id,
    doctorId:       a.doctor_id,
    specialtyId:    a.specialty_id ?? '',
    visitTypeId:    a.visit_type_id,
    date:           a.date,
    time:           a.time?.slice(0, 5) ?? '',
    status:         a.status,
    isUrgent:       a.is_urgent,
    clinicId:       a.clinic_id,
    notes:          a.notes,
    isHomeVisit:    a.is_home_visit,
    homeAddress:    a.home_address,
    homeArea:       a.home_area,
    homeCity:       a.home_city,
    homeLocationPin: a.home_location_pin,
    createdAt:      a.created_at,
    reminderSentConfirmation: a.reminder_sent_confirmation,
    reminderSent24h: a.reminder_sent_24h,
    reminderSent2h:  a.reminder_sent_2h,
  });

  const load = useCallback(async (date?: string) => {
    if (!user) return;
    setLoading(true);
    try {
      // No token → fallback to in-memory store
      if (!getToken()) {
        const all = appointmentStore.getAll();
        const filtered = filterAppointmentsForUser(all, user);
        setAppointments(filtered);
        setLoading(false);
        return;
      }
      const qs = date ? `?date=${date}` : '';
      const data = await apiFetch<any[]>(`/appointments${qs}`);
      setAppointments(data.map(normalise));
    } catch {
      // API failed → fallback to in-memory
      const all = appointmentStore.getAll();
      const filtered = filterAppointmentsForUser(all, user);
      setAppointments(filtered);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    // Reactive: re-sync when another component adds/updates an appointment
    return appointmentStore.subscribe(() => {
      if (!getToken() && user) {
        setAppointments(filterAppointmentsForUser(appointmentStore.getAll(), user));
      }
    });
  }, [load]);

  const createAppointment = useCallback(async (data: {
    patientId: string; doctorId: string; specialtyId: string;
    visitTypeId?: string; date: string; time: string;
    clinicId?: string; notes?: string; isUrgent?: boolean;
    isHomeVisit?: boolean; homeAddress?: string; homeArea?: string;
    homeCity?: string; homeLocationPin?: string;
  }) => {
    // ─── Scheduling strategy gate (runs for all paths) ───────────────────────
    if (!data.isHomeVisit) {
      const clinicId = data.clinicId || user?.clinicId || '';
      const strategyResult = handleBookingByStrategy(
        clinicId,
        { doctorId: data.doctorId, date: data.date, time: data.time },
        appointmentStore.getAll()
      );
      if (!strategyResult.ok) throw new Error(strategyResult.reason ?? 'BOOKING_REJECTED');
      // Attach computed fields so they're stored with the appointment
      (data as any).__queuePosition = strategyResult.queuePosition;
      (data as any).__expectedStartAt = strategyResult.estimatedStartTime
        ? `${data.date}T${strategyResult.estimatedStartTime}:00`
        : undefined;
    }

    if (!getToken()) {
      // Fallback: create in in-memory appointmentStore
      const vtCat = data.visitTypeId ? visitTypeStore.get(vt => vt.id === data.visitTypeId)?.category : undefined;
      const newApt = {
        id: `apt-${Date.now()}`,
        patientId:         data.patientId,
        doctorId:          data.doctorId,
        specialtyId:       data.specialtyId,
        visitTypeId:       data.visitTypeId,
        visitTypeCategory: vtCat,
        date:              data.date,
        time:              data.time,
        status:            'scheduled' as const,
        clinicId:          data.clinicId || user?.clinicId || '',
        notes:             data.notes,
        isUrgent:          data.isUrgent || false,
        isHomeVisit:       data.isHomeVisit || false,
        homeAddress:       data.homeAddress,
        homeArea:          data.homeArea,
        homeCity:          data.homeCity,
        createdAt:         new Date().toISOString(),
        queuePosition:     (data as any).__queuePosition,
        expectedStartAt:   (data as any).__expectedStartAt,
      };
      appointmentStore.add(newApt);
      // Pre-create visit+invoice so billing and doctor dashboard update immediately
      preBookAppointment(newApt.id);
      setAppointments(prev => [newApt, ...prev]);
      return newApt;
    }
    try {
      const result = await apiFetch<any>('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patientId:      data.patientId,
          doctorId:       data.doctorId,
          specialtyId:    data.specialtyId,
          visitTypeId:    data.visitTypeId,
          date:           data.date,
          time:           data.time,
          notes:          data.notes,
          isUrgent:       data.isUrgent,
          isHomeVisit:    data.isHomeVisit,
          homeAddress:    data.homeAddress,
          homeArea:       data.homeArea,
          homeCity:       data.homeCity,
        }),
      });
      setAppointments(prev => [normalise(result), ...prev]);
      return normalise(result);
    } catch {
      // Offline or server error — create locally and queue for sync
      const ts = new Date().toISOString();
      const newApt = {
        id: `apt-${Date.now()}`,
        patientId:         data.patientId,
        doctorId:          data.doctorId,
        specialtyId:       data.specialtyId,
        visitTypeId:       data.visitTypeId,
        visitTypeCategory: data.visitTypeId ? visitTypeStore.get(vt => vt.id === data.visitTypeId)?.category : undefined,
        date:              data.date,
        time:              data.time,
        status:            'scheduled' as const,
        clinicId:          data.clinicId || user?.clinicId || '',
        notes:             data.notes,
        isUrgent:          data.isUrgent || false,
        isHomeVisit:       data.isHomeVisit || false,
        homeAddress:       data.homeAddress,
        homeArea:          data.homeArea,
        homeCity:          data.homeCity,
        createdAt:         ts,
        queuePosition:     (data as any).__queuePosition,
        expectedStartAt:   (data as any).__expectedStartAt,
      };
      appointmentStore.add(newApt);
      preBookAppointment(newApt.id);
      // STEP 3: queue for server sync
      enqueueAction({
        action: 'create_appointment',
        endpoint: '/appointments',
        method: 'POST',
        body: { patientId: data.patientId, doctorId: data.doctorId, visitTypeId: data.visitTypeId, date: data.date, time: data.time, notes: data.notes, isUrgent: data.isUrgent },
        timestamp: ts,
        clinicId: data.clinicId || user?.clinicId,
        localId: newApt.id,
      });
      setAppointments(prev => [newApt, ...prev]);
      return newApt;
    }
  }, [user]);

  const cancelAppointment = useCallback(async (
    id: string,
  ): Promise<{ ok: boolean; blocked?: 'paid' | 'partially_paid' }> => {
    if (!getToken()) {
      // Demo mode: run invoice guard then update state
      const result = cancelAppointmentWithCheck(id);
      if (!result.ok) return result;
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' } : a));
      return { ok: true };
    }
    try {
      await apiFetch(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' } : a));
      return { ok: true };
    } catch (e: any) {
      const msg: string = e?.message || '';
      if (msg.includes('paid') || msg.includes('partially_paid')) {
        return { ok: false, blocked: msg.includes('partially') ? 'partially_paid' : 'paid' };
      }
      // Network / other error — fall back to local guard
      const result = cancelAppointmentWithCheck(id);
      if (!result.ok) return result;
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' } : a));
      return { ok: true };
    }
  }, []);

  const checkInAppointment = useCallback(async (appointmentId: string) => {
    const apt = appointments.find(a => a.id === appointmentId);
    if (!apt) return null;
    if (!getToken()) {
      const result = checkInAppointmentLocal(appointmentId);
      if (result) {
        setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status: 'converted' as any } : a));
      }
      return result;
    }
    try {
      const result = await apiFetch<{ visit: any; invoice: any }>('/visits', {
        method: 'POST',
        body: JSON.stringify({
          patientId:     apt.patientId,
          doctorId:      apt.doctorId,
          specialtyId:   apt.specialtyId,
          visitTypeId:   apt.visitTypeId,
          appointmentId: apt.id,
          date:          apt.date,
          time:          apt.time,
          notes:         apt.notes,
          isHomeVisit:   apt.isHomeVisit,
          homeAddress:   apt.homeAddress,
          homeArea:      apt.homeArea,
          homeCity:      apt.homeCity,
        }),
      });
      setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status: 'converted' as any } : a));
      return result;
    } catch (e: any) {
      console.warn('[checkInAppointment] API error — check-in failed silently:', e?.message ?? e);
      return null;
    }
  }, [appointments]);

  const markNoShow = useCallback(async (appointmentId: string) => {
    if (!getToken()) {
      markNoShowLocal(appointmentId);
      setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status: 'no_show' } : a));
      return;
    }
    await apiFetch(`/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'no_show' }),
    });
    setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status: 'no_show' } : a));
  }, []);

  const markUrgent = useCallback((appointmentId: string) => {
    markUrgentLocal(appointmentId);
    setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, isUrgent: true } : a));
  }, []);

  return {
    appointments, loading, reload: load,
    createAppointment, cancelAppointment,
    checkInAppointment, markNoShow, markUrgent,
  };
};

// ── Invoice filter: Invoice has no clinicId; derive it via visitId → Visit.clinicId ──
function filterInvoicesForUser(
  allInvoices: Invoice[],
  user: ReturnType<typeof useAuth>['user'],
): Invoice[] {
  if (!user) return allInvoices;
  if (user.role === 'super_admin') return allInvoices;
  if (!user.clinicId) return allInvoices;
  const clinicVisitIds = new Set(
    visitStore.filter(v => v.clinicId === user.clinicId).map(v => v.id)
  );
  return allInvoices.filter(inv => clinicVisitIds.has(inv.visitId));
}

// ── useInvoices ───────────────────────────────────────────────────────────────
export const useInvoices = () => {
  const { user } = useAuth();
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [invoiceItems, setItems]    = useState<InvoiceItem[]>([]);
  const [payments, setPayments]     = useState<Payment[]>([]);
  const [loading, setLoading]       = useState(false);

  const normaliseInvoice = (i: any): Invoice => ({
    id:            i.id,
    visitId:       i.visit_id,
    patientId:     i.patient_id,
    status:        i.status,
    totalAmount:   Number(i.total_amount ?? 0),
    paidAmount:    Number(i.paid_amount ?? 0),
    discountType:  i.discount_type ?? 'none',
    discountValue: Number(i.discount_value ?? 0),
    isActive:      i.is_active ?? true,
    createdAt:     i.created_at,
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await apiFetch<any[]>('/billing/invoices');
      const normInvoices = data.map(normaliseInvoice);
      setInvoices(normInvoices);

      // Flatten items + payments from nested response
      const allItems: InvoiceItem[] = [];
      const allPayments: Payment[]  = [];
      data.forEach(inv => {
        (inv.invoice_items || []).forEach((item: any) => {
          allItems.push({
            id: item.id, invoiceId: inv.id, serviceId: item.service_id,
            quantity: item.quantity, unitPrice: Number(item.unit_price),
            totalPrice: Number(item.total_price), doctorShare: Number(item.doctor_share),
          });
        });
        (inv.payments || []).forEach((p: any) => {
          allPayments.push({
            id: p.id, invoiceId: inv.id, amount: Number(p.amount),
            method: p.method, date: p.date, receivedBy: p.received_by,
            isActive: p.is_active ?? true, createdAt: p.created_at,
          });
        });
      });
      setItems(allItems);
      setPayments(allPayments);
    } catch {
      // Fallback to in-memory stores in demo mode
      if (!getToken()) {
        // Retroactively create invoices for any scheduled appointment that has none
        ensureAppointmentInvoices();
        const filteredInvs = filterInvoicesForUser(invoiceStore.getAll(), user);
        const filteredInvIds = new Set(filteredInvs.map(i => i.id));
        setInvoices(filteredInvs);
        setItems(invoiceItemStore.filter(it => filteredInvIds.has(it.invoiceId)));
        setPayments(paymentStore.filter(p => filteredInvIds.has(p.invoiceId)));
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    // Reactive: re-sync when invoices/payments are updated
    const unsubInv = invoiceStore.subscribe(() => {
      if (!getToken()) {
        const filteredInvs = filterInvoicesForUser(invoiceStore.getAll(), user);
        const filteredInvIds = new Set(filteredInvs.map(i => i.id));
        setInvoices(filteredInvs);
        setItems(invoiceItemStore.filter(it => filteredInvIds.has(it.invoiceId)));
        setPayments(paymentStore.filter(p => filteredInvIds.has(p.invoiceId)));
      }
    });
    return unsubInv;
  }, [load]);

  const addInvoiceItem = useCallback(async (invoiceId: string, serviceId: string, quantity = 1) => {
    if (!getToken()) {
      addInvoiceItemLocal(invoiceId, serviceId, quantity);
      return;
    }
    const result = await apiFetch<any>(`/billing/invoices/${invoiceId}/items`, {
      method: 'POST',
      body: JSON.stringify({ serviceId, quantity }),
    });
    load();
    return result;
  }, [load]);

  const addPayment = useCallback(async (data: {
    invoiceId: string; amount: number;
    method: Payment['method']; receivedBy?: string;
  }) => {
    if (!getToken()) {
      // Demo mode: record payment in local store (triggers invoiceStore.subscribe → React state update)
      addPaymentLocal({
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        receivedBy: data.receivedBy || '',
      });
      return;
    }
    const result = await apiFetch<any>(`/billing/invoices/${data.invoiceId}/pay`, {
      method: 'POST',
      body: JSON.stringify({ amount: data.amount, method: data.method }),
    });
    load();
    return result;
  }, [load]);

  const updateInvoiceDiscount = useCallback(async (
    invoiceId: string,
    discountType: Invoice['discountType'],
    discountValue: number,
  ) => {
    if (!getToken()) {
      updateInvoiceDiscountLocal(invoiceId, discountType, discountValue);
      return;
    }
    await apiFetch(`/billing/invoices/${invoiceId}/discount`, {
      method: 'PATCH',
      body: JSON.stringify({ discountType, discountValue }),
    });
    load();
  }, [load]);

  const refundInvoice = useCallback(async (invoiceId: string) => {
    if (!getToken()) {
      refundInvoiceLocal(invoiceId);
      return;
    }
    await apiFetch(`/billing/invoices/${invoiceId}/refund`, { method: 'POST' });
    load();
  }, [load]);

  const recomputeInvoice = useCallback(async (invoiceId: string) => {
    // Server computes automatically via triggers; just refresh
    load();
  }, [load]);

  return {
    invoices, invoiceItems, payments, loading, reload: load,
    addInvoiceItem, addPayment, recomputeInvoice,
    updateInvoiceDiscount, refundInvoice,
    getItemsForInvoice: (id: string) => invoiceItems.filter(i => i.invoiceId === id),
    getPaymentsForInvoice: (id: string) => payments.filter(p => p.invoiceId === id && p.isActive),
  };
};
