import { createStore } from './createStore';

export type DocumentType = 'xray' | 'lab' | 'external_report' | 'prescription' | 'other';

export interface UploadedDocument {
  id: string;
  patientId: string;
  clinicId: string;
  doctorId: string;
  type: DocumentType;
  fileName: string;
  fileType: 'image' | 'pdf';
  fileData: string; // base64
  notes?: string;
  uploadedAt: string;
  uploadedBy: string;
}

export const documentUploadStore = createStore<UploadedDocument>([], 'cf_uploaded_documents');
