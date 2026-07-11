import { createStore } from './createStore';

export interface PatientMeta {
  patientId: string;
  tags: string[];
  isArchived: boolean;
  city?: string;
}

export const patientMetaStore = createStore<PatientMeta>([], 'cf_patient_meta');

export function getPatientMeta(patientId: string): PatientMeta {
  return patientMetaStore.get(m => m.patientId === patientId) || { patientId, tags: [], isArchived: false };
}

export function updatePatientMeta(patientId: string, updates: Partial<Omit<PatientMeta, 'patientId'>>) {
  const existing = patientMetaStore.get(m => m.patientId === patientId);
  if (existing) {
    patientMetaStore.update(m => m.patientId === patientId, updates);
  } else {
    patientMetaStore.add({ patientId, tags: [], isArchived: false, ...updates });
  }
}
