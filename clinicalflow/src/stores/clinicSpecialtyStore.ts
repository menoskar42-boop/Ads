// ─── clinicSpecialtyStore.ts ──────────────────────────────────────────────────
// Per-clinic specialty activation.
// Each clinic has its own active specialty list, stored under:
//   cf_clinic_sp_{clinicId}
// This prevents cross-clinic contamination when toggling specialties.

import { CLINIC_IDS } from './clinicStore';

// ─── Seed defaults for demo clinics ──────────────────────────────────────────
const CLINIC_DEFAULTS: Record<string, string[]> = {
  [CLINIC_IDS.NILE_MEDICAL]: ['sp-1', 'sp-3', 'sp-4', 'sp-25'],   // General, Cardiology, Dermatology, Dentistry
  [CLINIC_IDS.CAIRO_HEALTH]: ['sp-1', 'sp-2', 'sp-5', 'sp-41'],   // General, Pediatrics, Orthopedics, Internal
  [CLINIC_IDS.ALEX_CARE]:    ['sp-1', 'sp-7', 'sp-8', 'sp-16'],   // General, ENT, OB/GYN, Pulmonology
};

const storageKey = (clinicId: string) => `cf_clinic_sp_${clinicId}`;

function loadActiveIds(clinicId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(clinicId));
    if (raw !== null) return JSON.parse(raw) as string[];
  } catch { /* parse error */ }
  // First time: seed clinic defaults (empty array for unknown clinics)
  const defaults = CLINIC_DEFAULTS[clinicId] ?? [];
  localStorage.setItem(storageKey(clinicId), JSON.stringify(defaults));
  return defaults;
}

function saveActiveIds(clinicId: string, ids: string[]) {
  localStorage.setItem(storageKey(clinicId), JSON.stringify(ids));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getActiveSpecialtyIdsForClinic(clinicId: string): string[] {
  if (!clinicId) return [];
  return loadActiveIds(clinicId);
}

export function isSpecialtyActiveForClinic(clinicId: string, specialtyId: string): boolean {
  return loadActiveIds(clinicId).includes(specialtyId);
}

/** Toggle active state for a specialty in a specific clinic.
 *  Returns the NEW active state (true = now active). */
export function toggleSpecialtyForClinic(clinicId: string, specialtyId: string): boolean {
  const ids = loadActiveIds(clinicId);
  const idx = ids.indexOf(specialtyId);
  if (idx >= 0) {
    saveActiveIds(clinicId, ids.filter(id => id !== specialtyId));
    return false;
  } else {
    saveActiveIds(clinicId, [...ids, specialtyId]);
    return true;
  }
}
