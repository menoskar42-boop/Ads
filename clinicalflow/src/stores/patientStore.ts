import { Patient } from '@/types';
import { createStore } from './createStore';
import { CLINIC_IDS } from './clinicStore';

// ── localStorage key ──────────────────────────────────────────────────────────
const LS_KEY = 'cf_registered_patients';

// ── Load any previously registered patients from localStorage ────────────────
function loadRegisteredPatients(): Patient[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Patient[];
  } catch {
    return [];
  }
}

// ── Save a new patient to localStorage ───────────────────────────────────────
export function persistPatient(patient: Patient): void {
  try {
    const existing = loadRegisteredPatients();
    if (existing.some(p => p.id === patient.id)) return;
    localStorage.setItem(LS_KEY, JSON.stringify([...existing, patient]));
  } catch {
    // localStorage unavailable — graceful degradation
  }
}

// ── Seed data (removed — patients come from Supabase) ────────────────────────
const mockPatients: Patient[] = [];

// ── Merge seed + persisted patients (no duplicates) ───────────────────────────
const persistedPatients = loadRegisteredPatients();
const allInitialPatients = [
  ...mockPatients,
  ...persistedPatients.filter(p => !mockPatients.some(m => m.id === p.id)),
];

export const patientStore = createStore<Patient>(allInitialPatients, 'cf_registered_patients', true);
