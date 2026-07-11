import { createStore } from './createStore';

export interface SpecialtyFormRecord {
  id: string;
  patientId: string;
  visitId?: string;
  doctorId: string;
  formType: string; // 'dermatology' | 'gynecology' | 'pediatrics' | 'general' | etc.
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const specialtyFormStore = createStore<SpecialtyFormRecord>([], 'cf_specialty_forms');
