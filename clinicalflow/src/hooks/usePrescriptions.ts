import { useState, useEffect, useCallback } from 'react';
import { Prescription } from '@/types';
import { prescriptionStore } from '@/stores/prescriptionStore';
import { useAuth } from '@/hooks/useAuth';
import { getToken } from '@/utils/authToken';

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

function normalisePrescription(p: any): Prescription {
  return {
    id: p.id,
    patientId: p.patient_id,
    doctorId: p.doctor_id,
    visitId: p.visit_id ?? '',
    status: p.status ?? 'active',
    medications: p.medications ?? [],
    notes: p.notes ?? '',
    prescribedAt: p.prescribed_at ?? p.created_at,
    expiresAt: p.expires_at,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export const usePrescriptions = (options?: { patientId?: string; visitId?: string }) => {
  const { user } = useAuth();
  const token = getToken();

  const getLocalPrescriptions = useCallback(() => {
    const all = prescriptionStore.getAll();
    if (!user) return all;
    if (user.role === 'super_admin') return all;
    if (user.role === 'doctor') return all.filter(rx => rx.doctorId === user.id);
    return all;
  }, [user]);

  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() =>
    token ? [] : getLocalPrescriptions()
  );

  const load = useCallback(async () => {
    if (!token) {
      setPrescriptions(getLocalPrescriptions());
      return;
    }
    try {
      const params = new URLSearchParams();
      if (options?.patientId) params.set('patientId', options.patientId);
      if (options?.visitId)   params.set('visitId', options.visitId);
      const data = await apiFetch<any[]>(`/prescriptions?${params}`);
      setPrescriptions(data.map(normalisePrescription));
    } catch {
      setPrescriptions(getLocalPrescriptions());
    }
  }, [token, options?.patientId, options?.visitId, getLocalPrescriptions]);

  useEffect(() => {
    load();
    if (!token) {
      const unsub = prescriptionStore.subscribe(() =>
        setPrescriptions(getLocalPrescriptions())
      );
      return unsub;
    }
  }, [token, options?.patientId, options?.visitId]);

  const addPrescription = async (data: Omit<Prescription, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!token) {
      const now = new Date().toISOString();
      return prescriptionStore.add({ ...data, id: `rx-${Date.now()}`, createdAt: now, updatedAt: now });
    }
    const created = await apiFetch<any>('/prescriptions', {
      method: 'POST',
      body: JSON.stringify({
        patientId: data.patientId,
        visitId: data.visitId,
        status: data.status,
        medications: data.medications,
        notes: data.notes,
        expiresAt: data.expiresAt,
      }),
    });
    const rx = normalisePrescription(created);
    setPrescriptions(prev => [rx, ...prev]);
    return rx;
  };

  const updatePrescription = async (id: string, data: Partial<Prescription>) => {
    if (!token) {
      prescriptionStore.update(p => p.id === id, { ...data, updatedAt: new Date().toISOString() });
      return;
    }
    const updated = await apiFetch<any>(`/prescriptions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: data.status, medications: data.medications, notes: data.notes }),
    });
    setPrescriptions(prev => prev.map(p => p.id === id ? normalisePrescription(updated) : p));
  };

  const deletePrescription = async (id: string) => {
    if (!token) {
      prescriptionStore.remove(p => p.id === id);
      return;
    }
    await apiFetch(`/prescriptions/${id}`, { method: 'DELETE' });
    setPrescriptions(prev => prev.filter(p => p.id !== id));
  };

  const recordRefill = async (prescriptionId: string, medicationId: string) => {
    if (!token) {
      const rx = prescriptionStore.get(p => p.id === prescriptionId);
      if (!rx) return;
      const updatedMeds = rx.medications.map(m => {
        if (m.id !== medicationId || m.refillsUsed >= m.refillsTotal) return m;
        const next = new Date();
        next.setDate(next.getDate() + 30);
        return {
          ...m,
          refillsUsed: m.refillsUsed + 1,
          nextRefillDate: m.refillsUsed + 1 < m.refillsTotal ? next.toISOString().split('T')[0] : undefined,
        };
      });
      prescriptionStore.update(p => p.id === prescriptionId, { medications: updatedMeds, updatedAt: new Date().toISOString() });
      return;
    }
    const rx = prescriptions.find(p => p.id === prescriptionId);
    if (!rx) return;
    const updatedMeds = rx.medications.map(m => {
      if (m.id !== medicationId || m.refillsUsed >= m.refillsTotal) return m;
      const next = new Date();
      next.setDate(next.getDate() + 30);
      return {
        ...m,
        refillsUsed: m.refillsUsed + 1,
        nextRefillDate: m.refillsUsed + 1 < m.refillsTotal ? next.toISOString().split('T')[0] : undefined,
      };
    });
    await updatePrescription(prescriptionId, { medications: updatedMeds });
  };

  return { prescriptions, addPrescription, updatePrescription, deletePrescription, recordRefill, reload: load };
};
