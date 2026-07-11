import { createStore } from './createStore';

export type QueueStrategy = 'A' | 'B' | 'C' | 'D' | 'E';

export interface QueueStrategyConfig {
  id: string;
  clinicId: string;
  strategy: QueueStrategy;
  urgentAlwaysFirst: boolean;
  rotationPattern: string[]; // For D: visitTypeIds in order (can repeat for ratio)
  rotationIndex: number;     // For D: current position in rotation cycle
  lastServedCategory: 'primary' | 'secondary' | null; // For C: alternating tracking
  lastServedUrgencyTier: 'urgent' | 'emergency' | null; // Tracks U/E interleave position
}

const seedDefaults: QueueStrategyConfig[] = [
  { id: 'clinic-1', clinicId: 'clinic-1', strategy: 'B', urgentAlwaysFirst: true, rotationPattern: [], rotationIndex: 0, lastServedCategory: null, lastServedUrgencyTier: null },
  { id: 'clinic-2', clinicId: 'clinic-2', strategy: 'A', urgentAlwaysFirst: true, rotationPattern: [], rotationIndex: 0, lastServedCategory: null, lastServedUrgencyTier: null },
  { id: 'clinic-3', clinicId: 'clinic-3', strategy: 'E', urgentAlwaysFirst: true, rotationPattern: [], rotationIndex: 0, lastServedCategory: null, lastServedUrgencyTier: null },
];

export const queueStrategyStore = createStore<QueueStrategyConfig>(seedDefaults, 'cf_queue_strategies');

export function getClinicQueueStrategy(clinicId: string): QueueStrategyConfig {
  return queueStrategyStore.get(q => q.clinicId === clinicId) || {
    id: clinicId,
    clinicId,
    strategy: 'A' as QueueStrategy,
    urgentAlwaysFirst: true,
    rotationPattern: [],
    rotationIndex: 0,
    lastServedCategory: null,
    lastServedUrgencyTier: null,
  };
}

export function updateQueueStrategy(clinicId: string, changes: Partial<Omit<QueueStrategyConfig, 'id' | 'clinicId'>>) {
  const existing = queueStrategyStore.get(q => q.clinicId === clinicId);
  if (existing) {
    queueStrategyStore.update(q => q.clinicId === clinicId, changes);
  } else {
    queueStrategyStore.add({
      id: clinicId,
      clinicId,
      strategy: 'A',
      urgentAlwaysFirst: true,
      rotationPattern: [],
      rotationIndex: 0,
      lastServedCategory: null,
      lastServedUrgencyTier: null,
      ...changes,
    });
  }
}
