import { VisitType } from '@/types';
import { createStore } from './createStore';

// ─── Default visit types per demo clinic ───
const DEFAULT_TYPES = (clinicId: string, prefix: string, prices: { c: number; f: number; u: number }): VisitType[] => [
  {
    id: `${prefix}-consultation`,
    clinicId,
    name: 'Consultation',
    nameAr: 'كشف',
    price: prices.c,
    durationMinutes: 20,
    isUrgent: false,
    isEnabled: true,
    sortOrder: 1,
  },
  {
    id: `${prefix}-followup`,
    clinicId,
    name: 'Follow-up',
    nameAr: 'استشارة',
    price: prices.f,
    durationMinutes: 10,
    isUrgent: false,
    isEnabled: true,
    sortOrder: 2,
  },
  {
    id: `${prefix}-urgent`,
    clinicId,
    name: 'Urgent Consultation',
    nameAr: 'كشف مستعجل',
    price: prices.u,
    durationMinutes: 15,
    isUrgent: true,
    isEnabled: true,
    sortOrder: 0,
  },
];

export const visitTypeStore = createStore<VisitType>([
  ...DEFAULT_TYPES('clinic-1', 'vt-c1', { c: 150, f: 100, u: 250 }),
  ...DEFAULT_TYPES('clinic-2', 'vt-c2', { c: 200, f: 130, u: 350 }),
  ...DEFAULT_TYPES('clinic-3', 'vt-c3', { c: 100, f: 75, u: 175 }),
], 'cf_visit_types');

export function getClinicVisitTypes(clinicId: string): VisitType[] {
  const types = visitTypeStore.filter(vt => vt.clinicId === clinicId);
  if (types.length === 0) {
    // Auto-create defaults for unknown clinic
    const defaults = DEFAULT_TYPES(clinicId, `vt-${clinicId}`, { c: 150, f: 100, u: 250 });
    defaults.forEach(d => visitTypeStore.add(d));
    return defaults;
  }
  return types.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getEnabledClinicVisitTypes(clinicId: string): VisitType[] {
  return getClinicVisitTypes(clinicId).filter(vt => vt.isEnabled);
}

export function getVisitType(id: string): VisitType | undefined {
  return visitTypeStore.get(vt => vt.id === id);
}

export function updateVisitType(id: string, changes: Partial<Omit<VisitType, 'id' | 'clinicId'>>) {
  visitTypeStore.update(vt => vt.id === id, changes);
}

export function addVisitType(clinicId: string, data: Omit<VisitType, 'id' | 'clinicId'>): VisitType {
  const existing = getClinicVisitTypes(clinicId);
  const maxOrder = existing.reduce((max, vt) => Math.max(max, vt.sortOrder), -1);
  const newType: VisitType = {
    ...data,
    id: `vt-${clinicId}-${Date.now()}`,
    clinicId,
    sortOrder: data.isUrgent ? -1 : maxOrder + 1,
  };
  visitTypeStore.add(newType);
  return newType;
}

export function removeVisitType(id: string) {
  visitTypeStore.remove(vt => vt.id === id);
}

export function moveVisitTypePriority(id: string, direction: 'up' | 'down', clinicId: string) {
  const types = getClinicVisitTypes(clinicId).filter(vt => !vt.isUrgent);
  const idx = types.findIndex(vt => vt.id === id);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= types.length) return;
  const tempOrder = types[idx].sortOrder;
  visitTypeStore.update(vt => vt.id === types[idx].id, { sortOrder: types[swapIdx].sortOrder });
  visitTypeStore.update(vt => vt.id === types[swapIdx].id, { sortOrder: tempOrder });
}
