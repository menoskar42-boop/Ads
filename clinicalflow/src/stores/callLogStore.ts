import { createStore } from './createStore';
import { patientStore } from './patientStore';

export type CallOutcome = 'booked' | 'rescheduled' | 'cancelled' | 'inquiry' | 'no_answer';

export interface CallLog {
  id: string;
  clinicId?: string;
  patientId: string;
  userId: string;
  notes: string;
  outcome: CallOutcome;
  callTime: string;
}

const CALL_LOGS_KEY = 'cf_call_logs';
export const callLogStore = createStore<CallLog>([], CALL_LOGS_KEY);

export function addCallLog(log: Omit<CallLog, 'id'>): CallLog {
  const entry: CallLog = { ...log, id: crypto.randomUUID() };
  callLogStore.add(entry);
  return entry;
}

export function getCallLogsForPatient(patientId: string): CallLog[] {
  return callLogStore
    .filter(l => l.patientId === patientId)
    .sort((a, b) => b.callTime.localeCompare(a.callTime));
}

export function getCallLogsForClinic(clinicId: string, limit = 50): CallLog[] {
  return callLogStore
    .filter(l => l.clinicId === clinicId)
    .sort((a, b) => b.callTime.localeCompare(a.callTime))
    .slice(0, limit);
}

// ─── STEP 5: VIP helpers ──────────────────────────────────────────────────────

export function setPatientVip(patientId: string, isVip: boolean): void {
  patientStore.update(p => p.id === patientId, { isVip } as any);
}
