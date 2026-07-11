// dataMask.ts — role-aware field masking (STEP 6)
// Receptionists see limited patient data; admins/doctors see full data.

import { Patient } from '@/types';
import { UserRole } from '@/types';

// ─── Phone masking: show last 4 digits only ───────────────────
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return '*'.repeat(phone.length - 4) + phone.slice(-4);
}

// ─── Email masking: show first char + domain ──────────────────
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

// ─── National ID masking ──────────────────────────────────────
export function maskNationalId(id: string): string {
  if (id.length <= 4) return '****';
  return '*'.repeat(id.length - 4) + id.slice(-4);
}

// ─── Patient data masking by role ─────────────────────────────
export interface MaskedPatient {
  id: string;
  name: string;
  nameAr: string;
  phone: string;          // masked for reception
  email?: string;         // masked for reception
  nationalId?: string;    // hidden for reception
  dateOfBirth?: string;   // hidden for reception
  gender?: string;
  _masked: boolean;
}

export function maskPatient(patient: Patient, role: UserRole | undefined): MaskedPatient {
  const canSeeFull = role === 'admin' || role === 'doctor' || role === 'super_admin';
  if (canSeeFull) {
    return { ...patient, _masked: false };
  }
  // Reception and others — name only + masked sensitive fields
  return {
    id: patient.id,
    name: patient.name,
    nameAr: patient.nameAr,
    phone: patient.phone ? maskPhone(patient.phone) : '',
    email: patient.email ? maskEmail(patient.email) : undefined,
    nationalId: undefined,
    dateOfBirth: undefined,
    gender: patient.gender,
    _masked: true,
  };
}

// ─── Invoice masking (reception sees totals, not line details) ─
export function canViewInvoiceDetails(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

// ─── Financial report access ──────────────────────────────────
export function canViewFinancials(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

// ─── Generic field redactor ────────────────────────────────────
export function redact(value: string, role: UserRole | undefined, allowedRoles: string[]): string {
  if (allowedRoles.includes(role ?? '')) return value;
  return '••••••';
}
