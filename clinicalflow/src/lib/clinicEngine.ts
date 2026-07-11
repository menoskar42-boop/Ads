// Clinic Automation Engine
// Thin orchestration layer: event constants + notification dispatch + queue actions.
// All functions are synchronous from the caller's perspective; HTTP notification
// is fire-and-forget (no await needed).

import { getToken } from '@/utils/authToken';
import {
  checkInAppointment,
  skipToEnd,
  markNoShow,
  getQueueInfo,
  getAvgVisitDuration,
  visitStore,
} from '@/stores/visitStore';

// ─── STEP 1: Event constants ────────────────────────────────────────────────
export const CLINIC_EVENTS = {
  BOOKING_CREATED:    'booking_created',
  PATIENT_CHECKED_IN: 'patient_checked_in',
  QUEUE_UPDATED:      'queue_updated',
  PATIENT_TURN_NEAR:  'patient_turn_near',
  PATIENT_TURN_NOW:   'patient_turn_now',
  NO_SHOW:            'no_show',
} as const;

export type ClinicEvent = typeof CLINIC_EVENTS[keyof typeof CLINIC_EVENTS];

// ─── STEP 2: sendNotification ────────────────────────────────────────────────
// Posts event to server (WhatsApp delivery). Falls back to console on error.
export function sendNotification(
  patientId: string,
  event: ClinicEvent,
  opts: { doctorId?: string; clinicId?: string; data?: Record<string, unknown> } = {},
): void {
  const body = { event, patientId, ...opts };
  const token = getToken();
  fetch('/api/clinic-event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }).catch(() => console.log('[clinicEngine]', event, patientId));
}

// ─── STEP 7: Near-turn detection (positions 1-3) ─────────────────────────────
export function checkNearTurn(
  doctorId: string,
  clinicId: string,
  waitingVisits: Array<{ id: string; patientId: string }>,
): void {
  waitingVisits.slice(0, 3).forEach((v, i) => {
    sendNotification(v.patientId, CLINIC_EVENTS.PATIENT_TURN_NEAR, {
      doctorId,
      clinicId,
      data: { position: i + 1, remaining: i },
    });
  });
}

// ─── STEP 3: Auto queue update on check-in ───────────────────────────────────
export function onCheckIn(
  appointmentId: string,
  doctorId: string,
  clinicId: string,
  waitingAfter: Array<{ id: string; patientId: string }>,
): ReturnType<typeof checkInAppointment> {
  const result = checkInAppointment(appointmentId);
  if (result) {
    sendNotification(result.visit.patientId, CLINIC_EVENTS.PATIENT_CHECKED_IN, { doctorId, clinicId });
    checkNearTurn(doctorId, clinicId, waitingAfter);
  }
  return result;
}

// ─── STEP 5: Doctor "Next" button ────────────────────────────────────────────
// Call AFTER updating visit status. Pass the visit that was just called.
export function onDoctorNext(
  calledVisit: { id: string; patientId: string },
  doctorId: string,
  clinicId: string,
  waitingAfter: Array<{ id: string; patientId: string }>,
): void {
  sendNotification(calledVisit.patientId, CLINIC_EVENTS.PATIENT_TURN_NOW, { doctorId, clinicId });
  sendNotification(calledVisit.patientId, CLINIC_EVENTS.QUEUE_UPDATED,    { doctorId, clinicId });
  checkNearTurn(doctorId, clinicId, waitingAfter);
}

// ─── STEP 4: No-show logic ────────────────────────────────────────────────────
// Moves patient to end of queue (soft skip) and fires no-show notification.
export function onNoShow(
  visitId: string,
  patientId: string,
  doctorId: string,
  clinicId: string,
  waitingAfter: Array<{ id: string; patientId: string }>,
): void {
  skipToEnd(visitId);
  sendNotification(patientId, CLINIC_EVENTS.NO_SHOW, { doctorId, clinicId });
  checkNearTurn(doctorId, clinicId, waitingAfter);
}

// ─── STEP 6: Estimated time helpers ─────────────────────────────────────────
export function getETA(doctorId: string, visitId: string): string {
  const info = getQueueInfo(doctorId, visitId);
  return info.estimatedReadyAt;
}

export function getAvgDuration(doctorId: string): number {
  return getAvgVisitDuration(doctorId);
}
