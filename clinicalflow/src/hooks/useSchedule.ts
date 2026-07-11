import { useState, useEffect, useCallback } from 'react';
import { DoctorSchedule, BlockedDate } from '@/types';
import {
  scheduleStore,
  blockedDateStore,
  getAvailableSlots,
  getDoctorWorkingDays,
} from '@/stores/scheduleStore';
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

function normaliseSchedule(s: any): DoctorSchedule {
  return {
    id: s.id,
    doctorId: s.doctor_id,
    clinicId: s.clinic_id,
    dayOfWeek: s.day_of_week,
    startTime: s.start_time,
    endTime: s.end_time,
    slotDurationMinutes: s.slot_duration_minutes ?? 20,
    maxPatients: s.max_patients ?? 20,
    isEnabled: s.is_enabled ?? true,
    roomId: s.room_id ?? undefined,
    branchId: s.branch_id ?? undefined,
  };
}

function normaliseBlocked(b: any): BlockedDate {
  return {
    id: b.id,
    doctorId: b.doctor_id,
    clinicId: b.clinic_id,
    date: b.date,
    reason: b.reason ?? '',
  };
}

export const useSchedule = () => {
  const token = getToken();
  const [schedules, setSchedules] = useState<DoctorSchedule[]>(() =>
    token ? [] : scheduleStore.getAll()
  );
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>(() =>
    token ? [] : blockedDateStore.getAll()
  );

  const load = useCallback(async () => {
    if (!token) {
      setSchedules([...scheduleStore.getAll()]);
      setBlockedDates([...blockedDateStore.getAll()]);
      return;
    }
    try {
      const [sched, blocked] = await Promise.allSettled([
        apiFetch<any[]>('/schedules'),
        apiFetch<any[]>('/schedules/blocked-dates'),
      ]);
      if (sched.status === 'fulfilled') {
        const normed = (sched.value ?? []).map(normaliseSchedule);
        setSchedules(normed);
        normed.forEach(s => scheduleStore.update(x => x.id === s.id, s) || scheduleStore.add(s));
      }
      if (blocked.status === 'fulfilled') {
        const normed = (blocked.value ?? []).map(normaliseBlocked);
        setBlockedDates(normed);
      }
    } catch {
      setSchedules([...scheduleStore.getAll()]);
      setBlockedDates([...blockedDateStore.getAll()]);
    }
  }, [token]);

  useEffect(() => {
    load();
    if (!token) {
      const u1 = scheduleStore.subscribe(() => setSchedules([...scheduleStore.getAll()]));
      const u2 = blockedDateStore.subscribe(() => setBlockedDates([...blockedDateStore.getAll()]));
      return () => { u1(); u2(); };
    }
  }, [token]);

  const addSchedule = useCallback(async (data: Omit<DoctorSchedule, 'id'>) => {
    if (!token) {
      return scheduleStore.add({ ...data, id: `sch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` });
    }
    try {
      const created = await apiFetch<any>('/schedules', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: data.doctorId,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          slotDurationMinutes: data.slotDurationMinutes,
          maxPatients: data.maxPatients,
          isEnabled: data.isEnabled ?? true,
          roomId: data.roomId,
          branchId: data.branchId,
        }),
      });
      const schedule = normaliseSchedule(created);
      setSchedules(prev => [...prev, schedule]);
      return schedule;
    } catch {
      return scheduleStore.add({ ...data, id: `sch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` });
    }
  }, [token]);

  const updateSchedule = useCallback(async (id: string, data: Partial<DoctorSchedule>) => {
    if (!token) {
      scheduleStore.update(s => s.id === id, data);
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
      return;
    }
    try {
      const updated = await apiFetch<any>(`/schedules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          startTime: data.startTime,
          endTime: data.endTime,
          slotDurationMinutes: data.slotDurationMinutes,
          maxPatients: data.maxPatients,
          isEnabled: data.isEnabled,
          roomId: data.roomId,
        }),
      });
      setSchedules(prev => prev.map(s => s.id === id ? normaliseSchedule(updated) : s));
    } catch {
      scheduleStore.update(s => s.id === id, data);
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    }
  }, [token]);

  const removeSchedule = useCallback(async (id: string) => {
    if (!token) {
      scheduleStore.remove(s => s.id === id);
      setSchedules(prev => prev.filter(s => s.id !== id));
      return;
    }
    try {
      await apiFetch(`/schedules/${id}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    setSchedules(prev => prev.filter(s => s.id !== id));
  }, [token]);

  const addBlockedDate = useCallback(async (data: Omit<BlockedDate, 'id'>) => {
    if (!token) {
      return blockedDateStore.add({ ...data, id: `blk-${Date.now()}` });
    }
    try {
      const created = await apiFetch<any>('/schedules/blocked-dates', {
        method: 'POST',
        body: JSON.stringify({ doctorId: data.doctorId, date: data.date, reason: data.reason }),
      });
      const blocked = normaliseBlocked(created);
      setBlockedDates(prev => [...prev, blocked]);
      return blocked;
    } catch {
      return blockedDateStore.add({ ...data, id: `blk-${Date.now()}` });
    }
  }, [token]);

  const removeBlockedDate = useCallback(async (id: string) => {
    if (!token) {
      blockedDateStore.remove(b => b.id === id);
      setBlockedDates(prev => prev.filter(b => b.id !== id));
      return;
    }
    try {
      await apiFetch(`/schedules/blocked-dates/${id}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    setBlockedDates(prev => prev.filter(b => b.id !== id));
  }, [token]);

  const getDoctorSchedule = useCallback((doctorId: string) =>
    schedules.filter(s => s.doctorId === doctorId), [schedules]);

  const getDoctorBlockedDates = useCallback((doctorId: string) =>
    blockedDates.filter(b => b.doctorId === doctorId), [blockedDates]);

  return {
    schedules,
    blockedDates,
    addSchedule,
    updateSchedule,
    removeSchedule,
    addBlockedDate,
    removeBlockedDate,
    getDoctorSchedule,
    getDoctorBlockedDates,
    reload: load,
    getAvailableSlots: useCallback(getAvailableSlots, []),
    getDoctorWorkingDays: useCallback(getDoctorWorkingDays, []),
  };
};
