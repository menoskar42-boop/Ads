import { DoctorClinicLink } from '@/types';
import { createStore } from './createStore';
import { CLINIC_IDS } from './clinicStore';

const mockLinks: DoctorClinicLink[] = [
  { id: 'dcl-1', doctorId: 'u-2', clinicId: CLINIC_IDS.NILE_MEDICAL, isActive: true },
  { id: 'dcl-2', doctorId: 'u-2', clinicId: CLINIC_IDS.CAIRO_HEALTH, isActive: true },
  { id: 'dcl-3', doctorId: 'u-3', clinicId: CLINIC_IDS.NILE_MEDICAL, isActive: true },
  { id: 'dcl-4', doctorId: 'u-4', clinicId: CLINIC_IDS.NILE_MEDICAL, isActive: true },
  { id: 'dcl-5', doctorId: 'u-5', clinicId: CLINIC_IDS.NILE_MEDICAL, isActive: true },
];

export const doctorClinicStore = createStore<DoctorClinicLink>(mockLinks, 'cf_doctor_clinic_links');

export const getClinicsForDoctor = (doctorId: string): string[] =>
  doctorClinicStore.filter(l => l.doctorId === doctorId && l.isActive).map(l => l.clinicId);

export const getDoctorsForClinic = (clinicId: string): string[] =>
  doctorClinicStore.filter(l => l.clinicId === clinicId && l.isActive).map(l => l.doctorId);

export const isMultiClinicDoctor = (doctorId: string): boolean =>
  doctorClinicStore.filter(l => l.doctorId === doctorId && l.isActive).length > 1;

export const addDoctorClinicLink = (doctorId: string, clinicId: string) => {
  const existing = doctorClinicStore.get(l => l.doctorId === doctorId && l.clinicId === clinicId);
  if (existing) {
    doctorClinicStore.update(l => l.doctorId === doctorId && l.clinicId === clinicId, { isActive: true });
  } else {
    doctorClinicStore.add({ id: `dcl-${Date.now()}`, doctorId, clinicId, isActive: true });
  }
};

export const removeDoctorClinicLink = (doctorId: string, clinicId: string) => {
  doctorClinicStore.update(l => l.doctorId === doctorId && l.clinicId === clinicId, { isActive: false });
};
