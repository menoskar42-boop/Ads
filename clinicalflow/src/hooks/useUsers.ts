import { useState, useEffect, useCallback } from 'react';
import { User } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { getToken } from '@/utils/authToken';
import { userStore } from '@/stores/userStore';

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

function normalise(u: any): User {
  return {
    id:          u.id,
    name:        u.name,
    nameAr:      u.name_ar ?? u.name,
    email:       u.email,
    role:        u.role,
    specialtyId: u.specialty_id,
    clinicId:    u.clinic_id ?? '',
    isActive:    u.is_active ?? true,
    createdAt:   u.created_at,
    homeVisitEnabled:      u.home_visit_enabled,
    homeVisitPrice:        u.home_visit_price        ? Number(u.home_visit_price)        : undefined,
    homeVisitDurationMinutes: u.home_visit_duration_min,
    homeVisitDailyLimit:   u.home_visit_daily_limit,
    homeVisitRadiusKm:     u.home_visit_radius_km,
    homeVisitAreas:        u.home_visit_areas ?? [],
  };
}

export const useUsers = () => {
  const { user: authUser } = useAuth();
  const [users, setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      // No token → use in-memory store immediately
      if (!getToken()) {
        const all = userStore.getAll();
        const filtered = authUser.role === 'super_admin'
          ? all
          : all.filter(u => u.clinicId === authUser.clinicId);
        setUsers(filtered);
        setLoading(false);
        return;
      }
      const endpoint = '/auth/users';
      const data = await apiFetch<any[]>(endpoint);
      setUsers(data.map(normalise));
    } catch {
      // API failed → fallback to in-memory userStore
      const all = userStore.getAll();
      const filtered = authUser?.role === 'super_admin'
        ? all
        : all.filter(u => u.clinicId === authUser?.clinicId);
      setUsers(filtered);
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => { load(); }, [load]);

  const addUser = useCallback(async (data: {
    name: string; nameAr?: string; email: string; password: string;
    role: User['role']; clinicId: string; specialtyId?: string;
    homeVisitEnabled?: boolean;
  }) => {
    try {
      const result = await apiFetch<any>('/auth/users', {
        method: 'POST',
        body: JSON.stringify({
          name:        data.name,
          nameAr:      data.nameAr ?? data.name,
          email:       data.email,
          password:    data.password,
          role:        data.role,
          clinicId:    data.clinicId,
          specialtyId: data.specialtyId,
          homeVisitEnabled: data.homeVisitEnabled ?? false,
        }),
      });
      const user = normalise(result);
      userStore.add(user); // persist to localStorage
      // save password
      if (data.password) {
        const passwords = JSON.parse(localStorage.getItem('cf_staff_passwords') || '{}');
        passwords[user.id] = data.password;
        localStorage.setItem('cf_staff_passwords', JSON.stringify(passwords));
      }
      setUsers(prev => [user, ...prev]);
      return user;
    } catch {
      // API not available → create locally and persist
      const newUser: User = {
        id: `u-${Date.now()}`,
        name: data.name,
        nameAr: data.nameAr ?? data.name,
        email: data.email,
        role: data.role,
        clinicId: data.clinicId,
        specialtyId: data.specialtyId,
        isActive: true,
        createdAt: new Date().toISOString(),
        homeVisitEnabled: data.homeVisitEnabled ?? false,
      };
      userStore.add(newUser);
      if (data.password) {
        const passwords = JSON.parse(localStorage.getItem('cf_staff_passwords') || '{}');
        passwords[newUser.id] = data.password;
        localStorage.setItem('cf_staff_passwords', JSON.stringify(passwords));
      }
      setUsers(prev => [newUser, ...prev]);
      return newUser;
    }
  }, []);

  const updateUser = useCallback(async (id: string, data: Partial<User>) => {
    userStore.update(u => u.id === id, data); // persist to localStorage
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
  }, []);

  const deleteUser = useCallback((id: string) => {
    userStore.remove(u => u.id === id); // persist to localStorage
    setUsers(prev => prev.filter(u => u.id !== id));
  }, []);

  const doctors = users.filter(u => u.role === 'doctor');

  return {
    users,
    loading,
    reload: load,
    addUser,
    updateUser,
    deleteUser,
    doctors,
    activeDoctors:   doctors.filter(u => u.isActive),
    platformDoctors: doctors,
    getDoctorsBySpecialty: (specialtyId: string) =>
      doctors.filter(u => u.specialtyId === specialtyId && u.isActive),
  };
};
