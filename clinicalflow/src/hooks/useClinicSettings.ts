import { useState, useEffect, useCallback } from 'react';
import { clinicSettingsStore } from '@/stores/clinicSettingsStore';
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

export const useClinicSettings = () => {
  const token = getToken();
  const [settings, setSettings] = useState<any>(() => clinicSettingsStore.get());

  const load = useCallback(async () => {
    if (!token) {
      setSettings(clinicSettingsStore.get());
      return;
    }
    try {
      const data = await apiFetch<any>('/clinic-settings');
      if (data) {
        const normalised = {
          clinicName: data.clinic_name ?? data.clinicName ?? '',
          clinicNameAr: data.clinic_name_ar ?? data.clinicNameAr ?? '',
          address: data.address ?? '',
          phone: data.phone ?? '',
          email: data.email ?? '',
          logo: data.logo ?? '',
          currency: data.currency ?? 'EGP',
          defaultLanguage: data.default_language ?? data.defaultLanguage ?? 'ar',
          appointmentDuration: data.appointment_duration ?? data.appointmentDuration ?? 20,
          bookingLeadHours: data.booking_lead_hours ?? data.bookingLeadHours ?? 2,
          maxDailyAppointments: data.max_daily_appointments ?? data.maxDailyAppointments ?? 50,
          invoicePrefix: data.invoice_prefix ?? data.invoicePrefix ?? 'INV',
          vatRate: data.vat_rate ?? data.vatRate ?? 0,
          enableWhatsapp: data.enable_whatsapp ?? data.enableWhatsapp ?? false,
          enableOnlineBooking: data.enable_online_booking ?? data.enableOnlineBooking ?? true,
          enableAI: data.enable_ai ?? data.enableAI ?? true,
          ...data,
        };
        setSettings(normalised);
        clinicSettingsStore.update(normalised);
      }
    } catch {
      setSettings(clinicSettingsStore.get());
    }
  }, [token]);

  useEffect(() => {
    load();
    if (!token) {
      const unsub = clinicSettingsStore.subscribe(() => setSettings({ ...clinicSettingsStore.get() }));
      return unsub;
    }
  }, [token]);

  const updateSettings = useCallback(async (updates: any) => {
    const merged = { ...settings, ...updates };
    setSettings(merged);
    clinicSettingsStore.update(updates);

    if (!token) return;
    try {
      const saved = await apiFetch<any>('/clinic-settings', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      if (saved) setSettings((prev: any) => ({ ...prev, ...saved }));
    } catch {
      // Kept local update; will sync on next load
    }
  }, [token, settings]);

  return { settings, updateSettings };
};
