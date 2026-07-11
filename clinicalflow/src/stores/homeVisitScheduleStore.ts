import { createStore } from './createStore';
import { appointmentStore } from './visitStore';

export interface HomeVisitSchedule {
  id: string;
  doctorId: string;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  maxVisitsPerDay: number;
  isActive: boolean;
}

const seed: HomeVisitSchedule[] = [
  // Dr. Ahmed Hassan (u-2) — clinic schedule is Sun-Thu, so home visits on Fri (5) & Sat (6)
  { id: 'hvs-1', doctorId: 'u-2', dayOfWeek: 5, startTime: '10:00', endTime: '14:00', maxVisitsPerDay: 5, isActive: true },
  { id: 'hvs-2', doctorId: 'u-2', dayOfWeek: 6, startTime: '10:00', endTime: '14:00', maxVisitsPerDay: 5, isActive: true },
  // Dr. Sarah Mitchell (u-3) — clinic schedule is Sun/Tue/Thu, so home visits on Mon (1) & Wed (3)
  { id: 'hvs-3', doctorId: 'u-3', dayOfWeek: 1, startTime: '09:00', endTime: '13:00', maxVisitsPerDay: 4, isActive: true },
  { id: 'hvs-4', doctorId: 'u-3', dayOfWeek: 3, startTime: '09:00', endTime: '13:00', maxVisitsPerDay: 4, isActive: true },
  // Dr. Khaled Mostafa (u-hv1) — standalone home-visit doctor, available Sat (6), Sun (0), Mon (1), eve
  { id: 'hvs-5', doctorId: 'u-hv1', dayOfWeek: 0, startTime: '18:00', endTime: '22:00', maxVisitsPerDay: 5, isActive: true },
  { id: 'hvs-6', doctorId: 'u-hv1', dayOfWeek: 1, startTime: '18:00', endTime: '22:00', maxVisitsPerDay: 5, isActive: true },
  { id: 'hvs-7', doctorId: 'u-hv1', dayOfWeek: 6, startTime: '10:00', endTime: '20:00', maxVisitsPerDay: 5, isActive: true },
];

export const homeVisitScheduleStore = createStore<HomeVisitSchedule>(seed, 'cf_hv_schedules');

const HV_SLOT_DURATION = 45; // minutes per home visit slot

export function getHomeVisitSlots(doctorId: string, date: string): string[] {
  const dayOfWeek = new Date(date).getDay();

  const schedule = homeVisitScheduleStore.get(
    s => s.doctorId === doctorId && s.dayOfWeek === dayOfWeek && s.isActive
  );
  if (!schedule) return [];

  const existingHV = appointmentStore.filter(
    a => a.doctorId === doctorId && a.date === date && a.isHomeVisit &&
         a.status !== 'cancelled' && a.status !== 'no_show'
  );

  if (existingHV.length >= schedule.maxVisitsPerDay) return [];

  const slots: string[] = [];
  const [startH, startM] = schedule.startTime.split(':').map(Number);
  const [endH, endM] = schedule.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  for (let m = startMinutes; m + HV_SLOT_DURATION <= endMinutes; m += HV_SLOT_DURATION) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
  }

  const bookedTimes = new Set(existingHV.map(a => a.time));
  return slots.filter(s => !bookedTimes.has(s));
}

export function getHomeVisitWorkingDays(doctorId: string): number[] {
  return homeVisitScheduleStore
    .filter(s => s.doctorId === doctorId && s.isActive)
    .map(s => s.dayOfWeek);
}

export function getDoctorHomeVisitSchedules(doctorId: string): HomeVisitSchedule[] {
  return homeVisitScheduleStore.filter(s => s.doctorId === doctorId);
}

export function addHomeVisitSchedule(data: Omit<HomeVisitSchedule, 'id'>): HomeVisitSchedule {
  return homeVisitScheduleStore.add({
    ...data,
    id: `hvs-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
  });
}

export function updateHomeVisitSchedule(id: string, changes: Partial<Omit<HomeVisitSchedule, 'id'>>) {
  homeVisitScheduleStore.update(s => s.id === id, changes);
}

export function removeHomeVisitSchedule(id: string) {
  homeVisitScheduleStore.remove(s => s.id === id);
}
