import { createStore } from './createStore';
import { DocumentAuditLog } from '@/types';

const mockAuditLogs: DocumentAuditLog[] = [
  {
    id: 'audit-1',
    userId: 'u-2',
    patientId: 'pt-1',
    documentId: 'doc-1',
    action: 'upload',
    timestamp: '2026-02-15T10:00:00Z',
    clinicId: 'clinic-1',
    metadata: { documentType: 'lab_test', specialtyId: 'spec-cardiology' },
  },
  {
    id: 'audit-2',
    userId: 'u-2',
    patientId: 'pt-1',
    documentId: 'doc-2',
    action: 'upload',
    timestamp: '2026-02-20T14:30:00Z',
    clinicId: 'clinic-1',
    metadata: { documentType: 'radiology', specialtyId: 'spec-cardiology' },
  },
  {
    id: 'audit-3',
    userId: 'u-1',
    patientId: 'pt-1',
    documentId: 'doc-1',
    action: 'view',
    timestamp: '2026-02-16T08:00:00Z',
    clinicId: 'clinic-1',
  },
  {
    id: 'audit-4',
    userId: 'u-2',
    patientId: 'pt-1',
    documentId: 'doc-3',
    action: 'upload',
    timestamp: '2026-03-01T09:00:00Z',
    clinicId: 'clinic-1',
    metadata: { documentType: 'prescription', specialtyId: 'spec-cardiology' },
  },
  {
    id: 'audit-5',
    userId: 'u-2',
    patientId: 'pt-2',
    documentId: `rx:rx-1`,
    action: 'view_prescription',
    timestamp: '2026-03-05T11:00:00Z',
    clinicId: 'clinic-1',
  },
  {
    id: 'audit-6',
    userId: 'u-1',
    patientId: 'pt-3',
    documentId: `patient:pt-3`,
    action: 'view_patient',
    timestamp: '2026-03-08T09:30:00Z',
    clinicId: 'clinic-1',
  },
];

export const documentAuditStore = createStore<DocumentAuditLog>(mockAuditLogs, 'cf_document_audit');
