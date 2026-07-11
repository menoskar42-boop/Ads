import { MedicalNote } from '@/types';
import { createStore } from './createStore';

const mockNotes: MedicalNote[] = [
  {
    id: 'mn-1', patientId: 'pt-1', visitId: 'v-1', doctorId: 'doc-1',
    category: 'diagnosis', title: 'Hypertension Stage 1',
    content: 'Blood pressure consistently elevated at 140/90. Started on Lisinopril 10mg daily. Monitor in 2 weeks.',
    attachments: [],
    createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'mn-2', patientId: 'pt-1', doctorId: 'doc-1',
    category: 'allergy', title: 'Penicillin Allergy',
    content: 'Patient reports rash and swelling when taking Penicillin-based antibiotics. Avoid all penicillin derivatives.',
    attachments: [],
    createdAt: '2023-09-10T08:30:00Z', updatedAt: '2023-09-10T08:30:00Z',
  },
  {
    id: 'mn-3', patientId: 'pt-1', doctorId: 'doc-2',
    category: 'prescription', title: 'Lisinopril 10mg',
    content: 'Take once daily in the morning. Refill for 3 months.',
    attachments: [],
    createdAt: '2024-01-15T10:15:00Z', updatedAt: '2024-01-15T10:15:00Z',
  },
  {
    id: 'mn-4', patientId: 'pt-2', doctorId: 'doc-1',
    category: 'general', title: 'Annual Checkup',
    content: 'All vitals within normal range. No concerns reported. Continue current routine.',
    attachments: [],
    createdAt: '2024-02-20T09:00:00Z', updatedAt: '2024-02-20T09:00:00Z',
  },
  {
    id: 'mn-5', patientId: 'pt-3', doctorId: 'doc-1',
    category: 'chronic_condition', title: 'Type 2 Diabetes',
    content: 'HbA1c at 7.2%. Currently on Metformin 500mg BID. Dietary counseling provided.',
    attachments: [],
    createdAt: '2023-11-05T14:00:00Z', updatedAt: '2024-01-10T11:00:00Z',
  },
  {
    id: 'mn-6', patientId: 'pt-3', doctorId: 'doc-2',
    category: 'follow_up', title: 'Diabetes Follow-up',
    content: 'HbA1c improved to 6.8%. Continue current medication. Recheck in 3 months.',
    attachments: [],
    createdAt: '2024-03-01T10:00:00Z', updatedAt: '2024-03-01T10:00:00Z',
  },
];

export const medicalNoteStore = createStore<MedicalNote>(mockNotes, 'cf_medical_notes');
