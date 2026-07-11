import { useState, useEffect, useCallback } from 'react';
import { Specialty, Service } from '@/types';
import { specialtyStore, serviceStore } from '@/stores/specialtyStore';
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

function normaliseSpecialty(s: any): Specialty {
  return {
    id: s.id,
    name: s.name,
    nameAr: s.name_ar ?? s.name,
    formSchema: s.form_schema ?? [],
    isActive: s.is_active ?? true,
  };
}

function normaliseService(s: any): Service {
  return {
    id: s.id,
    name: s.name,
    nameAr: s.name_ar ?? s.name,
    specialtyId: s.specialty_id,
    price: Number(s.price ?? 0),
    doctorPercentage: Number(s.doctor_percentage ?? 60),
    isActive: s.is_active ?? true,
  };
}

export const useSpecialties = () => {
  const token = getToken();
  const [specialties, setSpecialties] = useState<Specialty[]>(() =>
    token ? [] : specialtyStore.getAll()
  );
  const [loading, setLoading] = useState(false);

  const loadSpecialties = useCallback(async () => {
    if (!token) {
      setSpecialties(specialtyStore.getAll());
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<any[]>('/specialties');
      setSpecialties(data.map(normaliseSpecialty));
    } catch {
      setSpecialties(specialtyStore.getAll());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSpecialties();
    if (!token) {
      const unsub = specialtyStore.subscribe(() =>
        setSpecialties([...specialtyStore.getAll()])
      );
      return unsub;
    }
  }, [token]);

  const addSpecialty = async (data: Omit<Specialty, 'id'>) => {
    if (!token) {
      return specialtyStore.add({ ...data, id: `sp-${Date.now()}` });
    }
    const created = await apiFetch<any>('/specialties', {
      method: 'POST',
      body: JSON.stringify({ name: data.name, nameAr: data.nameAr, formSchema: data.formSchema }),
    });
    const specialty = normaliseSpecialty(created);
    setSpecialties(prev => [...prev, specialty]);
    return specialty;
  };

  const updateSpecialty = async (id: string, data: Partial<Specialty>) => {
    if (!token) {
      specialtyStore.update(s => s.id === id, data);
      return;
    }
    const updated = await apiFetch<any>(`/specialties/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: data.name, nameAr: data.nameAr, isActive: data.isActive, formSchema: data.formSchema }),
    });
    setSpecialties(prev => prev.map(s => s.id === id ? normaliseSpecialty(updated) : s));
  };

  const deleteSpecialty = async (id: string) => {
    if (!token) {
      specialtyStore.remove(s => s.id === id);
      return;
    }
    await apiFetch(`/specialties/${id}`, { method: 'DELETE' });
    setSpecialties(prev => prev.filter(s => s.id !== id));
  };

  return { specialties, specialtyStore, loading, addSpecialty, updateSpecialty, deleteSpecialty, reload: loadSpecialties };
};

export const useServices = () => {
  const token = getToken();
  const [services, setServices] = useState<Service[]>(() =>
    token ? [] : serviceStore.getAll()
  );
  const [loading, setLoading] = useState(false);

  const loadServices = useCallback(async () => {
    if (!token) {
      setServices(serviceStore.getAll());
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<any[]>('/services');
      setServices(data.map(normaliseService));
    } catch {
      setServices(serviceStore.getAll());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadServices();
    if (!token) {
      const unsub = serviceStore.subscribe(() =>
        setServices([...serviceStore.getAll()])
      );
      return unsub;
    }
  }, [token]);

  const addService = async (data: Omit<Service, 'id'>) => {
    if (!token) {
      return serviceStore.add({ ...data, id: `svc-${Date.now()}` });
    }
    const created = await apiFetch<any>('/services', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        nameAr: data.nameAr,
        specialtyId: data.specialtyId,
        price: data.price,
        doctorPercentage: data.doctorPercentage,
      }),
    });
    const service = normaliseService(created);
    setServices(prev => [...prev, service]);
    return service;
  };

  const updateService = async (id: string, data: Partial<Service>) => {
    if (!token) {
      serviceStore.update(s => s.id === id, data);
      return;
    }
    const updated = await apiFetch<any>(`/services/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: data.name,
        nameAr: data.nameAr,
        specialtyId: data.specialtyId,
        price: data.price,
        doctorPercentage: data.doctorPercentage,
        isActive: data.isActive,
      }),
    });
    setServices(prev => prev.map(s => s.id === id ? normaliseService(updated) : s));
  };

  const deleteService = async (id: string) => {
    if (!token) {
      serviceStore.remove(s => s.id === id);
      return;
    }
    await apiFetch(`/services/${id}`, { method: 'DELETE' });
    setServices(prev => prev.filter(s => s.id !== id));
  };

  return { services, loading, addService, updateService, deleteService, reload: loadServices };
};
