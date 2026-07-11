import { useState, useEffect, useCallback } from 'react';
import { getToken } from '@/utils/authToken';

export type ModuleName = 'finance' | 'inventory' | 'ai' | 'insurance' | 'reports';

export interface ModuleState {
  finance:   boolean;
  inventory: boolean;
  ai:        boolean;
  insurance: boolean;
  reports:   boolean;
}

const ALL_ENABLED: ModuleState = {
  finance: true, inventory: true, ai: true, insurance: true, reports: true,
};

const STORAGE_KEY = 'cf_clinic_modules';

function loadFromStorage(clinicId: string): ModuleState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return ALL_ENABLED;
    const parsed = JSON.parse(raw);
    return parsed[clinicId] ?? ALL_ENABLED;
  } catch {
    return ALL_ENABLED;
  }
}

function saveToStorage(clinicId: string, state: ModuleState) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    existing[clinicId] = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch { /* storage full */ }
}

export function useModules(clinicId?: string) {
  const [modules, setModules] = useState<ModuleState>(
    clinicId ? loadFromStorage(clinicId) : ALL_ENABLED
  );
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const token = getToken();
      if (!token) {
        setModules(loadFromStorage(clinicId));
        return;
      }
      const res = await fetch(`/api/modules/${clinicId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('fetch failed');
      const data: { module_name: ModuleName; is_enabled: boolean }[] = await res.json();
      const state = { ...ALL_ENABLED };
      data.forEach(r => { state[r.module_name] = r.is_enabled; });
      setModules(state);
      saveToStorage(clinicId, state);
    } catch {
      // Fallback to localStorage (offline / demo)
      setModules(loadFromStorage(clinicId));
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => { load(); }, [load]);

  const toggleModule = useCallback(async (
    moduleName: ModuleName,
    isEnabled: boolean,
  ) => {
    if (!clinicId) return;
    // Optimistic update
    const next = { ...modules, [moduleName]: isEnabled };
    setModules(next);
    saveToStorage(clinicId, next);

    const token = getToken();
    if (!token) return; // demo mode: localStorage is the source of truth

    try {
      await fetch('/api/modules/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clinic_id: clinicId, module_name: moduleName, is_enabled: isEnabled }),
      });
    } catch {
      // Revert on server error
      setModules(modules);
      saveToStorage(clinicId, modules);
    }
  }, [clinicId, modules]);

  return { modules, loading, toggleModule, reload: load };
}
