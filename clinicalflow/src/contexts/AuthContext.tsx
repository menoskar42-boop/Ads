import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserRole, Patient } from '@/types';
import { userStore } from '@/stores/userStore';
import { patientStore, persistPatient } from '@/stores/patientStore';
import { getClinicsForDoctor } from '@/stores/doctorClinicStore';
import { registrationStore } from '@/stores/registrationStore';
import { getToken, saveAuthSession, clearAuthSession, loadSavedAuthUser } from '@/utils/authToken';
import { generateReferralCode, findPatientByReferralCode, applyReferralBonus } from '@/stores/loyaltyStore';
import { auditLogin, auditLogout, trackLoginAttempt } from '@/stores/auditStore';

const LS_PASS_KEY = 'cf_patient_passwords';
const LS_USER_KEY = 'cf_user';
const API = '/api';

function loadPasswords(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_PASS_KEY) || '{}'); } catch { return {}; }
}

function savePassword(id: string, pw: string) {
  try {
    const all = loadPasswords();
    all[id] = pw;
    localStorage.setItem(LS_PASS_KEY, JSON.stringify(all));
  } catch { /* graceful */ }
}

export interface AuthUser {
  id: string;
  name: string;
  nameAr: string;
  email: string;
  role: UserRole;
  specialtyId?: string;
  patientId?: string;
  clinicId: string;
}

interface AuthContextType {
  user: AuthUser | null;
  pendingDoctorClinics: string[] | null;
  pendingDoctorUser: AuthUser | null;
  login: (clinicId: string, role: UserRole) => void;
  loginStaff: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginAsSuperAdmin: (password: string) => boolean;
  loginAsPatient: (phone: string, password: string) => { ok: boolean; error?: string };
  registerPatient: (data: { name: string; phone: string; email: string; password: string; referredBy?: string }) => boolean;
  selectClinicForDoctor: (clinicId: string) => void;
  switchClinic: () => void;
  logout: () => void;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SUPER_ADMIN_PASSWORD = 'Mon_oskar11';

function mapProfile(p: any): AuthUser {
  return {
    id:          p.id,
    name:        p.name,
    nameAr:      p.name_ar ?? p.name,
    email:       p.email ?? '',
    role:        p.role,
    specialtyId: p.specialty_id ?? undefined,
    clinicId:    p.clinic_id ?? '',
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => loadSavedAuthUser<AuthUser>());
  const [pendingDoctorClinics, setPendingDoctorClinics] = useState<string[] | null>(null);
  const [pendingDoctorUser, setPendingDoctorUser]       = useState<AuthUser | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token || !user) return;
    if (user.role === 'patient' || user.role === 'super_admin') return;
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const refreshed = mapProfile(data);
          setUser(refreshed);
          localStorage.setItem(LS_USER_KEY, JSON.stringify(refreshed));
        } else {
          clearAuthSession();
          setUser(null);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Demo login disabled — use loginStaff() with real Supabase credentials
  const login = (_clinicId: string, _role: UserRole) => {
    console.warn('Demo login disabled. Use loginStaff() with Supabase credentials.');
  };

  const loginStaffLocal = (email: string, password: string): { ok: boolean; error?: string } => {
    // Fallback: check local userStore + cf_staff_passwords. Used when the
    // Supabase backend rejects the login (e.g. user was approved by SuperAdmin
    // locally but never created in Supabase) or when Supabase is unavailable.
    const normalisedEmail = email.trim().toLowerCase();
    const localUser = userStore.get(u => (u.email || '').toLowerCase() === normalisedEmail && u.isActive);
    if (!localUser) return { ok: false, error: 'بيانات الدخول غير صحيحة.' };

    let staffPasswords: Record<string, string> = {};
    try { staffPasswords = JSON.parse(localStorage.getItem('cf_staff_passwords') || '{}'); } catch { /* graceful */ }
    if (staffPasswords[localUser.id] !== password) return { ok: false, error: 'بيانات الدخول غير صحيحة.' };

    const authUser: AuthUser = {
      id:          localUser.id,
      name:        localUser.name,
      nameAr:      localUser.nameAr || localUser.name,
      email:       localUser.email || '',
      role:        localUser.role,
      specialtyId: localUser.specialtyId,
      clinicId:    localUser.clinicId || '',
    };
    if (authUser.role === 'doctor') {
      const links = getClinicsForDoctor(authUser.id);
      if (links.length > 1) { setPendingDoctorUser(authUser); setPendingDoctorClinics(links); return { ok: true }; }
    }
    setUser(authUser);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(authUser));
    auditLogin({ userId: authUser.id, userName: authUser.name, clinicId: authUser.clinicId });
    return { ok: true };
  };

  const loginStaff = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), password }),
      });
      if (res.ok) {
        const data = await res.json();
        const authUser = mapProfile(data.user);
        saveAuthSession(data.token, data.refresh, authUser);
        // Clear any stale demo data from localStorage so Supabase data is authoritative
        [
          'cf_appointments', 'cf_visits', 'cf_invoices', 'cf_invoice_items',
          'cf_payments', 'cf_registered_patients', 'cf_staff_users',
          'cf_doctor_clinic_links',
        ].forEach(k => localStorage.removeItem(k));
        if (authUser.role === 'doctor') {
          const links = getClinicsForDoctor(authUser.id);
          if (links.length > 1) { setPendingDoctorUser(authUser); setPendingDoctorClinics(links); return { ok: true }; }
        }
        setUser(authUser);
        auditLogin({ userId: authUser.id, userName: authUser.name, clinicId: authUser.clinicId ?? '' });
        return { ok: true };
      }
      // Supabase rejected — fall back to the local userStore (handles users
      // approved via SuperAdmin in the local-only demo flow).
      const localResult = loginStaffLocal(email, password);
      if (localResult.ok) return localResult;
      const errBody = await res.json().catch(() => ({}));
      trackLoginAttempt(email, '', undefined);
      return { ok: false, error: errBody.error || 'بيانات الدخول غير صحيحة.' };
    } catch {
      // Network / Supabase unavailable — try the local fallback before erroring out.
      const localResult = loginStaffLocal(email, password);
      if (localResult.ok) return localResult;
      return { ok: false, error: 'تعذر الاتصال بالخادم. تحقق من الاتصال بالإنترنت.' };
    }
  };

  const selectClinicForDoctor = (clinicId: string) => {
    if (!pendingDoctorUser) return;
    const doctorInClinic = userStore.get(u => u.clinicId === clinicId && u.role === 'doctor' && u.isActive);
    const finalUser: AuthUser = {
      ...pendingDoctorUser, clinicId,
      specialtyId: doctorInClinic?.specialtyId ?? pendingDoctorUser.specialtyId,
    };
    setUser(finalUser);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(finalUser));
    setPendingDoctorClinics(null);
    setPendingDoctorUser(null);
  };

  const switchClinic = () => {
    if (!user || user.role !== 'doctor') return;
    const links = getClinicsForDoctor(user.id);
    if (links.length > 1) { setPendingDoctorUser(user); setPendingDoctorClinics(links); setUser(null); }
  };

  const loginAsSuperAdmin = (password: string): boolean => {
    if (password !== SUPER_ADMIN_PASSWORD) return false;
    const authUser: AuthUser = {
      id: 'super-admin', name: 'Super Admin', nameAr: 'المدير العام',
      email: 'superadmin@clinicflow.io', role: 'super_admin', clinicId: 'super',
    };
    setUser(authUser);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(authUser));
    return true;
  };

  const loginAsPatient = (phone: string, password: string): { ok: boolean; error?: string } => {
    const trimmed = phone.trim();
    if (!trimmed)  return { ok: false, error: 'أدخل رقم الهاتف.' };
    if (!password) return { ok: false, error: 'أدخل كلمة المرور.' };
    let patient = patientStore.get(p => p.phone === trimmed);
    if (!patient) {
      const reg = registrationStore.get(r => r.type === 'patient' && r.phone === trimmed);
      if (reg) {
        const newPt: Patient = {
          id: `pt-reg-${reg.id}`, name: reg.name, nameAr: reg.name,
          phone: reg.phone, email: reg.email,
          dateOfBirth: '', gender: 'male', createdAt: reg.createdAt,
        };
        const already = patientStore.get(p => p.phone === newPt.phone);
        if (!already) { patientStore.add(newPt); persistPatient(newPt); if (reg.password) savePassword(newPt.id, reg.password); }
        patient = already ?? newPt;
      }
    }
    if (!patient) return { ok: false, error: 'لم يتم العثور على حساب بهذا الرقم.' };
    const expected = loadPasswords()[patient.id];
    if (expected && expected !== password) return { ok: false, error: 'كلمة المرور غير صحيحة.' };
    const authUser: AuthUser = {
      id: patient.id, name: patient.name, nameAr: patient.nameAr,
      email: patient.email || '', role: 'patient',
      patientId: patient.id, clinicId: patient.clinicId ?? '',
    };
    setUser(authUser);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(authUser));
    return { ok: true };
  };

  const registerPatient = (data: { name: string; phone: string; email: string; password: string; referredBy?: string }): boolean => {
    const existing = patientStore.get(p => p.phone === data.phone || (data.email && p.email === data.email));
    if (existing) return false;
    // STEP 2 — generate unique referral code; retry on collision
    let referralCode = generateReferralCode();
    while (findPatientByReferralCode(referralCode)) referralCode = generateReferralCode();
    const patient: Patient = {
      id: `pt-${Date.now()}`, name: data.name, nameAr: data.name,
      phone: data.phone, email: data.email,
      dateOfBirth: '', gender: 'male', createdAt: new Date().toISOString(),
      referralCode,
      referredBy: data.referredBy || undefined,
    };
    patientStore.add(patient);
    persistPatient(patient);
    if (data.password) savePassword(patient.id, data.password);
    // STEP 4 — apply referral bonus; guards: valid code, not self, not duplicate
    if (data.referredBy && data.referredBy !== referralCode) {
      const referrerId = findPatientByReferralCode(data.referredBy);
      if (referrerId && referrerId !== patient.id) {
        applyReferralBonus(referrerId, patient.id, patient.clinicId || 'clinic-1');
      }
    }
    const authUser: AuthUser = {
      id: patient.id, name: patient.name, nameAr: patient.nameAr,
      email: patient.email || '', role: 'patient',
      patientId: patient.id, clinicId: '',
    };
    setUser(authUser);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(authUser));
    return true;
  };

  const logout = (reason?: string) => {
    if (user) {
      auditLogout({ userId: user.id, userName: user.name, clinicId: user.clinicId ?? '', reason });
    }
    const token = getToken();
    if (token) {
      fetch(`${API}/auth/logout`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      }).catch(() => {});
    }
    clearAuthSession();
    setUser(null);
    setPendingDoctorClinics(null);
    setPendingDoctorUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user, pendingDoctorClinics, pendingDoctorUser,
      login, loginStaff, loginAsSuperAdmin, loginAsPatient, registerPatient,
      selectClinicForDoctor, switchClinic, logout,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

