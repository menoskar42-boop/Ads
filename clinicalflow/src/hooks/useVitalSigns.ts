import { useState, useEffect, useCallback } from 'react';
import { VitalSign } from '@/types';
import { vitalSignStore } from '@/stores/vitalSignStore';
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

function normaliseVital(v: any): VitalSign {
  return {
    id: v.id,
    patientId: v.patient_id,
    visitId: v.visit_id ?? undefined,
    doctorId: v.doctor_id,
    systolic: v.systolic ?? undefined,
    diastolic: v.diastolic ?? undefined,
    heartRate: v.heart_rate ?? undefined,
    temperature: v.temperature ?? undefined,
    weight: v.weight ?? undefined,
    height: v.height ?? undefined,
    oxygenSaturation: v.oxygen_saturation ?? undefined,
    notes: v.notes ?? undefined,
    recordedAt: v.recorded_at ?? v.created_at,
    createdAt: v.recorded_at ?? v.created_at,
  };
}

export const useVitalSigns = (options?: { patientId?: string; visitId?: string }) => {
  const token = getToken();
  const [vitals, setVitals] = useState<VitalSign[]>(() =>
    token ? [] : vitalSignStore.getAll()
  );

  const load = useCallback(async () => {
    if (!token) {
      setVitals(vitalSignStore.getAll());
      return;
    }
    if (!options?.patientId) {
      setVitals([]);
      return;
    }
    try {
      const params = new URLSearchParams({ patientId: options.patientId });
      if (options.visitId) params.set('visitId', options.visitId);
      const data = await apiFetch<any[]>(`/vital-signs?${params}`);
      setVitals(data.map(normaliseVital));
    } catch {
      setVitals(vitalSignStore.getAll().filter(v =>
        options?.patientId ? v.patientId === options.patientId : true
      ));
    }
  }, [token, options?.patientId, options?.visitId]);

  useEffect(() => {
    load();
    if (!token) {
      const unsub = vitalSignStore.subscribe(() => setVitals([...vitalSignStore.getAll()]));
      return unsub;
    }
  }, [token, options?.patientId, options?.visitId]);

  const addVital = async (data: Omit<VitalSign, 'id' | 'createdAt'>) => {
    if (!token) {
      return vitalSignStore.add({ ...data, id: `vs-${Date.now()}`, createdAt: new Date().toISOString() });
    }
    try {
      const created = await apiFetch<any>('/vital-signs', {
        method: 'POST',
        body: JSON.stringify({
          patientId: data.patientId,
          visitId: data.visitId,
          systolic: data.systolic,
          diastolic: data.diastolic,
          heartRate: data.heartRate,
          temperature: data.temperature,
          weight: data.weight,
          height: data.height,
          oxygenSaturation: data.oxygenSaturation,
          notes: data.notes,
        }),
      });
      const vital = normaliseVital(created);
      setVitals(prev => [vital, ...prev]);
      return vital;
    } catch {
      return vitalSignStore.add({ ...data, id: `vs-${Date.now()}`, createdAt: new Date().toISOString() });
    }
  };

  const updateVital = (id: string, data: Partial<VitalSign>) => {
    vitalSignStore.update(v => v.id === id, data);
    setVitals(prev => prev.map(v => v.id === id ? { ...v, ...data } : v));
  };

  const deleteVital = (id: string) => {
    vitalSignStore.remove(v => v.id === id);
    setVitals(prev => prev.filter(v => v.id !== id));
  };

  return { vitals, addVital, updateVital, deleteVital, reload: load };
};
