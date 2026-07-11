import { createStore } from './createStore';

export interface ConsultationRequest {
  id: string;
  clinicId: string;
  patientName: string;
  patientPhone: string;
  consultationType: string;   // general | followup | surgery | emergency
  specialtyId?: string;
  specialtyName?: string;
  specialtyNameAr?: string;
  symptoms?: string;
  aiMessage?: string;
  status: 'pending' | 'handled' | 'cancelled';
  createdAt: string;
}

export const consultationRequestStore = createStore<ConsultationRequest>([], 'cf_consultation_requests');
