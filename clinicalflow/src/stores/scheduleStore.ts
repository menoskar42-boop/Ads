import { DoctorSchedule, BlockedDate } from '@/types';
import { createStore } from './createStore';
import { appointmentStore } from './visitStore';

const mockSchedules: DoctorSchedule[] = [
  // Dr. Ahmed (u-2, General Medicine) — Sun-Thu 9:00-14:00
  { id: 'sch-1', doctorId: 'u-2', dayOfWeek: 0, startTime: '09:00', endTime: '14:00', isActive: true },
  { id: 'sch-2', doctorId: 'u-2', dayOfWeek: 1, startTime: '09:00', endTime: '14:00', isActive: true },
  { id: 'sch-3', doctorId: 'u-2', dayOfWeek: 2, startTime: '09:00', endTime: '14:00', isActive: true },
  { id: 'sch-4', doctorId: 'u-2', dayOfWeek: 3, startTime: '09:00', endTime: '14:00', isActive: true },
  { id: 'sch-5', doctorId: 'u-2', dayOfWeek: 4, startTime: '09:00', endTime: '14:00', isActive: true },
  // Dr. Sarah (u-3, Pediatrics) — Sun, Tue, Thu 10:00-15:00
  { id: 'sch-6', doctorId: 'u-3', dayOfWeek: 0, startTime: '10:00', endTime: '15:00', isActive: true },
  { id: 'sch-7', doctorId: 'u-3', dayOfWeek: 2, startTime: '10:00', endTime: '15:00', isActive: true },
  { id: 'sch-8', doctorId: 'u-3', dayOfWeek: 4, startTime: '10:00', endTime: '15:00', isActive: true },
  // Dr. Omar (u-4, Cardiology) — Mon, Wed 9:00-13:00
  { id: 'sch-9', doctorId: 'u-4', dayOfWeek: 1, startTime: '09:00', endTime: '13:00', isActive: true },
  { id: 'sch-10', doctorId: 'u-4', dayOfWeek: 3, startTime: '09:00', endTime: '13:00', isActive: true },
  // Dr. Lisa (u-5, Dermatology) — Sun-Wed 11:00-16:00
  { id: 'sch-11', doctorId: 'u-5', dayOfWeek: 0, startTime: '11:00', endTime: '16:00', isActive: true },
  { id: 'sch-12', doctorId: 'u-5', dayOfWeek: 1, startTime: '11:00', endTime: '16:00', isActive: true },
  { id: 'sch-13', doctorId: 'u-5', dayOfWeek: 2, startTime: '11:00', endTime: '16:00', isActive: true },
  { id: 'sch-14', doctorId: 'u-5', dayOfWeek: 3, startTime: '11:00', endTime: '16:00', isActive: true },
];

export const scheduleStore    = createStore<DoctorSchedule>(mockSchedules, 'cf_schedules');
export const blockedDateStore = createStore<BlockedDate>([],               'cf_blocked_dates');

const SLOT_DURATION = 30; // minutes

export function getAvailableSlots(doctorId: string, date: string): string[] {
  const dayOfWeek = new Date(date).getDay();

  // Check if date is blocked
  const isBlocked = blockedDateStore.get(b => b.doctorId === doctorId && b.date === date);
  if (isBlocked) return [];

  // Get schedule for this day
  const schedule = scheduleStore.get(
    s => s.doctorId === doctorId && s.dayOfWeek === dayOfWeek && s.isActive
  );
  if (!schedule) return [];

  // Generate all slots
  const slots: string[] = [];
  const [startH, startM] = schedule.startTime.split(':').map(Number);
  const [endH, endM] = schedule.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  for (let m = startMinutes; m + SLOT_DURATION <= endMinutes; m += SLOT_DURATION) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
  }

  // Filter out booked slots
  const existingAppointments = appointmentStore.filter(
    a => a.doctorId === doctorId && a.date === date && a.status !== 'cancelled' && a.status !== 'no_show'
  );
  const bookedTimes = new Set(existingAppointments.map(a => a.time));

  return slots.filter(s => !bookedTimes.has(s));
}

export function getDoctorWorkingDays(doctorId: string): number[] {
  return scheduleStore
    .filter(s => s.doctorId === doctorId && s.isActive)
    .map(s => s.dayOfWeek);
}
