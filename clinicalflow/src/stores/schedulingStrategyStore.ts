import { createStore } from './createStore';

export type SchedulingStrategy = 'queue' | 'interval' | 'strict' | 'hybrid';

export interface SchedulingStrategyConfig {
  id: string;
  clinicId: string;
  strategy: SchedulingStrategy;
  intervalMinutes: number;
  maxPerInterval: number;
}

const DEFAULTS = { strategy: 'hybrid' as SchedulingStrategy, intervalMinutes: 30, maxPerInterval: 4 };

export const schedulingStrategyStore = createStore<SchedulingStrategyConfig>(
  [], 'cf_scheduling_strategies'
);

export function getSchedulingStrategy(clinicId: string): SchedulingStrategyConfig {
  return schedulingStrategyStore.get(c => c.clinicId === clinicId) ?? { id: clinicId, clinicId, ...DEFAULTS };
}

export function updateSchedulingStrategy(
  clinicId: string,
  changes: Partial<Omit<SchedulingStrategyConfig, 'id' | 'clinicId'>>
) {
  const existing = schedulingStrategyStore.get(c => c.clinicId === clinicId);
  if (existing) {
    schedulingStrategyStore.update(c => c.clinicId === clinicId, changes);
  } else {
    schedulingStrategyStore.add({ id: clinicId, clinicId, ...DEFAULTS, ...changes });
  }
}

function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Validates whether a new booking is allowed and returns position + estimated start.
// Pass existing scheduled/confirmed appointments for the same doctor+date.
export function handleBookingByStrategy(
  clinicId: string,
  bookingData: { doctorId: string; date: string; time: string },
  existingAppointments: Array<{ doctorId: string; date: string; time: string; status: string }>
): { ok: boolean; reason?: string; queuePosition: number; estimatedStartTime?: string } {
  const { strategy, intervalMinutes, maxPerInterval } = getSchedulingStrategy(clinicId);
  const { doctorId, date, time } = bookingData;

  const active = existingAppointments.filter(
    a => a.doctorId === doctorId && a.date === date &&
      (a.status === 'scheduled' || a.status === 'confirmed')
  );

  switch (strategy) {
    case 'queue':
      return { ok: true, queuePosition: active.length + 1 };

    case 'strict': {
      if (active.some(a => a.time === time)) return { ok: false, reason: 'SLOT_CONFLICT', queuePosition: 0 };
      return { ok: true, queuePosition: 1 };
    }

    case 'interval':
    case 'hybrid': {
      const reqMin = timeToMinutes(time);
      const blockStart = Math.floor(reqMin / intervalMinutes) * intervalMinutes;

      const inBlock = active.filter(a => {
        const m = timeToMinutes(a.time);
        return m >= blockStart && m < blockStart + intervalMinutes;
      });

      if (inBlock.length >= maxPerInterval) return { ok: false, reason: 'INTERVAL_FULL', queuePosition: 0 };

      const queuePosition = inBlock.length + 1;
      let estimatedStartTime: string | undefined;
      if (strategy === 'hybrid') {
        const slotSize = Math.floor(intervalMinutes / maxPerInterval);
        estimatedStartTime = minutesToTime(blockStart + (queuePosition - 1) * slotSize);
      }
      return { ok: true, queuePosition, estimatedStartTime };
    }

    default:
      return { ok: true, queuePosition: active.length + 1 };
  }
}
