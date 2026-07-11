import { createStore } from './createStore';

export interface BodyAnnotation {
  id: string;
  patientId: string;
  visitId?: string;
  doctorId: string;
  view: 'front' | 'back' | 'face';
  zone: string;
  zoneAr: string;
  procedure: string;
  notes: string;
  createdAt: string;
}

export const bodyAnnotationStore = createStore<BodyAnnotation>([], 'cf_body_annotations');
