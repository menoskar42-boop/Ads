import { createStore } from './createStore';
import { AppointmentVisitType, Appointment } from '@/types';

// ─── Queue Settings (per clinic) ─────────────────────────────
export type QueueEngineStrategy = 'fifo' | 'urgent_first' | 'consult_mix' | 'consult_first' | 'custom';

export interface QueueEngineSettings {
  id: string;
  clinicId: string;
  strategyType: QueueEngineStrategy;
  customPattern: string[];   // ordered visit-type categories for 'custom'
  allowEmergency: boolean;
  smartOptimizationEnabled: boolean; // STEP 8 toggle
}

const seedSettings: QueueEngineSettings[] = [
  { id: 'clinic-1', clinicId: 'clinic-1', strategyType: 'urgent_first', customPattern: [], allowEmergency: true, smartOptimizationEnabled: true },
  { id: 'clinic-2', clinicId: 'clinic-2', strategyType: 'fifo',         customPattern: [], allowEmergency: true, smartOptimizationEnabled: true },
  { id: 'clinic-3', clinicId: 'clinic-3', strategyType: 'consult_mix',  customPattern: [], allowEmergency: true, smartOptimizationEnabled: true },
];

export const queueEngineStore = createStore<QueueEngineSettings>(seedSettings, 'cf_queue_engine_settings');

export function getQueueSettings(clinicId: string): QueueEngineSettings {
  return queueEngineStore.get(s => s.clinicId === clinicId) || {
    id: clinicId,
    clinicId,
    strategyType: 'fifo',
    customPattern: [],
    allowEmergency: true,
    smartOptimizationEnabled: true,
  };
}

export function saveQueueSettings(
  clinicId: string,
  changes: Partial<Omit<QueueEngineSettings, 'id' | 'clinicId'>>,
) {
  const existing = queueEngineStore.get(s => s.clinicId === clinicId);
  if (existing) {
    queueEngineStore.update(s => s.clinicId === clinicId, changes);
  } else {
    queueEngineStore.add({
      id: clinicId,
      clinicId,
      strategyType: 'fifo',
      customPattern: [],
      allowEmergency: true,
      ...changes,
    });
  }
}

// ─── Queue Audit Log (in-memory, no persistence needed for demo) ──
export interface QueueAuditEntry {
  ts: string;
  clinicId: string;
  action: 'confirm_payment' | 'mark_emergency' | 'remove_from_queue' | 'rebuild';
  appointmentId: string;
  by?: string;
}

const _auditLog: QueueAuditEntry[] = [];

export function appendQueueAudit(entry: Omit<QueueAuditEntry, 'ts'>) {
  _auditLog.push({ ts: new Date().toISOString(), ...entry });
  if (_auditLog.length > 500) _auditLog.shift(); // rolling cap
}

export function getQueueAuditLog(clinicId: string): QueueAuditEntry[] {
  return _auditLog.filter(e => e.clinicId === clinicId);
}

// ─── Helpers ─────────────────────────────────────────────────
export const STRATEGY_LABELS: Record<QueueEngineStrategy, { en: string; ar: string }> = {
  fifo:          { en: 'First In, First Out',        ar: 'الأول يُخدَّم أولاً' },
  urgent_first:  { en: 'Urgent First',               ar: 'العاجل أولاً' },
  consult_mix:   { en: 'Consultations Mixed',        ar: 'خلط الكشوفات' },
  consult_first: { en: 'Consultations First',        ar: 'الكشوفات أولاً' },
  custom:        { en: 'Custom Pattern',             ar: 'نمط مخصص' },
};

export const VISIT_TYPE_LABELS: Record<AppointmentVisitType, { en: string; ar: string }> = {
  checkup:      { en: 'Check-up',     ar: 'كشف' },
  consultation: { en: 'Consultation', ar: 'استشارة' },
};

// ─── STEP 3: Average duration (STEP 3) ───────────────────────
// Fallback durations when no history exists
const DURATION_FALLBACK: Record<string, number> = {
  checkup:      10,
  consultation: 15,
  _default:     12,
};

// Duration history store: { clinicId → { visitType → number[] } }
const _durationHistory: Record<string, Record<string, number[]>> = {};

export function recordActualDuration(clinicId: string, visitType: string | undefined, minutes: number) {
  if (minutes <= 0 || minutes > 180) return; // sanity cap
  const vt = visitType || '_default';
  if (!_durationHistory[clinicId]) _durationHistory[clinicId] = {};
  if (!_durationHistory[clinicId][vt]) _durationHistory[clinicId][vt] = [];
  const arr = _durationHistory[clinicId][vt];
  arr.push(minutes);
  if (arr.length > 20) arr.shift(); // keep last 20
}

export function getAverageDuration(clinicId: string, visitType: string | undefined): number {
  const vt = visitType || '_default';
  const arr = _durationHistory[clinicId]?.[vt];
  if (arr && arr.length > 0) {
    return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
  }
  return DURATION_FALLBACK[vt] ?? DURATION_FALLBACK['_default'];
}

// ─── STEP 4: Predict queue timing ────────────────────────────
export interface TimedAppointment extends Appointment {
  estimatedDuration: number;
  expectedStartAt: string;
  expectedEndAt: string;
  waitMinutes: number; // minutes from now until expectedStartAt
}

export function predictQueueTiming(
  queue: Appointment[],
  clinicId: string,
  nowMs: number = Date.now(),
): TimedAppointment[] {
  let cursor = nowMs;
  return queue.map(apt => {
    const dur = getAverageDuration(clinicId, apt.visitTypeCategory);
    const expectedStartAt = new Date(cursor).toISOString();
    const expectedEndAt   = new Date(cursor + dur * 60_000).toISOString();
    const waitMinutes     = Math.max(0, Math.round((cursor - nowMs) / 60_000));
    cursor += dur * 60_000;
    return { ...apt, estimatedDuration: dur, expectedStartAt, expectedEndAt, waitMinutes };
  });
}

// ─── STEP 5: Smart reordering ─────────────────────────────────
// Looks at the first `lookAhead` normal (non-priority) appointments.
// If a long consultation is followed by a short checkup, swaps them.
// Never touches the priority block (emergency/urgent).
// Returns a new array — does NOT mutate the input.
const LONG_THRESHOLD_MINUTES = 15;  // consultation longer than this is "long"
const SHORT_THRESHOLD_MINUTES = 12; // checkup shorter than this is "short"

export function smartReorder(
  queue: Appointment[],
  clinicId: string,
  lookAhead = 5,
): Appointment[] {
  // Separate priority block from normals
  const isPriority = (a: Appointment) => !!a.isEmergency || !!a.isUrgent;
  const priorityEnd = queue.findIndex(a => !isPriority(a));
  if (priorityEnd === -1) return [...queue]; // all priority — nothing to reorder

  const priorityBlock = queue.slice(0, priorityEnd);
  const normals       = [...queue.slice(priorityEnd)];

  // Single-pass bubble: for each position up to lookAhead,
  // if current is long and next is short, swap them once.
  const window = Math.min(lookAhead, normals.length - 1);
  for (let i = 0; i < window; i++) {
    const cur  = normals[i];
    const next = normals[i + 1];
    if (!next) break;

    const curDur  = getAverageDuration(clinicId, cur.visitTypeCategory);
    const nextDur = getAverageDuration(clinicId, next.visitTypeCategory);

    if (curDur >= LONG_THRESHOLD_MINUTES && nextDur <= SHORT_THRESHOLD_MINUTES) {
      normals[i]     = next;
      normals[i + 1] = cur;
      i++; // skip the swapped pair to avoid double-swap
    }
  }

  return [...priorityBlock, ...normals];
}

// ─── STEP 6: No-show risk score ───────────────────────────────
// Returns a score 0–100. Higher = more likely to no-show.
// Factors: late check-in relative to appointment time, repeat late history.
export function computeNoShowScore(apt: Appointment): number {
  let score = 0;

  // Factor 1: checked in very late compared to appointment time
  if (apt.checkedInAt && apt.date && apt.time) {
    const aptMs     = new Date(`${apt.date}T${apt.time}:00`).getTime();
    const checkInMs = new Date(apt.checkedInAt).getTime();
    const lateMin   = Math.round((checkInMs - aptMs) / 60_000);
    if (lateMin > 30) score += 50;
    else if (lateMin > 15) score += 30;
    else if (lateMin > 5)  score += 15;
  }

  // Factor 2: appointment has never been confirmed (still expected)
  if (!apt.paymentConfirmed) score += 20;

  // Factor 3: appointment is far past its scheduled time and still not started
  if (apt.date && apt.time) {
    const aptMs   = new Date(`${apt.date}T${apt.time}:00`).getTime();
    const overMin = Math.round((Date.now() - aptMs) / 60_000);
    if (overMin > 20) score += 30;
    else if (overMin > 10) score += 15;
  }

  return Math.min(100, score);
}

export type DelayLevel = 'green' | 'yellow' | 'red';

// Derives green/yellow/red from waitMinutes
export function getDelayLevel(waitMinutes: number): DelayLevel {
  if (waitMinutes <= 10) return 'green';
  if (waitMinutes <= 25) return 'yellow';
  return 'red';
}
