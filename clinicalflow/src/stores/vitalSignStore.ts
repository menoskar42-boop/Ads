import { VitalSign } from '@/types';
import { createStore } from './createStore';

const mockVitals: VitalSign[] = [
  {
    id: 'vs-1', patientId: 'pt-1', visitId: 'v-1', doctorId: 'doc-1',
    systolic: 140, diastolic: 90, heartRate: 78, temperature: 36.8, weight: 82, height: 175, oxygenSaturation: 98,
    recordedAt: '2024-01-15T10:00:00Z', createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'vs-2', patientId: 'pt-1', doctorId: 'doc-1',
    systolic: 135, diastolic: 85, heartRate: 72, temperature: 36.6, weight: 81, height: 175, oxygenSaturation: 99,
    recordedAt: '2024-02-10T09:30:00Z', createdAt: '2024-02-10T09:30:00Z',
  },
  {
    id: 'vs-3', patientId: 'pt-1', doctorId: 'doc-2',
    systolic: 130, diastolic: 82, heartRate: 70, temperature: 36.7, weight: 80, height: 175, oxygenSaturation: 98,
    recordedAt: '2024-03-05T11:00:00Z', createdAt: '2024-03-05T11:00:00Z',
  },
  {
    id: 'vs-4', patientId: 'pt-2', doctorId: 'doc-1',
    systolic: 120, diastolic: 80, heartRate: 68, temperature: 36.5, weight: 65, height: 162, oxygenSaturation: 99,
    recordedAt: '2024-02-20T09:00:00Z', createdAt: '2024-02-20T09:00:00Z',
  },
  {
    id: 'vs-5', patientId: 'pt-3', doctorId: 'doc-1',
    systolic: 145, diastolic: 92, heartRate: 82, temperature: 37.0, weight: 95, height: 180, oxygenSaturation: 97,
    recordedAt: '2023-11-05T14:00:00Z', createdAt: '2023-11-05T14:00:00Z',
  },
];

export const vitalSignStore = createStore<VitalSign>(mockVitals, 'cf_vital_signs');
