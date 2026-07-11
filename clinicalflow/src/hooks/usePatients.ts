import { useState, useEffect, useCallback } from 'react';
import { Patient } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { getToken } from '@/utils/authToken';
import { patientStore } from '@/stores/patientStore';
import { enqueueAction } from '@/stores/offlineQueue';

const API = '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function normalise(p: any): Patient {
  return {
    id:          p.id,
    name:        p.name,
    nameAr:      p.name_ar ?? p.name,
    phone:       p.phone,
    email:       p.email,
    dateOfBirth: p.date_of_birth ?? '',
    gender:      p.gender ?? 'male',
    nationalId:  p.national_id,
    clinicId:    p.clinic_id,
    createdAt:   p.created_at,
  };
}

export const usePatients = () => {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // search + pagination state
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const limit = 50;

  const load = useCallback(async (q?: string, pg?: number) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // No token → use in-memory patientStore
      if (!getToken()) {
        let all = patientStore.getAll();
        // Patients are platform-level — include all patients regardless of clinicId
        // (clinicId on patient is optional per architecture; patients can book at any clinic)
        if (q) all = all.filter(p =>
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          (p.nameAr && p.nameAr.includes(q)) ||
          p.phone.includes(q)
        );
        setPatients(all);
        setTotal(all.length);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (q)  params.set('search', q);
      if (pg) params.set('page', String(pg));
      params.set('limit', String(limit));

      const data = await apiFetch<{ data: any[]; total: number }>(`/patients?${params}`);
      setPatients(data.data.map(normalise));
      setTotal(data.total ?? data.data.length);
    } catch (e: any) {
      // API failed → fallback to in-memory
      const all = patientStore.getAll();
      // Patients are platform-level — no clinicId filter
      setPatients(all);
      setTotal(all.length);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(search, page); }, [load, search, page]);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const addPatient = useCallback(async (data: Omit<Patient, 'id' | 'createdAt'>) => {
    try {
      const result = await apiFetch<any>('/patients', {
        method: 'POST',
        body: JSON.stringify({
          name:        data.name,
          nameAr:      data.nameAr,
          phone:       data.phone,
          email:       data.email,
          dateOfBirth: data.dateOfBirth,
          gender:      data.gender,
          nationalId:  data.nationalId,
        }),
      });
      const patient = normalise(result);
      patientStore.add(patient); // persist to localStorage
      setPatients(prev => [patient, ...prev]);
      setTotal(t => t + 1);
      return patient;
    } catch {
      // API not available (offline or server error) → create locally + queue for sync
      const ts = new Date().toISOString();
      const patient: Patient = {
        id: `pt-${Date.now()}`,
        name:        data.name,
        nameAr:      data.nameAr ?? data.name,
        phone:       data.phone,
        email:       data.email,
        dateOfBirth: data.dateOfBirth ?? '',
        gender:      data.gender ?? 'male',
        nationalId:  data.nationalId,
        clinicId:    data.clinicId ?? user?.clinicId,
        createdAt:   ts,
      };
      patientStore.add(patient);
      // STEP 3: queue for server sync when back online
      if (getToken()) {
        enqueueAction({
          action: 'create_patient',
          endpoint: '/patients',
          method: 'POST',
          body: { name: data.name, nameAr: data.nameAr, phone: data.phone, email: data.email, dateOfBirth: data.dateOfBirth, gender: data.gender, nationalId: data.nationalId },
          timestamp: ts,
          clinicId: data.clinicId ?? user?.clinicId,
          localId: patient.id,
        });
      }
      setPatients(prev => [patient, ...prev]);
      setTotal(t => t + 1);
      return patient;
    }
  }, [user]);

  const updatePatient = useCallback(async (id: string, data: Partial<Patient>) => {
    try {
      const result = await apiFetch<any>(`/patients/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name:        data.name,
          nameAr:      data.nameAr,
          phone:       data.phone,
          email:       data.email,
          dateOfBirth: data.dateOfBirth,
          gender:      data.gender,
          nationalId:  data.nationalId,
        }),
      });
      const updated = normalise(result);
      patientStore.update(p => p.id === id, updated); // persist to localStorage
      setPatients(prev => prev.map(p => p.id === id ? updated : p));
      return updated;
    } catch {
      // API not available → update locally and persist
      patientStore.update(p => p.id === id, data);
      const updated = { ...patientStore.get(p => p.id === id)! };
      setPatients(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
      return updated;
    }
  }, []);

  const deletePatient = useCallback(async (id: string) => {
    patientStore.remove(p => p.id === id); // persist to localStorage
    setPatients(prev => prev.filter(p => p.id !== id));
    setTotal(t => t - 1);
  }, []);

  return {
    patients, total, loading, error,
    search, setSearch,
    page, setPage, limit,
    reload: () => load(search, page),
    addPatient, updatePatient, deletePatient,
  };
};
