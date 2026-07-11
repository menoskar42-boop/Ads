import { RegistrationEntry, RegistrationType } from '@/types';
import { createStore } from './createStore';

// ── localStorage keys ─────────────────────────────────────────────────────────
const LS_KEY = 'cf_registrations';

function loadPersistedRegistrations(): RegistrationEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAllRegistrations(entries: RegistrationEntry[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch { /* graceful */ }
}

// ── Seed data ─────────────────────────────────────────────────────────────────
const mockRegistrations: RegistrationEntry[] = [
  {
    id: 'reg-seed-1', regNumber: 'DOC-20001', referralCode: 'DOC-20001',
    type: 'doctor', name: 'Dr. Ahmed Hassan', email: 'ahmed@nilemedical.com',
    phone: '01012345678', password: '', specialtyId: 'sp-1', userId: 'u-2',
    status: 'approved', approvedAt: '2024-01-01T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'reg-seed-2', regNumber: 'DOC-20002', referralCode: 'DOC-20002',
    type: 'doctor', name: 'Dr. Sara Ibrahim', email: 'sara@cairohealth.com',
    phone: '01098765432', password: '', specialtyId: 'sp-2', userId: 'u-3',
    status: 'approved', approvedAt: '2024-01-01T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'reg-seed-3', regNumber: 'DOC-20003', referralCode: 'DOC-20003',
    type: 'doctor', name: 'Dr. Omar Farouk', email: 'omar@alexandriacare.com',
    phone: '01023456789', password: '', specialtyId: 'sp-3', userId: 'u-4',
    status: 'approved', approvedAt: '2024-01-01T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'reg-seed-4', regNumber: 'DOC-20004', referralCode: 'DOC-20004',
    type: 'doctor', name: 'Dr. Nour Salah', email: 'nour@nilemedical.com',
    phone: '01056789012', password: '', specialtyId: 'sp-4', userId: 'u-5',
    status: 'approved', approvedAt: '2024-01-01T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'reg-seed-5', regNumber: 'CLN-30001', referralCode: 'CLN-30001',
    type: 'clinic', name: 'Nile Medical Center', clinicName: 'Nile Medical Center',
    email: 'info@nilemedical.com', phone: '0223456789', password: '',
    address: '15 Nile Street, Cairo', city: 'Cairo', adminName: 'Admin Nile',
    userId: 'u-1', linkedClinicId: 'clinic-1',
    status: 'approved', approvedAt: '2024-01-01T00:00:00.000Z',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
];

// ── Merge seed + persisted (no duplicates by id) ──────────────────────────────
const persisted = loadPersistedRegistrations();
const allInitial = [
  ...mockRegistrations,
  ...persisted.filter(p => !mockRegistrations.some(m => m.id === p.id)),
];

export const registrationStore = createStore<RegistrationEntry>(allInitial, 'cf_registrations', true);

// ── Helpers ───────────────────────────────────────────────────────────────────
const getNextNumber = (type: RegistrationType): string => {
  const prefix = type === 'patient' ? 'PAT' : type === 'doctor' ? 'DOC' : 'CLN';
  const base   = type === 'patient' ? 10001 : type === 'doctor' ? 20001 : 30001;
  const all    = registrationStore.filter(r => r.type === type);
  return `${prefix}-${base + all.length}`;
};

const generateReferralCode = (type: RegistrationType, regNumber: string): string => {
  const num    = regNumber.split('-')[1];
  const prefix = type === 'patient' ? 'PAT' : type === 'doctor' ? 'DOC' : 'CLN';
  return `${prefix}-${num}`;
};

function syncToStorage() {
  saveAllRegistrations(registrationStore.getAll());
}

// ── Public API ────────────────────────────────────────────────────────────────

export const registerUser = (
  data: Omit<RegistrationEntry, 'id' | 'regNumber' | 'referralCode' | 'createdAt' | 'status'>
): { entry?: RegistrationEntry; error?: string } => {
  // ── Check for duplicate email ──────────────────────────────────────────────
  const allRegs = [
    ...registrationStore.getAll(),
    ...loadPersistedRegistrations(),
  ];
  const emailExists = allRegs.some(
    r => r.email.toLowerCase() === data.email.toLowerCase()
  );
  if (emailExists) {
    return { error: 'يوجد طلب مسجّل بهذا البريد الإلكتروني مسبقاً.' };
  }
  const phoneExists = data.phone && allRegs.some(
    r => r.phone === data.phone && r.type === data.type
  );
  if (phoneExists) {
    return { error: 'يوجد طلب مسجّل بهذا الرقم مسبقاً.' };
  }

  const regNumber    = getNextNumber(data.type);
  const referralCode = generateReferralCode(data.type, regNumber);
  const entry: RegistrationEntry = {
    ...data,
    id:           `reg-${Date.now()}`,
    regNumber,
    referralCode,
    status:       data.type === 'patient' ? 'approved' : 'pending',
    createdAt:    new Date().toISOString(),
  };
  registrationStore.add(entry);
  syncToStorage();
  return { entry };
};

/** Approve a pending registration and link the created userId/clinicId */
export const approveRegistration = (
  id: string,
  links: { userId?: string; linkedClinicId?: string } = {}
): void => {
  registrationStore.update(r => r.id === id, {
    status:     'approved',
    approvedAt: new Date().toISOString(),
    ...links,
  });
  syncToStorage();
};

/** Reject a pending registration with an optional reason */
export const rejectRegistration = (id: string, reason?: string): void => {
  registrationStore.update(r => r.id === id, {
    status:          'rejected',
    rejectionReason: reason || '',
  });
  syncToStorage();
};

export const findByReferralCode = (code: string): RegistrationEntry | undefined =>
  registrationStore.get(r => r.referralCode === code);

export const getRegistrationByEmail = (email: string): RegistrationEntry | undefined =>
  registrationStore.get(r => r.email === email);

export const getRegistrationByUserId = (userId: string): RegistrationEntry | undefined =>
  registrationStore.get(r => r.userId === userId);
