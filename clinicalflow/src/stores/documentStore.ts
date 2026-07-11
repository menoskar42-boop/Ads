import { createStore } from './createStore';
import { MedicalDocument, DocumentVisibilityMode } from '@/types';

const mockDocuments: MedicalDocument[] = [
  {
    id: 'doc-1',
    patientId: 'pt-1',
    specialtyId: 'spec-cardiology',
    doctorId: 'usr-doctor',
    uploadedBy: 'usr-doctor',
    documentType: 'lab_test',
    title: 'Blood Test - CBC',
    titleAr: 'تحليل دم - صورة دم كاملة',
    fileName: 'blood_test_cbc.pdf',
    mimeType: 'application/pdf',
    fileUrl: '',
    fileSize: 245000,
    notes: 'Routine blood work',
    uploadDate: '2026-02-15',
    createdAt: '2026-02-15T10:00:00Z',
  },
  {
    id: 'doc-2',
    patientId: 'pt-1',
    specialtyId: 'spec-cardiology',
    doctorId: 'usr-doctor',
    uploadedBy: 'usr-doctor',
    documentType: 'radiology',
    title: 'Chest X-Ray',
    titleAr: 'أشعة صدر',
    fileName: 'chest_xray.jpg',
    mimeType: 'image/jpeg',
    fileUrl: '',
    fileSize: 1500000,
    uploadDate: '2026-02-20',
    createdAt: '2026-02-20T14:30:00Z',
  },
  {
    id: 'doc-3',
    patientId: 'pt-1',
    specialtyId: 'spec-cardiology',
    doctorId: 'usr-doctor',
    uploadedBy: 'usr-doctor',
    documentType: 'prescription',
    title: 'Cardiology Prescription',
    titleAr: 'وصفة طبية - قلب',
    fileName: 'prescription_cardio.pdf',
    mimeType: 'application/pdf',
    fileUrl: '',
    fileSize: 120000,
    uploadDate: '2026-03-01',
    createdAt: '2026-03-01T09:00:00Z',
  },
  {
    id: 'doc-4',
    patientId: 'pt-1',
    specialtyId: 'spec-cardiology',
    doctorId: 'usr-doctor',
    uploadedBy: 'usr-admin',
    documentType: 'medical_report',
    title: 'ECG Report',
    titleAr: 'تقرير رسم القلب',
    fileName: 'ecg_report.pdf',
    mimeType: 'application/pdf',
    fileUrl: '',
    fileSize: 350000,
    uploadDate: '2026-03-05',
    createdAt: '2026-03-05T11:15:00Z',
  },
  {
    id: 'doc-5',
    patientId: 'pt-2',
    specialtyId: 'spec-cardiology',
    doctorId: 'usr-doctor',
    uploadedBy: 'usr-doctor',
    documentType: 'lab_test',
    title: 'Lipid Profile',
    titleAr: 'تحليل دهون',
    fileName: 'lipid_profile.pdf',
    mimeType: 'application/pdf',
    fileUrl: '',
    fileSize: 180000,
    uploadDate: '2026-02-28',
    createdAt: '2026-02-28T10:00:00Z',
  },
];

let visibilitySettings: Record<string, DocumentVisibilityMode> = {};

export const documentStore = createStore<MedicalDocument>(mockDocuments, 'cf_medical_documents');

export const getDocumentVisibility = (specialtyId: string): DocumentVisibilityMode => {
  return visibilitySettings[specialtyId] || 'specialty_all';
};

export const setDocumentVisibility = (specialtyId: string, mode: DocumentVisibilityMode) => {
  visibilitySettings = { ...visibilitySettings, [specialtyId]: mode };
};

export const getAllVisibilitySettings = (): Record<string, DocumentVisibilityMode> => {
  return { ...visibilitySettings };
};
